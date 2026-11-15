'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  AlertTriangle, ArrowRight, ArrowUpRight, ClipboardList, FileCheck2, FilePlus2, IndianRupee, Landmark, ReceiptIndianRupee, TimerReset, TrendingUp, UserPlus, Wallet,
} from 'lucide-react';
import { useAuth, useData } from '@/components/providers';
import { ActivityTimeline } from '@/components/activity';
import { Card, CardTitle, LoadingPanel, StatCard, StatusBadge } from '@/components/common';
import { InstallBanner } from '@/components/pwa';
import { fetchAudit } from '@/lib/data';
import { addDays, fmtDate, inr, inrCompact, monthKey, monthLabel, todayISO } from '@/lib/format';
import { STATUS_COLORS, daysOverdue, invoiceStatus, isBillable, receivedOn } from '@/lib/status';
import type { AuditLog } from '@/lib/types';

const QUICK = [
  { href: '/invoices/new', label: 'New invoice', icon: FilePlus2, tone: 'bg-brand-orange text-white shadow-md shadow-brand-orange/25' },
  { href: '/estimates/new', label: 'Create estimate', icon: ClipboardList, tone: 'bg-white text-brand-ink ring-1 ring-border' },
  { href: '/quotations/new', label: 'Create quotation', icon: FileCheck2, tone: 'bg-white text-brand-ink ring-1 ring-border' },
  { href: '/customers?new=1', label: 'Add customer', icon: UserPlus, tone: 'bg-white text-brand-ink ring-1 ring-border' },
  { href: '/payments?record=1', label: 'Record payment', icon: Wallet, tone: 'bg-white text-brand-ink ring-1 ring-border' },
];

const tooltipStyle = { borderRadius: 12, border: '1px solid #e2e8f0', boxShadow: '0 8px 24px rgba(16,41,74,.12)', fontSize: 12 };

export default function DashboardPage() {
  const { profile } = useAuth();
  const { invoices, quotations, payments, customerById, projectById, loading } = useData();
  const [logs, setLogs] = useState<AuditLog[]>([]);

  useEffect(() => {
    fetchAudit({ limit: 12 }).then(setLogs).catch(() => undefined);
  }, [invoices.length, payments.length, quotations.length]);

  const stats = useMemo(() => {
    const billable = invoices.filter(isBillable);
    const billed = billable.reduce((s, i) => s + i.grand_total, 0);
    const received = billable.reduce((s, i) => s + receivedOn(i), 0);
    const pending = billable.reduce((s, i) => s + Math.max(0, i.balance_due), 0);
    const overdueList = billable.filter((i) => invoiceStatus(i) === 'Overdue');
    const overdue = overdueList.reduce((s, i) => s + i.balance_due, 0);
    const thisMonth = monthKey(todayISO());
    const lastMonth = monthKey(addDays(`${thisMonth}-01`, -1));
    const monthBilled = billable.filter((i) => monthKey(i.invoice_date) === thisMonth).reduce((s, i) => s + i.grand_total, 0);
    const lastBilled = billable.filter((i) => monthKey(i.invoice_date) === lastMonth).reduce((s, i) => s + i.grand_total, 0);
    const monthReceived = payments.filter((p) => monthKey(p.payment_date) === thisMonth).reduce((s, p) => s + p.amount, 0);
    const openQuotes = quotations.filter((q) => q.status === 'Draft' || q.status === 'Sent');

    // last 12 months
    const months: string[] = [];
    const d = new Date();
    for (let i = 11; i >= 0; i -= 1) months.push(monthKey(new Date(d.getFullYear(), d.getMonth() - i, 15).toISOString()));
    const monthly = months.map((m) => ({
      month: monthLabel(m),
      Billed: Math.round(billable.filter((i) => monthKey(i.invoice_date) === m).reduce((s, i) => s + i.grand_total, 0)),
      Received: Math.round(payments.filter((p) => monthKey(p.payment_date) === m).reduce((s, p) => s + p.amount, 0)
        + billable.filter((i) => monthKey(i.invoice_date) === m).reduce((s, i) => s + i.advance_paid + i.previous_payments, 0)),
    }));

    const byProject = new Map<string, number>();
    billable.forEach((i) => { if (i.project_id) byProject.set(i.project_id, (byProject.get(i.project_id) ?? 0) + i.grand_total); });
    const projects = Array.from(byProject.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6)
      .map(([id, value]) => ({ name: projectById.get(id)?.project_name ?? 'Project', value: Math.round(value) }));

    const statusCounts = new Map<string, number>();
    invoices.forEach((i) => { const s = invoiceStatus(i); statusCounts.set(s, (statusCounts.get(s) ?? 0) + 1); });
    const statuses = Array.from(statusCounts.entries()).map(([name, value]) => ({ name, value }));

    return {
      billed, received, pending, overdue, overdueList, monthBilled, lastBilled, monthReceived, openQuotes, monthly, projects, statuses,
      paymentSplit: [
        { name: 'Received', value: Math.round(received), color: '#10b981' },
        { name: 'Pending', value: Math.round(Math.max(0, pending - overdue)), color: '#f59e0b' },
        { name: 'Overdue', value: Math.round(overdue), color: '#ef4444' },
      ].filter((s) => s.value > 0),
    };
  }, [invoices, payments, quotations, projectById]);

  if (loading) return <LoadingPanel label="Loading your workspace…" />;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const change = stats.lastBilled > 0 ? ((stats.monthBilled - stats.lastBilled) / stats.lastBilled) * 100 : null;
  const recent = [...invoices].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 6);

  return (
    <div className="animate-in-up space-y-6">
      <InstallBanner />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="label-eyebrow text-brand-orange">{new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-brand-ink sm:text-[28px]">{greeting}{profile?.full_name ? `, ${profile.full_name.split(' ')[0]}` : ''}</h1>
          <p className="mt-1 text-sm text-muted-foreground">Here&apos;s how billing and collections are tracking.</p>
        </div>
      </div>

      <div className="-mx-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
        <div className="flex w-max gap-2 sm:grid sm:w-auto sm:grid-cols-5">
          {QUICK.map((q) => (
            <Link key={q.href} href={q.href} className={`flex h-12 items-center gap-2.5 rounded-2xl px-4 text-sm font-semibold transition hover:-translate-y-0.5 ${q.tone}`}><q.icon size={18} />{q.label}</Link>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total billed" value={inrCompact(stats.billed)} icon={IndianRupee} hint={`${invoices.filter(isBillable).length} invoices · ${invoices.length} total`} />
        <StatCard label="Amount received" value={inrCompact(stats.received)} icon={Landmark} tone="green" hint={stats.billed ? `${Math.round((stats.received / stats.billed) * 100)}% collected` : 'No collections yet'} />
        <StatCard label="Pending payments" value={inrCompact(stats.pending)} icon={TimerReset} tone="orange" hint={`${invoices.filter((i) => isBillable(i) && i.balance_due > 0).length} invoices open`} />
        <StatCard label="Overdue" value={inrCompact(stats.overdue)} icon={AlertTriangle} tone="red" hint={`${stats.overdueList.length} invoice${stats.overdueList.length === 1 ? '' : 's'} past due`} />
        <StatCard label="This month billed" value={inrCompact(stats.monthBilled)} icon={TrendingUp} tone="sky" hint={change === null ? 'First month of data' : <span className={change >= 0 ? 'text-emerald-600' : 'text-red-600'}>{change >= 0 ? '▲' : '▼'} {Math.abs(change).toFixed(0)}% vs last month</span>} />
        <StatCard label="This month received" value={inrCompact(stats.monthReceived)} icon={Wallet} tone="green" hint="Payments recorded this month" />
        <StatCard label="Quotations & estimates" value={quotations.length} icon={FileCheck2} tone="slate" hint={`${stats.openQuotes.length} open · ${inrCompact(stats.openQuotes.reduce((s, q) => s + q.grand_total, 0))}`} />
        <StatCard label="Invoices generated" value={invoices.length} icon={ReceiptIndianRupee} tone="navy" hint={`${invoices.filter((i) => i.status === 'Draft').length} drafts`} />
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardTitle title="Monthly billing overview" description="Billed vs received over the last 12 months" icon={TrendingUp} />
          <div className="h-[280px] p-3 sm:p-5">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.monthly} barGap={2} margin={{ left: -8, right: 4, top: 6 }}>
                <CartesianGrid vertical={false} stroke="#eef2f6" />
                <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#64748b' }} interval="preserveStartEnd" />
                <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={(v) => inrCompact(v)} width={58} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => inr(v, 0)} cursor={{ fill: 'rgba(16,41,74,0.04)' }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Billed" fill="#10294a" radius={[6, 6, 0, 0]} maxBarSize={26} />
                <Bar dataKey="Received" fill="#ee8a2f" radius={[6, 6, 0, 0]} maxBarSize={26} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card>
          <CardTitle title="Received vs pending" description="Across all issued invoices" icon={Wallet} />
          <div className="relative h-[280px] p-3">
            {stats.paymentSplit.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={stats.paymentSplit} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="82%" paddingAngle={2} stroke="none">
                    {stats.paymentSplit.map((s) => <Cell key={s.name} fill={s.color} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => inr(v, 0)} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            ) : <p className="pt-24 text-center text-sm text-muted-foreground">No issued invoices yet.</p>}
            {stats.billed > 0 && <div className="pointer-events-none absolute inset-x-0 top-[42%] text-center"><p className="num text-lg font-semibold text-brand-ink">{Math.round((stats.received / stats.billed) * 100)}%</p><p className="text-[11px] text-muted-foreground">collected</p></div>}
          </div>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardTitle title="Revenue by project" description="Top projects by billed value" icon={ReceiptIndianRupee} />
          <div className="h-[260px] p-3 sm:p-5">
            {stats.projects.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.projects} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <CartesianGrid horizontal={false} stroke="#eef2f6" />
                  <XAxis type="number" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={(v) => inrCompact(v)} />
                  <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} width={130} tick={{ fontSize: 11, fill: '#334155' }} tickFormatter={(v: string) => (v.length > 20 ? `${v.slice(0, 19)}…` : v)} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => inr(v, 0)} cursor={{ fill: 'rgba(16,41,74,0.04)' }} />
                  <Bar dataKey="value" name="Billed" fill="#24508a" radius={[0, 6, 6, 0]} maxBarSize={22} />
                </BarChart>
              </ResponsiveContainer>
            ) : <p className="pt-20 text-center text-sm text-muted-foreground">Link invoices to projects to see revenue by project.</p>}
          </div>
        </Card>
        <Card>
          <CardTitle title="Invoice status" description="Distribution of all invoices" />
          <div className="h-[260px] p-3">
            {stats.statuses.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={stats.statuses} dataKey="value" nameKey="name" outerRadius="78%" stroke="#fff" strokeWidth={2}>
                    {stats.statuses.map((s) => <Cell key={s.name} fill={STATUS_COLORS[s.name] ?? '#94a3b8'} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            ) : <p className="pt-20 text-center text-sm text-muted-foreground">No invoices yet.</p>}
          </div>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardTitle title="Recent invoices" action={<Link href="/invoices" className="flex items-center gap-1 text-sm font-semibold text-brand-navy-3 hover:underline">View all <ArrowRight size={14} /></Link>} />
          <div className="divide-y">
            {!recent.length && <p className="p-8 text-center text-sm text-muted-foreground">No invoices yet. <Link href="/invoices/new" className="font-semibold text-brand-navy-3">Create the first one</Link>.</p>}
            {recent.map((inv) => (
              <Link key={inv.id} href={`/invoices/${inv.id}`} className="flex items-center gap-3 px-5 py-3 transition hover:bg-slate-50/70">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-navy/5 text-brand-navy"><ReceiptIndianRupee size={16} /></span>
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{customerById.get(inv.customer_id ?? '')?.name ?? inv.snapshot?.customer?.name ?? 'No customer'}</p><p className="truncate text-xs text-muted-foreground">{inv.invoice_number} · {fmtDate(inv.invoice_date)}</p></div>
                <div className="text-right"><p className="num text-sm font-semibold">{inr(inv.grand_total)}</p><StatusBadge status={invoiceStatus(inv)} className="mt-0.5" /></div>
              </Link>
            ))}
          </div>
        </Card>
        <div className="space-y-5">
          <Card>
            <CardTitle title="Needs follow-up" description="Overdue invoices" icon={AlertTriangle} action={stats.overdueList.length > 0 ? <Link href="/payments?tab=pending" className="text-sm font-semibold text-brand-navy-3 hover:underline">All</Link> : undefined} />
            <div className="divide-y">
              {!stats.overdueList.length && <p className="px-5 py-6 text-center text-sm text-muted-foreground">Nothing overdue. 🎉</p>}
              {stats.overdueList.sort((a, b) => b.balance_due - a.balance_due).slice(0, 5).map((inv) => (
                <Link key={inv.id} href={`/invoices/${inv.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-slate-50/70">
                  <div className="min-w-0"><p className="truncate text-sm font-medium">{customerById.get(inv.customer_id ?? '')?.name ?? '—'}</p><p className="text-xs text-red-600">{daysOverdue(inv)} days overdue · {inv.invoice_number}</p></div>
                  <span className="num flex items-center gap-1 text-sm font-semibold">{inr(inv.balance_due, 0)}<ArrowUpRight size={14} className="text-slate-400" /></span>
                </Link>
              ))}
            </div>
          </Card>
          <Card>
            <CardTitle title="Recent activity" />
            <div className="max-h-[360px] overflow-y-auto p-5"><ActivityTimeline logs={logs} linkEntities empty="Activity will appear here as your team works." /></div>
          </Card>
        </div>
      </div>
    </div>
  );
}
