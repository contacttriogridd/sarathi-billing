'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronsUpDown, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useData } from '@/components/providers';
import { Field, NumberInput, SelectNative, Segmented, Spinner, TextInput, Toggle, inputClass, selectChevron } from '@/components/common';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Textarea } from '@/components/ui/textarea';
import { CATALOG_CATEGORIES, CUSTOMER_TYPES, EXPENSE_CATEGORIES, GST_RATES, INDIAN_STATES, PAYMENT_METHODS, PROJECT_STATUSES, PROJECT_TYPES, UNITS, UNIT_LABELS } from '@/lib/constants';
import { friendlyError, upsertRow } from '@/lib/data';
import { fmtDate, inr, isValidEmail, isValidGstin, isValidPhone, todayISO } from '@/lib/format';
import type { CatalogItem, Customer, Expense, Invoice, Payment, Project } from '@/lib/types';

const dialogClass = 'max-h-[92vh] overflow-y-auto rounded-2xl p-5 sm:max-w-xl sm:p-6';

function FormButtons({ busy, onCancel, label = 'Save' }: { busy: boolean; onCancel: () => void; label?: string }) {
  return (
    <DialogFooter className="mt-6 gap-2 sm:gap-2">
      <button type="button" onClick={onCancel} className="h-11 rounded-xl px-4 text-sm font-medium text-slate-600 hover:bg-slate-100 sm:h-10">Cancel</button>
      <button type="submit" disabled={busy} className="flex h-11 items-center justify-center gap-2 rounded-xl bg-brand-navy px-5 text-sm font-semibold text-white hover:bg-brand-navy-2 disabled:opacity-60 sm:h-10">{busy && <Spinner />}{label}</button>
    </DialogFooter>
  );
}

export const UnitDatalist = () => (
  <datalist id="unit-options">{UNITS.map((u) => <option key={u} value={u} />)}</datalist>
);

const UNIT_GROUPS: { label: string; units: string[] }[] = [
  { label: 'Area', units: ['Sq.ft', 'Sq.m'] },
  { label: 'Volume', units: ['Cu.ft', 'Cu.m'] },
  { label: 'Length (running)', units: ['Rft', 'Rmt'] },
  { label: 'Count & weight', units: ['Nos', 'Bags', 'Kg', 'Ton', 'Litre'] },
  { label: 'Time & labour', units: ['Hours', 'Days', 'Labour'] },
  { label: 'Lump sum & percent', units: ['LS', '%'] },
];
const isListedUnit = (u: string) => UNIT_GROUPS.some((g) => g.units.includes(u));

/** Unit picker: grouped dropdown (Sq.ft, Cu.m, Rft…) plus "Custom unit…" for anything else. */
export function UnitSelect({ value, onChange, className }: { value: string; onChange: (v: string) => void; className?: string }) {
  const [custom, setCustom] = useState(!isListedUnit(value) && value !== '');
  useEffect(() => { if (isListedUnit(value)) setCustom(false); }, [value]);
  if (custom) {
    return (
      <input
        autoFocus={!value}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => { if (!value.trim()) { onChange('Nos'); setCustom(false); } }}
        placeholder="Unit"
        title="Custom unit — clear it to choose from the list again"
        className={cn(inputClass, className)}
      />
    );
  }
  return (
    <select
      value={value || 'Nos'}
      title={UNIT_LABELS[value] ?? value}
      onChange={(e) => { if (e.target.value === '__custom__') { setCustom(true); onChange(''); } else onChange(e.target.value); }}
      className={cn(inputClass, selectChevron, 'cursor-pointer bg-[length:12px] bg-[right_6px_center] pr-5', className)}
    >
      {UNIT_GROUPS.map((g) => (
        <optgroup key={g.label} label={g.label}>
          {g.units.map((u) => <option key={u} value={u}>{u}</option>)}
        </optgroup>
      ))}
      <option value="__custom__">Custom unit…</option>
    </select>
  );
}

// ---------------------------------------------------------------------------
// Customer
// ---------------------------------------------------------------------------

const emptyCustomer = (): Partial<Customer> => ({ name: '', phone: '', email: '', address: '', state: 'Tamil Nadu', gstin: '', customer_type: 'Individual', notes: '' });

export function CustomerDialog({ open, onOpenChange, customer, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; customer?: Customer | null; onSaved?: (c: Customer) => void }) {
  const { refresh } = useData();
  const [form, setForm] = useState<Partial<Customer>>(emptyCustomer());
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => { if (open) { setForm(customer ? { ...customer } : emptyCustomer()); setErrors({}); } }, [open, customer]);
  const set = (patch: Partial<Customer>) => setForm((f) => ({ ...f, ...patch }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!form.name?.trim()) errs.name = 'Customer name is required';
    if (!isValidPhone(form.phone ?? '')) errs.phone = 'Enter a valid 10-digit phone number';
    if (!isValidEmail(form.email ?? '')) errs.email = 'Enter a valid email address';
    if (!isValidGstin(form.gstin ?? '')) errs.gstin = 'GSTIN should be 15 characters, e.g. 33ABCDE1234F1Z5';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      const saved = await upsertRow<Customer>('customers', { ...form, name: form.name!.trim(), gstin: (form.gstin ?? '').toUpperCase().trim() });
      await refresh('customers');
      toast.success(customer ? 'Customer updated' : 'Customer added');
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
        <DialogHeader><DialogTitle>{customer ? 'Edit customer' : 'Add customer'}</DialogTitle><DialogDescription>Details are filled in automatically on invoices and quotations.</DialogDescription></DialogHeader>
        <form onSubmit={submit} className="mt-2 grid gap-4 sm:grid-cols-2">
          <Field label="Customer name" required error={errors.name} className="sm:col-span-2"><TextInput autoFocus value={form.name ?? ''} onChange={(e) => set({ name: e.target.value })} placeholder="Person or company name" /></Field>
          <Field label="Phone" error={errors.phone}><TextInput type="tel" inputMode="tel" value={form.phone ?? ''} onChange={(e) => set({ phone: e.target.value })} placeholder="98765 43210" /></Field>
          <Field label="Email" error={errors.email}><TextInput type="email" value={form.email ?? ''} onChange={(e) => set({ email: e.target.value })} placeholder="name@example.com" /></Field>
          <Field label="Address" className="sm:col-span-2"><Textarea value={form.address ?? ''} onChange={(e) => set({ address: e.target.value })} rows={2} className="rounded-xl text-[15px] sm:text-sm" placeholder="Door no, street, area, city, PIN" /></Field>
          <Field label="State"><SelectNative value={form.state ?? 'Tamil Nadu'} onChange={(e) => set({ state: e.target.value })}>{INDIAN_STATES.map((s) => <option key={s}>{s}</option>)}</SelectNative></Field>
          <Field label="GSTIN" error={errors.gstin}><TextInput value={form.gstin ?? ''} onChange={(e) => set({ gstin: e.target.value.toUpperCase() })} placeholder="Optional" maxLength={15} /></Field>
          <Field label="Customer type" className="sm:col-span-2"><SelectNative value={form.customer_type ?? 'Individual'} onChange={(e) => set({ customer_type: e.target.value })}>{CUSTOMER_TYPES.map((t) => <option key={t}>{t}</option>)}</SelectNative></Field>
          <Field label="Notes" className="sm:col-span-2"><Textarea value={form.notes ?? ''} onChange={(e) => set({ notes: e.target.value })} rows={2} className="rounded-xl" placeholder="Internal notes (not printed)" /></Field>
          <div className="sm:col-span-2"><FormButtons busy={busy} onCancel={() => onOpenChange(false)} label={customer ? 'Save changes' : 'Add customer'} /></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Pickers
// ---------------------------------------------------------------------------

function Picker<T extends { id: string }>({ items, value, onChange, label, sub, placeholder, emptyText, onCreate, createLabel, disabled }: {
  items: T[]; value: string | null; onChange: (id: string | null) => void; label: (t: T) => string; sub?: (t: T) => string; placeholder: string;
  emptyText: string; onCreate?: () => void; createLabel?: string; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = items.find((i) => i.id === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" disabled={disabled} className={cn(inputClass, 'items-center justify-between text-left', !selected && 'text-slate-400')}>
          <span className="truncate">{selected ? label(selected) : placeholder}</span>
          <ChevronsUpDown size={15} className="ml-2 shrink-0 text-slate-400" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] min-w-[280px] rounded-xl p-0" align="start">
        <Command>
          <CommandInput placeholder="Search…" className="h-11" />
          <CommandList className="max-h-[300px]">
            <CommandEmpty>{emptyText}</CommandEmpty>
            {onCreate && (
              <CommandGroup>
                <CommandItem value="__create__ new add" onSelect={() => { setOpen(false); onCreate(); }} className="gap-2 py-2.5 font-medium text-brand-navy-3"><Plus size={15} /> {createLabel}</CommandItem>
              </CommandGroup>
            )}
            <CommandGroup>
              {value && <CommandItem value="__clear__ none" onSelect={() => { onChange(null); setOpen(false); }} className="text-muted-foreground">Clear selection</CommandItem>}
              {items.map((item) => (
                <CommandItem key={item.id} value={`${label(item)} ${sub?.(item) ?? ''} ${item.id}`} onSelect={() => { onChange(item.id); setOpen(false); }} className="gap-2 py-2">
                  <Check size={15} className={cn('shrink-0', value === item.id ? 'opacity-100' : 'opacity-0')} />
                  <span className="min-w-0"><span className="block truncate">{label(item)}</span>{sub && <span className="block truncate text-xs text-muted-foreground">{sub(item)}</span>}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function CustomerPicker({ value, onChange, disabled }: { value: string | null; onChange: (id: string | null) => void; disabled?: boolean }) {
  const { customers } = useData();
  const [creating, setCreating] = useState(false);
  return (
    <>
      <Picker items={customers} value={value} onChange={onChange} disabled={disabled} label={(c) => c.name} sub={(c) => [c.phone, c.gstin].filter(Boolean).join(' · ')}
        placeholder="Select customer" emptyText="No customers found." onCreate={() => setCreating(true)} createLabel="Add new customer" />
      <CustomerDialog open={creating} onOpenChange={setCreating} onSaved={(c) => onChange(c.id)} />
    </>
  );
}

export function ProjectPicker({ value, onChange, customerId, disabled }: { value: string | null; onChange: (id: string | null) => void; customerId: string | null; disabled?: boolean }) {
  const { projects } = useData();
  const [creating, setCreating] = useState(false);
  const list = useMemo(() => (customerId ? projects.filter((p) => p.customer_id === customerId) : projects), [projects, customerId]);
  return (
    <>
      <Picker items={list} value={value} onChange={onChange} disabled={disabled} label={(p) => p.project_name} sub={(p) => [p.project_code, p.location].filter(Boolean).join(' · ')}
        placeholder={customerId && !list.length ? 'No projects yet — add one' : 'Select project (optional)'} emptyText="No projects found." onCreate={() => setCreating(true)} createLabel="Add new project" />
      <ProjectDialog open={creating} onOpenChange={setCreating} defaultCustomerId={customerId} onSaved={(p) => onChange(p.id)} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Project
// ---------------------------------------------------------------------------

export function ProjectDialog({ open, onOpenChange, project, defaultCustomerId, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; project?: Project | null; defaultCustomerId?: string | null; onSaved?: (p: Project) => void }) {
  const { refresh } = useData();
  const blank = (): Partial<Project> => ({ project_name: '', project_code: '', customer_id: defaultCustomerId ?? '', location: '', project_type: 'Residential construction', start_date: todayISO(), expected_completion_date: null, status: 'Planning', estimated_budget: 0, description: '' });
  const [form, setForm] = useState<Partial<Project>>(blank());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (open) { setForm(project ? { ...project } : blank()); setError(''); } }, [open, project]);
  const set = (patch: Partial<Project>) => setForm((f) => ({ ...f, ...patch }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.project_name?.trim()) return setError('Project name is required');
    if (!form.customer_id) return setError('Select the customer for this project');
    if (form.start_date && form.expected_completion_date && form.expected_completion_date < form.start_date) return setError('Completion date cannot be before the start date');
    setBusy(true);
    try {
      const row: Record<string, unknown> = { ...form, project_name: form.project_name.trim(), start_date: form.start_date || null, expected_completion_date: form.expected_completion_date || null };
      if (!String(row.project_code ?? '').trim()) delete row.project_code;
      const saved = await upsertRow<Project>('projects', row);
      await refresh('projects');
      toast.success(project ? 'Project updated' : `Project ${saved.project_code} created`);
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
        <DialogHeader><DialogTitle>{project ? 'Edit project' : 'New project'}</DialogTitle><DialogDescription>Invoices and quotations can be grouped under a project.</DialogDescription></DialogHeader>
        <form onSubmit={submit} className="mt-2 grid gap-4 sm:grid-cols-2">
          <Field label="Project name" required className="sm:col-span-2"><TextInput autoFocus value={form.project_name ?? ''} onChange={(e) => set({ project_name: e.target.value })} placeholder="e.g. G+2 residence at Avinashi" /></Field>
          <Field label="Customer" required className="sm:col-span-2"><CustomerPicker value={form.customer_id || null} onChange={(id) => set({ customer_id: id ?? '' })} /></Field>
          <Field label="Project ID" hint={project ? undefined : 'Leave blank to auto-generate (PRJ-0001…)'}><TextInput value={form.project_code ?? ''} onChange={(e) => set({ project_code: e.target.value.toUpperCase() })} placeholder="Auto" /></Field>
          <Field label="Project type"><SelectNative value={form.project_type} onChange={(e) => set({ project_type: e.target.value })}>{PROJECT_TYPES.map((t) => <option key={t}>{t}</option>)}</SelectNative></Field>
          <Field label="Location / site address" className="sm:col-span-2"><TextInput value={form.location ?? ''} onChange={(e) => set({ location: e.target.value })} placeholder="Site address" /></Field>
          <Field label="Start date"><TextInput type="date" value={form.start_date ?? ''} onChange={(e) => set({ start_date: e.target.value || null })} /></Field>
          <Field label="Expected completion"><TextInput type="date" value={form.expected_completion_date ?? ''} onChange={(e) => set({ expected_completion_date: e.target.value || null })} /></Field>
          <Field label="Status"><SelectNative value={form.status} onChange={(e) => set({ status: e.target.value as Project['status'] })}>{PROJECT_STATUSES.map((s) => <option key={s}>{s}</option>)}</SelectNative></Field>
          <Field label="Estimated budget (₹)"><NumberInput value={form.estimated_budget ?? 0} onValue={(v) => set({ estimated_budget: v ?? 0 })} allowEmpty placeholder="0" /></Field>
          <Field label="Description" className="sm:col-span-2"><Textarea value={form.description ?? ''} onChange={(e) => set({ description: e.target.value })} rows={3} className="rounded-xl" placeholder="Scope of work, specifications…" /></Field>
          {error && <p className="rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-700 sm:col-span-2">{error}</p>}
          <div className="sm:col-span-2"><FormButtons busy={busy} onCancel={() => onOpenChange(false)} label={project ? 'Save changes' : 'Create project'} /></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Payment
// ---------------------------------------------------------------------------

export function PaymentDialog({ open, onOpenChange, invoice, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; invoice?: Invoice | null; onSaved?: (p: Payment) => void }) {
  const { invoices, customerById, refresh } = useData();
  const openInvoices = useMemo(() => invoices.filter((i) => i.status !== 'Cancelled' && i.balance_due > 0.009), [invoices]);
  const [invoiceId, setInvoiceId] = useState<string | null>(null);
  const [amount, setAmount] = useState(0);
  const [date, setDate] = useState(todayISO());
  const [method, setMethod] = useState<Payment['method']>('UPI');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const target = invoices.find((i) => i.id === invoiceId) ?? invoice ?? null;

  useEffect(() => {
    if (!open) return;
    setInvoiceId(invoice?.id ?? null);
    setAmount(invoice ? Math.max(0, invoice.balance_due) : 0);
    setDate(todayISO()); setMethod('UPI'); setReference(''); setNotes(''); setError('');
  }, [open, invoice]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!target) return setError('Choose the invoice this payment is for');
    if (!(amount > 0)) return setError('Enter the amount received');
    if (amount > target.balance_due + 0.009) return setError(`Amount cannot exceed the balance due of ${inr(target.balance_due)}`);
    setBusy(true);
    try {
      const saved = await upsertRow<Payment>('payments', { invoice_id: target.id, amount, payment_date: date, method, reference: reference.trim(), notes: notes.trim() });
      await refresh('payments', 'invoices');
      toast.success(`Payment of ${inr(amount)} recorded · ${saved.receipt_number}`);
      onSaved?.(saved);
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
        <DialogHeader><DialogTitle>Record payment</DialogTitle><DialogDescription>Balances and invoice status update automatically.</DialogDescription></DialogHeader>
        <form onSubmit={submit} className="mt-2 grid gap-4 sm:grid-cols-2">
          {!invoice && (
            <Field label="Invoice" required className="sm:col-span-2">
              <Picker items={openInvoices} value={invoiceId} onChange={(id) => { setInvoiceId(id); const inv = invoices.find((i) => i.id === id); setAmount(inv ? inv.balance_due : 0); }}
                label={(i) => `${i.invoice_number} — ${customerById.get(i.customer_id ?? '')?.name ?? 'Customer'}`} sub={(i) => `Balance ${inr(i.balance_due)} · ${fmtDate(i.invoice_date)}`}
                placeholder="Select an open invoice" emptyText="No invoices with a balance due." />
            </Field>
          )}
          {target && (
            <div className="grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-3 text-center sm:col-span-2">
              <div><p className="text-[11px] text-muted-foreground">Net payable</p><p className="num text-sm font-semibold">{inr(target.net_payable)}</p></div>
              <div><p className="text-[11px] text-muted-foreground">Received</p><p className="num text-sm font-semibold text-emerald-600">{inr(target.amount_paid + target.advance_paid + target.previous_payments)}</p></div>
              <div><p className="text-[11px] text-muted-foreground">Balance</p><p className="num text-sm font-semibold text-brand-orange-dark">{inr(target.balance_due)}</p></div>
            </div>
          )}
          <Field label="Amount received (₹)" required>
            <NumberInput value={amount} onValue={(v) => setAmount(v ?? 0)} className="text-lg font-semibold" />
            {target && amount !== target.balance_due && <button type="button" onClick={() => setAmount(target.balance_due)} className="mt-1 text-xs font-medium text-brand-navy-3 hover:underline">Full balance {inr(target.balance_due)}</button>}
          </Field>
          <Field label="Payment date" required><TextInput type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="Payment method" className="sm:col-span-2">
            <Segmented value={method} onChange={setMethod} options={PAYMENT_METHODS.map((m) => ({ value: m, label: m }))} className="flex w-full flex-wrap" />
          </Field>
          <Field label={method === 'Cheque' ? 'Cheque number & bank' : 'Transaction reference'} className="sm:col-span-2"><TextInput value={reference} onChange={(e) => setReference(e.target.value)} placeholder={method === 'UPI' ? 'UPI transaction ID / UTR' : method === 'Bank Transfer' ? 'UTR / NEFT reference' : 'Optional'} /></Field>
          <Field label="Notes" className="sm:col-span-2"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="rounded-xl" placeholder="Printed on the receipt" /></Field>
          {error && <p className="rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-700 sm:col-span-2">{error}</p>}
          <div className="sm:col-span-2"><FormButtons busy={busy} onCancel={() => onOpenChange(false)} label="Record payment" /></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Expense
// ---------------------------------------------------------------------------

export function ExpenseDialog({ open, onOpenChange, expense, defaultProjectId }: { open: boolean; onOpenChange: (o: boolean) => void; expense?: Expense | null; defaultProjectId?: string | null }) {
  const { projects, refresh } = useData();
  const blank = (): Partial<Expense> => ({ expense_date: todayISO(), category: 'Material', project_id: defaultProjectId ?? null, vendor: '', description: '', amount: 0, payment_method: 'Cash', reference: '', notes: '' });
  const [form, setForm] = useState<Partial<Expense>>(blank());
  const [busy, setBusy] = useState(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (open) setForm(expense ? { ...expense } : blank()); }, [open, expense]);
  const set = (patch: Partial<Expense>) => setForm((f) => ({ ...f, ...patch }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!((form.amount ?? 0) > 0)) return toast.error('Enter the expense amount');
    setBusy(true);
    try {
      await upsertRow('expenses', { ...form, project_id: form.project_id || null });
      await refresh('expenses');
      toast.success(expense ? 'Expense updated' : 'Expense recorded');
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
        <DialogHeader><DialogTitle>{expense ? 'Edit expense' : 'Record expense'}</DialogTitle><DialogDescription>Track material, labour and site costs for profit reporting.</DialogDescription></DialogHeader>
        <form onSubmit={submit} className="mt-2 grid gap-4 sm:grid-cols-2">
          <Field label="Amount (₹)" required><NumberInput value={form.amount ?? 0} onValue={(v) => set({ amount: v ?? 0 })} autoFocus className="text-lg font-semibold" /></Field>
          <Field label="Date" required><TextInput type="date" value={form.expense_date ?? ''} onChange={(e) => set({ expense_date: e.target.value })} /></Field>
          <Field label="Category" hint={form.category === 'Labour' ? 'Daily-wage labourers marked in Labour attendance are added automatically — record only other labour costs here.' : undefined}><SelectNative value={form.category} onChange={(e) => set({ category: e.target.value })}>{EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</SelectNative></Field>
          <Field label="Project"><SelectNative value={form.project_id ?? ''} onChange={(e) => set({ project_id: e.target.value || null })}><option value="">General / not project specific</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.project_name}</option>)}</SelectNative></Field>
          <Field label="Vendor / paid to"><TextInput value={form.vendor ?? ''} onChange={(e) => set({ vendor: e.target.value })} placeholder="Supplier or worker" /></Field>
          <Field label="Payment method"><SelectNative value={form.payment_method} onChange={(e) => set({ payment_method: e.target.value })}>{PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}</SelectNative></Field>
          <Field label="Description" className="sm:col-span-2"><TextInput value={form.description ?? ''} onChange={(e) => set({ description: e.target.value })} placeholder="e.g. 200 bags cement" /></Field>
          <Field label="Reference / bill no." className="sm:col-span-2"><TextInput value={form.reference ?? ''} onChange={(e) => set({ reference: e.target.value })} /></Field>
          <div className="sm:col-span-2"><FormButtons busy={busy} onCancel={() => onOpenChange(false)} label={expense ? 'Save changes' : 'Record expense'} /></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Catalogue item
// ---------------------------------------------------------------------------

export function CatalogDialog({ open, onOpenChange, item }: { open: boolean; onOpenChange: (o: boolean) => void; item?: CatalogItem | null }) {
  const { refresh, settings } = useData();
  const blank = (): Partial<CatalogItem> => ({ name: '', category: 'Material', unit: 'Nos', rate: 0, tax_rate: settings.default_tax_rate, hsn_sac: '', description: '', active: true });
  const [form, setForm] = useState<Partial<CatalogItem>>(blank());
  const [busy, setBusy] = useState(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (open) setForm(item ? { ...item } : blank()); }, [open, item]);
  const set = (patch: Partial<CatalogItem>) => setForm((f) => ({ ...f, ...patch }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name?.trim()) return toast.error('Item name is required');
    setBusy(true);
    try {
      await upsertRow('catalog_items', { ...form, name: form.name.trim() });
      await refresh('catalog');
      toast.success(item ? 'Item updated' : 'Item added to catalogue');
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
        <DialogHeader><DialogTitle>{item ? 'Edit catalogue item' : 'Add catalogue item'}</DialogTitle><DialogDescription>Reusable materials, labour and work items with default rates.</DialogDescription></DialogHeader>
        <form onSubmit={submit} className="mt-2 grid gap-4 sm:grid-cols-2">
          <Field label="Item / work description" required className="sm:col-span-2"><TextInput autoFocus value={form.name ?? ''} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Brickwork in CM 1:6" /></Field>
          <Field label="Category"><SelectNative value={form.category} onChange={(e) => set({ category: e.target.value })}>{CATALOG_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</SelectNative></Field>
          <Field label="Unit"><UnitSelect value={form.unit ?? 'Nos'} onChange={(v) => set({ unit: v })} /></Field>
          <Field label="Default rate (₹)"><NumberInput value={form.rate ?? 0} onValue={(v) => set({ rate: v ?? 0 })} allowEmpty placeholder="0.00" /></Field>
          <Field label="GST %"><TextInput list="gst-rates" inputMode="decimal" value={String(form.tax_rate ?? 0)} onChange={(e) => set({ tax_rate: Number(e.target.value.replace(/[^\d.]/g, '')) || 0 })} /><datalist id="gst-rates">{GST_RATES.map((r) => <option key={r} value={r} />)}</datalist></Field>
          <Field label="HSN / SAC code"><TextInput value={form.hsn_sac ?? ''} onChange={(e) => set({ hsn_sac: e.target.value })} /></Field>
          <div className="flex items-end"><Toggle checked={form.active ?? true} onChange={(v) => set({ active: v })} label="Active" description="Show in item suggestions" /></div>
          <div className="sm:col-span-2"><FormButtons busy={busy} onCancel={() => onOpenChange(false)} label={item ? 'Save changes' : 'Add item'} /></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
