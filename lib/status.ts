import { daysBetween, todayISO } from '@/lib/format';
import type { DisplayStatus, Invoice } from '@/lib/types';

/** Invoices past their due date with money outstanding are shown as Overdue. */
export const invoiceStatus = (inv: Pick<Invoice, 'status' | 'due_date' | 'balance_due'>): DisplayStatus => {
  if ((inv.status === 'Sent' || inv.status === 'Partially Paid') && inv.due_date && inv.due_date < todayISO() && inv.balance_due > 0.009) return 'Overdue';
  return inv.status;
};

/** Counts towards revenue / receivables (excludes drafts, cancelled and proforma). */
export const isBillable = (inv: Pick<Invoice, 'status' | 'invoice_type'>) =>
  inv.status !== 'Draft' && inv.status !== 'Cancelled' && inv.invoice_type !== 'Proforma Invoice';

export const receivedOn = (inv: Pick<Invoice, 'amount_paid' | 'advance_paid' | 'previous_payments'>) =>
  inv.amount_paid + inv.advance_paid + inv.previous_payments;

export const daysOverdue = (inv: Pick<Invoice, 'due_date'>) => (inv.due_date ? Math.max(0, daysBetween(inv.due_date, todayISO())) : 0);

export const STATUS_STYLES: Record<string, string> = {
  Draft: 'bg-slate-100 text-slate-600 ring-slate-200',
  Sent: 'bg-sky-50 text-sky-700 ring-sky-200',
  'Partially Paid': 'bg-amber-50 text-amber-700 ring-amber-200',
  Paid: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  Overdue: 'bg-red-50 text-red-700 ring-red-200',
  Cancelled: 'bg-zinc-100 text-zinc-500 ring-zinc-200 line-through',
  Approved: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  Rejected: 'bg-red-50 text-red-700 ring-red-200',
  Expired: 'bg-zinc-100 text-zinc-500 ring-zinc-200',
  Converted: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
  Planning: 'bg-slate-100 text-slate-600 ring-slate-200',
  'In Progress': 'bg-sky-50 text-sky-700 ring-sky-200',
  'On Hold': 'bg-amber-50 text-amber-700 ring-amber-200',
  Completed: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
};

export const STATUS_COLORS: Record<string, string> = {
  Draft: '#94a3b8', Sent: '#0ea5e9', 'Partially Paid': '#f59e0b', Paid: '#10b981', Overdue: '#ef4444', Cancelled: '#a1a1aa',
};
