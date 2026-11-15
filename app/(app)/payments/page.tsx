'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { BellRing, Download, Loader2, Plus, Trash2, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth, useData } from '@/components/providers';
import { Card, ConfirmDialog, EmptyState, LoadingPanel, PageHeader, SearchInput, Segmented, SelectNative, StatusBadge, TextInput, matches, useDebounced } from '@/components/common';
import { PaymentDialog } from '@/components/forms';
import { cn } from '@/lib/utils';
import { PAYMENT_METHODS } from '@/lib/constants';
import { deleteRow, friendlyError, updateInvoice } from '@/lib/data';
import { fmtDate, inr, slug } from '@/lib/format';
import { generateReceiptPdf } from '@/lib/pdf/lazy';
import { downloadBytes, openWhatsAppText } from '@/lib/share';
import { daysOverdue, invoiceStatus, isBillable } from '@/lib/status';
import type { Invoice, Payment } from '@/lib/types';

const BUCKETS = [
  { key: 'current', label: 'Not yet due', test: (d: number) => d <= 0 },
  { key: '30', label: '1–30 days', test: (d: number) => d >= 1 && d <= 30 },
  { key: '60', label: '31–60 days', test: (d: number) => d >= 31 && d <= 60 },
  { key: '90', label: '61–90 days', test: (d: number) => d >= 61 && d <= 90 },
  { key: '90+', label: '90+ days', test: (d: number) => d > 90 },
];

function PaymentsInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { isAdmin } = useAuth();
  const { payments, invoices, invoiceById, customerById, settings, refresh, loading } = useData();
  const [tab, setTab] = useState<'received' | 'pending'>(params.get('tab') === 'pending' ? 'pending' : 'received');
  const [recordOpen, setRecordOpen] = useState(false);
  const [recordFor, setRecordFor] = useState<Invoice | null>(null);
  const [query, setQuery] = useState('');
  const [method, setMethod] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [bucket, setBucket] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Payment | null>(null);
  const q = useDebounced(query);

  useEffect(() => { if (params.get('record') === '1') setRecordOpen(true); }, [params]);

  const received = useMemo(() => payments.filter((p) => {
    if (method && p.method !== method) return false;
    if (from && p.payment_date < from) return false;
    if (to && p.payment_date > to) return false;
    const inv = invoiceById.get(p.invoice_id);
    return matches(q, p.receipt_number, p.reference, inv?.invoice_number, customerById.get(p.customer_id ?? '')?.name, p.amount);
  }).sort((a, b) => b.payment_date.localeCompare(a.payment_date) || b.created_at.localeCompare(a.created_at)), [payments, method, from, to, q, invoiceById, customerById]);

  const pending = useMemo(() => invoices.filter((i) => isBillable(i) && i.balance_due > 0.009), [invoices]);
  const aging = useMemo(() => BUCKETS.map((b) => {
    const list = pending.filter((i) => b.test(i.due_date ? daysOverdue(i) : 0));
    return { ...b, count: list.length, total: list.reduce((s, i) => s + i.balance_due, 0) };
  }), [pending]);
  const pendingFiltered = useMemo(() => pending.filter((i) => {
    if (bucket) { const b = BUCKETS.find((x) => x.key === bucket)!; if (!b.test(i.due_date ? daysOverdue(i) : 0)) return false; }
    return matches(q, i.invoice_number, customerById.get(i.customer_id ?? '')?.name);
  }).sort((a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999')), [pending, bucket, q, customerById]);

  const receipt = async (p: Payment) => {
    setBusy(p.id);
    try {
      const inv = invoiceById.get(p.invoice_id);
      if (!inv) throw new Error('Invoice not found');
      const paidToDate = payments.filter((x) => x.invoice_id === p.invoice_id && (x.payment_date < p.payment_date || (x.payment_date === p.payment_date && x.created_at <= p.created_at))).reduce((s, x) => s + x.amount, 0);
      downloadBytes(await generateReceiptPdf(p, inv, settings, customerById.get(inv.customer_id ?? ''), paidToDate), `${slug(p.receipt_number)}.pdf`);
    } catch (e) { toast.error(friendlyError(e)); } finally { setBusy(null); }
  };

  const remind = async (inv: Invoice) => {
    const c = customerById.get(inv.customer_id ?? '');
    const over = daysOverdue(inv);
    openWhatsAppText(c?.phone, `Dear ${c?.name ?? 'Sir/Madam'},\n\nThis is a gentle reminder that invoice ${inv.invoice_number} dated ${fmtDate(inv.invoice_date)} has a balance of ${inr(inv.balance_due)}${inv.due_date ? `, due on ${fmtDate(inv.due_date)}` : ''}${over > 0 ? ` (overdue by ${over} days)` : ''}. Kindly arrange the payment at the earliest.${settings.upi_id ? `\n\nUPI: ${settings.upi_id}` : ''}\n\nRegards,\n${settings.company_name}`);
    try { await updateInvoice(inv.id, { last_reminder_at: new Date().toISOString() }); await refresh('invoices'); } catch { /* reminder still sent */ }
  };

  if (loading) return <LoadingPanel />;
  const totalReceived = received.reduce((s, p) => s + p.amount, 0);

  return (
    <div className="animate-in-up">
      <PageHeader title="Payments" description="Collections, receipts and outstanding balances." actions={<button onClick={() => { setRecordFor(null); setRecordOpen(true); }} className="flex h-10 items-center gap-2 rounded-xl bg-brand-orange px-4 text-sm font-semibold text-white shadow-sm shadow-brand-orange/30 hover:bg-brand-orange-dark"><Plus size={16} />Record payment</button>} />
      <Segmented value={tab} onChange={setTab} className="mb-4" options={[{ value: 'received', label: `Received (${payments.length})` }, { value: 'pending', label: `Pending & overdue (${pending.length})` }]} />

      {tab === 'received' ? (
        <>
          <Card className="mb-4 grid gap-2 p-3 sm:grid-cols-[1fr_170px_160px_160px] sm:p-4">
            <SearchInput value={query} onChange={setQuery} placeholder="Search receipt, invoice, customer, reference…" />
            <SelectNative value={method} onChange={(e) => setMethod(e.target.value)}><option value="">All methods</option>{PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}</SelectNative>
            <TextInput type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From" />
            <TextInput type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To" />
          </Card>
          <p className="mb-3 text-sm text-muted-foreground">{received.length} payments · <span className="num font-semibold text-emerald-700">{inr(totalReceived)}</span></p>
          {!received.length ? <Card><EmptyState icon={Wallet} title="No payments found" description="Payments you record against invoices appear here with downloadable receipts." /></Card> : (
            <Card className="divide-y overflow-hidden">
              {received.map((p) => {
                const inv = invoiceById.get(p.invoice_id);
                return (
                  <div key={p.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4 sm:px-5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{customerById.get(p.customer_id ?? '')?.name ?? '—'}</p>
                      <p className="truncate text-xs text-muted-foreground">{p.receipt_number} · {fmtDate(p.payment_date)} · {p.method}{p.reference ? ` · ${p.reference}` : ''}</p>
                    </div>
                    <div className="flex items-center justify-between gap-3 sm:justify-end">
                      {inv && <Link href={`/invoices/${inv.id}`} className="text-xs font-medium text-brand-navy-3 hover:underline">{inv.invoice_number}</Link>}
                      <p className="num w-32 text-right font-semibold text-emerald-700">{inr(p.amount)}</p>
                      <button onClick={() => receipt(p)} className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-100" title="Download receipt">{busy === p.id ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}</button>
                      {isAdmin && <button onClick={() => setDeleting(p)} className="grid h-9 w-9 place-items-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600" title="Delete"><Trash2 size={16} /></button>}
                    </div>
                  </div>
                );
              })}
            </Card>
          )}
        </>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
            {aging.map((b) => (
              <button key={b.key} onClick={() => setBucket(bucket === b.key ? '' : b.key)} className={cn('rounded-2xl border bg-white p-3 text-left transition', bucket === b.key ? 'border-brand-navy ring-2 ring-brand-navy/10' : 'hover:border-slate-300')}>
                <p className={cn('text-xs font-medium', b.key === 'current' ? 'text-sky-700' : b.key === '30' ? 'text-amber-700' : 'text-red-700')}>{b.label}</p>
                <p className="num mt-1 text-base font-semibold">{inr(b.total, 0)}</p>
                <p className="text-[11px] text-muted-foreground">{b.count} invoice{b.count === 1 ? '' : 's'}</p>
              </button>
            ))}
          </div>
          <SearchInput value={query} onChange={setQuery} placeholder="Search invoice or customer…" className="mb-4" />
          {!pendingFiltered.length ? <Card><EmptyState icon={Wallet} title="Nothing pending" description="All issued invoices are fully paid." /></Card> : (
            <Card className="divide-y overflow-hidden">
              {pendingFiltered.map((inv) => {
                const c = customerById.get(inv.customer_id ?? '');
                const over = daysOverdue(inv);
                return (
                  <div key={inv.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4 sm:px-5">
                    <button onClick={() => router.push(`/invoices/${inv.id}`)} className="min-w-0 flex-1 text-left">
                      <div className="flex items-center gap-2"><p className="truncate text-sm font-semibold">{c?.name ?? '—'}</p><StatusBadge status={invoiceStatus(inv)} /></div>
                      <p className="truncate text-xs text-muted-foreground">{inv.invoice_number} · due {fmtDate(inv.due_date)}{over > 0 ? <span className="text-red-600"> · {over} days overdue</span> : ''}{inv.last_reminder_at ? ` · reminded ${fmtDate(inv.last_reminder_at)}` : ''}</p>
                    </button>
                    <div className="flex items-center justify-between gap-2 sm:justify-end">
                      <p className="num w-32 font-semibold text-brand-orange-dark sm:text-right">{inr(inv.balance_due)}</p>
                      <button onClick={() => remind(inv)} className="flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold text-[#128C7E] hover:bg-emerald-50"><BellRing size={14} />Remind</button>
                      <button onClick={() => { setRecordFor(inv); setRecordOpen(true); }} className="flex h-9 items-center gap-1.5 rounded-lg bg-brand-navy px-3 text-xs font-semibold text-white"><Wallet size={14} />Record</button>
                    </div>
                  </div>
                );
              })}
            </Card>
          )}
        </>
      )}

      <PaymentDialog open={recordOpen} onOpenChange={(o) => { setRecordOpen(o); if (!o && params.get('record')) router.replace('/payments'); }} invoice={recordFor} />
      <ConfirmDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)} title="Delete this payment?" destructive confirmLabel="Delete payment"
        description={deleting ? `${inr(deleting.amount)} (${deleting.receipt_number}). The invoice balance and status will be recalculated.` : ''}
        onConfirm={async () => { try { await deleteRow('payments', deleting!.id); await refresh('payments', 'invoices'); toast.success('Payment deleted'); } catch (e) { toast.error(friendlyError(e)); throw e; } }} />
    </div>
  );
}

export default function PaymentsPage() {
  return <Suspense fallback={<LoadingPanel />}><PaymentsInner /></Suspense>;
}
