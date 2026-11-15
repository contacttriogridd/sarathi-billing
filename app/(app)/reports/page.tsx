'use client';

import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { FileSpreadsheet, FileText, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useData } from '@/components/providers';
import { Card, LoadingPanel, PageHeader, SelectNative, TextInput } from '@/components/common';
import { cn } from '@/lib/utils';
import { REPORT_TYPES, buildReport, type ReportType } from '@/lib/reports';
import { generateReportPdf } from '@/lib/pdf/lazy';
import { exportReportExcel } from '@/lib/excel';
import { amount as money, inr, inrCompact, qty, slug, todayISO } from '@/lib/format';
import { friendlyError } from '@/lib/data';
import { downloadBytes } from '@/lib/share';

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const presets = () => {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const fyStart = m >= 3 ? y : y - 1;
  const q = Math.floor(m / 3);
  return [
    { id: 'today', label: 'Today', from: todayISO(), to: todayISO() },
    { id: 'month', label: 'This month', from: iso(new Date(y, m, 1)), to: iso(new Date(y, m + 1, 0)) },
    { id: 'last-month', label: 'Last month', from: iso(new Date(y, m - 1, 1)), to: iso(new Date(y, m, 0)) },
    { id: 'quarter', label: 'This quarter', from: iso(new Date(y, q * 3, 1)), to: iso(new Date(y, q * 3 + 3, 0)) },
    { id: 'fy', label: `FY ${fyStart}-${String((fyStart + 1) % 100).padStart(2, '0')}`, from: `${fyStart}-04-01`, to: `${fyStart + 1}-03-31` },
    { id: 'last-fy', label: `FY ${fyStart - 1}-${String(fyStart % 100).padStart(2, '0')}`, from: `${fyStart - 1}-04-01`, to: `${fyStart}-03-31` },
    { id: 'all', label: 'All time', from: '', to: '' },
  ];
};

export default function ReportsPage() {
  const { invoices, payments, expenses, customers, projects, settings, loading } = useData();
  const ranges = useMemo(presets, []);
  const [type, setType] = useState<ReportType>('monthly');
  const [preset, setPreset] = useState('fy');
  const [from, setFrom] = useState(ranges[4].from);
  const [to, setTo] = useState(ranges[4].to);
  const [busy, setBusy] = useState<'pdf' | 'xlsx' | null>(null);

  const report = useMemo(() => buildReport(type, from, to, { invoices, payments, expenses, customers, projects }), [type, from, to, invoices, payments, expenses, customers, projects]);
  const filename = `${slug(report.title.toLowerCase())}-${from || 'start'}-to-${to || 'today'}`;

  const exportPdf = async () => {
    setBusy('pdf');
    try { downloadBytes(await generateReportPdf(report, settings), `${filename}.pdf`); } catch (e) { toast.error(friendlyError(e)); } finally { setBusy(null); }
  };
  const exportXlsx = async () => {
    setBusy('xlsx');
    try { await exportReportExcel(report, `${filename}.xlsx`, settings.company_name); } catch (e) { toast.error(friendlyError(e)); } finally { setBusy(null); }
  };

  if (loading) return <LoadingPanel />;
  const groups = Array.from(new Set(REPORT_TYPES.map((r) => r.group)));

  return (
    <div className="animate-in-up">
      <PageHeader title="Reports & analytics" description="Billing, GST, receivables and profitability — export any report to PDF or Excel."
        actions={<>
          <button onClick={exportPdf} disabled={!!busy} className="flex h-10 items-center gap-2 rounded-xl border bg-white px-3.5 text-sm font-semibold hover:bg-slate-50">{busy === 'pdf' ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}PDF</button>
          <button onClick={exportXlsx} disabled={!!busy} className="flex h-10 items-center gap-2 rounded-xl bg-emerald-700 px-3.5 text-sm font-semibold text-white hover:bg-emerald-800">{busy === 'xlsx' ? <Loader2 size={16} className="animate-spin" /> : <FileSpreadsheet size={16} />}Excel</button>
        </>} />

      <div className="grid gap-5 lg:grid-cols-[250px_minmax(0,1fr)]">
        <Card className="h-fit p-2 lg:sticky lg:top-24">
          <div className="lg:hidden"><SelectNative value={type} onChange={(e) => setType(e.target.value as ReportType)}>{REPORT_TYPES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</SelectNative></div>
          <nav className="hidden lg:block">
            {groups.map((g) => (
              <div key={g} className="mb-2">
                <p className="px-3 pb-1 pt-2 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{g}</p>
                {REPORT_TYPES.filter((r) => r.group === g).map((r) => (
                  <button key={r.id} onClick={() => setType(r.id)} className={cn('block w-full rounded-lg px-3 py-2 text-left text-sm transition', type === r.id ? 'bg-brand-navy font-semibold text-white' : 'text-slate-600 hover:bg-slate-50')}>{r.label}</button>
                ))}
              </div>
            ))}
          </nav>
        </Card>

        <div className="min-w-0 space-y-4">
          <Card className="p-3 sm:p-4">
            <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
              {ranges.map((r) => <button key={r.id} onClick={() => { setPreset(r.id); setFrom(r.from); setTo(r.to); }} className={cn('h-8 whitespace-nowrap rounded-full px-3 text-xs font-medium', preset === r.id ? 'bg-brand-navy text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}>{r.label}</button>)}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:max-w-md">
              <TextInput type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPreset('custom'); }} aria-label="From" />
              <TextInput type="date" value={to} onChange={(e) => { setTo(e.target.value); setPreset('custom'); }} aria-label="To" />
            </div>
          </Card>

          <div>
            <h2 className="text-lg font-semibold text-brand-ink">{report.title}</h2>
            <p className="text-sm text-muted-foreground">{report.subtitle}</p>
          </div>

          {report.summary && (
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              {report.summary.map((s) => <Card key={s.label} className="p-4"><p className="text-xs text-muted-foreground">{s.label}</p><p className="num mt-1 truncate text-lg font-semibold text-brand-ink">{s.value}</p></Card>)}
            </div>
          )}

          {report.chart && report.chart.data.length > 0 && (
            <Card className="h-[280px] p-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={report.chart.data} margin={{ left: -6, right: 6 }}>
                  <CartesianGrid vertical={false} stroke="#eef2f6" />
                  <XAxis dataKey={report.chart.key} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={(v) => inrCompact(v)} width={58} />
                  <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} formatter={(v: number) => inr(v, 0)} cursor={{ fill: 'rgba(16,41,74,0.04)' }} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                  {report.chart.series.map((s) => <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color} radius={[5, 5, 0, 0]} maxBarSize={28} />)}
                </BarChart>
              </ResponsiveContainer>
            </Card>
          )}

          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="bg-slate-50/80 text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <tr>{report.columns.map((c) => <th key={c.key} className={cn('whitespace-nowrap px-4 py-3', c.align === 'right' ? 'text-right' : 'text-left')}>{c.label}</th>)}</tr>
                </thead>
                <tbody className="divide-y">
                  {!report.rows.length && <tr><td colSpan={report.columns.length} className="px-4 py-12 text-center text-muted-foreground">No records for the selected period.</td></tr>}
                  {report.rows.map((row, i) => (
                    <tr key={i} className="hover:bg-slate-50/60">
                      {report.columns.map((c) => <td key={c.key} className={cn('px-4 py-2.5', c.align === 'right' && 'num whitespace-nowrap text-right')}>{c.format === 'money' ? money(row[c.key]) : c.format === 'number' ? qty(row[c.key]) : String(row[c.key] ?? '—') || '—'}</td>)}
                    </tr>
                  ))}
                </tbody>
                {report.totals && report.rows.length > 0 && (
                  <tfoot className="border-t-2 border-brand-navy/20 bg-brand-navy/[0.04] font-semibold">
                    <tr>{report.columns.map((c) => <td key={c.key} className={cn('px-4 py-3', c.align === 'right' && 'num whitespace-nowrap text-right')}>{report.totals![c.key] === undefined ? '' : c.format === 'money' ? money(report.totals![c.key]) : c.format === 'number' ? qty(report.totals![c.key]) : String(report.totals![c.key])}</td>)}</tr>
                  </tfoot>
                )}
              </table>
            </div>
          </Card>
          {type === 'project' && <p className="text-xs text-muted-foreground">* Margin = billed value excluding GST minus recorded project expenses.</p>}
        </div>
      </div>
    </div>
  );
}
