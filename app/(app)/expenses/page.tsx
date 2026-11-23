'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { HardHat, Plus, WalletCards } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth, useData } from '@/components/providers';
import { Card, ConfirmDialog, EmptyState, LoadingPanel, PageHeader, SearchInput, SelectNative, TextInput, matches, useDebounced } from '@/components/common';
import { ExpenseDialog } from '@/components/forms';
import { ExpenseList } from '@/components/expense-list';
import { EXPENSE_CATEGORIES } from '@/lib/constants';
import { deleteRow, friendlyError } from '@/lib/data';
import { inr } from '@/lib/format';
import type { Expense } from '@/lib/types';

export default function ExpensesPage() {
  const { isAdmin } = useAuth();
  const { expenses, projects, projectById, refresh, loading } = useData();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [projectId, setProjectId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [deleting, setDeleting] = useState<Expense | null>(null);
  const q = useDebounced(query);

  const filtered = useMemo(() => expenses.filter((e) => (!category || e.category === category) && (!projectId || e.project_id === projectId)
    && (!from || e.expense_date >= from) && (!to || e.expense_date <= to) && matches(q, e.description, e.vendor, e.reference, e.category, projectById.get(e.project_id ?? '')?.project_name)), [expenses, category, projectId, from, to, q, projectById]);
  const byCategory = useMemo(() => {
    const m = new Map<string, number>();
    filtered.forEach((e) => m.set(e.category, (m.get(e.category) ?? 0) + e.amount));
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [filtered]);
  const total = filtered.reduce((s, e) => s + e.amount, 0);
  const fromAttendance = filtered.filter((e) => e.attendance_id).reduce((s, e) => s + e.amount, 0);

  if (loading) return <LoadingPanel />;

  return (
    <div className="animate-in-up">
      <PageHeader title="Expenses" description="Material, labour and site costs — used for profit reporting. Labour wages from attendance are added automatically." actions={<><Link href="/labour" className="flex h-10 items-center gap-2 rounded-xl border bg-white px-3.5 text-sm font-semibold hover:bg-slate-50"><HardHat size={16} />Labour attendance</Link><button onClick={() => { setEditing(null); setOpen(true); }} className="flex h-10 items-center gap-2 rounded-xl bg-brand-orange px-4 text-sm font-semibold text-white shadow-sm shadow-brand-orange/30 hover:bg-brand-orange-dark"><Plus size={16} />Record expense</button></>} />
      <Card className="mb-4 grid gap-2 p-3 sm:grid-cols-2 sm:p-4 lg:grid-cols-[1fr_170px_200px_150px_150px]">
        <SearchInput value={query} onChange={setQuery} placeholder="Search description, vendor…" />
        <SelectNative value={category} onChange={(e) => setCategory(e.target.value)}><option value="">All categories</option>{EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</SelectNative>
        <SelectNative value={projectId} onChange={(e) => setProjectId(e.target.value)}><option value="">All projects</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.project_name}</option>)}</SelectNative>
        <TextInput type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From" />
        <TextInput type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To" />
      </Card>

      {byCategory.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          <span className="rounded-full bg-brand-navy px-3 py-1.5 text-sm font-semibold text-white">Total {inr(total, 0)}</span>
          {byCategory.map(([c, v]) => <button key={c} onClick={() => setCategory(category === c ? '' : c)} className="rounded-full bg-white px-3 py-1.5 text-sm ring-1 ring-border hover:bg-slate-50">{c} <span className="num font-semibold">{inr(v, 0)}</span></button>)}
          {fromAttendance > 0 && <span className="flex items-center gap-1.5 rounded-full bg-brand-orange/10 px-3 py-1.5 text-sm text-brand-orange-dark"><HardHat size={14} />From attendance <span className="num font-semibold">{inr(fromAttendance, 0)}</span></span>}
        </div>
      )}

      {!filtered.length ? <Card><EmptyState icon={WalletCards} title={expenses.length ? 'No expenses match' : 'No expenses yet'} description="Track project spending to see margins in project pages and the profit report." /></Card> : (
        <Card className="overflow-hidden">
          <ExpenseList expenses={filtered} onEdit={(e) => { setEditing(e); setOpen(true); }} onDelete={isAdmin ? setDeleting : undefined} />
        </Card>
      )}
      <ExpenseDialog open={open} onOpenChange={setOpen} expense={editing} />
      <ConfirmDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)} title="Delete this expense?" destructive confirmLabel="Delete"
        onConfirm={async () => { try { await deleteRow('expenses', deleting!.id); await refresh('expenses'); toast.success('Expense deleted'); } catch (err) { toast.error(friendlyError(err)); throw err; } }} />
    </div>
  );
}
