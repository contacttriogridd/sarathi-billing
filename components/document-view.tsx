'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Ban, BellRing, CheckCircle2, ChevronDown, Copy, Download, Eye, FileOutput, Loader2, Mail, MessageCircle, Pencil, Printer, Receipt, Send, Trash2, Wallet, XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth, useData } from '@/components/providers';
import { ActivityTimeline } from '@/components/activity';
import { Card, CardTitle, ConfirmDialog, KeyValue, LoadingPanel, StatusBadge } from '@/components/common';
import { PaymentDialog } from '@/components/forms';
import { PdfPreviewDialog, PdfViewer, type PdfJob } from '@/components/pdf-viewer';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { deleteInvoice, deleteQuotation, deleteRow, fetchAudit, friendlyError, getInvoice, getQuotation, updateInvoice, updateQuotation } from '@/lib/data';
import { generateInvoicePdf, generateQuotationPdf, generateReceiptPdf } from '@/lib/pdf/lazy';
import { invoiceTitle } from '@/lib/constants';
import { daysOverdue, invoiceStatus } from '@/lib/status';
import { fmtDate, inr, slug } from '@/lib/format';
import { downloadBytes, openEmail, openWhatsAppText, printPdf, shareToWhatsApp } from '@/lib/share';
import type { AuditLog, Invoice, LineItem, Payment, Quotation, QuotationStatus } from '@/lib/types';

type Full<T> = T & { items: LineItem[] };

function ActionButton({ onClick, icon: Icon, label, primary, busy, disabled, className = '' }: { onClick: () => void; icon: typeof Download; label: string; primary?: boolean; busy?: boolean; disabled?: boolean; className?: string }) {
  return (
    <button onClick={onClick} disabled={disabled || busy} className={`flex h-10 items-center justify-center gap-2 rounded-xl px-3.5 text-sm font-semibold transition disabled:opacity-50 ${primary ? 'bg-brand-orange text-white shadow-sm shadow-brand-orange/30 hover:bg-brand-orange-dark' : 'border bg-white text-brand-ink hover:bg-slate-50'} ${className}`}>
      {busy ? <Loader2 size={16} className="animate-spin" /> : <Icon size={16} />}<span>{label}</span>
    </button>
  );
}

const useAudit = (ids: string[], version: string) => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const key = ids.join(',');
  useEffect(() => {
    if (!ids.length) return;
    let active = true;
    fetchAudit({ entityIds: ids, limit: 40 }).then((l) => { if (active) setLogs(l); }).catch(() => undefined);
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, version]);
  return logs;
};

// ===========================================================================
// Invoice
// ===========================================================================

export function InvoiceView({ id }: { id: string }) {
  const router = useRouter();
  const { isAdmin } = useAuth();
  const { settings, invoiceById, payments, customerById, projectById, refresh, loading } = useData();
  const header = invoiceById.get(id);
  const [inv, setInv] = useState<Full<Invoice> | null | 'missing'>(null);
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [confirm, setConfirm] = useState<null | 'cancel' | 'delete' | { payment: Payment }>(null);
  const version = `${header?.updated_at ?? ''}-${header?.amount_paid ?? ''}-${header?.status ?? ''}`;

  useEffect(() => {
    if (loading) return;
    let active = true;
    getInvoice(id).then((r) => { if (active) setInv(r ?? 'missing'); }).catch((e) => { toast.error(friendlyError(e)); if (active) setInv('missing'); });
    return () => { active = false; };
  }, [id, version, loading]);

  const customer = inv && inv !== 'missing' && inv.customer_id ? customerById.get(inv.customer_id) : undefined;
  const project = inv && inv !== 'missing' && inv.project_id ? projectById.get(inv.project_id) : undefined;

  useEffect(() => {
    if (!inv || inv === 'missing') return;
    let active = true;
    setBytes(null);
    generateInvoicePdf(inv, inv.items, settings, customer, project).then((b) => { if (active) setBytes(b); }).catch((e) => toast.error(friendlyError(e)));
    return () => { active = false; };
  }, [inv, settings, customer, project]);

  const invPayments = useMemo(() => payments.filter((p) => p.invoice_id === id).sort((a, b) => a.payment_date.localeCompare(b.payment_date)), [payments, id]);
  const logs = useAudit([id, ...invPayments.map((p) => p.id)], version + invPayments.length);

  if (inv === null) return <LoadingPanel />;
  if (inv === 'missing') return <div className="py-20 text-center"><p className="text-sm text-muted-foreground">This invoice could not be found or was deleted.</p><Link href="/invoices" className="mt-3 inline-block text-sm font-semibold text-brand-navy-3">Back to invoices</Link></div>;

  const status = invoiceStatus(inv);
  const title = invoiceTitle(inv.invoice_type, inv.tax_mode);
  const filename = `${slug(inv.invoice_number)}.pdf`;
  const received = inv.amount_paid + inv.advance_paid + inv.previous_payments;
  const progress = inv.net_payable > 0 ? Math.min(100, (received / inv.net_payable) * 100) : 0;
  const canEdit = inv.status !== 'Cancelled' && (inv.status === 'Draft' || isAdmin);
  const shareMessage = `Dear ${customer?.name ?? 'Sir/Madam'},\n\nGreetings from ${settings.company_name}. Please find ${title.toLowerCase().replace(/\b\w/g, (m) => m.toUpperCase())} ${inv.invoice_number} dated ${fmtDate(inv.invoice_date)} for ${inr(inv.grand_total)}.${inv.balance_due > 0 ? `\nBalance due: ${inr(inv.balance_due)}${inv.due_date ? ` (due ${fmtDate(inv.due_date)})` : ''}.` : ''}${settings.upi_id && inv.balance_due > 0 ? `\nUPI: ${settings.upi_id}` : ''}\n\nThank you,\n${settings.company_name}${settings.phone ? `\n${settings.phone}` : ''}`;
  const job: PdfJob | null = bytes ? { bytes, filename, share: { phone: customer?.phone, message: shareMessage, path: `invoices/${inv.id}/${filename}` } } : null;

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try { await fn(); } catch (e) { toast.error(friendlyError(e)); } finally { setBusy(null); }
  };

  const share = () => run('share', async () => {
    if (!bytes) return;
    const r = await shareToWhatsApp({ bytes, filename, message: shareMessage, phone: customer?.phone, storagePath: `invoices/${inv.id}/${filename}` });
    if (r === 'opened-whatsapp') toast.info('PDF downloaded — attach it in the WhatsApp chat that opened.');
    if (inv.status === 'Draft') toast.message('This invoice is still a draft. Issue it to start tracking payments.');
  });

  const reminderText = `Dear ${customer?.name ?? 'Sir/Madam'},\n\nThis is a gentle reminder that invoice ${inv.invoice_number} dated ${fmtDate(inv.invoice_date)} has a balance of ${inr(inv.balance_due)}${inv.due_date ? `, due on ${fmtDate(inv.due_date)}` : ''}${status === 'Overdue' ? ` (overdue by ${daysOverdue(inv)} days)` : ''}. Kindly arrange the payment at the earliest.${settings.upi_id ? `\n\nUPI: ${settings.upi_id}` : ''}${settings.bank_account_number ? `\nBank: ${settings.bank_name} A/c ${settings.bank_account_number}, IFSC ${settings.bank_ifsc}` : ''}\n\nRegards,\n${settings.company_name}${settings.phone ? `\n${settings.phone}` : ''}`;
  const remind = (channel: 'whatsapp' | 'email') => run('remind', async () => {
    if (channel === 'whatsapp') openWhatsAppText(customer?.phone, reminderText);
    else openEmail(customer?.email, `Payment reminder — ${inv.invoice_number}`, reminderText);
    await updateInvoice(inv.id, { last_reminder_at: new Date().toISOString() });
    await refresh('invoices');
  });

  const receipt = (p: Payment) => run(`rc-${p.id}`, async () => {
    const paidToDate = invPayments.filter((x) => x.payment_date < p.payment_date || (x.payment_date === p.payment_date && x.created_at <= p.created_at)).reduce((s, x) => s + x.amount, 0);
    const b = await generateReceiptPdf(p, inv, settings, customer, paidToDate);
    downloadBytes(b, `${slug(p.receipt_number)}.pdf`);
  });

  return (
    <div className="animate-in-up">
      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <button onClick={() => router.push('/invoices')} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border bg-white hover:bg-slate-50" aria-label="Back"><ArrowLeft size={18} /></button>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2"><h1 className="truncate text-xl font-semibold tracking-tight text-brand-ink sm:text-2xl">{inv.invoice_number}</h1><StatusBadge status={status} /></div>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {title.charAt(0) + title.slice(1).toLowerCase()} · {customer ? <Link href={`/customers/${customer.id}`} className="font-medium text-brand-navy-3 hover:underline">{customer.name}</Link> : inv.snapshot?.customer?.name ?? 'No customer'}
              {project && <> · <Link href={`/projects/${project.id}`} className="hover:underline">{project.project_name}</Link></>}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {inv.status !== 'Cancelled' && inv.balance_due > 0.009 && inv.status !== 'Draft' && <ActionButton primary icon={Wallet} label="Record payment" onClick={() => setPayOpen(true)} />}
          {inv.status === 'Draft' && <ActionButton primary icon={Send} label="Issue invoice" busy={busy === 'issue'} onClick={() => run('issue', async () => {
            if (!inv.customer_id) throw new Error('Select a customer before issuing — edit the invoice first.');
            await updateInvoice(inv.id, { status: 'Sent', sent_at: new Date().toISOString() });
            await refresh('invoices');
            toast.success('Invoice issued');
          })} />}
          <ActionButton icon={Download} label="Download" disabled={!bytes} onClick={() => bytes && downloadBytes(bytes, filename)} />
          <ActionButton icon={Printer} label="Print" disabled={!bytes} onClick={() => bytes && printPdf(bytes)} className="hidden sm:flex" />
          <ActionButton icon={MessageCircle} label="WhatsApp" busy={busy === 'share'} disabled={!bytes} onClick={share} className="!border-[#25D366]/40 !text-[#128C7E]" />
          <DropdownMenu>
            <DropdownMenuTrigger asChild><button className="flex h-10 items-center gap-1.5 rounded-xl border bg-white px-3 text-sm font-semibold hover:bg-slate-50">More <ChevronDown size={15} /></button></DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 rounded-xl">
              {canEdit && <DropdownMenuItem onSelect={() => router.push(`/invoices/${inv.id}/edit`)}><Pencil size={14} className="mr-2" />Edit invoice</DropdownMenuItem>}
              <DropdownMenuItem onSelect={() => setPreviewOpen(true)} disabled={!bytes}><Eye size={14} className="mr-2" />Full-screen preview</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => bytes && printPdf(bytes)} className="sm:hidden"><Printer size={14} className="mr-2" />Print</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => router.push(`/invoices/new?duplicate=${inv.id}`)}><Copy size={14} className="mr-2" />Duplicate</DropdownMenuItem>
              {inv.invoice_type === 'Proforma Invoice' && <DropdownMenuItem onSelect={() => router.push(`/invoices/new?duplicate=${inv.id}&type=tax`)}><FileOutput size={14} className="mr-2" />Convert to tax invoice</DropdownMenuItem>}
              {inv.balance_due > 0 && inv.status !== 'Draft' && inv.status !== 'Cancelled' && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">Payment reminder</DropdownMenuLabel>
                  <DropdownMenuItem onSelect={() => remind('whatsapp')}><BellRing size={14} className="mr-2" />Remind on WhatsApp</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => remind('email')}><Mail size={14} className="mr-2" />Remind by email</DropdownMenuItem>
                </>
              )}
              {inv.status !== 'Cancelled' && <><DropdownMenuSeparator /><DropdownMenuItem onSelect={() => setConfirm('cancel')} className="text-red-600 focus:text-red-600"><Ban size={14} className="mr-2" />Cancel invoice</DropdownMenuItem></>}
              {isAdmin && <DropdownMenuItem onSelect={() => setConfirm('delete')} className="text-red-600 focus:text-red-600"><Trash2 size={14} className="mr-2" />Delete permanently</DropdownMenuItem>}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {inv.status === 'Cancelled' && <div className="mb-4 flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><XCircle size={17} className="mt-0.5 shrink-0" /><span>Cancelled on {fmtDate(inv.cancelled_at)}{inv.cancel_reason ? ` — “${inv.cancel_reason}”` : ''}. This invoice is excluded from billing totals.</span></div>}
      {inv.last_reminder_at && inv.balance_due > 0 && <p className="mb-4 text-xs text-muted-foreground">Last payment reminder sent {fmtDate(inv.last_reminder_at)}.</p>}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="order-2 min-w-0 xl:order-1">
          <Card className="overflow-hidden">
            <div className="hidden bg-slate-100 p-6 md:block"><PdfViewer bytes={bytes} className="mx-auto max-w-[760px]" /></div>
            <button onClick={() => setPreviewOpen(true)} disabled={!bytes} className="flex w-full items-center justify-center gap-2 p-4 text-sm font-semibold text-brand-navy md:hidden">{bytes ? <Eye size={16} /> : <Loader2 size={16} className="animate-spin" />} View PDF</button>
          </Card>
        </div>

        <div className="order-1 space-y-5 xl:order-2">
          <Card className="p-5">
            <div className="flex items-baseline justify-between"><span className="text-sm text-muted-foreground">Balance due</span><span className="num text-2xl font-semibold text-brand-ink">{inr(inv.balance_due)}</span></div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${progress}%` }} /></div>
            <p className="mt-1.5 text-xs text-muted-foreground">{progress.toFixed(0)}% received{inv.due_date ? ` · due ${fmtDate(inv.due_date)}` : ''}{status === 'Overdue' ? ` · ${daysOverdue(inv)} days overdue` : ''}</p>
            <div className="mt-4 border-t pt-3">
              <KeyValue label="Invoice date" value={fmtDate(inv.invoice_date)} />
              <KeyValue label="Grand total" value={inr(inv.grand_total)} />
              {inv.deductions_total > 0 && <KeyValue label="Deductions" value={`−${inr(inv.deductions_total)}`} />}
              <KeyValue label="Net payable" value={inr(inv.net_payable)} strong />
              {inv.advance_paid > 0 && <KeyValue label="Advance" value={inr(inv.advance_paid)} />}
              {inv.previous_payments > 0 && <KeyValue label="Previous payments" value={inr(inv.previous_payments)} />}
              <KeyValue label="Payments received" value={inr(inv.amount_paid)} />
              {inv.tax_total > 0 && <KeyValue label={inv.tax_type === 'IGST' ? 'IGST' : 'CGST + SGST'} value={inr(inv.tax_total)} />}
            </div>
          </Card>

          <Card>
            <CardTitle title="Payments" icon={Receipt} action={inv.status !== 'Cancelled' && inv.balance_due > 0.009 ? <button onClick={() => setPayOpen(true)} className="text-sm font-semibold text-brand-navy-3 hover:underline">+ Record</button> : undefined} />
            <div className="divide-y">
              {!invPayments.length && <p className="px-5 py-6 text-center text-sm text-muted-foreground">No payments recorded yet.</p>}
              {invPayments.map((p) => (
                <div key={p.id} className="flex items-center gap-3 px-5 py-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-600"><CheckCircle2 size={16} /></span>
                  <div className="min-w-0 flex-1"><p className="num text-sm font-semibold">{inr(p.amount)}</p><p className="truncate text-xs text-muted-foreground">{fmtDate(p.payment_date)} · {p.method}{p.reference ? ` · ${p.reference}` : ''}</p></div>
                  <button onClick={() => receipt(p)} className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100" title={`Download receipt ${p.receipt_number}`}>{busy === `rc-${p.id}` ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}</button>
                  {isAdmin && <button onClick={() => setConfirm({ payment: p })} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600" title="Delete payment"><Trash2 size={15} /></button>}
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <CardTitle title="History" />
            <div className="p-5"><ActivityTimeline logs={logs} /></div>
          </Card>
        </div>
      </div>

      <PaymentDialog open={payOpen} onOpenChange={setPayOpen} invoice={header ?? inv} />
      <PdfPreviewDialog open={previewOpen} onOpenChange={setPreviewOpen} title={`${inv.invoice_number}`} job={job} />
      <ConfirmDialog open={confirm === 'cancel'} onOpenChange={(o) => !o && setConfirm(null)} title={`Cancel ${inv.invoice_number}?`} destructive requireReason reasonLabel="Reason for cancellation" confirmLabel="Cancel invoice"
        description={inv.amount_paid > 0 ? 'This invoice has payments recorded. Delete those payments first, then cancel.' : 'The invoice stays in your records marked as cancelled, with this reason in the audit history.'}
        onConfirm={async (reason) => {
          try { await updateInvoice(inv.id, { status: 'Cancelled', cancel_reason: reason }); await refresh('invoices'); toast.success('Invoice cancelled'); } catch (e) { toast.error(friendlyError(e)); throw e; }
        }} />
      <ConfirmDialog open={confirm === 'delete'} onOpenChange={(o) => !o && setConfirm(null)} title="Delete this invoice permanently?" destructive confirmLabel="Delete"
        description="This removes the invoice and its items. Invoices with payments cannot be deleted — cancel them instead to keep the audit trail."
        onConfirm={async () => {
          try { await deleteInvoice(inv.id); await refresh('invoices'); toast.success('Invoice deleted'); router.replace('/invoices'); } catch (e) { toast.error(friendlyError(e)); throw e; }
        }} />
      <ConfirmDialog open={typeof confirm === 'object' && confirm !== null} onOpenChange={(o) => !o && setConfirm(null)} title="Delete this payment?" destructive confirmLabel="Delete payment"
        description={typeof confirm === 'object' && confirm ? `${inr(confirm.payment.amount)} received on ${fmtDate(confirm.payment.payment_date)} (${confirm.payment.receipt_number}). The invoice balance will be recalculated.` : ''}
        onConfirm={async () => {
          if (typeof confirm !== 'object' || !confirm) return;
          try { await deleteRow('payments', confirm.payment.id); await refresh('payments', 'invoices'); toast.success('Payment deleted'); } catch (e) { toast.error(friendlyError(e)); throw e; }
        }} />
    </div>
  );
}

// ===========================================================================
// Quotation / Estimate
// ===========================================================================

export function QuotationView({ id, kind }: { id: string; kind: 'quotation' | 'estimate' }) {
  const router = useRouter();
  const { isAdmin } = useAuth();
  const { settings, quotations, customerById, projectById, invoiceById, refresh, loading } = useData();
  const header = quotations.find((q) => q.id === id);
  const [q, setQ] = useState<Full<Quotation> | null | 'missing'>(null);
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const base = kind === 'estimate' ? '/estimates' : '/quotations';
  const label = kind === 'estimate' ? 'Estimate' : 'Quotation';

  useEffect(() => {
    if (loading) return;
    let active = true;
    getQuotation(id).then((r) => { if (active) setQ(r ?? 'missing'); }).catch((e) => { toast.error(friendlyError(e)); if (active) setQ('missing'); });
    return () => { active = false; };
  }, [id, header?.updated_at, header?.status, loading]);

  const customer = q && q !== 'missing' && q.customer_id ? customerById.get(q.customer_id) : undefined;
  const project = q && q !== 'missing' && q.project_id ? projectById.get(q.project_id) : undefined;

  useEffect(() => {
    if (!q || q === 'missing') return;
    let active = true;
    setBytes(null);
    generateQuotationPdf(q, q.items, settings, customer, project).then((b) => { if (active) setBytes(b); }).catch((e) => toast.error(friendlyError(e)));
    return () => { active = false; };
  }, [q, settings, customer, project]);

  const logs = useAudit([id], `${header?.updated_at ?? ''}${header?.status ?? ''}`);

  if (q === null) return <LoadingPanel />;
  if (q === 'missing') return <div className="py-20 text-center"><p className="text-sm text-muted-foreground">This {label.toLowerCase()} could not be found.</p><Link href={base} className="mt-3 inline-block text-sm font-semibold text-brand-navy-3">Back</Link></div>;

  const expired = q.valid_until && q.valid_until < new Date().toISOString().slice(0, 10) && !['Approved', 'Converted', 'Rejected'].includes(q.status);
  const filename = `${slug(q.quotation_number)}.pdf`;
  const message = `Dear ${customer?.name ?? 'Sir/Madam'},\n\nGreetings from ${settings.company_name}. Please find our ${label.toLowerCase()} ${q.quotation_number}${q.subject ? ` for ${q.subject}` : ''} amounting to ${inr(q.grand_total)}${q.valid_until ? `, valid until ${fmtDate(q.valid_until)}` : ''}.\n\nWe look forward to working with you.\n${settings.company_name}${settings.phone ? `\n${settings.phone}` : ''}`;
  const job: PdfJob | null = bytes ? { bytes, filename, share: { phone: customer?.phone, message, path: `quotations/${q.id}/${filename}` } } : null;
  const converted = q.converted_invoice_id ? invoiceById.get(q.converted_invoice_id) : undefined;

  const setStatus = async (status: QuotationStatus) => {
    setBusy(status);
    try { await updateQuotation(q.id, { status }); await refresh('quotations'); toast.success(`Marked as ${status.toLowerCase()}`); } catch (e) { toast.error(friendlyError(e)); } finally { setBusy(null); }
  };

  return (
    <div className="animate-in-up">
      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <button onClick={() => router.push(base)} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border bg-white hover:bg-slate-50" aria-label="Back"><ArrowLeft size={18} /></button>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2"><h1 className="truncate text-xl font-semibold tracking-tight text-brand-ink sm:text-2xl">{q.quotation_number}</h1><StatusBadge status={expired ? 'Expired' : q.status} /></div>
            <p className="mt-0.5 text-sm text-muted-foreground">{label} · {customer ? <Link href={`/customers/${customer.id}`} className="font-medium text-brand-navy-3 hover:underline">{customer.name}</Link> : 'No customer'}{q.subject ? ` · ${q.subject}` : ''}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {q.status !== 'Converted' && <ActionButton primary icon={FileOutput} label="Convert to invoice" onClick={() => router.push(`/invoices/new?from=${q.id}`)} />}
          {converted && <ActionButton icon={Receipt} label={`Invoice ${converted.invoice_number}`} onClick={() => router.push(`/invoices/${converted.id}`)} />}
          <ActionButton icon={Download} label="Download" disabled={!bytes} onClick={() => bytes && downloadBytes(bytes, filename)} />
          <ActionButton icon={MessageCircle} label="WhatsApp" busy={busy === 'share'} disabled={!bytes} className="!border-[#25D366]/40 !text-[#128C7E]" onClick={async () => {
            if (!bytes) return;
            setBusy('share');
            try {
              const r = await shareToWhatsApp({ bytes, filename, message, phone: customer?.phone, storagePath: `quotations/${q.id}/${filename}` });
              if (r === 'opened-whatsapp') toast.info('PDF downloaded — attach it in the WhatsApp chat that opened.');
              if (q.status === 'Draft') await setStatus('Sent');
            } catch (e) { toast.error(friendlyError(e)); } finally { setBusy(null); }
          }} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild><button className="flex h-10 items-center gap-1.5 rounded-xl border bg-white px-3 text-sm font-semibold hover:bg-slate-50">More <ChevronDown size={15} /></button></DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 rounded-xl">
              {q.status !== 'Converted' && <DropdownMenuItem onSelect={() => router.push(`${base}/${q.id}/edit`)}><Pencil size={14} className="mr-2" />Edit</DropdownMenuItem>}
              <DropdownMenuItem onSelect={() => bytes && printPdf(bytes)}><Printer size={14} className="mr-2" />Print</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setPreviewOpen(true)}><Eye size={14} className="mr-2" />Full-screen preview</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => router.push(`${base}/new?duplicate=${q.id}`)}><Copy size={14} className="mr-2" />Duplicate</DropdownMenuItem>
              {q.status !== 'Converted' && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">Update status</DropdownMenuLabel>
                  {(['Sent', 'Approved', 'Rejected'] as QuotationStatus[]).filter((s) => s !== q.status).map((s) => <DropdownMenuItem key={s} onSelect={() => setStatus(s)}>Mark as {s.toLowerCase()}</DropdownMenuItem>)}
                </>
              )}
              {isAdmin && <><DropdownMenuSeparator /><DropdownMenuItem onSelect={() => setConfirmDelete(true)} className="text-red-600 focus:text-red-600"><Trash2 size={14} className="mr-2" />Delete</DropdownMenuItem></>}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="order-2 min-w-0 xl:order-1">
          <Card className="overflow-hidden">
            <div className="hidden bg-slate-100 p-6 md:block"><PdfViewer bytes={bytes} className="mx-auto max-w-[760px]" /></div>
            <button onClick={() => setPreviewOpen(true)} disabled={!bytes} className="flex w-full items-center justify-center gap-2 p-4 text-sm font-semibold text-brand-navy md:hidden"><Eye size={16} /> View PDF</button>
          </Card>
        </div>
        <div className="order-1 space-y-5 xl:order-2">
          <Card className="p-5">
            <div className="flex items-baseline justify-between"><span className="text-sm text-muted-foreground">{label} total</span><span className="num text-2xl font-semibold text-brand-ink">{inr(q.grand_total)}</span></div>
            <div className="mt-4 border-t pt-3">
              <KeyValue label="Date" value={fmtDate(q.quotation_date)} />
              <KeyValue label="Valid until" value={fmtDate(q.valid_until)} />
              <KeyValue label="Taxable value" value={inr(q.taxable_amount)} />
              <KeyValue label="GST" value={inr(q.tax_total)} />
              {project && <KeyValue label="Project" value={<Link className="text-brand-navy-3 hover:underline" href={`/projects/${project.id}`}>{project.project_name}</Link>} />}
            </div>
            {q.status !== 'Converted' && q.status !== 'Approved' && (
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button onClick={() => setStatus('Approved')} disabled={!!busy} className="h-10 rounded-xl bg-emerald-600 text-sm font-semibold text-white hover:bg-emerald-700">Approve</button>
                <button onClick={() => setStatus('Rejected')} disabled={!!busy || q.status === 'Rejected'} className="h-10 rounded-xl border text-sm font-semibold text-red-600 hover:bg-red-50">Reject</button>
              </div>
            )}
          </Card>
          <Card><CardTitle title="History" /><div className="p-5"><ActivityTimeline logs={logs} /></div></Card>
        </div>
      </div>

      <PdfPreviewDialog open={previewOpen} onOpenChange={setPreviewOpen} title={q.quotation_number} job={job} />
      <ConfirmDialog open={confirmDelete} onOpenChange={setConfirmDelete} title={`Delete ${q.quotation_number}?`} destructive confirmLabel="Delete" description="This permanently removes the document and its items."
        onConfirm={async () => { try { await deleteQuotation(q.id); await refresh('quotations'); toast.success('Deleted'); router.replace(base); } catch (e) { toast.error(friendlyError(e)); throw e; } }} />
    </div>
  );
}
