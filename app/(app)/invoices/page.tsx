'use client';

import { Suspense, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowDownUp, Copy, Download, Eye, FilePlus2, FileSpreadsheet, FileText, MoreHorizontal, Pencil, ReceiptIndianRupee, SlidersHorizontal, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth, useData } from '@/components/providers';
import { Card, EmptyState, LoadingPanel, PageHeader, SearchInput, SelectNative, StatusBadge, TextInput, matches, useDebounced } from '@/components/common';
import { PaymentDialog } from '@/components/forms';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { INVOICE_TYPES } from '@/lib/constants';
import { friendlyError, getInvoice } from '@/lib/data';
import { fmtDate, inr, slug, todayISO } from '@/lib/format';
import { generateInvoicePdf, generateReportPdf } from '@/lib/pdf/lazy';
import type { ReportSpec } from '@/lib/pdf/report';
import { exportReportExcel } from '@/lib/excel';
import { downloadBytes } from '@/lib/share';
import { invoiceStatus, receivedOn } from '@/lib/status';
import type { Invoice } from '@/lib/types';

const TABS = ['All', 'Draft', 'Unpaid', 'Overdue', 'Partially Paid', 'Paid', 'Cancelled'] as const;
type Sort = 'date-desc' | 'date-asc' | 'amount-desc' | 'amount-asc' | 'balance-desc';

function InvoicesInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { isAdmin } = useAuth();
  const { invoices, customers, projects, customerById, projectById, settings, loading } = useData();
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<(typeof TABS)[number]>((params.get('status') as (typeof TABS)[number]) || 'All');
  const [customerId, setCustomerId] = useState(params.get('customer') ?? '');
  const [projectId, setProjectId] = useState(params.get('project') ?? '');
  const [type, setType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sort, setSort] = useState<Sort>('date-desc');
  const [showFilters, setShowFilters] = useState(Boolean(params.get('customer') || params.get('project')));
  const [limit, setLimit] = useState(60);
  const [payFor, setPayFor] = useState<Invoice | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const q = useDebounced(query);

  const filtered = useMemo(() => {
    const list = invoices.filter((inv) => {
      const st = invoiceStatus(inv);
      if (tab === 'Unpaid' && !(st === 'Sent' || st === 'Partially Paid' || st === 'Overdue')) return false;
      if (tab !== 'All' && tab !== 'Unpaid' && st !== tab) return false;
      if (customerId && inv.customer_id !== customerId) return false;
      if (projectId && inv.project_id !== projectId) return false;
      if (type && inv.invoice_type !== type) return false;
      if (from && inv.invoice_date < from) return false;
      if (to && inv.invoice_date > to) return false;
      const c = inv.customer_id ? customerById.get(inv.customer_id) : undefined;
      const p = inv.project_id ? projectById.get(inv.project_id) : undefined;
      return matches(q, inv.invoice_number, c?.name, c?.phone, p?.project_name, p?.project_code, inv.reference_number, inv.work_order_number, inv.invoice_type, inv.grand_total);
    });
    const sorters: Record<Sort, (a: Invoice, b: Invoice) => number> = {
      'date-desc': (a, b) => b.invoice_date.localeCompare(a.invoice_date) || b.created_at.localeCompare(a.created_at),
      'date-asc': (a, b) => a.invoice_date.localeCompare(b.invoice_date) || a.created_at.localeCompare(b.created_at),
      'amount-desc': (a, b) => b.grand_total - a.grand_total,
      'amount-asc': (a, b) => a.grand_total - b.grand_total,
      'balance-desc': (a, b) => b.balance_due - a.balance_due,
    };
    return list.sort(sorters[sort]);
  }, [invoices, tab, customerId, projectId, type, from, to, q, sort, customerById, projectById]);

  const totals = useMemo(() => {
    const live = filtered.filter((i) => i.status !== 'Cancelled' && i.status !== 'Draft');
    return { billed: live.reduce((s, i) => s + i.grand_total, 0), received: live.reduce((s, i) => s + receivedOn(i), 0), balance: live.reduce((s, i) => s + Math.max(0, i.balance_due), 0) };
  }, [filtered]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { All: invoices.length };
    invoices.forEach((inv) => {
      const st = invoiceStatus(inv);
      c[st] = (c[st] ?? 0) + 1;
      if (st === 'Sent' || st === 'Partially Paid' || st === 'Overdue') c.Unpaid = (c.Unpaid ?? 0) + 1;
    });
    return c;
  }, [invoices]);

  const downloadPdf = async (inv: Invoice) => {
    setBusy(inv.id);
    try {
      const full = await getInvoice(inv.id);
      if (!full) throw new Error('Invoice not found');
      const bytes = await generateInvoicePdf(full, full.items, settings, customerById.get(full.customer_id ?? ''), projectById.get(full.project_id ?? ''));
      downloadBytes(bytes, `${slug(full.invoice_number)}.pdf`);
    } catch (e) { toast.error(friendlyError(e)); } finally { setBusy(null); }
  };

  const exportSpec = (): ReportSpec => ({
    title: 'Invoice register',
    subtitle: [tab !== 'All' ? tab : '', from || to ? `${from ? fmtDate(from) : '…'} – ${to ? fmtDate(to) : '…'}` : ''].filter(Boolean).join(' · ') || 'All invoices',
    columns: [
      { key: 'number', label: 'Invoice no.', weight: 1.3 }, { key: 'date', label: 'Date', weight: 0.9 }, { key: 'customer', label: 'Customer', weight: 1.6 },
      { key: 'project', label: 'Project', weight: 1.3 }, { key: 'type', label: 'Type', weight: 1.1 }, { key: 'total', label: 'Total', align: 'right', format: 'money', weight: 1.1 },
      { key: 'paid', label: 'Received', align: 'right', format: 'money', weight: 1.1 }, { key: 'balance', label: 'Balance', align: 'right', format: 'money', weight: 1.1 }, { key: 'status', label: 'Status', weight: 0.9 },
    ],
    rows: filtered.map((i) => ({ number: i.invoice_number, date: fmtDate(i.invoice_date), customer: customerById.get(i.customer_id ?? '')?.name ?? '', project: projectById.get(i.project_id ?? '')?.project_name ?? '', type: i.invoice_type, total: i.grand_total, paid: receivedOn(i), balance: i.balance_due, status: invoiceStatus(i) })),
    totals: { number: `${filtered.length} invoices`, total: totals.billed, paid: totals.received, balance: totals.balance },
  });

  if (loading) return <LoadingPanel />;

  return (
    <div className="animate-in-up">
      <PageHeader title="Invoices" description="Every bill you've raised — search, filter and act on them." actions={
        <>
          <DropdownMenu>
            <DropdownMenuTrigger asChild><button className="flex h-10 items-center gap-2 rounded-xl border bg-white px-3.5 text-sm font-semibold hover:bg-slate-50"><Download size={16} />Export</button></DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="rounded-xl">
              <DropdownMenuItem onSelect={() => exportReportExcel(exportSpec(), `invoices-${todayISO()}.xlsx`, settings.company_name).catch((e) => toast.error(friendlyError(e)))}><FileSpreadsheet size={14} className="mr-2" />Excel (.xlsx)</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => generateReportPdf(exportSpec(), settings).then((b) => downloadBytes(b, `invoices-${todayISO()}.pdf`)).catch((e) => toast.error(friendlyError(e)))}><FileText size={14} className="mr-2" />PDF</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Link href="/invoices/new" className="flex h-10 items-center gap-2 rounded-xl bg-brand-orange px-4 text-sm font-semibold text-white shadow-sm shadow-brand-orange/30 hover:bg-brand-orange-dark"><FilePlus2 size={16} />New invoice</Link>
        </>
      } />

      <div className="-mx-4 mb-4 overflow-x-auto px-4 scrollbar-thin sm:mx-0 sm:px-0">
        <div className="flex w-max gap-1.5">
          {TABS.map((t) => (
            <button key={t} onClick={() => setTab(t)} className={cn('flex h-9 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium transition', tab === t ? 'bg-brand-navy text-white' : 'bg-white text-slate-600 ring-1 ring-border hover:bg-slate-50')}>
              {t}<span className={cn('rounded-full px-1.5 text-[11px]', tab === t ? 'bg-white/20' : 'bg-slate-100 text-slate-500', t === 'Overdue' && counts.Overdue && tab !== t && 'bg-red-50 text-red-600')}>{counts[t] ?? 0}</span>
            </button>
          ))}
        </div>
      </div>

      <Card className="mb-4 p-3 sm:p-4">
        <div className="flex flex-col gap-3 sm:flex-row">
          <SearchInput value={query} onChange={setQuery} placeholder="Search number, customer, project, reference…" className="flex-1" />
          <div className="flex gap-2">
            <SelectNative value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="sm:w-48" aria-label="Sort">
              <option value="date-desc">Newest first</option><option value="date-asc">Oldest first</option><option value="amount-desc">Amount: high to low</option><option value="amount-asc">Amount: low to high</option><option value="balance-desc">Balance due: highest</option>
            </SelectNative>
            <button onClick={() => setShowFilters(!showFilters)} className={cn('flex h-11 shrink-0 items-center gap-2 rounded-xl border px-3.5 text-sm font-medium sm:h-10', showFilters ? 'border-brand-navy bg-brand-navy/5 text-brand-navy' : 'bg-white')}><SlidersHorizontal size={16} /><span className="hidden sm:inline">Filters</span></button>
          </div>
        </div>
        {showFilters && (
          <div className="mt-3 grid gap-2 border-t pt-3 sm:grid-cols-2 lg:grid-cols-5">
            <SelectNative value={customerId} onChange={(e) => setCustomerId(e.target.value)}><option value="">All customers</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</SelectNative>
            <SelectNative value={projectId} onChange={(e) => setProjectId(e.target.value)}><option value="">All projects</option>{projects.filter((p) => !customerId || p.customer_id === customerId).map((p) => <option key={p.id} value={p.id}>{p.project_name}</option>)}</SelectNative>
            <SelectNative value={type} onChange={(e) => setType(e.target.value)}><option value="">All invoice types</option>{INVOICE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.value}</option>)}</SelectNative>
            <TextInput type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From date" />
            <TextInput type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To date" />
            {(customerId || projectId || type || from || to) && <button onClick={() => { setCustomerId(''); setProjectId(''); setType(''); setFrom(''); setTo(''); }} className="text-left text-sm font-medium text-brand-navy-3 hover:underline sm:col-span-2 lg:col-span-5">Clear filters</button>}
          </div>
        )}
      </Card>

      <div className="mb-3 grid grid-cols-3 gap-2 text-center sm:max-w-xl sm:gap-3">
        <div className="rounded-xl bg-white p-2.5 ring-1 ring-border"><p className="text-[11px] text-muted-foreground">Billed</p><p className="num text-sm font-semibold sm:text-base">{inr(totals.billed, 0)}</p></div>
        <div className="rounded-xl bg-white p-2.5 ring-1 ring-border"><p className="text-[11px] text-muted-foreground">Received</p><p className="num text-sm font-semibold text-emerald-600 sm:text-base">{inr(totals.received, 0)}</p></div>
        <div className="rounded-xl bg-white p-2.5 ring-1 ring-border"><p className="text-[11px] text-muted-foreground">Balance</p><p className="num text-sm font-semibold text-brand-orange-dark sm:text-base">{inr(totals.balance, 0)}</p></div>
      </div>

      {!filtered.length ? (
        <Card><EmptyState icon={ReceiptIndianRupee} title={invoices.length ? 'No invoices match' : 'No invoices yet'} description={invoices.length ? 'Try a different search or clear the filters.' : 'Create your first construction bill — it takes about a minute.'} action={!invoices.length && <Link href="/invoices/new" className="flex h-10 items-center gap-2 rounded-xl bg-brand-navy px-4 text-sm font-semibold text-white"><FilePlus2 size={16} />Create invoice</Link>} /></Card>
      ) : (
        <>
          {/* Desktop table */}
          <Card className="hidden overflow-hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50/80 text-left text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Invoice</th><th className="px-4 py-3">Customer / project</th><th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3 text-right"><button onClick={() => setSort(sort === 'amount-desc' ? 'amount-asc' : 'amount-desc')} className="inline-flex items-center gap-1 uppercase">Total <ArrowDownUp size={12} /></button></th>
                    <th className="px-4 py-3 text-right">Paid</th><th className="px-4 py-3 text-right">Balance</th><th className="px-4 py-3">Status</th><th className="w-12 px-2 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtered.slice(0, limit).map((inv) => {
                    const c = customerById.get(inv.customer_id ?? '');
                    const p = projectById.get(inv.project_id ?? '');
                    const st = invoiceStatus(inv);
                    return (
                      <tr key={inv.id} onClick={() => router.push(`/invoices/${inv.id}`)} className="cursor-pointer transition hover:bg-slate-50/70">
                        <td className="px-4 py-3"><p className="font-semibold text-brand-ink">{inv.invoice_number}</p><p className="text-xs text-muted-foreground">{inv.invoice_type}</p></td>
                        <td className="max-w-[260px] px-4 py-3"><p className="truncate font-medium">{c?.name ?? inv.snapshot?.customer?.name ?? '—'}</p><p className="truncate text-xs text-muted-foreground">{p?.project_name ?? '—'}</p></td>
                        <td className="whitespace-nowrap px-4 py-3"><p>{fmtDate(inv.invoice_date)}</p>{inv.due_date && <p className={cn('text-xs', st === 'Overdue' ? 'text-red-600' : 'text-muted-foreground')}>Due {fmtDate(inv.due_date)}</p>}</td>
                        <td className="num whitespace-nowrap px-4 py-3 text-right font-semibold">{inr(inv.grand_total)}</td>
                        <td className="num whitespace-nowrap px-4 py-3 text-right text-emerald-700">{inr(receivedOn(inv))}</td>
                        <td className="num whitespace-nowrap px-4 py-3 text-right font-medium">{inv.status === 'Cancelled' ? '—' : inr(inv.balance_due)}</td>
                        <td className="px-4 py-3"><StatusBadge status={st} /></td>
                        <td className="px-2 py-3" onClick={(e) => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild><button className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100" aria-label="Actions"><MoreHorizontal size={16} /></button></DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48 rounded-xl">
                              <DropdownMenuItem onSelect={() => router.push(`/invoices/${inv.id}`)}><Eye size={14} className="mr-2" />View</DropdownMenuItem>
                              {inv.status !== 'Cancelled' && (inv.status === 'Draft' || isAdmin) && <DropdownMenuItem onSelect={() => router.push(`/invoices/${inv.id}/edit`)}><Pencil size={14} className="mr-2" />Edit</DropdownMenuItem>}
                              <DropdownMenuItem onSelect={() => downloadPdf(inv)} disabled={busy === inv.id}><Download size={14} className="mr-2" />Download PDF</DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => router.push(`/invoices/new?duplicate=${inv.id}`)}><Copy size={14} className="mr-2" />Duplicate</DropdownMenuItem>
                              {inv.status !== 'Cancelled' && inv.status !== 'Draft' && inv.balance_due > 0 && <><DropdownMenuSeparator /><DropdownMenuItem onSelect={() => setPayFor(inv)}><Wallet size={14} className="mr-2" />Record payment</DropdownMenuItem></>}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Mobile cards */}
          <div className="space-y-2.5 md:hidden">
            {filtered.slice(0, limit).map((inv) => {
              const c = customerById.get(inv.customer_id ?? '');
              const st = invoiceStatus(inv);
              return (
                <Link key={inv.id} href={`/invoices/${inv.id}`} className="card-surface block p-4 active:bg-slate-50">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0"><p className="truncate font-semibold text-brand-ink">{c?.name ?? inv.snapshot?.customer?.name ?? 'No customer'}</p><p className="truncate text-xs text-muted-foreground">{inv.invoice_number} · {fmtDate(inv.invoice_date)}</p></div>
                    <StatusBadge status={st} />
                  </div>
                  <div className="mt-3 flex items-end justify-between">
                    <div><p className="text-[11px] text-muted-foreground">Total</p><p className="num font-semibold">{inr(inv.grand_total)}</p></div>
                    {inv.status !== 'Cancelled' && inv.balance_due > 0 && <div className="text-right"><p className="text-[11px] text-muted-foreground">Balance</p><p className="num font-semibold text-brand-orange-dark">{inr(inv.balance_due)}</p></div>}
                  </div>
                </Link>
              );
            })}
          </div>
          {filtered.length > limit && <button onClick={() => setLimit(limit + 60)} className="mx-auto mt-4 block h-10 rounded-xl border bg-white px-5 text-sm font-medium hover:bg-slate-50">Show more ({filtered.length - limit} remaining)</button>}
        </>
      )}
      <PaymentDialog open={!!payFor} onOpenChange={(o) => !o && setPayFor(null)} invoice={payFor} />
    </div>
  );
}

export default function InvoicesPage() {
  return <Suspense fallback={<LoadingPanel />}><InvoicesInner /></Suspense>;
}
