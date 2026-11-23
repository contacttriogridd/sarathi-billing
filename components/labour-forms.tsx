'use client';

import { useEffect, useMemo, useState } from 'react';
import { DatabaseZap, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useAuth, useData } from '@/components/providers';
import { Card, ConfirmDialog, Field, NumberInput, SelectNative, Segmented, Spinner, TextInput, Toggle } from '@/components/common';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { ATTENDANCE_STATUSES, LABOUR_PAYMENT_KINDS, LABOUR_TRADES, PAYMENT_METHODS } from '@/lib/constants';
import { LABOUR_SETUP_MESSAGE, deleteRow, friendlyError, repriceAttendance, saveAttendance, upsertRow } from '@/lib/data';
import { fmtDate, inr, isValidPhone, todayISO } from '@/lib/format';
import { STATUS_TONE, attendanceAmount, labourBalance, suggestedOvertimeRate } from '@/lib/labour';
import type { Attendance, AttendanceStatus, Labourer, LabourPayment } from '@/lib/types';

const dialogClass = 'max-h-[92vh] overflow-y-auto rounded-2xl p-5 sm:max-w-xl sm:p-6';

function FormButtons({ busy, onCancel, label = 'Save', extra }: { busy: boolean; onCancel: () => void; label?: string; extra?: React.ReactNode }) {
  return (
    <DialogFooter className="mt-6 gap-2 sm:gap-2">
      {extra && <div className="mr-auto">{extra}</div>}
      <button type="button" onClick={onCancel} className="h-11 rounded-xl px-4 text-sm font-medium text-slate-600 hover:bg-slate-100 sm:h-10">Cancel</button>
      <button type="submit" disabled={busy} className="flex h-11 items-center justify-center gap-2 rounded-xl bg-brand-navy px-5 text-sm font-semibold text-white hover:bg-brand-navy-2 disabled:opacity-60 sm:h-10">{busy && <Spinner />}{label}</button>
    </DialogFooter>
  );
}

/** Like Field, but not a <label>: a label wrapping buttons would send clicks on its caption to the first button. */
function FieldGroup({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div role="group" aria-label={label} className={cn('min-w-0', className)}>
      <span className="mb-1.5 block text-[13px] font-medium text-slate-700">{label}</span>
      {children}
    </div>
  );
}

/** Shown on the labour pages until the labour attendance database update has been run. */
export function LabourSetupNotice() {
  return (
    <Card className="flex items-start gap-3 border-amber-200 bg-amber-50/70 p-5 text-sm text-amber-900">
      <DatabaseZap size={20} className="mt-0.5 shrink-0" />
      <div>
        <p className="font-semibold">One-time setup needed</p>
        <p className="mt-1 leading-6">{LABOUR_SETUP_MESSAGE}</p>
      </div>
    </Card>
  );
}

/** Present / Half day / Absent buttons. */
export function StatusButtons({ value, onChange, disabled, compact }: { value: AttendanceStatus | null; onChange: (s: AttendanceStatus) => void; disabled?: boolean; compact?: boolean }) {
  return (
    <div className="inline-flex gap-1" role="radiogroup" aria-label="Attendance">
      {ATTENDANCE_STATUSES.map((s) => (
        <button
          key={s}
          type="button"
          role="radio"
          aria-label={s}
          aria-checked={value === s}
          disabled={disabled}
          onClick={() => onChange(s)}
          className={cn('h-9 rounded-lg px-2.5 text-[13px] font-semibold ring-1 ring-inset transition disabled:opacity-60',
            compact ? 'min-w-[38px]' : 'min-w-[64px]',
            value === s ? STATUS_TONE[s].active : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50')}
        >
          {compact ? STATUS_TONE[s].short : s === 'Half day' ? 'Half' : s}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Labourer
// ---------------------------------------------------------------------------

export function LabourerDialog({ open, onOpenChange, labourer, defaultProjectId, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; labourer?: Labourer | null; defaultProjectId?: string | null; onSaved?: (l: Labourer) => void }) {
  const { projects, attendance, refresh } = useData();
  const blank = (): Partial<Labourer> => ({ name: '', labour_code: '', phone: '', trade: 'Helper', daily_wage: 0, overtime_rate: 0, default_project_id: defaultProjectId ?? null, joined_on: todayISO(), active: true, notes: '' });
  const [form, setForm] = useState<Partial<Labourer>>(blank());
  const [otTouched, setOtTouched] = useState(false);
  const [applyFrom, setApplyFrom] = useState('');
  const [apply, setApply] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (open) { setForm(labourer ? { ...labourer } : blank()); setOtTouched(!!labourer); setApply(false); setApplyFrom(todayISO()); setErrors({}); } }, [open, labourer]);
  const set = (patch: Partial<Labourer>) => setForm((f) => ({ ...f, ...patch }));
  const activeProjects = useMemo(() => projects.filter((p) => (p.status !== 'Completed' && p.status !== 'Cancelled') || p.id === form.default_project_id), [projects, form.default_project_id]);
  const ratesChanged = !!labourer && (form.daily_wage !== labourer.daily_wage || form.overtime_rate !== labourer.overtime_rate);
  const affected = useMemo(() => (labourer && apply ? attendance.filter((a) => a.labourer_id === labourer.id && a.work_date >= applyFrom).length : 0), [attendance, labourer, apply, applyFrom]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!form.name?.trim()) errs.name = 'Labourer name is required';
    if (!isValidPhone(form.phone ?? '')) errs.phone = 'Enter a valid 10-digit phone number';
    if (!((form.daily_wage ?? 0) > 0)) errs.daily_wage = 'Enter the daily wage';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      const row: Record<string, unknown> = { ...form, name: form.name!.trim(), trade: (form.trade ?? '').trim(), phone: (form.phone ?? '').trim(), joined_on: form.joined_on || null, default_project_id: form.default_project_id || null };
      if (!String(row.labour_code ?? '').trim()) delete row.labour_code;
      const saved = await upsertRow<Labourer>('labourers', row);
      let repriced = 0;
      if (labourer && ratesChanged && apply && applyFrom) repriced = await repriceAttendance(labourer.id, applyFrom, form.daily_wage ?? 0, form.overtime_rate ?? 0);
      await refresh('labourers', ...(repriced ? (['attendance', 'expenses'] as const) : []));
      toast.success(labourer ? `Labourer updated${repriced ? ` · ${repriced} attendance day${repriced === 1 ? '' : 's'} re-priced` : ''}` : `${saved.name} added · ${saved.labour_code}`);
      onSaved?.(saved);
      onOpenChange(false);
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={dialogClass}>
        <DialogHeader><DialogTitle>{labourer ? 'Edit labourer' : 'Add labourer'}</DialogTitle><DialogDescription>Wages are worked out from attendance and added to project expenses automatically.</DialogDescription></DialogHeader>
        <form onSubmit={submit} className="mt-2 grid gap-4 sm:grid-cols-2">
          <Field label="Labourer name" required error={errors.name} className="sm:col-span-2"><TextInput autoFocus value={form.name ?? ''} onChange={(e) => set({ name: e.target.value })} placeholder="Full name" /></Field>
          <Field label="Trade / skill">
            <TextInput list="labour-trades" value={form.trade ?? ''} onChange={(e) => set({ trade: e.target.value })} placeholder="Mason, Helper…" />
            <datalist id="labour-trades">{LABOUR_TRADES.map((t) => <option key={t} value={t} />)}</datalist>
          </Field>
          <Field label="Phone" error={errors.phone}><TextInput type="tel" inputMode="tel" value={form.phone ?? ''} onChange={(e) => set({ phone: e.target.value })} placeholder="98765 43210" /></Field>
          <Field label="Daily wage (₹)" required error={errors.daily_wage}>
            <NumberInput value={form.daily_wage ?? 0} onValue={(v) => set({ daily_wage: v ?? 0, ...(otTouched ? {} : { overtime_rate: suggestedOvertimeRate(v ?? 0) }) })} className="font-semibold" />
          </Field>
          <Field label="Overtime rate (₹ per hour)" hint={`Suggested ${inr(suggestedOvertimeRate(form.daily_wage ?? 0))} (daily wage ÷ 8)`}>
            <NumberInput value={form.overtime_rate ?? 0} onValue={(v) => { setOtTouched(true); set({ overtime_rate: v ?? 0 }); }} allowEmpty placeholder="0" />
          </Field>
          {ratesChanged && (
            <div className="rounded-xl bg-sky-50 p-3 sm:col-span-2">
              <Toggle checked={apply} onChange={setApply} label="Apply the new rates to attendance already marked" description="Days marked earlier keep the rate they were marked with unless you apply it here." />
              {apply && (
                <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-slate-600">From</span>
                  <TextInput type="date" value={applyFrom} onChange={(e) => setApplyFrom(e.target.value)} className="w-auto" />
                  <span className="text-xs text-muted-foreground">{affected} day{affected === 1 ? '' : 's'} will be re-priced, and their expenses updated.</span>
                </div>
              )}
            </div>
          )}
          <Field label="Usual site / project" className="sm:col-span-2" hint="Pre-selects the project when you mark attendance.">
            <SelectNative value={form.default_project_id ?? ''} onChange={(e) => set({ default_project_id: e.target.value || null })}>
              <option value="">No fixed site</option>
              {activeProjects.map((p) => <option key={p.id} value={p.id}>{p.project_name} ({p.project_code})</option>)}
            </SelectNative>
          </Field>
          <Field label="Labour ID" hint={labourer ? undefined : 'Leave blank to auto-generate (LAB-0001…)'}><TextInput value={form.labour_code ?? ''} onChange={(e) => set({ labour_code: e.target.value.toUpperCase() })} placeholder="Auto" /></Field>
          <Field label="Joined on"><TextInput type="date" value={form.joined_on ?? ''} onChange={(e) => set({ joined_on: e.target.value || null })} /></Field>
          <Field label="Notes" className="sm:col-span-2"><Textarea value={form.notes ?? ''} onChange={(e) => set({ notes: e.target.value })} rows={2} className="rounded-xl" placeholder="Address, ID proof, bank / UPI details…" /></Field>
          <div className="sm:col-span-2"><Toggle checked={form.active ?? true} onChange={(v) => set({ active: v })} label="Active" description="Inactive labourers are hidden from the daily attendance sheet." /></div>
          <div className="sm:col-span-2"><FormButtons busy={busy} onCancel={() => onOpenChange(false)} label={labourer ? 'Save changes' : 'Add labourer'} /></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// One attendance day
// ---------------------------------------------------------------------------

export function AttendanceDialog({ open, onOpenChange, labourer, date, record, defaultProjectId, onSaved }: {
  open: boolean; onOpenChange: (o: boolean) => void; labourer: Labourer | null; date: string; record?: Attendance | null; defaultProjectId?: string | null; onSaved?: (a: Attendance) => void;
}) {
  const { isAdmin } = useAuth();
  const { projects, refresh } = useData();
  const [status, setStatus] = useState<AttendanceStatus>('Present');
  const [projectId, setProjectId] = useState('');
  const [ot, setOt] = useState(0);
  const [wage, setWage] = useState(0);
  const [otRate, setOtRate] = useState(0);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  useEffect(() => {
    if (!open || !labourer) return;
    setStatus(record?.status ?? 'Present');
    setProjectId(record ? record.project_id ?? '' : defaultProjectId ?? labourer.default_project_id ?? '');
    setOt(record?.overtime_hours ?? 0);
    setWage(record?.daily_wage ?? labourer.daily_wage);
    setOtRate(record?.overtime_rate ?? labourer.overtime_rate);
    setNotes(record?.notes ?? '');
  }, [open, labourer, record, defaultProjectId]);

  if (!labourer) return null;
  const amount = attendanceAmount(status, wage, ot, otRate);
  const future = date > todayISO();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (future) return toast.error('Attendance cannot be marked for a future date');
    if (ot < 0 || ot > 24) return toast.error('Overtime must be between 0 and 24 hours');
    setBusy(true);
    try {
      const [saved] = await saveAttendance([{ labourer_id: labourer.id, work_date: date, status, project_id: projectId || null, overtime_hours: status === 'Absent' ? 0 : ot, daily_wage: wage, overtime_rate: otRate, notes: notes.trim() }]);
      await refresh('attendance', 'expenses');
      toast.success(`${labourer.name} · ${status} on ${fmtDate(date)}${saved && saved.amount > 0 ? ` · ${inr(saved.amount)} added to expenses` : ''}`);
      if (saved) onSaved?.(saved);
      onOpenChange(false);
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className={dialogClass}>
          <DialogHeader>
            <DialogTitle>{labourer.name} · {fmtDate(date)}</DialogTitle>
            <DialogDescription>{labourer.labour_code}{labourer.trade ? ` · ${labourer.trade}` : ''} — the wage for the day is added to the project&apos;s expenses.</DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="mt-2 grid gap-4 sm:grid-cols-2">
            <FieldGroup label="Attendance" className="sm:col-span-2">
              <Segmented value={status} onChange={setStatus} options={ATTENDANCE_STATUSES.map((s) => ({ value: s, label: s }))} className="flex w-full" />
            </FieldGroup>
            <Field label="Project / site" className="sm:col-span-2">
              <SelectNative value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                <option value="">General / not project specific</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.project_name} ({p.project_code})</option>)}
              </SelectNative>
            </Field>
            <Field label="Overtime hours"><NumberInput value={status === 'Absent' ? 0 : ot} onValue={(v) => setOt(v ?? 0)} allowEmpty placeholder="0" disabled={status === 'Absent'} /></Field>
            <Field label="Overtime rate (₹ / hour)"><NumberInput value={otRate} onValue={(v) => setOtRate(v ?? 0)} allowEmpty placeholder="0" /></Field>
            <Field label="Daily wage for this day (₹)" hint={wage !== labourer.daily_wage ? `Labourer's current rate is ${inr(labourer.daily_wage)}` : undefined}><NumberInput value={wage} onValue={(v) => setWage(v ?? 0)} /></Field>
            <div className="flex flex-col justify-end rounded-xl bg-slate-50 px-4 py-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Wages for the day</p>
              <p className="num text-xl font-semibold text-brand-ink">{inr(amount)}</p>
            </div>
            <Field label="Notes" className="sm:col-span-2"><TextInput value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Work done, reason for absence…" /></Field>
            {future && <p className="rounded-xl bg-amber-50 px-4 py-2.5 text-sm text-amber-800 sm:col-span-2">This date is in the future — attendance can only be marked for today or earlier.</p>}
            <div className="sm:col-span-2">
              <FormButtons busy={busy} onCancel={() => onOpenChange(false)} label={record ? 'Save changes' : 'Mark attendance'}
                extra={record && isAdmin ? <button type="button" onClick={() => setConfirmRemove(true)} className="flex h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-medium text-red-600 hover:bg-red-50"><Trash2 size={15} />Remove entry</button> : undefined} />
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <ConfirmDialog open={confirmRemove} onOpenChange={setConfirmRemove} title="Remove this attendance entry?" destructive confirmLabel="Remove"
        description={`The day goes back to "not marked" and its wage of ${inr(record?.amount ?? 0)} is removed from expenses.`}
        onConfirm={async () => {
          try { await deleteRow('labour_attendance', record!.id); await refresh('attendance', 'expenses'); toast.success('Attendance entry removed'); onOpenChange(false); } catch (err) { toast.error(friendlyError(err)); throw err; }
        }} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Wages paid / advance
// ---------------------------------------------------------------------------

export function LabourPaymentDialog({ open, onOpenChange, labourer, payment }: { open: boolean; onOpenChange: (o: boolean) => void; labourer?: Labourer | null; payment?: LabourPayment | null }) {
  const { labourers, labourerById, attendance, labourPayments, projects, refresh } = useData();
  const [labourerId, setLabourerId] = useState('');
  const [form, setForm] = useState<Partial<LabourPayment>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    const lab = payment ? labourerById.get(payment.labourer_id) : labourer;
    setLabourerId(lab?.id ?? '');
    setForm(payment ? { ...payment } : { kind: 'Wages', amount: 0, payment_date: todayISO(), method: 'Cash', project_id: lab?.default_project_id ?? null, reference: '', notes: '' });
    setError('');
  }, [open, payment, labourer, labourerById]);

  const target = labourerById.get(labourerId) ?? null;
  const balance = useMemo(() => (target
    ? labourBalance(attendance.filter((a) => a.labourer_id === target.id), labourPayments.filter((p) => p.labourer_id === target.id && p.id !== payment?.id))
    : null), [target, attendance, labourPayments, payment]);
  const set = (patch: Partial<LabourPayment>) => setForm((f) => ({ ...f, ...patch }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!target) return setError('Choose the labourer');
    if (!((form.amount ?? 0) > 0)) return setError('Enter the amount paid');
    if (!form.payment_date) return setError('Enter the payment date');
    setBusy(true);
    try {
      await upsertRow('labour_payments', { ...form, labourer_id: target.id, project_id: form.project_id || null, reference: (form.reference ?? '').trim(), notes: (form.notes ?? '').trim() });
      await refresh('labourPayments');
      toast.success(`${form.kind === 'Advance' ? 'Advance' : 'Wages'} of ${inr(form.amount)} ${payment ? 'updated' : 'recorded'} for ${target.name}`);
      onOpenChange(false);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={dialogClass}>
        <DialogHeader>
          <DialogTitle>{payment ? 'Edit labour payment' : 'Pay labourer'}</DialogTitle>
          <DialogDescription>Settles the labourer&apos;s balance. Wages are already counted in project expenses from attendance, so this is not added as another expense.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="mt-2 grid gap-4 sm:grid-cols-2">
          {!labourer && !payment && (
            <Field label="Labourer" required className="sm:col-span-2">
              <SelectNative value={labourerId} onChange={(e) => setLabourerId(e.target.value)}>
                <option value="">Select labourer</option>
                {labourers.filter((l) => l.active || l.id === labourerId).map((l) => <option key={l.id} value={l.id}>{l.name} ({l.labour_code})</option>)}
              </SelectNative>
            </Field>
          )}
          {balance && (
            <div className="grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-3 text-center sm:col-span-2">
              <div><p className="text-[11px] text-muted-foreground">Earned</p><p className="num text-sm font-semibold">{inr(balance.earned)}</p></div>
              <div><p className="text-[11px] text-muted-foreground">Paid</p><p className="num text-sm font-semibold text-emerald-600">{inr(balance.paid)}</p></div>
              <div><p className="text-[11px] text-muted-foreground">{balance.balance < 0 ? 'Advance' : 'Balance due'}</p><p className={cn('num text-sm font-semibold', balance.balance < 0 ? 'text-red-600' : 'text-brand-orange-dark')}>{inr(Math.abs(balance.balance))}</p></div>
            </div>
          )}
          <FieldGroup label="Type" className="sm:col-span-2">
            <Segmented value={(form.kind ?? 'Wages') as LabourPayment['kind']} onChange={(v) => set({ kind: v })} options={LABOUR_PAYMENT_KINDS.map((k) => ({ value: k, label: k === 'Wages' ? 'Wages payment' : 'Advance' }))} className="flex w-full" />
          </FieldGroup>
          <div className="min-w-0">
            <Field label="Amount (₹)" required>
              <NumberInput value={form.amount ?? 0} onValue={(v) => set({ amount: v ?? 0 })} className="text-lg font-semibold" autoFocus />
            </Field>
            {balance && balance.balance > 0 && form.amount !== balance.balance && form.kind !== 'Advance' && (
              <button type="button" onClick={() => set({ amount: balance.balance })} className="mt-1 text-xs font-medium text-brand-navy-3 hover:underline">Pay full balance {inr(balance.balance)}</button>
            )}
          </div>
          <Field label="Date" required><TextInput type="date" value={form.payment_date ?? ''} max={todayISO()} onChange={(e) => set({ payment_date: e.target.value })} /></Field>
          <FieldGroup label="Payment method" className="sm:col-span-2">
            <Segmented value={(form.method ?? 'Cash') as (typeof PAYMENT_METHODS)[number]} onChange={(v) => set({ method: v })} options={PAYMENT_METHODS.map((m) => ({ value: m, label: m }))} className="flex w-full flex-wrap" />
          </FieldGroup>
          <Field label="Project (optional)"><SelectNative value={form.project_id ?? ''} onChange={(e) => set({ project_id: e.target.value || null })}><option value="">Not project specific</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.project_name}</option>)}</SelectNative></Field>
          <Field label="Reference"><TextInput value={form.reference ?? ''} onChange={(e) => set({ reference: e.target.value })} placeholder="UPI ref, week no.…" /></Field>
          <Field label="Notes" className="sm:col-span-2"><TextInput value={form.notes ?? ''} onChange={(e) => set({ notes: e.target.value })} placeholder="e.g. Week 18–23 Nov settlement" /></Field>
          {error && <p className="rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-700 sm:col-span-2">{error}</p>}
          <div className="sm:col-span-2"><FormButtons busy={busy} onCancel={() => onOpenChange(false)} label={payment ? 'Save changes' : form.kind === 'Advance' ? 'Record advance' : 'Record payment'} /></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
