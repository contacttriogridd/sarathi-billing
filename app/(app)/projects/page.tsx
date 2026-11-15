'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarDays, FolderKanban, FolderPlus, MapPin } from 'lucide-react';
import { useData } from '@/components/providers';
import { Card, EmptyState, LoadingPanel, PageHeader, SearchInput, SelectNative, StatusBadge, matches, useDebounced } from '@/components/common';
import { ProjectDialog } from '@/components/forms';
import { cn } from '@/lib/utils';
import { PROJECT_STATUSES, PROJECT_TYPES } from '@/lib/constants';
import { fmtDate, inr, inrCompact } from '@/lib/format';
import { isBillable, receivedOn } from '@/lib/status';

export default function ProjectsPage() {
  const router = useRouter();
  const { projects, invoices, customerById, loading } = useData();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const [open, setOpen] = useState(false);
  const q = useDebounced(query);

  const billing = useMemo(() => {
    const map = new Map<string, { billed: number; received: number; pending: number; count: number }>();
    invoices.filter(isBillable).forEach((i) => {
      if (!i.project_id) return;
      const s = map.get(i.project_id) ?? { billed: 0, received: 0, pending: 0, count: 0 };
      s.billed += i.grand_total; s.received += receivedOn(i); s.pending += Math.max(0, i.balance_due); s.count += 1;
      map.set(i.project_id, s);
    });
    return map;
  }, [invoices]);

  const filtered = useMemo(() => projects.filter((p) => (!status || p.status === status) && (!type || p.project_type === type)
    && matches(q, p.project_name, p.project_code, p.location, customerById.get(p.customer_id)?.name)), [projects, status, type, q, customerById]);

  if (loading) return <LoadingPanel />;

  return (
    <div className="animate-in-up">
      <PageHeader title="Projects" description="Construction projects with their billing progress against budget."
        actions={<button onClick={() => setOpen(true)} className="flex h-10 items-center gap-2 rounded-xl bg-brand-orange px-4 text-sm font-semibold text-white shadow-sm shadow-brand-orange/30 hover:bg-brand-orange-dark"><FolderPlus size={16} />New project</button>} />
      <div className="mb-4 grid gap-2 sm:grid-cols-[1fr_200px_220px]">
        <SearchInput value={query} onChange={setQuery} placeholder="Search project, ID, site, customer…" />
        <SelectNative value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All statuses</option>{PROJECT_STATUSES.map((s) => <option key={s}>{s}</option>)}</SelectNative>
        <SelectNative value={type} onChange={(e) => setType(e.target.value)}><option value="">All project types</option>{PROJECT_TYPES.map((t) => <option key={t}>{t}</option>)}</SelectNative>
      </div>

      {!filtered.length ? (
        <Card><EmptyState icon={FolderKanban} title={projects.length ? 'No projects match' : 'No projects yet'} description={projects.length ? 'Try another filter.' : 'Group invoices, quotations and expenses under each construction project.'} action={!projects.length && <button onClick={() => setOpen(true)} className="flex h-10 items-center gap-2 rounded-xl bg-brand-navy px-4 text-sm font-semibold text-white"><FolderPlus size={16} />Create project</button>} /></Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((p) => {
            const b = billing.get(p.id) ?? { billed: 0, received: 0, pending: 0, count: 0 };
            const pct = p.estimated_budget > 0 ? Math.min(100, (b.billed / p.estimated_budget) * 100) : 0;
            return (
              <button key={p.id} onClick={() => router.push(`/projects/${p.id}`)} className="card-surface p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-brand-orange">{p.project_code}</p>
                    <p className="truncate font-semibold text-brand-ink">{p.project_name}</p>
                    <p className="truncate text-xs text-muted-foreground">{customerById.get(p.customer_id)?.name ?? '—'} · {p.project_type}</p>
                  </div>
                  <StatusBadge status={p.status} />
                </div>
                <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                  {p.location && <p className="flex items-center gap-1.5 truncate"><MapPin size={12} />{p.location}</p>}
                  {(p.start_date || p.expected_completion_date) && <p className="flex items-center gap-1.5"><CalendarDays size={12} />{fmtDate(p.start_date)} → {fmtDate(p.expected_completion_date)}</p>}
                </div>
                <div className="mt-4">
                  <div className="flex justify-between text-xs"><span className="text-muted-foreground">Billed {inrCompact(b.billed)}{p.estimated_budget > 0 ? ` of ${inrCompact(p.estimated_budget)}` : ''}</span>{p.estimated_budget > 0 && <span className="font-medium">{pct.toFixed(0)}%</span>}</div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className={cn('h-full rounded-full', pct >= 100 ? 'bg-emerald-500' : 'bg-brand-navy-3')} style={{ width: `${p.estimated_budget > 0 ? pct : 0}%` }} /></div>
                  {b.pending > 0 && <p className="mt-2 text-xs text-brand-orange-dark">{inr(b.pending, 0)} pending across {b.count} invoice{b.count === 1 ? '' : 's'}</p>}
                </div>
              </button>
            );
          })}
        </div>
      )}
      <ProjectDialog open={open} onOpenChange={setOpen} onSaved={(p) => router.push(`/projects/${p.id}`)} />
    </div>
  );
}
