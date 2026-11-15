'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, FileCheck2, FolderKanban, Mail, MapPin, MessageCircle, Pencil, Phone, Plus, ReceiptIndianRupee, Trash2, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth, useData } from '@/components/providers';
import { Card, ConfirmDialog, LoadingPanel, Segmented, StatCard, StatusBadge } from '@/components/common';
import { CustomerDialog, PaymentDialog, ProjectDialog } from '@/components/forms';
import { deleteRow, friendlyError } from '@/lib/data';
import { fmtDate, initials, inr } from '@/lib/format';
import { invoiceStatus, isBillable, receivedOn } from '@/lib/status';
import { openWhatsAppText } from '@/lib/share';

export default function CustomerDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { isAdmin } = useAuth();
  const { customerById, invoices, quotations, projects, payments, settings, refresh, loading } = useData();
  const customer = customerById.get(params.id);
  const [tab, setTab] = useState<'invoices' | 'projects' | 'quotations' | 'payments'>('invoices');
  const [editOpen, setEditOpen] = useState(false);
  const [projectOpen, setProjectOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const data = useMemo(() => {
    const inv = invoices.filter((i) => i.customer_id === params.id).sort((a, b) => b.invoice_date.localeCompare(a.invoice_date));
    const billable = inv.filter(isBillable);
    return {
      invoices: inv,
      quotations: quotations.filter((q) => q.customer_id === params.id),
      projects: projects.filter((p) => p.customer_id === params.id),
      payments: payments.filter((p) => p.customer_id === params.id).sort((a, b) => b.payment_date.localeCompare(a.payment_date)),
      billed: billable.reduce((s, i) => s + i.grand_total, 0),
      received: billable.reduce((s, i) => s + receivedOn(i), 0),
      pending: billable.reduce((s, i) => s + Math.max(0, i.balance_due), 0),
      overdue: billable.filter((i) => invoiceStatus(i) === 'Overdue').reduce((s, i) => s + i.balance_due, 0),
    };
  }, [invoices, quotations, projects, payments, params.id]);

  if (loading) return <LoadingPanel />;
  if (!customer) return <div className="py-20 text-center text-sm text-muted-foreground">Customer not found. <Link href="/customers" className="font-semibold text-brand-navy-3">Back to customers</Link></div>;

  const invoiceNumber = (id: string) => invoices.find((i) => i.id === id)?.invoice_number ?? '';
  const statement = `Dear ${customer.name},\n\nAs per our records, your outstanding balance with ${settings.company_name} is ${inr(data.pending)}${data.overdue > 0 ? ` (of which ${inr(data.overdue)} is overdue)` : ''}.\n\n${data.invoices.filter((i) => isBillable(i) && i.balance_due > 0).map((i) => `• ${i.invoice_number} (${fmtDate(i.invoice_date)}): ${inr(i.balance_due)}`).join('\n')}\n\nKindly arrange the payment at your earliest convenience.${settings.upi_id ? `\nUPI: ${settings.upi_id}` : ''}\n\nRegards,\n${settings.company_name}`;

  return (
    <div className="animate-in-up space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <button onClick={() => router.push('/customers')} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border bg-white hover:bg-slate-50" aria-label="Back"><ArrowLeft size={18} /></button>
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-brand-navy text-base font-semibold text-white">{initials(customer.name)}</span>
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold tracking-tight text-brand-ink sm:text-2xl">{customer.name}</h1>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span>{customer.customer_type}</span>
              {customer.phone && <a href={`tel:${customer.phone}`} className="flex items-center gap-1 hover:text-brand-navy"><Phone size={13} />{customer.phone}</a>}
              {customer.email && <a href={`mailto:${customer.email}`} className="flex items-center gap-1 hover:text-brand-navy"><Mail size={13} />{customer.email}</a>}
              {customer.gstin && <span>GSTIN {customer.gstin}</span>}
            </div>
            {customer.address && <p className="mt-1 flex items-start gap-1 text-sm text-muted-foreground"><MapPin size={13} className="mt-0.5 shrink-0" />{customer.address}{customer.state ? `, ${customer.state}` : ''}</p>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/invoices/new?customer=${customer.id}`} className="flex h-10 items-center gap-2 rounded-xl bg-brand-orange px-4 text-sm font-semibold text-white hover:bg-brand-orange-dark"><ReceiptIndianRupee size={16} />New invoice</Link>
          <Link href={`/quotations/new?customer=${customer.id}`} className="flex h-10 items-center gap-2 rounded-xl border bg-white px-3.5 text-sm font-semibold hover:bg-slate-50"><FileCheck2 size={16} />Quotation</Link>
          {data.pending > 0 && <button onClick={() => openWhatsAppText(customer.phone, statement)} className="flex h-10 items-center gap-2 rounded-xl border border-[#25D366]/40 bg-white px-3.5 text-sm font-semibold text-[#128C7E] hover:bg-emerald-50"><MessageCircle size={16} />Send statement</button>}
          <button onClick={() => setEditOpen(true)} className="flex h-10 items-center gap-2 rounded-xl border bg-white px-3.5 text-sm font-semibold hover:bg-slate-50"><Pencil size={15} />Edit</button>
          {isAdmin && <button onClick={() => setConfirmDelete(true)} className="grid h-10 w-10 place-items-center rounded-xl border bg-white text-red-600 hover:bg-red-50" aria-label="Delete"><Trash2 size={16} /></button>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total billed" value={inr(data.billed, 0)} icon={ReceiptIndianRupee} hint={`${data.invoices.length} invoices`} />
        <StatCard label="Received" value={inr(data.received, 0)} icon={Wallet} tone="green" />
        <StatCard label="Pending" value={inr(data.pending, 0)} icon={Wallet} tone="orange" hint={data.overdue > 0 ? <span className="text-red-600">{inr(data.overdue, 0)} overdue</span> : undefined} />
        <StatCard label="Projects" value={data.projects.length} icon={FolderKanban} tone="sky" hint={`${data.quotations.length} quotations`} />
      </div>

      {customer.notes && <Card className="p-4 text-sm text-slate-600"><span className="font-medium text-brand-ink">Notes: </span>{customer.notes}</Card>}

      <Card>
        <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between">
          <Segmented value={tab} onChange={setTab} className="w-full overflow-x-auto sm:w-auto" options={[
            { value: 'invoices', label: `Invoices (${data.invoices.length})` }, { value: 'projects', label: `Projects (${data.projects.length})` },
            { value: 'quotations', label: `Quotes (${data.quotations.length})` }, { value: 'payments', label: `Payments (${data.payments.length})` },
          ]} />
          {tab === 'projects' && <button onClick={() => setProjectOpen(true)} className="flex h-9 items-center gap-1.5 rounded-lg bg-brand-navy px-3 text-sm font-semibold text-white"><Plus size={15} />Add project</button>}
          {tab === 'payments' && data.pending > 0 && <button onClick={() => setPayOpen(true)} className="flex h-9 items-center gap-1.5 rounded-lg bg-brand-navy px-3 text-sm font-semibold text-white"><Plus size={15} />Record payment</button>}
        </div>
        <div className="divide-y">
          {tab === 'invoices' && (data.invoices.length ? data.invoices.map((i) => (
            <Link key={i.id} href={`/invoices/${i.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-slate-50/70">
              <div className="min-w-0"><p className="truncate text-sm font-semibold">{i.invoice_number}</p><p className="truncate text-xs text-muted-foreground">{fmtDate(i.invoice_date)} · {i.invoice_type}</p></div>
              <div className="flex items-center gap-3"><div className="text-right"><p className="num text-sm font-semibold">{inr(i.grand_total)}</p>{i.balance_due > 0 && i.status !== 'Cancelled' && <p className="num text-xs text-brand-orange-dark">Due {inr(i.balance_due)}</p>}</div><StatusBadge status={invoiceStatus(i)} /></div>
            </Link>
          )) : <p className="p-8 text-center text-sm text-muted-foreground">No invoices for this customer yet.</p>)}
          {tab === 'projects' && (data.projects.length ? data.projects.map((p) => (
            <Link key={p.id} href={`/projects/${p.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-slate-50/70">
              <div className="min-w-0"><p className="truncate text-sm font-semibold">{p.project_name}</p><p className="truncate text-xs text-muted-foreground">{p.project_code} · {p.project_type}{p.location ? ` · ${p.location}` : ''}</p></div>
              <StatusBadge status={p.status} />
            </Link>
          )) : <p className="p-8 text-center text-sm text-muted-foreground">No projects yet.</p>)}
          {tab === 'quotations' && (data.quotations.length ? data.quotations.map((q) => (
            <Link key={q.id} href={`/${q.doc_kind === 'estimate' ? 'estimates' : 'quotations'}/${q.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-slate-50/70">
              <div className="min-w-0"><p className="truncate text-sm font-semibold">{q.quotation_number}</p><p className="truncate text-xs text-muted-foreground">{q.doc_kind === 'estimate' ? 'Estimate' : 'Quotation'} · {fmtDate(q.quotation_date)}</p></div>
              <div className="flex items-center gap-3"><p className="num text-sm font-semibold">{inr(q.grand_total)}</p><StatusBadge status={q.status} /></div>
            </Link>
          )) : <p className="p-8 text-center text-sm text-muted-foreground">No quotations or estimates yet.</p>)}
          {tab === 'payments' && (data.payments.length ? data.payments.map((p) => (
            <Link key={p.id} href={`/invoices/${p.invoice_id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-slate-50/70">
              <div className="min-w-0"><p className="num text-sm font-semibold text-emerald-700">{inr(p.amount)}</p><p className="truncate text-xs text-muted-foreground">{fmtDate(p.payment_date)} · {p.method} · {invoiceNumber(p.invoice_id)}</p></div>
              <span className="text-xs text-muted-foreground">{p.receipt_number}</span>
            </Link>
          )) : <p className="p-8 text-center text-sm text-muted-foreground">No payments recorded.</p>)}
        </div>
      </Card>

      <CustomerDialog open={editOpen} onOpenChange={setEditOpen} customer={customer} />
      <ProjectDialog open={projectOpen} onOpenChange={setProjectOpen} defaultCustomerId={customer.id} />
      <PaymentDialog open={payOpen} onOpenChange={setPayOpen} />
      <ConfirmDialog open={confirmDelete} onOpenChange={setConfirmDelete} title={`Delete ${customer.name}?`} destructive confirmLabel="Delete" description="Only customers without projects, invoices or quotations can be deleted."
        onConfirm={async () => { try { await deleteRow('customers', customer.id); await refresh('customers'); toast.success('Customer deleted'); router.replace('/customers'); } catch (e) { toast.error(friendlyError(e)); throw e; } }} />
    </div>
  );
}
