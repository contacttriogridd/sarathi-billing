import type { ReportSection, ReportSpec } from '@/lib/report-spec';
import { financialYear, fmtDate, inr, monthKey, monthLabel, qty, round2 } from '@/lib/format';
import { daysOverdue, invoiceStatus, isBillable, receivedOn } from '@/lib/status';
import { fmtHours, groupBy, labourBalance, summariseAttendance, weekday } from '@/lib/labour';
import type { Attendance, Customer, Expense, Invoice, Labourer, LabourPayment, Payment, Project } from '@/lib/types';

export const REPORT_TYPES = [
  { id: 'daily', label: 'Daily billing', group: 'Billing' },
  { id: 'monthly', label: 'Monthly billing', group: 'Billing' },
  { id: 'annual', label: 'Annual billing (FY)', group: 'Billing' },
  { id: 'customer', label: 'Customer-wise billing', group: 'Billing' },
  { id: 'project', label: 'Project-wise billing', group: 'Billing' },
  { id: 'project-report', label: 'Project report', group: 'Projects & labour' },
  { id: 'labour', label: 'Labour wages & attendance', group: 'Projects & labour' },
  { id: 'gst', label: 'GST summary (rate-wise)', group: 'Tax' },
  { id: 'gst-register', label: 'GST register (invoice-wise)', group: 'Tax' },
  { id: 'paid', label: 'Paid invoices', group: 'Receivables' },
  { id: 'pending', label: 'Pending invoices', group: 'Receivables' },
  { id: 'overdue', label: 'Overdue invoices', group: 'Receivables' },
  { id: 'profit', label: 'Profit & expense overview', group: 'Profitability' },
] as const;

export type ReportType = (typeof REPORT_TYPES)[number]['id'];
/** Reports that are run for one project (required) or can be narrowed to one (optional). */
export const REPORT_PROJECT_FILTER: Partial<Record<ReportType, 'required' | 'optional'>> = { 'project-report': 'required', labour: 'optional' };
export type ReportData = {
  invoices: Invoice[]; payments: Payment[]; expenses: Expense[]; customers: Customer[]; projects: Project[];
  labourers: Labourer[]; attendance: Attendance[]; labourPayments: LabourPayment[];
};
export type ReportOptions = { projectId?: string };
export type ReportResult = ReportSpec & { chart?: { key: string; series: { key: string; label: string; color: string }[]; data: Record<string, string | number>[] } };

const inRange = (d: string, from: string, to: string) => (!from || d >= from) && (!to || d <= to);
const sum = <T>(list: T[], f: (x: T) => number) => round2(list.reduce((s, x) => s + f(x), 0));

const invoiceRow = (i: Invoice, customers: Map<string, Customer>, projects: Map<string, Project>) => ({
  number: i.invoice_number, date: fmtDate(i.invoice_date), due: fmtDate(i.due_date), customer: customers.get(i.customer_id ?? '')?.name ?? i.snapshot?.customer?.name ?? '',
  project: projects.get(i.project_id ?? '')?.project_name ?? '', total: i.grand_total, received: receivedOn(i), balance: i.balance_due, days: daysOverdue(i), status: invoiceStatus(i),
});

const periodLabel = (from: string, to: string) => (from || to ? `${from ? fmtDate(from) : 'Beginning'} – ${to ? fmtDate(to) : 'Today'}` : 'All time');
const share = (part: number, whole: number) => (whole > 0 ? `${((part / whole) * 100).toFixed(1)}%` : '—');
const short = (name: string) => (name.length > 18 ? `${name.slice(0, 17)}…` : name);

export function buildReport(type: ReportType, from: string, to: string, data: ReportData, opts: ReportOptions = {}): ReportResult {
  const customers = new Map(data.customers.map((c) => [c.id, c]));
  const projects = new Map(data.projects.map((p) => [p.id, p]));
  const billable = data.invoices.filter((i) => isBillable(i) && inRange(i.invoice_date, from, to));
  const pays = data.payments.filter((p) => inRange(p.payment_date, from, to));
  const subtitle = periodLabel(from, to);
  const baseSummary = [
    { label: 'Invoices', value: String(billable.length) },
    { label: 'Billed', value: inr(sum(billable, (i) => i.grand_total)) },
    { label: 'GST', value: inr(sum(billable, (i) => i.tax_total)) },
    { label: 'Collected', value: inr(sum(pays, (p) => p.amount)) },
  ];

  const periodReport = (keyOf: (iso: string) => string, labelOf: (k: string) => string, title: string, keyLabel: string): ReportResult => {
    const keys = new Set<string>();
    billable.forEach((i) => keys.add(keyOf(i.invoice_date)));
    pays.forEach((p) => keys.add(keyOf(p.payment_date)));
    const rows = Array.from(keys).sort().map((k) => {
      const inv = billable.filter((i) => keyOf(i.invoice_date) === k);
      return { period: labelOf(k), count: inv.length, taxable: sum(inv, (i) => i.taxable_amount), gst: sum(inv, (i) => i.tax_total), billed: sum(inv, (i) => i.grand_total), received: sum(pays.filter((p) => keyOf(p.payment_date) === k), (p) => p.amount) };
    });
    return {
      title, subtitle, summary: baseSummary,
      columns: [{ key: 'period', label: keyLabel, weight: 1.3 }, { key: 'count', label: 'Invoices', align: 'right', format: 'number', weight: 0.7 }, { key: 'taxable', label: 'Taxable value', align: 'right', format: 'money' }, { key: 'gst', label: 'GST', align: 'right', format: 'money' }, { key: 'billed', label: 'Billed', align: 'right', format: 'money' }, { key: 'received', label: 'Collected', align: 'right', format: 'money' }],
      rows,
      totals: { period: 'Total', count: billable.length, taxable: sum(rows, (r) => r.taxable), gst: sum(rows, (r) => r.gst), billed: sum(rows, (r) => r.billed), received: sum(rows, (r) => r.received) },
      chart: { key: 'period', series: [{ key: 'billed', label: 'Billed', color: '#10294a' }, { key: 'received', label: 'Collected', color: '#ee8a2f' }], data: rows.map((r) => ({ period: r.period, billed: r.billed, received: r.received })) },
    };
  };

  switch (type) {
    case 'daily': return periodReport((d) => d, (k) => fmtDate(k), 'Daily billing report', 'Date');
    case 'monthly': return periodReport(monthKey, monthLabel, 'Monthly billing report', 'Month');
    case 'annual': return periodReport(financialYear, (k) => `FY ${k}`, 'Annual billing report', 'Financial year');

    case 'customer': {
      const rows = data.customers.map((c) => {
        const inv = billable.filter((i) => i.customer_id === c.id);
        return { name: c.name, gstin: c.gstin, count: inv.length, billed: sum(inv, (i) => i.grand_total), received: sum(inv, (i) => receivedOn(i)), pending: sum(inv, (i) => Math.max(0, i.balance_due)) };
      }).filter((r) => r.count > 0).sort((a, b) => b.billed - a.billed);
      return {
        title: 'Customer-wise billing', subtitle, summary: [{ label: 'Customers billed', value: String(rows.length) }, ...baseSummary.slice(1)],
        columns: [{ key: 'name', label: 'Customer', weight: 2 }, { key: 'gstin', label: 'GSTIN', weight: 1.4 }, { key: 'count', label: 'Invoices', align: 'right', format: 'number', weight: 0.7 }, { key: 'billed', label: 'Billed', align: 'right', format: 'money' }, { key: 'received', label: 'Received', align: 'right', format: 'money' }, { key: 'pending', label: 'Pending', align: 'right', format: 'money' }],
        rows, totals: { name: 'Total', count: sum(rows, (r) => r.count), billed: sum(rows, (r) => r.billed), received: sum(rows, (r) => r.received), pending: sum(rows, (r) => r.pending) },
        chart: { key: 'name', series: [{ key: 'billed', label: 'Billed', color: '#10294a' }, { key: 'pending', label: 'Pending', color: '#ee8a2f' }], data: rows.slice(0, 10).map((r) => ({ name: r.name.length > 18 ? `${r.name.slice(0, 17)}…` : r.name, billed: r.billed, pending: r.pending })) },
      };
    }

    case 'project': {
      const rows = data.projects.map((p) => {
        const inv = billable.filter((i) => i.project_id === p.id);
        const exp = data.expenses.filter((e) => e.project_id === p.id && inRange(e.expense_date, from, to));
        const taxable = sum(inv, (i) => i.taxable_amount);
        const spent = sum(exp, (e) => e.amount);
        return { name: p.project_name, code: p.project_code, customer: customers.get(p.customer_id)?.name ?? '', budget: p.estimated_budget, billed: sum(inv, (i) => i.grand_total), received: sum(inv, (i) => receivedOn(i)), pending: sum(inv, (i) => Math.max(0, i.balance_due)), expenses: spent, margin: round2(taxable - spent) };
      }).filter((r) => r.billed > 0 || r.expenses > 0).sort((a, b) => b.billed - a.billed);
      return {
        title: 'Project-wise billing', subtitle, summary: [{ label: 'Projects', value: String(rows.length) }, ...baseSummary.slice(1)],
        columns: [{ key: 'code', label: 'ID', weight: 0.8 }, { key: 'name', label: 'Project', weight: 1.8 }, { key: 'customer', label: 'Customer', weight: 1.4 }, { key: 'budget', label: 'Budget', align: 'right', format: 'money' }, { key: 'billed', label: 'Billed', align: 'right', format: 'money' }, { key: 'received', label: 'Received', align: 'right', format: 'money' }, { key: 'pending', label: 'Pending', align: 'right', format: 'money' }, { key: 'expenses', label: 'Expenses', align: 'right', format: 'money' }, { key: 'margin', label: 'Margin*', align: 'right', format: 'money' }],
        rows, totals: { name: 'Total', budget: sum(rows, (r) => r.budget), billed: sum(rows, (r) => r.billed), received: sum(rows, (r) => r.received), pending: sum(rows, (r) => r.pending), expenses: sum(rows, (r) => r.expenses), margin: sum(rows, (r) => r.margin) },
        chart: { key: 'name', series: [{ key: 'billed', label: 'Billed', color: '#10294a' }, { key: 'expenses', label: 'Expenses', color: '#ef4444' }], data: rows.slice(0, 10).map((r) => ({ name: r.name.length > 18 ? `${r.name.slice(0, 17)}…` : r.name, billed: r.billed, expenses: r.expenses })) },
      };
    }

    case 'gst': {
      const map = new Map<string, { rate: string; taxable: number; cgst: number; sgst: number; igst: number; tax: number }>();
      billable.filter((i) => i.tax_mode !== 'none').forEach((i) => (i.tax_breakdown ?? []).forEach((b) => {
        const key = b.exempt ? 'Exempt' : `${b.rate}%`;
        const m = map.get(key) ?? { rate: key, taxable: 0, cgst: 0, sgst: 0, igst: 0, tax: 0 };
        m.taxable += b.taxable; m.cgst += b.cgst; m.sgst += b.sgst; m.igst += b.igst; m.tax += b.tax;
        map.set(key, m);
      }));
      const nonGst = billable.filter((i) => i.tax_mode === 'none');
      if (nonGst.length) map.set('Non-GST', { rate: 'Non-GST bills', taxable: sum(nonGst, (i) => i.taxable_amount), cgst: 0, sgst: 0, igst: 0, tax: 0 });
      const rows = Array.from(map.values()).map((r) => ({ ...r, taxable: round2(r.taxable), cgst: round2(r.cgst), sgst: round2(r.sgst), igst: round2(r.igst), tax: round2(r.tax) }));
      return {
        title: 'GST summary', subtitle,
        summary: [{ label: 'Taxable value', value: inr(sum(rows, (r) => r.taxable)) }, { label: 'CGST', value: inr(sum(rows, (r) => r.cgst)) }, { label: 'SGST', value: inr(sum(rows, (r) => r.sgst)) }, { label: 'IGST', value: inr(sum(rows, (r) => r.igst)) }],
        columns: [{ key: 'rate', label: 'GST rate', weight: 1.2 }, { key: 'taxable', label: 'Taxable value', align: 'right', format: 'money' }, { key: 'cgst', label: 'CGST', align: 'right', format: 'money' }, { key: 'sgst', label: 'SGST', align: 'right', format: 'money' }, { key: 'igst', label: 'IGST', align: 'right', format: 'money' }, { key: 'tax', label: 'Total tax', align: 'right', format: 'money' }],
        rows, totals: { rate: 'Total', taxable: sum(rows, (r) => r.taxable), cgst: sum(rows, (r) => r.cgst), sgst: sum(rows, (r) => r.sgst), igst: sum(rows, (r) => r.igst), tax: sum(rows, (r) => r.tax) },
      };
    }

    case 'gst-register': {
      const rows = billable.sort((a, b) => a.invoice_date.localeCompare(b.invoice_date)).map((i) => {
        const c = customers.get(i.customer_id ?? '');
        return { number: i.invoice_number, date: fmtDate(i.invoice_date), customer: c?.name ?? i.snapshot?.customer?.name ?? '', gstin: c?.gstin ?? i.snapshot?.customer?.gstin ?? '', pos: i.place_of_supply, taxable: i.taxable_amount, cgst: i.cgst_total, sgst: i.sgst_total, igst: i.igst_total, total: i.grand_total };
      });
      return {
        title: 'GST register', subtitle, summary: [{ label: 'B2B invoices', value: String(rows.filter((r) => r.gstin).length) }, { label: 'B2C invoices', value: String(rows.filter((r) => !r.gstin).length) }, { label: 'Taxable value', value: inr(sum(rows, (r) => r.taxable)) }, { label: 'Total tax', value: inr(sum(rows, (r) => r.cgst + r.sgst + r.igst)) }],
        columns: [{ key: 'number', label: 'Invoice no.', weight: 1.2 }, { key: 'date', label: 'Date', weight: 0.9 }, { key: 'customer', label: 'Customer', weight: 1.5 }, { key: 'gstin', label: 'GSTIN', weight: 1.3 }, { key: 'pos', label: 'Place of supply', weight: 1 }, { key: 'taxable', label: 'Taxable', align: 'right', format: 'money' }, { key: 'cgst', label: 'CGST', align: 'right', format: 'money' }, { key: 'sgst', label: 'SGST', align: 'right', format: 'money' }, { key: 'igst', label: 'IGST', align: 'right', format: 'money' }, { key: 'total', label: 'Invoice total', align: 'right', format: 'money' }],
        rows, totals: { number: 'Total', taxable: sum(rows, (r) => r.taxable), cgst: sum(rows, (r) => r.cgst), sgst: sum(rows, (r) => r.sgst), igst: sum(rows, (r) => r.igst), total: sum(rows, (r) => r.total) },
      };
    }

    case 'paid':
    case 'pending':
    case 'overdue': {
      const list = billable.filter((i) => (type === 'paid' ? i.status === 'Paid' : type === 'pending' ? i.balance_due > 0.009 : invoiceStatus(i) === 'Overdue'))
        .sort((a, b) => (type === 'overdue' ? daysOverdue(b) - daysOverdue(a) : a.invoice_date.localeCompare(b.invoice_date)));
      const rows = list.map((i) => invoiceRow(i, customers, projects));
      const columns: ReportSpec['columns'] = [{ key: 'number', label: 'Invoice no.', weight: 1.2 }, { key: 'date', label: 'Date', weight: 0.9 }, { key: 'customer', label: 'Customer', weight: 1.6 }, { key: 'project', label: 'Project', weight: 1.3 }, { key: 'total', label: 'Total', align: 'right', format: 'money' }, { key: 'received', label: 'Received', align: 'right', format: 'money' }];
      if (type !== 'paid') columns.push({ key: 'balance', label: 'Balance', align: 'right', format: 'money' }, { key: 'due', label: 'Due date', weight: 0.9 });
      if (type === 'overdue') columns.push({ key: 'days', label: 'Days overdue', align: 'right', format: 'number', weight: 0.8 });
      return {
        title: type === 'paid' ? 'Paid invoices' : type === 'pending' ? 'Pending invoices' : 'Overdue invoices', subtitle, columns, rows,
        summary: [{ label: 'Invoices', value: String(rows.length) }, { label: 'Invoice value', value: inr(sum(rows, (r) => r.total)) }, { label: 'Received', value: inr(sum(rows, (r) => r.received)) }, { label: 'Outstanding', value: inr(sum(rows, (r) => Math.max(0, r.balance))) }],
        totals: { number: 'Total', total: sum(rows, (r) => r.total), received: sum(rows, (r) => r.received), balance: sum(rows, (r) => r.balance) },
      };
    }

    case 'profit': {
      const exps = data.expenses.filter((e) => inRange(e.expense_date, from, to));
      const keys = new Set<string>([...billable.map((i) => monthKey(i.invoice_date)), ...exps.map((e) => monthKey(e.expense_date))]);
      const rows = Array.from(keys).sort().map((k) => {
        const revenue = sum(billable.filter((i) => monthKey(i.invoice_date) === k), (i) => i.taxable_amount);
        const expense = sum(exps.filter((e) => monthKey(e.expense_date) === k), (e) => e.amount);
        return { period: monthLabel(k), revenue, expense, profit: round2(revenue - expense), margin: revenue > 0 ? `${(((revenue - expense) / revenue) * 100).toFixed(1)}%` : '—' };
      });
      const byCat = new Map<string, number>();
      exps.forEach((e) => byCat.set(e.category, (byCat.get(e.category) ?? 0) + e.amount));
      const revenue = sum(rows, (r) => r.revenue);
      const expense = sum(rows, (r) => r.expense);
      return {
        title: 'Profit & expense overview', subtitle,
        summary: [{ label: 'Revenue (excl. GST)', value: inr(revenue) }, { label: 'Expenses', value: inr(expense) }, { label: 'Profit', value: inr(revenue - expense) }, { label: 'Margin', value: revenue > 0 ? `${(((revenue - expense) / revenue) * 100).toFixed(1)}%` : '—' },
          ...Array.from(byCat.entries()).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([c, v]) => ({ label: `Spent on ${c}`, value: inr(v) }))],
        columns: [{ key: 'period', label: 'Month', weight: 1.2 }, { key: 'revenue', label: 'Revenue (excl. GST)', align: 'right', format: 'money' }, { key: 'expense', label: 'Expenses', align: 'right', format: 'money' }, { key: 'profit', label: 'Profit', align: 'right', format: 'money' }, { key: 'margin', label: 'Margin', align: 'right', weight: 0.7 }],
        rows, totals: { period: 'Total', revenue, expense, profit: round2(revenue - expense), margin: revenue > 0 ? `${(((revenue - expense) / revenue) * 100).toFixed(1)}%` : '—' },
        chart: { key: 'period', series: [{ key: 'revenue', label: 'Revenue', color: '#10294a' }, { key: 'expense', label: 'Expenses', color: '#ef4444' }, { key: 'profit', label: 'Profit', color: '#10b981' }], data: rows.map((r) => ({ period: r.period, revenue: r.revenue, expense: r.expense, profit: r.profit })) },
      };
    }
    case 'project-report': return projectReport(opts.projectId, from, to, data, customers, subtitle);

    case 'labour': {
      const project = opts.projectId ? projects.get(opts.projectId) : undefined;
      const att = data.attendance.filter((a) => inRange(a.work_date, from, to) && (!opts.projectId || a.project_id === opts.projectId));
      // payments are made to the labourer, not per site, so they are only shown for all projects
      const pays = opts.projectId ? [] : data.labourPayments.filter((p) => inRange(p.payment_date, from, to));
      const attBy = groupBy(att, (a) => a.labourer_id);
      const payBy = groupBy(pays, (p) => p.labourer_id);
      const rows = data.labourers.filter((l) => attBy.has(l.id) || payBy.has(l.id)).map((l) => {
        const t = summariseAttendance(attBy.get(l.id) ?? []);
        const paid = sum(payBy.get(l.id) ?? [], (p) => p.amount);
        return { code: l.labour_code, name: l.name, trade: l.trade, present: t.present, half: t.half, absent: t.absent, ot: t.otHours, mandays: t.manDays, wages: t.wages, paid, net: round2(t.wages - paid) };
      }).sort((a, b) => b.wages - a.wages || a.name.localeCompare(b.name));
      const total = summariseAttendance(att);
      const columns: ReportSpec['columns'] = [
        { key: 'code', label: 'Labour ID', weight: 0.85 }, { key: 'name', label: 'Labourer', weight: 1.6 }, { key: 'trade', label: 'Trade', weight: 1 },
        { key: 'present', label: 'Present', align: 'right', format: 'number', weight: 0.7 }, { key: 'half', label: 'Half days', align: 'right', format: 'number', weight: 0.7 },
        { key: 'absent', label: 'Absent', align: 'right', format: 'number', weight: 0.7 }, { key: 'ot', label: 'OT hours', align: 'right', format: 'number', weight: 0.75 },
        { key: 'mandays', label: 'Man-days', align: 'right', format: 'number', weight: 0.8 }, { key: 'wages', label: 'Wages', align: 'right', format: 'money' },
      ];
      if (!opts.projectId) columns.push({ key: 'paid', label: 'Paid', align: 'right', format: 'money' }, { key: 'net', label: 'Balance', align: 'right', format: 'money' });
      return {
        title: 'Labour wages & attendance', subtitle: project ? `${project.project_name} · ${subtitle}` : subtitle,
        summary: [
          { label: 'Labourers', value: String(rows.length) }, { label: 'Man-days', value: qty(total.manDays) },
          { label: 'Wages earned', value: inr(total.wages) },
          opts.projectId ? { label: 'Overtime', value: fmtHours(total.otHours) } : { label: 'Paid', value: inr(sum(pays, (p) => p.amount)) },
        ],
        columns, rows,
        totals: { code: 'Total', present: total.present, half: total.half, absent: total.absent, ot: total.otHours, mandays: total.manDays, wages: total.wages, paid: sum(rows, (r) => r.paid), net: sum(rows, (r) => r.net) },
        chart: { key: 'name', series: [{ key: 'wages', label: 'Wages', color: '#10294a' }, ...(opts.projectId ? [] : [{ key: 'paid', label: 'Paid', color: '#ee8a2f' }])], data: rows.slice(0, 10).map((r) => ({ name: short(r.name), wages: r.wages, paid: r.paid })) },
        note: 'Man-days count a half day as 0.5. Wages come from attendance and are already included in project expenses; payments and advances only settle each labourer\'s balance.',
      };
    }
    default:
      return { title: 'Report', columns: [], rows: [] };
  }
}

/** Everything about one project in the selected period: billing, collections, expenses and labour. */
function projectReport(projectId: string | undefined, from: string, to: string, data: ReportData, customers: Map<string, Customer>, period: string): ReportResult {
  const p = data.projects.find((x) => x.id === projectId);
  if (!p) return { title: 'Project report', subtitle: 'Choose a project', columns: [], rows: [] };
  const customer = customers.get(p.customer_id);
  const allInvoices = data.invoices.filter((i) => i.project_id === p.id);
  const invoiceById = new Map(allInvoices.map((i) => [i.id, i]));
  const inv = allInvoices.filter((i) => isBillable(i) && inRange(i.invoice_date, from, to)).sort((a, b) => a.invoice_date.localeCompare(b.invoice_date));
  const pays = data.payments.filter((pm) => invoiceById.has(pm.invoice_id) && inRange(pm.payment_date, from, to)).sort((a, b) => a.payment_date.localeCompare(b.payment_date));
  const exps = data.expenses.filter((e) => e.project_id === p.id && inRange(e.expense_date, from, to));
  const att = data.attendance.filter((a) => a.project_id === p.id && inRange(a.work_date, from, to));

  const billed = sum(inv, (i) => i.grand_total);
  const taxable = sum(inv, (i) => i.taxable_amount);
  const spent = sum(exps, (e) => e.amount);
  const labour = summariseAttendance(att);

  // month by month
  const months = Array.from(new Set([...inv.map((i) => monthKey(i.invoice_date)), ...pays.map((x) => monthKey(x.payment_date)), ...exps.map((e) => monthKey(e.expense_date))])).sort();
  const monthly = months.map((k) => {
    const mExp = exps.filter((e) => monthKey(e.expense_date) === k);
    const mTaxable = sum(inv.filter((i) => monthKey(i.invoice_date) === k), (i) => i.taxable_amount);
    const mLabour = sum(mExp.filter((e) => e.category === 'Labour'), (e) => e.amount);
    const mTotal = sum(mExp, (e) => e.amount);
    return { period: monthLabel(k), taxable: mTaxable, collected: sum(pays.filter((x) => monthKey(x.payment_date) === k), (x) => x.amount), labour: mLabour, other: round2(mTotal - mLabour), expenses: mTotal, margin: round2(mTaxable - mTotal) };
  });

  const byCategory = Array.from(groupBy(exps, (e) => e.category).entries()).map(([category, list]) => ({ category, count: list.length, amount: sum(list, (e) => e.amount) }))
    .sort((a, b) => b.amount - a.amount).map((r) => ({ ...r, share: share(r.amount, spent) }));

  const attBy = groupBy(att, (a) => a.labourer_id);
  const labourRows = data.labourers.filter((l) => attBy.has(l.id)).map((l) => {
    const t = summariseAttendance(attBy.get(l.id) ?? []);
    return { code: l.labour_code, name: l.name, trade: l.trade, present: t.present, half: t.half, absent: t.absent, ot: t.otHours, mandays: t.manDays, wages: t.wages };
  }).sort((a, b) => b.wages - a.wages || a.name.localeCompare(b.name));

  const otherExpenses = exps.filter((e) => !e.attendance_id).sort((a, b) => a.expense_date.localeCompare(b.expense_date))
    .map((e) => ({ date: fmtDate(e.expense_date), category: e.category, vendor: e.vendor, description: e.description, reference: e.reference, amount: e.amount }));

  const sections: ReportSection[] = [
    {
      title: 'Monthly summary', empty: 'No billing or expenses in the selected period.',
      columns: [{ key: 'period', label: 'Month', weight: 1 }, { key: 'taxable', label: 'Billed (excl. GST)', align: 'right', format: 'money' }, { key: 'collected', label: 'Collected', align: 'right', format: 'money' },
        { key: 'labour', label: 'Labour', align: 'right', format: 'money' }, { key: 'other', label: 'Other expenses', align: 'right', format: 'money' }, { key: 'expenses', label: 'Total expenses', align: 'right', format: 'money' }, { key: 'margin', label: 'Margin', align: 'right', format: 'money' }],
      rows: monthly,
      totals: { period: 'Total', taxable: sum(monthly, (r) => r.taxable), collected: sum(monthly, (r) => r.collected), labour: sum(monthly, (r) => r.labour), other: sum(monthly, (r) => r.other), expenses: sum(monthly, (r) => r.expenses), margin: sum(monthly, (r) => r.margin) },
    },
    {
      title: 'Invoices', empty: 'No invoices in the selected period.',
      columns: [{ key: 'number', label: 'Invoice no.', weight: 1.25 }, { key: 'date', label: 'Date', weight: 0.9 }, { key: 'type', label: 'Type', weight: 1.2 }, { key: 'taxable', label: 'Taxable', align: 'right', format: 'money' },
        { key: 'gst', label: 'GST', align: 'right', format: 'money', weight: 0.85 }, { key: 'total', label: 'Total', align: 'right', format: 'money' }, { key: 'received', label: 'Received', align: 'right', format: 'money' },
        { key: 'balance', label: 'Balance', align: 'right', format: 'money' }, { key: 'status', label: 'Status', weight: 0.9 }],
      rows: inv.map((i) => ({ number: i.invoice_number, date: fmtDate(i.invoice_date), type: i.invoice_type, taxable: i.taxable_amount, gst: i.tax_total, total: i.grand_total, received: receivedOn(i), balance: i.balance_due, status: invoiceStatus(i) })),
      totals: { number: 'Total', taxable, gst: sum(inv, (i) => i.tax_total), total: billed, received: sum(inv, (i) => receivedOn(i)), balance: sum(inv, (i) => i.balance_due) },
    },
    {
      title: 'Payments received', empty: 'No payments received in the selected period.',
      columns: [{ key: 'receipt', label: 'Receipt no.', weight: 1.2 }, { key: 'date', label: 'Date', weight: 0.9 }, { key: 'invoice', label: 'Invoice no.', weight: 1.2 }, { key: 'method', label: 'Method', weight: 0.9 }, { key: 'reference', label: 'Reference', weight: 1.4 }, { key: 'amount', label: 'Amount', align: 'right', format: 'money' }],
      rows: pays.map((x) => ({ receipt: x.receipt_number, date: fmtDate(x.payment_date), invoice: invoiceById.get(x.invoice_id)?.invoice_number ?? '', method: x.method, reference: x.reference, amount: x.amount })),
      totals: { receipt: 'Total', amount: sum(pays, (x) => x.amount) },
    },
    {
      title: 'Expenses by category', empty: 'No expenses in the selected period.',
      columns: [{ key: 'category', label: 'Category', weight: 1.6 }, { key: 'count', label: 'Entries', align: 'right', format: 'number', weight: 0.7 }, { key: 'amount', label: 'Amount', align: 'right', format: 'money' }, { key: 'share', label: 'Share', align: 'right', weight: 0.7 }],
      rows: byCategory, totals: { category: 'Total', count: exps.length, amount: spent, share: spent > 0 ? '100%' : '' },
    },
    {
      title: 'Labour attendance & wages', empty: 'No labour attendance for this project in the selected period.',
      columns: [{ key: 'code', label: 'Labour ID', weight: 0.85 }, { key: 'name', label: 'Labourer', weight: 1.6 }, { key: 'trade', label: 'Trade', weight: 1 },
        { key: 'present', label: 'Present', align: 'right', format: 'number', weight: 0.7 }, { key: 'half', label: 'Half days', align: 'right', format: 'number', weight: 0.7 },
        { key: 'absent', label: 'Absent', align: 'right', format: 'number', weight: 0.7 }, { key: 'ot', label: 'OT hours', align: 'right', format: 'number', weight: 0.75 },
        { key: 'mandays', label: 'Man-days', align: 'right', format: 'number', weight: 0.8 }, { key: 'wages', label: 'Wages', align: 'right', format: 'money' }],
      rows: labourRows,
      totals: { code: 'Total', present: labour.present, half: labour.half, absent: labour.absent, ot: labour.otHours, mandays: labour.manDays, wages: labour.wages },
    },
    {
      title: 'Other expenses (material, transport, subcontract…)', empty: 'No other expenses in the selected period.',
      columns: [{ key: 'date', label: 'Date', weight: 0.9 }, { key: 'category', label: 'Category', weight: 1 }, { key: 'vendor', label: 'Paid to', weight: 1.3 }, { key: 'description', label: 'Description', weight: 2 }, { key: 'reference', label: 'Bill / ref.', weight: 1 }, { key: 'amount', label: 'Amount', align: 'right', format: 'money' }],
      rows: otherExpenses, totals: { date: 'Total', amount: sum(otherExpenses, (r) => r.amount) },
    },
  ];

  return {
    title: 'Project report', subtitle: `${p.project_code} · ${period}`,
    info: [
      { label: 'Project', value: p.project_name }, { label: 'Project ID', value: p.project_code }, { label: 'Customer', value: customer?.name ?? '—' },
      { label: 'Site / location', value: p.location || '—' }, { label: 'Type', value: p.project_type || '—' }, { label: 'Status', value: p.status },
      { label: 'Schedule', value: `${fmtDate(p.start_date)} to ${fmtDate(p.expected_completion_date)}` }, { label: 'Report period', value: period },
    ],
    summary: [
      { label: 'Estimated budget', value: p.estimated_budget > 0 ? inr(p.estimated_budget) : 'Not set' },
      { label: 'Billed (incl. GST)', value: inr(billed) },
      { label: 'Received', value: inr(sum(inv, (i) => receivedOn(i))) },
      { label: 'Pending', value: inr(sum(inv, (i) => Math.max(0, i.balance_due))) },
      { label: 'Total expenses', value: inr(spent) },
      { label: 'Labour wages', value: inr(labour.wages) },
      { label: 'Margin (excl. GST)', value: inr(taxable - spent) },
      { label: 'Labour man-days', value: qty(labour.manDays) },
    ],
    columns: [], rows: [], sections,
    chart: { key: 'period', series: [{ key: 'taxable', label: 'Billed (excl. GST)', color: '#10294a' }, { key: 'labour', label: 'Labour', color: '#ee8a2f' }, { key: 'other', label: 'Other expenses', color: '#ef4444' }], data: monthly.map((r) => ({ period: r.period, taxable: r.taxable, labour: r.labour, other: r.other })) },
    note: 'Margin = billed value excluding GST minus all project expenses. Labour wages from attendance are added to project expenses automatically.',
  };
}

/** A labourer's attendance register and payments for a period, e.g. one month. */
export function buildLabourerStatement(lab: Labourer, from: string, to: string, data: Pick<ReportData, 'attendance' | 'labourPayments' | 'projects'>): ReportResult {
  const projects = new Map(data.projects.map((p) => [p.id, p]));
  const allAtt = data.attendance.filter((a) => a.labourer_id === lab.id);
  const allPays = data.labourPayments.filter((p) => p.labourer_id === lab.id);
  const att = allAtt.filter((a) => inRange(a.work_date, from, to)).sort((a, b) => a.work_date.localeCompare(b.work_date));
  const pays = allPays.filter((p) => inRange(p.payment_date, from, to)).sort((a, b) => a.payment_date.localeCompare(b.payment_date));
  const t = summariseAttendance(att);
  const paid = sum(pays, (p) => p.amount);
  const overall = labourBalance(allAtt, allPays);
  const period = periodLabel(from, to);
  return {
    title: 'Labour statement', subtitle: `${lab.labour_code} · ${period}`,
    info: [
      { label: 'Labourer', value: lab.name }, { label: 'Labour ID', value: lab.labour_code }, { label: 'Trade', value: lab.trade || '—' },
      { label: 'Phone', value: lab.phone || '—' }, { label: 'Rates', value: `${inr(lab.daily_wage)} / day · OT ${inr(lab.overtime_rate)} / h` },
      { label: 'Usual site', value: projects.get(lab.default_project_id ?? '')?.project_name ?? '—' },
    ],
    summary: [
      { label: 'Days present', value: qty(t.present) }, { label: 'Half days', value: qty(t.half) }, { label: 'Man-days', value: qty(t.manDays) }, { label: 'Overtime', value: fmtHours(t.otHours) },
      { label: 'Wages earned', value: inr(t.wages) }, { label: 'Paid in period', value: inr(paid) }, { label: 'Period balance', value: inr(t.wages - paid) },
      { label: overall.balance < 0 ? 'Advance outstanding' : 'Total balance due', value: inr(Math.abs(overall.balance)) },
    ],
    columns: [], rows: [],
    sections: [
      {
        title: 'Attendance', empty: 'No attendance marked in this period.',
        columns: [{ key: 'date', label: 'Date', weight: 0.95 }, { key: 'day', label: 'Day', weight: 0.55 }, { key: 'project', label: 'Project / site', weight: 1.9 }, { key: 'status', label: 'Status', weight: 0.85 },
          { key: 'ot', label: 'OT hours', align: 'right', format: 'number', weight: 0.75 }, { key: 'rate', label: 'Rate / day', align: 'right', format: 'money', weight: 0.9 }, { key: 'amount', label: 'Wages', align: 'right', format: 'money' }],
        rows: att.map((a) => ({ date: fmtDate(a.work_date), day: weekday(a.work_date), project: projects.get(a.project_id ?? '')?.project_name ?? 'General', status: a.status, ot: a.overtime_hours || '', rate: a.daily_wage, amount: a.amount })),
        totals: { date: 'Total', ot: t.otHours, amount: t.wages },
      },
      {
        title: 'Payments & advances', empty: 'No payments in this period.',
        columns: [{ key: 'date', label: 'Date', weight: 0.95 }, { key: 'kind', label: 'Type', weight: 0.8 }, { key: 'method', label: 'Method', weight: 0.9 }, { key: 'reference', label: 'Reference', weight: 1.2 }, { key: 'notes', label: 'Notes', weight: 1.8 }, { key: 'amount', label: 'Amount', align: 'right', format: 'money' }],
        rows: pays.map((p) => ({ date: fmtDate(p.payment_date), kind: p.kind, method: p.method, reference: p.reference, notes: p.notes, amount: p.amount })),
        totals: { date: 'Total', amount: paid },
      },
    ],
    note: `Overall since joining: earned ${inr(overall.earned)}, paid ${inr(overall.paid)} — ${overall.balance < 0 ? `advance of ${inr(-overall.balance)} to be recovered` : `${inr(overall.balance)} due to the labourer`}.`,
  };
}
