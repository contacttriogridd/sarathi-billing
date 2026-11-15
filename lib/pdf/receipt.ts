import { rgb } from 'pdf-lib';
import { A4, Canvas, INK, LINE, MUTED, WHITE, hex, luminance, tint } from '@/lib/pdf/engine';
import { amountInWords, fmtDate, inr } from '@/lib/format';
import type { CompanySettings, Customer, Invoice, Payment } from '@/lib/types';
import { optionsFor } from '@/lib/pdf/options';

/** A4 payment receipt with company letterhead, amount, words and running balance. */
export async function generateReceiptPdf(payment: Payment, invoice: Invoice, settings: CompanySettings, customer: Customer | undefined, paidToDate: number) {
  const o = optionsFor(settings, invoice.pdf_options);
  const mono = o.template === 'mono';
  const accent = mono ? rgb(0.07, 0.07, 0.07) : hex(o.accentColor);
  const onAccent = luminance(accent) > 0.6 ? INK : WHITE;
  const c = await Canvas.create(o.font, { title: `Receipt ${payment.receipt_number}`, author: settings.company_name });
  c.addPage();
  const top = A4.height;
  const co = settings;

  // letterhead band
  const bandH = 96;
  c.rect(0, top, A4.width, bandH, { fill: accent });
  const logo = o.showLogo ? await c.image(co.logo_url) : null;
  let textX = c.left;
  if (logo) {
    c.rect(c.left, top - 20, 56, 56, { fill: WHITE, radius: 8 });
    c.drawImageFit(logo, c.left + 5, top - 25, 46, 46);
    textX += 70;
  }
  c.text(co.company_name, textX, top - 22, { size: 17, bold: true, color: onAccent });
  c.text(co.business_type, textX, top - 42, { size: 8.2, color: tint(accent, 0.72) });
  c.wrap(co.address, 7.8, 300).forEach((l, i) => c.text(l, textX, top - 55 - i * 10, { size: 7.8, color: tint(accent, 0.72) }));
  const contact = [co.phone && `Ph: ${co.phone}`, co.email].filter(Boolean).join('  ·  ');
  if (contact) c.text(contact, textX, top - 76, { size: 7.8, color: tint(accent, 0.72) });
  c.text('PAYMENT RECEIPT', c.right, top - 24, { size: 15, bold: true, color: onAccent, align: 'right', spacing: 0.8 });
  c.text(`No. ${payment.receipt_number}`, c.right, top - 46, { size: 9.4, bold: true, color: onAccent, align: 'right' });
  c.text(`Date: ${fmtDate(payment.payment_date)}`, c.right, top - 60, { size: 8.2, color: tint(accent, 0.72), align: 'right' });
  if (co.gstin) c.text(`GSTIN: ${co.gstin}`, c.right, top - 74, { size: 7.8, bold: true, color: onAccent, align: 'right' });

  let y = top - bandH - 34;
  c.text('Received with thanks from', c.left, y, { size: 8.6, color: MUTED });
  c.text(customer?.name || invoice.snapshot?.customer?.name || 'Customer', c.left, y - 14, { size: 15, bold: true });
  const addr = customer?.address || invoice.snapshot?.customer?.address;
  if (addr) c.wrap(addr, 8.2, 300).forEach((l, i) => c.text(l, c.left, y - 34 - i * 11, { size: 8.2, color: MUTED }));

  // amount card
  const cardW = 200;
  c.rect(c.right - cardW, y + 4, cardW, 70, { fill: tint(accent, 0.93), radius: 8 });
  c.text('AMOUNT RECEIVED', c.right - cardW + 14, y - 6, { size: 7, bold: true, color: mono ? INK : accent, spacing: 0.8 });
  c.text(inr(payment.amount), c.right - cardW + 14, y - 22, { size: 22, bold: true, color: mono ? INK : accent });
  c.text(`via ${payment.method}`, c.right - cardW + 14, y - 50, { size: 8.2, color: MUTED });
  y -= 96;

  c.text('Amount in words', c.left, y, { size: 7.4, bold: true, color: MUTED });
  c.paragraph(amountInWords(payment.amount), c.left, y - 12, c.width, { size: 9.4, bold: true });
  y -= 44;

  const rows: [string, string][] = [
    ['Against invoice', `${invoice.invoice_number}  ·  ${fmtDate(invoice.invoice_date)}`],
    ['Payment method', payment.method],
    ['Transaction reference', payment.reference || '—'],
    ['Invoice value (net payable)', inr(invoice.net_payable)],
    ['Advance & previous payments', inr(Number(invoice.advance_paid) + Number(invoice.previous_payments))],
    ['Total received to date', inr(paidToDate)],
    ['Balance outstanding', inr(Math.max(0, Number(invoice.net_payable) - Number(invoice.advance_paid) - Number(invoice.previous_payments) - paidToDate))],
  ];
  rows.forEach(([k, v], i) => {
    if (i % 2 === 0) c.rect(c.left, y + 5, c.width, 20, { fill: tint(accent, 0.965) });
    c.text(k, c.left + 10, y, { size: 8.6, color: MUTED });
    c.text(v, c.right - 10, y, { size: 8.8, bold: true, align: 'right', color: i === rows.length - 1 ? (mono ? INK : accent) : INK });
    y -= 20;
  });
  if (payment.notes) {
    y -= 8;
    c.text('Notes', c.left, y, { size: 7.4, bold: true, color: MUTED });
    y -= 12 + c.paragraph(payment.notes, c.left, y - 12, c.width, { size: 8.2 });
  }

  y -= 26;
  if (co.receipt_note) c.paragraph(co.receipt_note, c.left, y, 300, { size: 8.6, color: MUTED });
  c.text(`For ${co.company_name}`, c.right, y, { size: 8.4, bold: true, align: 'right', color: mono ? INK : accent });
  const signature = await c.image(co.signature_url);
  if (signature) c.drawImageFit(signature, c.right - 130, y - 12, 130, 40, 'right');
  c.line(c.right - 150, y - 60, c.right, y - 60, MUTED, 0.6);
  c.text('Authorised Signatory', c.right, y - 66, { size: 7.8, color: MUTED, align: 'right' });
  const stamp = await c.image(co.stamp_url);
  if (stamp && o.showStamp) c.drawImageFit(stamp, A4.width / 2 - 36, y - 2, 72, 62);

  c.line(c.left, 40, c.right, 40, LINE, 0.6);
  c.text('This is a computer generated receipt.', c.left, 33, { size: 7.2, color: MUTED });
  c.text(o.footerText || co.company_name, c.right, 33, { size: 7.2, color: MUTED, align: 'right' });
  return c.save();
}
