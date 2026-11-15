/**
 * Lazy entry points for PDF generation. pdf-lib, fontkit and the QR encoder are only
 * downloaded the first time a PDF is generated, keeping page loads fast on mobile.
 */
import type { CompanySettings, Customer, Invoice, LineItem, Payment, Project, Quotation } from '@/lib/types';
import type { ReportSpec } from '@/lib/pdf/report';

export const generateInvoicePdf = async (inv: Invoice, items: LineItem[], settings: CompanySettings, customer?: Customer, project?: Project) =>
  (await import('@/lib/pdf/build')).generateInvoicePdf(inv, items, settings, customer, project);

export const generateQuotationPdf = async (q: Quotation, items: LineItem[], settings: CompanySettings, customer?: Customer, project?: Project) =>
  (await import('@/lib/pdf/build')).generateQuotationPdf(q, items, settings, customer, project);

export const generateReceiptPdf = async (payment: Payment, invoice: Invoice, settings: CompanySettings, customer: Customer | undefined, paidToDate: number) =>
  (await import('@/lib/pdf/receipt')).generateReceiptPdf(payment, invoice, settings, customer, paidToDate);

export const generateReportPdf = async (spec: ReportSpec, settings: CompanySettings) =>
  (await import('@/lib/pdf/report')).generateReportPdf(spec, settings);
