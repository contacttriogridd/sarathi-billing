'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { MoreHorizontal, Pencil, Phone, Plus, ReceiptIndianRupee, Trash2, UserPlus, Users } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth, useData } from '@/components/providers';
import { Card, ConfirmDialog, EmptyState, LoadingPanel, PageHeader, SearchInput, matches, useDebounced } from '@/components/common';
import { CustomerDialog } from '@/components/forms';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { deleteRow, friendlyError } from '@/lib/data';
import { initials, inr } from '@/lib/format';
import { isBillable, receivedOn } from '@/lib/status';
import type { Customer } from '@/lib/types';

function CustomersInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { isAdmin } = useAuth();
  const { customers, invoices, projects, refresh, loading } = useData();
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Customer | null>(null);
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState<Customer | null>(null);
  const q = useDebounced(query);

  useEffect(() => { if (params.get('new') === '1') { setEditing(null); setOpen(true); } }, [params]);

  const summary = useMemo(() => {
    const map = new Map<string, { billed: number; received: number; pending: number; invoices: number; projects: number }>();
    customers.forEach((c) => map.set(c.id, { billed: 0, received: 0, pending: 0, invoices: 0, projects: 0 }));
    invoices.forEach((i) => {
      const s = i.customer_id ? map.get(i.customer_id) : undefined;
      if (!s) return;
      s.invoices += 1;
      if (isBillable(i)) { s.billed += i.grand_total; s.received += receivedOn(i); s.pending += Math.max(0, i.balance_due); }
    });
    projects.forEach((p) => { const s = map.get(p.customer_id); if (s) s.projects += 1; });
    return map;
  }, [customers, invoices, projects]);

  const filtered = useMemo(() => customers.filter((c) => matches(q, c.name, c.phone, c.email, c.gstin, c.address, c.customer_type)), [customers, q]);

  if (loading) return <LoadingPanel />;

  return (
    <div className="animate-in-up">
      <PageHeader title="Customers" description={`${customers.length} customer${customers.length === 1 ? '' : 's'} · billing history and outstanding balances`}
        actions={<button onClick={() => { setEditing(null); setOpen(true); }} className="flex h-10 items-center gap-2 rounded-xl bg-brand-orange px-4 text-sm font-semibold text-white shadow-sm shadow-brand-orange/30 hover:bg-brand-orange-dark"><UserPlus size={16} />Add customer</button>} />
      <SearchInput value={query} onChange={setQuery} placeholder="Search name, phone, GSTIN…" className="mb-4" />

      {!filtered.length ? (
        <Card><EmptyState icon={Users} title={customers.length ? 'No customers match' : 'Add your first customer'} description={customers.length ? 'Try another search.' : 'Customer details auto-fill on every invoice and quotation.'} action={!customers.length && <button onClick={() => setOpen(true)} className="flex h-10 items-center gap-2 rounded-xl bg-brand-navy px-4 text-sm font-semibold text-white"><Plus size={16} />Add customer</button>} /></Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((c) => {
            const s = summary.get(c.id)!;
            return (
              <div key={c.id} onClick={() => router.push(`/customers/${c.id}`)} className="card-surface group cursor-pointer p-4 transition hover:-translate-y-0.5 hover:shadow-md">
                <div className="flex items-start gap-3">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-navy text-sm font-semibold text-white">{initials(c.name)}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-brand-ink">{c.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{c.customer_type}{c.phone ? ` · ${c.phone}` : ''}</p>
                  </div>
                  <div onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><button className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100" aria-label="Actions"><MoreHorizontal size={16} /></button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48 rounded-xl">
                        <DropdownMenuItem onSelect={() => router.push(`/invoices/new?customer=${c.id}`)}><ReceiptIndianRupee size={14} className="mr-2" />New invoice</DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => { setEditing(c); setOpen(true); }}><Pencil size={14} className="mr-2" />Edit</DropdownMenuItem>
                        {c.phone && <DropdownMenuItem onSelect={() => { window.location.href = `tel:${c.phone}`; }}><Phone size={14} className="mr-2" />Call</DropdownMenuItem>}
                        {isAdmin && <><DropdownMenuSeparator /><DropdownMenuItem onSelect={() => setDeleting(c)} className="text-red-600 focus:text-red-600"><Trash2 size={14} className="mr-2" />Delete</DropdownMenuItem></>}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 border-t pt-3 text-center">
                  <div><p className="text-[11px] text-muted-foreground">Billed</p><p className="num text-sm font-semibold">{inr(s.billed, 0)}</p></div>
                  <div><p className="text-[11px] text-muted-foreground">Pending</p><p className={`num text-sm font-semibold ${s.pending > 0 ? 'text-brand-orange-dark' : ''}`}>{inr(s.pending, 0)}</p></div>
                  <div><p className="text-[11px] text-muted-foreground">Projects</p><p className="num text-sm font-semibold">{s.projects}</p></div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <CustomerDialog open={open} onOpenChange={(o) => { setOpen(o); if (!o && params.get('new')) router.replace('/customers'); }} customer={editing} onSaved={(c) => { if (!editing) router.push(`/customers/${c.id}`); }} />
      <ConfirmDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)} title={`Delete ${deleting?.name}?`} destructive confirmLabel="Delete customer"
        description="Customers with projects, invoices or quotations cannot be deleted, to protect your billing history."
        onConfirm={async () => { try { await deleteRow('customers', deleting!.id); await refresh('customers'); toast.success('Customer deleted'); } catch (e) { toast.error(friendlyError(e)); throw e; } }} />
    </div>
  );
}

export default function CustomersPage() {
  return <Suspense fallback={<LoadingPanel />}><CustomersInner /></Suspense>;
}
