import { computeDocument } from '@/lib/calc';
import { RA_TYPES, invoiceTitle } from '@/lib/constants';
import { companyForDocument, optionsFor } from '@/lib/pdf/options';
import { fmtDate } from '@/lib/format';
import { renderDocumentPdf, type PdfDocInput } from '@/lib/pdf/document';
import type { CompanySettings, Customer, Invoice, LineItem, Project, Quotation } from '@/lib/types';

export { companyForDocument, optionsFor };

const partyFrom = (snapshot: Partial<Customer> | undefined, live: Customer | undefined) => {
  const c = { ...(live ?? {}), ...(snapshot ?? {}) };
  return { name: c.name, address: c.address, phone: c.phone, email: c.email, gstin: c.gstin, state: c.state };
};

const projectFrom = (snapshot: Partial<Project> | undefined, live: Project | undefined) => {
  const p = { ...(live ?? {}), ...(snapshot ?? {}) };
  if (!p.project_name && !p.location) return null;
  return { name: p.project_name, code: p.project_code, location: p.location, type: p.project_type };
};

export const invoicePdfInput = (inv: Invoice, items: LineItem[], settings: CompanySettings, customer?: Customer, project?: Project): PdfDocInput => {
  const calc = computeDocument({ ...inv, items, amount_paid: inv.amount_paid });
  const isRa = RA_TYPES.includes(inv.invoice_type);
  const details: [string, string][] = [
    ['RA bill no.', isRa ? inv.ra_details?.ra_number ?? '' : ''],
    ['Work order no.', inv.work_order_number],
    ['Reference no.', inv.reference_number],
    ['Place of supply', inv.place_of_supply],
    ['Tax', inv.tax_mode === 'none' ? 'Non-GST' : `${inv.tax_type === 'IGST' ? 'IGST' : 'CGST + SGST'} (${inv.tax_mode === 'inclusive' ? 'inclusive' : 'exclusive'})`],
  ];
  return {
    kind: 'invoice',
    title: invoiceTitle(inv.invoice_type, inv.tax_mode),
    number: inv.invoice_number,
    date: fmtDate(inv.invoice_date),
    headerDates: inv.due_date ? [{ label: 'Due date', value: fmtDate(inv.due_date) }] : [],
    details,
    company: companyForDocument(settings, inv.snapshot, inv.status !== 'Draft'),
    customer: partyFrom(inv.snapshot?.customer, customer),
    project: projectFrom(inv.snapshot?.project, project),
    billingMode: inv.billing_mode,
    items,
    calc,
    taxMode: inv.tax_mode,
    taxType: inv.tax_type,
    lineDiscountType: inv.line_discount_type,
    discountPercent: inv.discount_type === 'percent' ? inv.discount_value : undefined,
    stageContract: inv.stage_details?.contract_value,
    ra: { enabled: isRa, number: inv.ra_details?.ra_number, showQuantities: Boolean(inv.ra_details?.show_quantities) },
    paymentTerms: inv.payment_terms,
    notes: inv.notes,
    terms: inv.terms,
    options: optionsFor(settings, inv.pdf_options),
    watermark: inv.status === 'Draft' ? { text: 'DRAFT', tone: 'neutral' } : inv.status === 'Cancelled' ? { text: 'CANCELLED', tone: 'danger' } : undefined,
    paid: inv.status === 'Paid',
    showPayments: true,
    upiAmount: calc.balance_due > 0 ? calc.balance_due : undefined,
  };
};

export const quotationPdfInput = (q: Quotation, items: LineItem[], settings: CompanySettings, customer?: Customer, project?: Project): PdfDocInput => {
  const calc = computeDocument({ ...q, items });
  const estimate = q.doc_kind === 'estimate';
  return {
    kind: estimate ? 'estimate' : 'quotation',
    title: estimate ? 'ESTIMATE' : 'QUOTATION',
    number: q.quotation_number,
    date: fmtDate(q.quotation_date),
    headerDates: q.valid_until ? [{ label: 'Valid until', value: fmtDate(q.valid_until) }] : [],
    details: [
      ['Status', q.status === 'Draft' ? 'Draft' : q.status],
      ['Tax', q.tax_mode === 'none' ? 'Non-GST' : `${q.tax_type === 'IGST' ? 'IGST' : 'CGST + SGST'} (${q.tax_mode})`],
    ],
    company: companyForDocument(settings, q.snapshot, q.status !== 'Draft'),
    customer: partyFrom(q.snapshot?.customer, customer),
    project: projectFrom(q.snapshot?.project, project),
    subject: q.subject,
    billingMode: q.billing_mode,
    items,
    calc,
    taxMode: q.tax_mode,
    taxType: q.tax_type,
    lineDiscountType: q.line_discount_type,
    discountPercent: q.discount_type === 'percent' ? q.discount_value : undefined,
    stageContract: q.stage_details?.contract_value,
    notes: q.notes,
    terms: q.terms,
    options: { ...optionsFor(settings, q.pdf_options), showUpiQr: false, showPaymentSummary: false },
    watermark: q.status === 'Draft' ? { text: 'DRAFT', tone: 'neutral' } : undefined,
    showPayments: false,
  };
};

export const generateInvoicePdf = (inv: Invoice, items: LineItem[], settings: CompanySettings, customer?: Customer, project?: Project) =>
  renderDocumentPdf(invoicePdfInput(inv, items, settings, customer, project));

export const generateQuotationPdf = (q: Quotation, items: LineItem[], settings: CompanySettings, customer?: Customer, project?: Project) =>
  renderDocumentPdf(quotationPdfInput(q, items, settings, customer, project));
