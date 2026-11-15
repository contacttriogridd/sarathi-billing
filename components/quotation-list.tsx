'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ClipboardList, FileCheck2, FileOutput, FilePlus2 } from 'lucide-react';
import { useData } from '@/components/providers';
import { Card, EmptyState, LoadingPanel, PageHeader, SearchInput, StatusBadge, matches, useDebounced } from '@/components/common';
import { cn } from '@/lib/utils';
import { fmtDate, inr, todayISO } from '@/lib/format';
import type { Quotation } from '@/lib/types';

const displayStatus = (q: Quotation) => (q.valid_until && q.valid_until < todayISO() && (q.status === 'Draft' || q.status === 'Sent') ? 'Expired' : q.status);
const TABS = ['All', 'Draft', 'Sent', 'Approved', 'Converted', 'Rejected', 'Expired'];

export function QuotationList({ kind }: { kind: 'quotation' | 'estimate' }) {
  const router = useRouter();
  const { quotations, customerById, projectById, loading } = useData();
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState('All');
  const q = useDebounced(query);
  const base = kind === 'estimate' ? '/estimates' : '/quotations';
  const label = kind === 'estimate' ? 'Estimates' : 'Quotations';
  const Icon = kind === 'estimate' ? ClipboardList : FileCheck2;

  const docs = useMemo(() => quotations.filter((d) => d.doc_kind === kind), [quotations, kind]);
  const filtered = useMemo(() => docs.filter((d) => (tab === 'All' || displayStatus(d) === tab) && matches(q, d.quotation_number, d.subject, customerById.get(d.customer_id ?? '')?.name, projectById.get(d.project_id ?? '')?.project_name)), [docs, tab, q, customerById, projectById]);
  const stats = useMemo(() => ({
    open: docs.filter((d) => d.status === 'Sent' || d.status === 'Draft').reduce((s, d) => s + d.grand_total, 0),
    approved: docs.filter((d) => d.status === 'Approved' || d.status === 'Converted').reduce((s, d) => s + d.grand_total, 0),
    rate: docs.filter((d) => d.status !== 'Draft').length ? Math.round((docs.filter((d) => d.status === 'Approved' || d.status === 'Converted').length / docs.filter((d) => d.status !== 'Draft').length) * 100) : 0,
  }), [docs]);

  if (loading) return <LoadingPanel />;

  return (
    <div className="animate-in-up">
      <PageHeader title={label} description={kind === 'estimate' ? 'Approximate cost estimates for prospective work.' : 'Formal price offers — convert approved ones to invoices in one click.'}
        actions={<Link href={`${base}/new`} className="flex h-10 items-center gap-2 rounded-xl bg-brand-orange px-4 text-sm font-semibold text-white shadow-sm shadow-brand-orange/30 hover:bg-brand-orange-dark"><FilePlus2 size={16} />New {kind}</Link>} />

      <div className="mb-4 grid grid-cols-3 gap-2 sm:max-w-xl sm:gap-3">
        <div className="rounded-xl bg-white p-3 ring-1 ring-border"><p className="text-[11px] text-muted-foreground">Open value</p><p className="num text-sm font-semibold sm:text-base">{inr(stats.open, 0)}</p></div>
        <div className="rounded-xl bg-white p-3 ring-1 ring-border"><p className="text-[11px] text-muted-foreground">Won value</p><p className="num text-sm font-semibold text-emerald-600 sm:text-base">{inr(stats.approved, 0)}</p></div>
        <div className="rounded-xl bg-white p-3 ring-1 ring-border"><p className="text-[11px] text-muted-foreground">Win rate</p><p className="num text-sm font-semibold sm:text-base">{stats.rate}%</p></div>
      </div>

      <div className="-mx-4 mb-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div className="flex w-max gap-1.5">
          {TABS.map((t) => <button key={t} onClick={() => setTab(t)} className={cn('h-9 rounded-full px-3.5 text-sm font-medium', tab === t ? 'bg-brand-navy text-white' : 'bg-white text-slate-600 ring-1 ring-border')}>{t}</button>)}
        </div>
      </div>
      <SearchInput value={query} onChange={setQuery} placeholder={`Search ${label.toLowerCase()}…`} className="mb-4" />

      {!filtered.length ? (
        <Card><EmptyState icon={Icon} title={docs.length ? 'Nothing matches' : `No ${label.toLowerCase()} yet`} description={docs.length ? 'Try another search or status.' : `Create a ${kind} with materials, labour and rates — then convert it to an invoice once approved.`} action={!docs.length && <Link href={`${base}/new`} className="flex h-10 items-center gap-2 rounded-xl bg-brand-navy px-4 text-sm font-semibold text-white"><FilePlus2 size={16} />Create {kind}</Link>} /></Card>
      ) : (
        <Card className="divide-y overflow-hidden">
          {filtered.map((d) => {
            const c = customerById.get(d.customer_id ?? '');
            const st = displayStatus(d);
            return (
              <div key={d.id} onClick={() => router.push(`${base}/${d.id}`)} className="flex cursor-pointer flex-col gap-2 p-4 transition hover:bg-slate-50/70 sm:flex-row sm:items-center sm:gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2"><p className="truncate font-semibold text-brand-ink">{d.quotation_number}</p><StatusBadge status={st} /></div>
                  <p className="truncate text-sm text-muted-foreground">{c?.name ?? 'No customer'}{d.subject ? ` · ${d.subject}` : ''}</p>
                </div>
                <div className="flex items-center justify-between gap-4 sm:justify-end">
                  <div className="text-xs text-muted-foreground sm:text-right"><p>{fmtDate(d.quotation_date)}</p>{d.valid_until && <p>Valid till {fmtDate(d.valid_until)}</p>}</div>
                  <p className="num w-32 text-right font-semibold">{inr(d.grand_total)}</p>
                  {(st === 'Approved' || st === 'Sent') && <button onClick={(e) => { e.stopPropagation(); router.push(`/invoices/new?from=${d.id}`); }} className="hidden h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold text-brand-navy hover:bg-white sm:flex"><FileOutput size={14} />Invoice</button>}
                </div>
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}
