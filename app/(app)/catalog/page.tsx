'use client';

import { useMemo, useState } from 'react';
import { BookOpen, Loader2, Pencil, Plus, Sparkles, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth, useData } from '@/components/providers';
import { Card, ConfirmDialog, EmptyState, LoadingPanel, PageHeader, SearchInput, Segmented, matches, useDebounced } from '@/components/common';
import { CatalogDialog } from '@/components/forms';
import { cn } from '@/lib/utils';
import { CATALOG_CATEGORIES, STARTER_ITEMS } from '@/lib/constants';
import { deleteRow, friendlyError } from '@/lib/data';
import { supabase } from '@/lib/supabase';
import { inr } from '@/lib/format';
import type { CatalogItem } from '@/lib/types';

export default function CatalogPage() {
  const { isAdmin } = useAuth();
  const { catalog, refresh, loading } = useData();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CatalogItem | null>(null);
  const [deleting, setDeleting] = useState<CatalogItem | null>(null);
  const [seeding, setSeeding] = useState(false);
  const q = useDebounced(query);
  const filtered = useMemo(() => catalog.filter((c) => (category === 'All' || c.category === category) && matches(q, c.name, c.hsn_sac, c.unit)), [catalog, category, q]);

  const seed = async () => {
    setSeeding(true);
    try {
      const existing = new Set(catalog.map((c) => c.name.toLowerCase()));
      const rows = STARTER_ITEMS.filter((s) => !existing.has(s.name.toLowerCase())).map((s) => ({ ...s, rate: 0 }));
      if (rows.length) {
        const { error } = await supabase.from('catalog_items').insert(rows);
        if (error) throw error;
      }
      await refresh('catalog');
      toast.success(`${rows.length} starter items added — set your rates next`);
    } catch (e) { toast.error(friendlyError(e)); } finally { setSeeding(false); }
  };

  if (loading) return <LoadingPanel />;

  return (
    <div className="animate-in-up">
      <PageHeader title="Item catalogue" description="Reusable materials, labour and work items. Pick them while billing to fill unit, rate and GST instantly."
        actions={<>
          <button onClick={seed} disabled={seeding} className="flex h-10 items-center gap-2 rounded-xl border bg-white px-3.5 text-sm font-semibold hover:bg-slate-50">{seeding ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}Load starter items</button>
          <button onClick={() => { setEditing(null); setOpen(true); }} className="flex h-10 items-center gap-2 rounded-xl bg-brand-orange px-4 text-sm font-semibold text-white shadow-sm shadow-brand-orange/30 hover:bg-brand-orange-dark"><Plus size={16} />Add item</button>
        </>} />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <SearchInput value={query} onChange={setQuery} placeholder="Search items…" className="flex-1" />
        <Segmented value={category} onChange={setCategory} className="overflow-x-auto" options={['All', ...CATALOG_CATEGORIES].map((c) => ({ value: c, label: c }))} />
      </div>
      {!filtered.length ? (
        <Card><EmptyState icon={BookOpen} title={catalog.length ? 'No items match' : 'Your catalogue is empty'} description="Add the materials and work items you bill often, or load a starter list of common construction items." action={!catalog.length && <button onClick={seed} className="flex h-10 items-center gap-2 rounded-xl bg-brand-navy px-4 text-sm font-semibold text-white"><Sparkles size={16} />Load starter items</button>} /></Card>
      ) : (
        <Card className="divide-y overflow-hidden">
          {filtered.map((c) => (
            <div key={c.id} className={cn('flex items-center gap-3 px-4 py-3 sm:px-5', !c.active && 'opacity-55')}>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{c.name}</p>
                <p className="truncate text-xs text-muted-foreground">{c.category} · GST {c.tax_rate}%{c.hsn_sac ? ` · HSN/SAC ${c.hsn_sac}` : ''}{!c.active ? ' · inactive' : ''}</p>
              </div>
              <p className="num text-right text-sm font-semibold">{c.rate > 0 ? inr(c.rate) : <span className="text-brand-orange-dark">Set rate</span>}<span className="text-xs font-normal text-muted-foreground"> / {c.unit}</span></p>
              <button onClick={() => { setEditing(c); setOpen(true); }} className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-100" aria-label="Edit"><Pencil size={15} /></button>
              {isAdmin && <button onClick={() => setDeleting(c)} className="grid h-9 w-9 place-items-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label="Delete"><Trash2 size={15} /></button>}
            </div>
          ))}
        </Card>
      )}
      <CatalogDialog open={open} onOpenChange={setOpen} item={editing} />
      <ConfirmDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)} title={`Delete ${deleting?.name}?`} destructive confirmLabel="Delete" description="Existing invoices are not affected."
        onConfirm={async () => { try { await deleteRow('catalog_items', deleting!.id); await refresh('catalog'); toast.success('Item deleted'); } catch (e) { toast.error(friendlyError(e)); throw e; } }} />
    </div>
  );
}
