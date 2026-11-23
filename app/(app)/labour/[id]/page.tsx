'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, CalendarCheck, CalendarDays, ChevronLeft, ChevronRight, FileText, HandCoins, IndianRupee, Loader2, MapPin, Pencil, Phone, Trash2, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useAuth, useData } from '@/components/providers';
import { Card, ConfirmDialog, LoadingPanel, Segmented, StatCard } from '@/components/common';
import { AttendanceDialog, LabourPaymentDialog, LabourSetupNotice, LabourerDialog } from '@/components/labour-forms';
import { deleteRow, friendlyError } from '@/lib/data';
import { fmtDate, inr, monthKey, qty, round2, slug, todayISO } from '@/lib/format';
import { STATUS_TONE, fmtHours, labourBalance, monthBounds, monthGrid, monthTitle, shiftMonth, summariseAttendance, weekday } from '@/lib/labour';
import { buildLabourerStatement } from '@/lib/reports';
import { generateReportPdf } from '@/lib/pdf/lazy';
import { downloadBytes } from '@/lib/share';
import type { LabourPayment } from '@/lib/types';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function LabourerPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { isAdmin } = useAuth();
  const { labourerById, attendance, labourPayments, projects, projectById, settings, refresh, loading, labourReady } = useData();
  const lab = labourerById.get(params.id);
  const today = todayISO();
  const [month, setMonth] = useState(monthKey(today));
  const [tab, setTab] = useState<'register' | 'payments'>('register');
  const [editOpen, setEditOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [editingPayment, setEditingPayment] = useState<LabourPayment | null>(null);
  const [deletingPayment, setDeletingPayment] = useState<LabourPayment | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);

  const d = useMemo(() => {
    const att = attendance.filter((a) => a.labourer_id === params.id);
    const pays = labourPayments.filter((p) => p.labourer_id === params.id).sort((a, b) => b.payment_date.localeCompare(a.payment_date) || b.created_at.localeCompare(a.created_at));
    const { from, to } = monthBounds(month);
    const monthAtt = att.filter((a) => a.work_date >= from && a.work_date <= to).sort((a, b) => a.work_date.localeCompare(b.work_date));
    const monthPaid = round2(pays.filter((p) => p.payment_date >= from && p.payment_date <= to).reduce((s, p) => s + p.amount, 0));
    return { att, pays, monthAtt, monthPaid, byDate: new Map(monthAtt.map((a) => [a.work_date, a])), month: summariseAttendance(monthAtt), total: summariseAttendance(att), balance: labourBalance(att, pays) };
  }, [attendance, labourPayments, params.id, month]);

  if (loading) return <LoadingPanel />;
  if (!labourReady) return <LabourSetupNotice />;
  if (!lab) return <div className="py-20 text-center text-sm text-muted-foreground">Labourer not found. <Link href="/labour?tab=labourers" className="font-semibold text-brand-navy-3">Back</Link></div>;
  const site = lab.default_project_id ? projectById.get(lab.default_project_id) : undefined;
  const dayRecord = day ? d.byDate.get(day) ?? attendance.find((a) => a.labourer_id === lab.id && a.work_date === day) ?? null : null;

  const downloadStatement = async () => {
    setPdfBusy(true);
    try {
      const { from, to } = monthBounds(month);
      const spec = buildLabourerStatement(lab, from, to, { attendance, labourPayments, projects });
      downloadBytes(await generateReportPdf(spec, settings), `labour-statement-${slug(lab.labour_code.toLowerCase())}-${slug(lab.name.toLowerCase())}-${month}.pdf`);
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setPdfBusy(false);
    }
  };

  return (
    <div className="animate-in-up space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <button onClick={() => router.push('/labour?tab=labourers')} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border bg-white hover:bg-slate-50" aria-label="Back"><ArrowLeft size={18} /></button>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-brand-orange">{lab.labour_code}{lab.trade ? ` · ${lab.trade}` : ''}</p>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-xl font-semibold tracking-tight text-brand-ink sm:text-2xl">{lab.name}</h1>
              <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset', lab.active ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-slate-100 text-slate-500 ring-slate-200')}>{lab.active ? 'Active' : 'Inactive'}</span>
            </div>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {lab.phone && <a href={`tel:${lab.phone.replace(/\s/g, '')}`} className="flex items-center gap-1 font-medium text-brand-navy-3 hover:underline"><Phone size={13} />{lab.phone}</a>}
              {site && <Link href={`/projects/${site.id}`} className="flex items-center gap-1 hover:underline"><MapPin size={13} />{site.project_name}</Link>}
              {lab.joined_on && <span className="flex items-center gap-1"><CalendarDays size={13} />Joined {fmtDate(lab.joined_on)}</span>}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => { setEditingPayment(null); setPayOpen(true); }} className="flex h-10 items-center gap-2 rounded-xl bg-brand-orange px-4 text-sm font-semibold text-white hover:bg-brand-orange-dark"><HandCoins size={16} />Pay / advance</button>
          <button onClick={downloadStatement} disabled={pdfBusy} className="flex h-10 items-center gap-2 rounded-xl border bg-white px-3.5 text-sm font-semibold hover:bg-slate-50">{pdfBusy ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}Statement</button>
          <button onClick={() => setEditOpen(true)} className="flex h-10 items-center gap-2 rounded-xl border bg-white px-3.5 text-sm font-semibold hover:bg-slate-50"><Pencil size={15} />Edit</button>
          {isAdmin && <button onClick={() => setConfirmDelete(true)} className="grid h-10 w-10 place-items-center rounded-xl border bg-white text-red-600 hover:bg-red-50" aria-label="Delete labourer"><Trash2 size={16} /></button>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Daily wage" value={inr(lab.daily_wage, 0)} icon={IndianRupee} hint={`OT ${inr(lab.overtime_rate, 0)} / hour`} />
        <StatCard label={monthTitle(month)} value={`${qty(d.month.manDays)} days`} icon={CalendarCheck} tone="sky" hint={`${inr(d.month.wages, 0)} wages${d.month.otHours ? ` · ${fmtHours(d.month.otHours)} OT` : ''}`} />
        <StatCard label="Total earned" value={inr(d.balance.earned, 0)} icon={CalendarDays} tone="slate" hint={`${qty(d.total.manDays)} man-days in all`} />
        <StatCard label="Total paid" value={inr(d.balance.paid, 0)} icon={Wallet} tone="green" hint={d.balance.advances ? `incl. ${inr(d.balance.advances, 0)} advances` : `${d.pays.length} payment${d.pays.length === 1 ? '' : 's'}`} />
        <StatCard label={d.balance.balance < 0 ? 'Advance outstanding' : 'Balance due'} value={inr(Math.abs(d.balance.balance), 0)} icon={HandCoins} tone={d.balance.balance < 0 ? 'red' : d.balance.balance > 0 ? 'orange' : 'green'}
          hint={d.balance.balance < 0 ? 'To recover from future wages' : d.balance.balance > 0 ? 'Earned but not yet paid' : 'Fully settled'} />
      </div>

      <Card className="p-4 sm:p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            <button onClick={() => setMonth(shiftMonth(month, -1))} className="grid h-9 w-9 place-items-center rounded-lg border bg-white hover:bg-slate-50" aria-label="Previous month"><ChevronLeft size={17} /></button>
            <h2 className="min-w-[150px] text-center text-[15px] font-semibold text-brand-ink">{monthTitle(month)}</h2>
            <button onClick={() => setMonth(shiftMonth(month, 1))} disabled={month >= monthKey(today)} className="grid h-9 w-9 place-items-center rounded-lg border bg-white hover:bg-slate-50 disabled:opacity-40" aria-label="Next month"><ChevronRight size={17} /></button>
          </div>
          <div className="hidden flex-wrap gap-3 text-xs text-muted-foreground sm:flex">
            {(['Present', 'Half day', 'Absent'] as const).map((s) => <span key={s} className="flex items-center gap-1.5"><span className={cn('h-2.5 w-2.5 rounded-full', STATUS_TONE[s].dot)} />{s}</span>)}
          </div>
        </div>
        <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
          {WEEKDAYS.map((w) => <div key={w} className="pb-1 text-center text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">{w}</div>)}
          {monthGrid(month).map((iso, i) => {
            if (!iso) return <div key={`b${i}`} />;
            const a = d.byDate.get(iso);
            const future = iso > today;
            return (
              <button key={iso} disabled={future} onClick={() => setDay(iso)} title={a ? `${a.status}${a.overtime_hours ? ` + ${fmtHours(a.overtime_hours)} OT` : ''} · ${inr(a.amount)}` : future ? undefined : 'Not marked — tap to mark'}
                className={cn('flex h-12 flex-col items-center justify-center rounded-lg text-sm ring-1 ring-inset transition sm:h-16', a ? STATUS_TONE[a.status].cell : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50', future && 'cursor-default opacity-40', iso === today && 'ring-2 ring-brand-navy')}>
                <span className="font-semibold leading-none">{Number(iso.slice(8))}</span>
                {a && <span className="mt-0.5 text-[10px] font-semibold leading-none">{STATUS_TONE[a.status].short}{a.overtime_hours > 0 ? '+OT' : ''}</span>}
                {a && a.amount > 0 && <span className="num mt-0.5 hidden text-[10px] leading-none opacity-80 sm:block">{inr(a.amount, 0)}</span>}
              </button>
            );
          })}
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-3 text-center sm:grid-cols-6">
          <div><p className="text-[11px] text-muted-foreground">Present</p><p className="num text-sm font-semibold">{d.month.present}</p></div>
          <div><p className="text-[11px] text-muted-foreground">Half days</p><p className="num text-sm font-semibold">{d.month.half}</p></div>
          <div><p className="text-[11px] text-muted-foreground">Absent</p><p className="num text-sm font-semibold">{d.month.absent}</p></div>
          <div><p className="text-[11px] text-muted-foreground">Overtime</p><p className="num text-sm font-semibold">{fmtHours(d.month.otHours)}</p></div>
          <div><p className="text-[11px] text-muted-foreground">Wages</p><p className="num text-sm font-semibold">{inr(d.month.wages, 0)}</p></div>
          <div><p className="text-[11px] text-muted-foreground">Paid this month</p><p className="num text-sm font-semibold text-emerald-600">{inr(d.monthPaid, 0)}</p></div>
        </div>
      </Card>

      <Card>
        <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between">
          <Segmented value={tab} onChange={setTab} options={[{ value: 'register', label: `${monthTitle(month)} (${d.monthAtt.length})` }, { value: 'payments', label: `Payments (${d.pays.length})` }]} />
          {tab === 'payments' && <button onClick={() => { setEditingPayment(null); setPayOpen(true); }} className="flex h-9 items-center gap-1.5 rounded-lg bg-brand-navy px-3 text-sm font-semibold text-white"><HandCoins size={15} />Pay / advance</button>}
        </div>
        <div className="divide-y">
          {tab === 'register' && (d.monthAtt.length ? d.monthAtt.map((a) => (
            <button key={a.id} onClick={() => setDay(a.work_date)} className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-slate-50/70">
              <span className={cn('grid h-8 w-8 shrink-0 place-items-center rounded-lg text-xs font-bold ring-1 ring-inset', STATUS_TONE[a.status].cell)}>{STATUS_TONE[a.status].short}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{weekday(a.work_date)}, {fmtDate(a.work_date)} · {a.status}{a.overtime_hours > 0 ? ` + ${fmtHours(a.overtime_hours)} OT` : ''}</p>
                <p className="truncate text-xs text-muted-foreground">{a.project_id ? projectById.get(a.project_id)?.project_name ?? 'Project' : 'General'} · {inr(a.daily_wage, 0)}/day{a.notes ? ` · ${a.notes}` : ''}</p>
              </div>
              <p className="num text-sm font-semibold">{inr(a.amount)}</p>
            </button>
          )) : <p className="p-8 text-center text-sm text-muted-foreground">No attendance marked in {monthTitle(month)}. Tap a day in the calendar to mark it.</p>)}
          {tab === 'payments' && (d.pays.length ? d.pays.map((p) => (
            <div key={p.id} className="flex items-center gap-3 px-5 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{p.kind === 'Advance' ? 'Advance' : 'Wages paid'} · {p.method}</p>
                <p className="truncate text-xs text-muted-foreground">{fmtDate(p.payment_date)}{p.project_id ? ` · ${projectById.get(p.project_id)?.project_name ?? ''}` : ''}{p.reference ? ` · ${p.reference}` : ''}{p.notes ? ` · ${p.notes}` : ''}</p>
              </div>
              <p className={cn('num text-sm font-semibold', p.kind === 'Advance' ? 'text-amber-700' : 'text-emerald-600')}>{inr(p.amount)}</p>
              <button onClick={() => { setEditingPayment(p); setPayOpen(true); }} className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-100" aria-label="Edit payment"><Pencil size={15} /></button>
              {isAdmin && <button onClick={() => setDeletingPayment(p)} className="grid h-9 w-9 place-items-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label="Delete payment"><Trash2 size={15} /></button>}
            </div>
          )) : <p className="p-8 text-center text-sm text-muted-foreground">No wages paid or advances given yet.</p>)}
        </div>
      </Card>
      {lab.notes && <Card className="p-5 text-sm leading-6 text-slate-600"><p className="mb-1 font-medium text-brand-ink">Notes</p>{lab.notes}</Card>}

      <LabourerDialog open={editOpen} onOpenChange={setEditOpen} labourer={lab} />
      <LabourPaymentDialog open={payOpen} onOpenChange={(o) => { setPayOpen(o); if (!o) setEditingPayment(null); }} labourer={lab} payment={editingPayment} />
      <AttendanceDialog open={!!day} onOpenChange={(o) => !o && setDay(null)} labourer={lab} date={day ?? today} record={dayRecord} />
      <ConfirmDialog open={!!deletingPayment} onOpenChange={(o) => !o && setDeletingPayment(null)} title="Delete this payment?" destructive confirmLabel="Delete"
        description={`${deletingPayment?.kind === 'Advance' ? 'Advance' : 'Wages payment'} of ${inr(deletingPayment?.amount ?? 0)} on ${fmtDate(deletingPayment?.payment_date)}. The labourer's balance goes up by this amount.`}
        onConfirm={async () => { try { await deleteRow('labour_payments', deletingPayment!.id); await refresh('labourPayments'); toast.success('Payment deleted'); } catch (e) { toast.error(friendlyError(e)); throw e; } }} />
      <ConfirmDialog open={confirmDelete} onOpenChange={setConfirmDelete} title={`Delete ${lab.name}?`} destructive confirmLabel="Delete"
        description={d.att.length || d.pays.length ? 'This labourer has attendance or payments recorded, so they can only be marked inactive (Edit → Active).' : 'This labourer has no attendance or payments and will be removed.'}
        onConfirm={async () => { try { await deleteRow('labourers', lab.id); await refresh('labourers'); toast.success('Labourer deleted'); router.replace('/labour?tab=labourers'); } catch (e) { toast.error(friendlyError(e)); throw e; } }} />
    </div>
  );
}
