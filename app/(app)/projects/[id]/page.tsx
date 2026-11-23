'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, CalendarCheck, CalendarDays, FileBarChart, FileCheck2, HardHat, IndianRupee, MapPin, Pencil, Plus, ReceiptIndianRupee, Trash2, TrendingUp, Wallet, WalletCards } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth, useData } from '@/components/providers';
import { Card, ConfirmDialog, LoadingPanel, Segmented, StatCard, StatusBadge } from '@/components/common';
import { ExpenseDialog, ProjectDialog } from '@/components/forms';
import { ExpenseList } from '@/components/expense-list';
import { deleteRow, friendlyError } from '@/lib/data';
import { fmtDate, inr, initials, qty } from '@/lib/format';
import { fmtHours, groupBy, summariseAttendance } from '@/lib/labour';
import type { Expense } from '@/lib/types';
import { invoiceStatus, isBillable, receivedOn } from '@/lib/status';

export default function ProjectDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { isAdmin } = useAuth();
  const { projectById, customerById, invoices, quotations, expenses, attendance, labourers, labourReady, refresh, loading } = useData();
  const project = projectById.get(params.id);
  const [tab, setTab] = useState<'invoices' | 'quotations' | 'expenses' | 'labour'>('invoices');
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const d = useMemo(() => {
    const inv = invoices.filter((i) => i.project_id === params.id).sort((a, b) => b.invoice_date.localeCompare(a.invoice_date));
    const billable = inv.filter(isBillable);
    const exp = expenses.filter((e) => e.project_id === params.id).sort((a, b) => b.expense_date.localeCompare(a.expense_date));
    const billedTaxable = billable.reduce((s, i) => s + i.taxable_amount, 0);
    const spent = exp.reduce((s, e) => s + e.amount, 0);
    const att = attendance.filter((a) => a.project_id === params.id);
    const byLabourer = groupBy(att, (a) => a.labourer_id);
    const labour = labourers.filter((l) => byLabourer.has(l.id)).map((l) => ({ labourer: l, ...summariseAttendance(byLabourer.get(l.id) ?? []) })).sort((a, b) => b.wages - a.wages);
    return {
      labour, labourTotal: summariseAttendance(att),
      invoices: inv, quotations: quotations.filter((q) => q.project_id === params.id), expenses: exp,
      billed: billable.reduce((s, i) => s + i.grand_total, 0), received: billable.reduce((s, i) => s + receivedOn(i), 0),
      pending: billable.reduce((s, i) => s + Math.max(0, i.balance_due), 0), spent, margin: billedTaxable - spent, billedTaxable,
    };
  }, [invoices, quotations, expenses, attendance, labourers, params.id]);

  if (loading) return <LoadingPanel />;
  if (!project) return <div className="py-20 text-center text-sm text-muted-foreground">Project not found. <Link href="/projects" className="font-semibold text-brand-navy-3">Back</Link></div>;
  const customer = customerById.get(project.customer_id);
  const pct = project.estimated_budget > 0 ? (d.billed / project.estimated_budget) * 100 : 0;

  return (
    <div className="animate-in-up space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <button onClick={() => router.push('/projects')} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border bg-white hover:bg-slate-50" aria-label="Back"><ArrowLeft size={18} /></button>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-brand-orange">{project.project_code} · {project.project_type}</p>
            <div className="flex flex-wrap items-center gap-2"><h1 className="truncate text-xl font-semibold tracking-tight text-brand-ink sm:text-2xl">{project.project_name}</h1><StatusBadge status={project.status} /></div>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {customer && <Link href={`/customers/${customer.id}`} className="font-medium text-brand-navy-3 hover:underline">{customer.name}</Link>}
              {project.location && <span className="flex items-center gap-1"><MapPin size={13} />{project.location}</span>}
              <span className="flex items-center gap-1"><CalendarDays size={13} />{fmtDate(project.start_date)} → {fmtDate(project.expected_completion_date)}</span>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/invoices/new?project=${project.id}`} className="flex h-10 items-center gap-2 rounded-xl bg-brand-orange px-4 text-sm font-semibold text-white hover:bg-brand-orange-dark"><ReceiptIndianRupee size={16} />New invoice</Link>
          <Link href={`/quotations/new?project=${project.id}`} className="flex h-10 items-center gap-2 rounded-xl border bg-white px-3.5 text-sm font-semibold hover:bg-slate-50"><FileCheck2 size={16} />Quotation</Link>
          <button onClick={() => { setEditingExpense(null); setExpenseOpen(true); }} className="flex h-10 items-center gap-2 rounded-xl border bg-white px-3.5 text-sm font-semibold hover:bg-slate-50"><WalletCards size={16} />Add expense</button>
          <Link href={`/labour?project=${project.id}`} className="flex h-10 items-center gap-2 rounded-xl border bg-white px-3.5 text-sm font-semibold hover:bg-slate-50"><HardHat size={16} />Attendance</Link>
          <Link href={`/reports?type=project-report&project=${project.id}`} className="flex h-10 items-center gap-2 rounded-xl border bg-white px-3.5 text-sm font-semibold hover:bg-slate-50"><FileBarChart size={16} />Report</Link>
          <button onClick={() => setEditOpen(true)} className="flex h-10 items-center gap-2 rounded-xl border bg-white px-3.5 text-sm font-semibold hover:bg-slate-50"><Pencil size={15} />Edit</button>
          {isAdmin && <button onClick={() => setConfirmDelete(true)} className="grid h-10 w-10 place-items-center rounded-xl border bg-white text-red-600 hover:bg-red-50" aria-label="Delete"><Trash2 size={16} /></button>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Estimated budget" value={inr(project.estimated_budget, 0)} icon={IndianRupee} hint={project.estimated_budget > 0 ? `${pct.toFixed(0)}% billed` : 'Not set'} />
        <StatCard label="Billed" value={inr(d.billed, 0)} icon={ReceiptIndianRupee} tone="sky" hint={`${d.invoices.length} invoices`} />
        <StatCard label="Received" value={inr(d.received, 0)} icon={Wallet} tone="green" />
        <StatCard label="Pending" value={inr(d.pending, 0)} icon={Wallet} tone="orange" />
        <StatCard label="Expenses / margin" value={inr(d.spent, 0)} icon={TrendingUp} tone={d.margin >= 0 ? 'green' : 'red'} hint={<><span className={d.margin >= 0 ? 'text-emerald-600' : 'text-red-600'}>Margin {inr(d.margin, 0)} (excl. GST)</span>{d.labourTotal.wages > 0 && <span className="block">incl. labour {inr(d.labourTotal.wages, 0)}</span>}</>} />
      </div>

      {project.estimated_budget > 0 && (
        <Card className="p-5">
          <div className="flex justify-between text-sm"><span className="font-medium">Billing progress against budget</span><span className="num">{inr(d.billed, 0)} / {inr(project.estimated_budget, 0)}</span></div>
          <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-gradient-to-r from-brand-navy-3 to-brand-navy" style={{ width: `${Math.min(100, pct)}%` }} /></div>
        </Card>
      )}
      {project.description && <Card className="p-5 text-sm leading-6 text-slate-600"><p className="mb-1 font-medium text-brand-ink">Scope</p>{project.description}</Card>}

      <Card>
        <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between">
          <Segmented value={tab} onChange={setTab} options={[{ value: 'invoices', label: `Invoices (${d.invoices.length})` }, { value: 'quotations', label: `Quotes (${d.quotations.length})` }, { value: 'expenses', label: `Expenses (${d.expenses.length})` }, ...(labourReady ? [{ value: 'labour' as const, label: `Labour (${d.labour.length})` }] : [])]} className="max-w-full overflow-x-auto" />
          {tab === 'expenses' && <button onClick={() => { setEditingExpense(null); setExpenseOpen(true); }} className="flex h-9 items-center gap-1.5 rounded-lg bg-brand-navy px-3 text-sm font-semibold text-white"><Plus size={15} />Add expense</button>}
          {tab === 'labour' && <Link href={`/labour?project=${params.id}`} className="flex h-9 items-center gap-1.5 rounded-lg bg-brand-navy px-3 text-sm font-semibold text-white"><CalendarCheck size={15} />Mark attendance</Link>}
        </div>
        <div className="divide-y">
          {tab === 'invoices' && (d.invoices.length ? d.invoices.map((i) => (
            <Link key={i.id} href={`/invoices/${i.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-slate-50/70">
              <div className="min-w-0"><p className="truncate text-sm font-semibold">{i.invoice_number}</p><p className="truncate text-xs text-muted-foreground">{fmtDate(i.invoice_date)} · {i.invoice_type}{i.ra_details?.ra_number ? ` · ${i.ra_details.ra_number}` : ''}</p></div>
              <div className="flex items-center gap-3"><p className="num text-sm font-semibold">{inr(i.grand_total)}</p><StatusBadge status={invoiceStatus(i)} /></div>
            </Link>
          )) : <p className="p-8 text-center text-sm text-muted-foreground">No invoices for this project yet.</p>)}
          {tab === 'quotations' && (d.quotations.length ? d.quotations.map((q) => (
            <Link key={q.id} href={`/${q.doc_kind === 'estimate' ? 'estimates' : 'quotations'}/${q.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-slate-50/70">
              <div className="min-w-0"><p className="truncate text-sm font-semibold">{q.quotation_number}</p><p className="truncate text-xs text-muted-foreground">{fmtDate(q.quotation_date)}{q.subject ? ` · ${q.subject}` : ''}</p></div>
              <div className="flex items-center gap-3"><p className="num text-sm font-semibold">{inr(q.grand_total)}</p><StatusBadge status={q.status} /></div>
            </Link>
          )) : <p className="p-8 text-center text-sm text-muted-foreground">No quotations or estimates.</p>)}
          {tab === 'expenses' && (d.expenses.length
            ? <ExpenseList expenses={d.expenses} showProject={false} onEdit={(e) => { setEditingExpense(e); setExpenseOpen(true); }} />
            : <p className="p-8 text-center text-sm text-muted-foreground">No expenses recorded for this project.</p>)}
          {tab === 'labour' && (d.labour.length ? (
            <>
              {d.labour.map((r) => (
                <Link key={r.labourer.id} href={`/labour/${r.labourer.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50/70">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-navy/[0.07] text-xs font-semibold text-brand-navy">{initials(r.labourer.name)}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{r.labourer.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{r.labourer.labour_code}{r.labourer.trade ? ` · ${r.labourer.trade}` : ''} · {r.present} present{r.half ? `, ${r.half} half` : ''}{r.otHours ? ` · ${fmtHours(r.otHours)} OT` : ''}</p>
                  </div>
                  <div className="text-right"><p className="num text-sm font-semibold">{inr(r.wages)}</p><p className="text-[11px] text-muted-foreground">{qty(r.manDays)} man-days</p></div>
                </Link>
              ))}
              <div className="flex items-center justify-between bg-slate-50/80 px-5 py-3 text-sm font-semibold"><span>Total labour · {qty(d.labourTotal.manDays)} man-days</span><span className="num">{inr(d.labourTotal.wages)}</span></div>
            </>
          ) : <p className="p-8 text-center text-sm text-muted-foreground">No labour attendance marked for this project yet.</p>)}
        </div>
      </Card>

      <ProjectDialog open={editOpen} onOpenChange={setEditOpen} project={project} />
      <ExpenseDialog open={expenseOpen} onOpenChange={(o) => { setExpenseOpen(o); if (!o) setEditingExpense(null); }} expense={editingExpense} defaultProjectId={project.id} />
      <ConfirmDialog open={confirmDelete} onOpenChange={setConfirmDelete} title={`Delete ${project.project_name}?`} destructive confirmLabel="Delete" description="Projects with invoices cannot be deleted. Quotations and expenses will be unlinked."
        onConfirm={async () => { try { await deleteRow('projects', project.id); await refresh('projects'); toast.success('Project deleted'); router.replace('/projects'); } catch (e) { toast.error(friendlyError(e)); throw e; } }} />
    </div>
  );
}
