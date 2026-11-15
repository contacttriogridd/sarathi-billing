import type { ReportSpec } from '@/lib/pdf/report';
import { financialYear, fmtDate, inr, monthKey, monthLabel, round2 } from '@/lib/format';
import { daysOverdue, invoiceStatus, isBillable, receivedOn } from '@/lib/status';
import type { Customer, Expense, Invoice, Payment, Project } from '@/lib/types';

export const REPORT_TYPES = [
  { id: 'daily', label: 'Daily billing', group: 'Billing' },
  { id: 'monthly', label: 'Monthly billing', group: 'Billing' },
  { id: 'annual', label: 'Annual billing (FY)', group: 'Billing' },
  { id: 'customer', label: 'Customer-wise billing', group: 'Billing' },
  { id: 'project', label: 'Project-wise billing', group: 'Billing' },
  { id: 'gst', label: 'GST summary (rate-wise)', group: 'Tax' },
  { id: 'gst-register', label: 'GST register (invoice-wise)', group: 'Tax' },
  { id: 'paid', label: 'Paid invoices', group: 'Receivables' },
  { id: 'pending', label: 'Pending invoices', group: 'Receivables' },
  { id: 'overdue', label: 'Overdue invoices', group: 'Receivables' },
  { id: 'profit', label: 'Profit & expense overview', group: 'Profitability' },
] as const;

export type ReportType = (typeof REPORT_TYPES)[number]['id'];
export type ReportData = { invoices: Invoice[]; payments: Payment[]; expenses: Expense[]; customers: Customer[]; projects: Project[] };
export type ReportResult = ReportSpec & { chart?: { key: string; series: { key: string; label: string; color: string }[]; data: Record<string, string | number>[] } };

const inRange = (d: string, from: string, to: string) => (!from || d >= from) && (!to || d <= to);
const sum = <T>(list: T[], f: (x: T) => number) => round2(list.reduce((s, x) => s + f(x), 0));

const invoiceRow = (i: Invoice, customers: Map<string, Customer>, projects: Map<string, Project>) => ({
  number: i.invoice_number, date: fmtDate(i.invoice_date), due: fmtDate(i.due_date), customer: customers.get(i.customer_id ?? '')?.name ?? i.snapshot?.customer?.name ?? '',
  project: projects.get(i.project_id ?? '')?.project_name ?? '', total: i.grand_total, received: receivedOn(i), balance: i.balance_due, days: daysOverdue(i), status: invoiceStatus(i),
});

export function buildReport(type: ReportType, from: string, to: string, data: ReportData): ReportResult {
  const customers = new Map(data.customers.map((c) => [c.id, c]));
  const projects = new Map(data.projects.map((p) => [p.id, p]));
  const billable = data.invoices.filter((i) => isBillable(i) && inRange(i.invoice_date, from, to));
  const pays = data.payments.filter((p) => inRange(p.payment_date, from, to));
  const subtitle = from || to ? `${from ? fmtDate(from) : 'Beginning'} – ${to ? fmtDate(to) : 'Today'}` : 'All time';
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
    default:
      return { title: 'Report', columns: [], rows: [] };
  }
}
