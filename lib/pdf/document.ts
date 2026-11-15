/**
 * Renders invoices, quotations and estimates as professional A4 PDFs.
 * Five templates share one layout pipeline; template + options decide styling.
 */
import type { PDFImage, RGB } from 'pdf-lib';
import { rgb } from 'pdf-lib';
import { A4, Canvas, INK, LINE, MUTED, WHITE, hex, luminance, shade, tint } from '@/lib/pdf/engine';
import type { CalcResult } from '@/lib/calc';
import type { BillingMode, CompanySnapshot, DiscountType, LineItem, PdfOptions, TaxMode, TaxType } from '@/lib/types';
import { amount as money, amountInWords, inr, qty as fmtQty } from '@/lib/format';

export type PdfCompany = Partial<CompanySnapshot> & { company_name: string; logo_url?: string; signature_url?: string; stamp_url?: string };
export type PdfParty = { name?: string; address?: string; phone?: string; email?: string; gstin?: string; state?: string };
export type PdfProject = { name?: string; code?: string; location?: string; type?: string };

export type PdfDocInput = {
  kind: 'invoice' | 'quotation' | 'estimate';
  title: string;
  number: string;
  date: string;
  headerDates: { label: string; value: string }[];
  details: [string, string][];
  company: PdfCompany;
  customer: PdfParty;
  project?: PdfProject | null;
  subject?: string;
  billingMode: BillingMode;
  items: LineItem[];
  calc: CalcResult;
  taxMode: TaxMode;
  taxType: TaxType;
  lineDiscountType: DiscountType;
  discountPercent?: number;
  stageContract?: number;
  ra?: { enabled: boolean; number?: string; showQuantities: boolean };
  paymentTerms?: string;
  notes?: string;
  terms?: string;
  options: PdfOptions;
  watermark?: { text: string; tone: 'neutral' | 'danger' };
  paid?: boolean;
  showPayments: boolean;
  upiAmount?: number;
};

type Theme = {
  accent: RGB;
  second: RGB;
  soft: RGB;
  softer: RGB;
  label: RGB;
  onAccent: RGB;
  onAccentMuted: RGB;
  party: 'box' | 'tint' | 'plain';
  totals: 'box' | 'band' | 'lines';
  mono: boolean;
};

const resolveTheme = (o: PdfOptions): Theme => {
  const mono = o.template === 'mono';
  const accent = mono ? rgb(0.07, 0.07, 0.07) : hex(o.accentColor, '#10294a');
  const second = mono ? rgb(0.07, 0.07, 0.07) : hex(o.secondaryColor, '#ee8a2f');
  const light = luminance(accent) > 0.6;
  return {
    accent,
    second,
    soft: mono ? rgb(0.94, 0.94, 0.94) : tint(accent, 0.91),
    softer: mono ? rgb(0.97, 0.97, 0.97) : tint(accent, 0.955),
    label: mono ? INK : o.template === 'modern' ? MUTED : accent,
    onAccent: light ? INK : WHITE,
    onAccentMuted: light ? shade(accent, 0.6) : tint(accent, 0.72),
    party: o.template === 'modern' ? 'plain' : o.template === 'classic' || mono ? 'box' : 'tint',
    totals: o.template === 'modern' ? 'lines' : o.template === 'classic' || mono ? 'box' : 'band',
    mono,
  };
};

const initialsOf = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || 'SA';

export async function renderDocumentPdf(d: PdfDocInput): Promise<Uint8Array> {
  const o = d.options;
  const t = resolveTheme(o);
  const c = await Canvas.create(o.font, { title: `${d.title} ${d.number}`, author: d.company.company_name, subject: d.customer.name });
  const [logo, signature, stamp] = await Promise.all([
    o.showLogo ? c.image(d.company.logo_url) : Promise.resolve(null),
    o.showAuthorizedSignature ? c.image(d.company.signature_url) : Promise.resolve(null),
    o.showStamp ? c.image(d.company.stamp_url) : Promise.resolve(null),
  ]);

  c.addPage();
  if (o.headerLayout === 'banner') headerBanner(c, d, t, logo);
  else if (o.headerLayout === 'centered') headerCentered(c, d, t, logo);
  else headerStandard(c, d, t, logo);

  // continuation pages get a compact header
  c.onPageAdded = (cv) => {
    cv.rect(0, A4.height, A4.width, 4, { fill: t.accent });
    cv.text(d.company.company_name, cv.left, A4.height - 20, { size: 10, bold: true, color: t.mono ? INK : t.accent });
    cv.text(`${d.title}  ·  ${d.number}  ·  continued`, cv.right, A4.height - 21, { size: 7.8, color: MUTED, align: 'right' });
    cv.line(cv.left, A4.height - 38, cv.right, A4.height - 38, LINE, 0.6);
    cv.y = A4.height - 50;
  };

  partyBlock(c, d, t);
  if (d.subject) {
    c.ensure(22);
    c.text('Subject:', c.left, c.y, { size: 8.6, bold: true });
    const used = c.paragraph(d.subject, c.left + 46, c.y, c.width - 46, { size: 8.6 });
    c.y -= used + 8;
  }
  if (d.billingMode === 'stage' && d.stageContract) {
    c.ensure(20);
    c.text(`Total contract value: ${inr(d.stageContract)}  ·  Billing for completed stages`, c.left, c.y, { size: 8.2, color: MUTED });
    c.y -= 16;
  }

  itemsTable(c, d, t);
  summary(c, d, t);
  termsBlock(c, d, t);
  signatureBlock(c, d, t, signature, stamp);

  // footer & page numbers
  const total = c.pages.length;
  c.pages.forEach((page, i) => {
    c.page = page;
    c.line(c.left, 40, c.right, 40, LINE, 0.6);
    const footer = o.footerText || `${d.company.company_name}`;
    c.text(footer, c.left, 33, { size: 7.2, color: MUTED });
    if (o.showPageNumbers) c.text(`Page ${i + 1} of ${total}`, c.right, 33, { size: 7.2, color: MUTED, align: 'right' });
    c.text('This is a computer generated document.', A4.width / 2, 22, { size: 6.4, color: tint(MUTED, 0.3), align: 'center' });
  });

  if (d.watermark) c.watermark(d.watermark.text, d.watermark.tone === 'danger' ? rgb(0.8, 0.15, 0.15) : rgb(0.45, 0.5, 0.56), d.watermark.tone === 'danger' ? 0.11 : 0.075);
  return c.save();
}

// ---------------------------------------------------------------------------
// Headers
// ---------------------------------------------------------------------------

const companyLines = (c: Canvas, d: PdfDocInput, width: number) => {
  const co = d.company;
  const o = d.options;
  const contact = [co.phone && `Ph: ${co.phone}`, co.email, co.website].filter(Boolean).join('   ·   ');
  const tax = [o.showGstin && co.gstin && `GSTIN: ${co.gstin}`, o.showPan && co.pan && `PAN: ${co.pan}`].filter(Boolean).join('     ');
  return {
    address: co.address ? c.wrap(co.address, 7.8, width) : [],
    contact: contact ? c.wrap(contact, 7.8, width) : [],
    tax,
  };
};

function headerBanner(c: Canvas, d: PdfDocInput, t: Theme, logo: PDFImage | null) {
  const o = d.options;
  const top = A4.height;
  const logoSize = 60;
  const showLogoBox = o.showLogo;
  const textX = c.left + (showLogoBox ? logoSize + 14 : 0);
  const rightW = 178;
  const textW = c.right - rightW - 14 - textX;
  const nameLines = c.wrap(d.company.company_name, 18, textW, true);
  const info = companyLines(c, d, textW);
  const blockH = nameLines.length * 21 + (d.company.business_type ? 13 : 0) + info.address.length * 10.4 + info.contact.length * 10.4 + (info.tax ? 12 : 0);
  const rightH = 26 + 16 + d.headerDates.length * 11.5 + 12 + (o.copyLabel ? 12 : 0);
  const bandH = Math.max(112, blockH + 46, rightH + 34, showLogoBox ? logoSize + 50 : 0);

  c.rect(0, top, A4.width, bandH, { fill: t.accent });
  let stripe = 0;
  if (o.template === 'corporate' || o.template === 'premium') {
    stripe = o.template === 'corporate' ? 5 : 2.4;
    c.rect(0, top - bandH, A4.width, stripe, { fill: t.second });
  }

  const y0 = top - 26;
  if (showLogoBox) {
    c.rect(c.left, y0, logoSize, logoSize, { fill: WHITE, radius: 9 });
    if (logo) c.drawImageFit(logo, c.left + 5, y0 - 5, logoSize - 10, logoSize - 10);
    else c.text(initialsOf(d.company.company_name), c.left + logoSize / 2, y0 - 19, { size: 19, bold: true, color: t.accent, align: 'center' });
  }

  let y = y0;
  nameLines.forEach((line) => { c.text(line, textX, y, { size: 18, bold: true, color: t.onAccent, spacing: 0.3 }); y -= 21; });
  if (d.company.business_type) { c.text(d.company.business_type, textX, y, { size: 8.4, color: t.onAccentMuted }); y -= 13; }
  info.address.forEach((line) => { c.text(line, textX, y, { size: 7.8, color: t.onAccentMuted }); y -= 10.4; });
  info.contact.forEach((line) => { c.text(line, textX, y, { size: 7.8, color: t.onAccentMuted }); y -= 10.4; });
  if (info.tax) c.text(info.tax, textX, y - 1, { size: 7.8, bold: true, color: t.onAccent });

  // right block
  let ry = y0 - 1;
  const titleSize = c.textWidth(d.title, 17, true, 0.8) > rightW ? 13 : 17;
  c.text(d.title, c.right, ry, { size: titleSize, bold: true, color: t.onAccent, align: 'right', spacing: 0.8 });
  ry -= titleSize + 10;
  c.text(`No. ${d.number}`, c.right, ry, { size: 9.4, bold: true, color: t.onAccent, align: 'right' });
  ry -= 15;
  [{ label: 'Date', value: d.date }, ...d.headerDates].forEach((row) => {
    c.text(`${row.label}: ${row.value}`, c.right, ry, { size: 8.2, color: t.onAccentMuted, align: 'right' });
    ry -= 11.5;
  });
  if (o.copyLabel) c.text(o.copyLabel.toUpperCase(), c.right, top - bandH + 16, { size: 6.8, bold: true, color: t.onAccentMuted, align: 'right', spacing: 0.8 });

  c.y = top - bandH - stripe - 20;
}

function headerStandard(c: Canvas, d: PdfDocInput, t: Theme, logo: PDFImage | null) {
  const o = d.options;
  const top = A4.height - 34;
  const hasLogo = Boolean(o.showLogo && logo);
  const logoW = 78;
  const textX = c.left + (hasLogo ? logoW + 12 : 0);
  const rightW = 190;
  const textW = c.right - rightW - 12 - textX;
  const nameSize = o.template === 'modern' ? 17 : 18;
  const nameLines = c.wrap(d.company.company_name, nameSize, textW, true);
  const info = companyLines(c, d, textW);

  if (hasLogo && logo) c.drawImageFit(logo, c.left, top, logoW, 60, 'left');

  let y = top;
  nameLines.forEach((line) => { c.text(line, textX, y, { size: nameSize, bold: true, color: t.mono ? INK : t.accent, spacing: 0.2 }); y -= nameSize + 3; });
  if (d.company.business_type) { c.text(d.company.business_type, textX, y, { size: 8.4, color: MUTED }); y -= 13; }
  info.address.forEach((line) => { c.text(line, textX, y, { size: 7.8, color: MUTED }); y -= 10.4; });
  info.contact.forEach((line) => { c.text(line, textX, y, { size: 7.8, color: MUTED }); y -= 10.4; });
  if (info.tax) { c.text(info.tax, textX, y - 1, { size: 7.8, bold: true }); y -= 12; }
  const leftBottom = Math.min(y, hasLogo ? top - 62 : y);

  let ry = top;
  const modern = o.template === 'modern';
  const titleSize = modern ? 21 : 17;
  const fitTitle = c.textWidth(d.title, titleSize, !modern, modern ? 1.6 : 0.6) > rightW ? titleSize - 5 : titleSize;
  c.text(modern ? titleCase(d.title) : d.title, c.right, ry, { size: fitTitle, bold: !modern, color: t.mono ? INK : t.accent, align: 'right', spacing: modern ? 0.4 : 0.6 });
  ry -= fitTitle + 9;
  c.text(`No. ${d.number}`, c.right, ry, { size: 9.4, bold: true, align: 'right' });
  ry -= 14;
  [{ label: 'Date', value: d.date }, ...d.headerDates].forEach((row) => {
    c.text(`${row.label}: ${row.value}`, c.right, ry, { size: 8.2, color: MUTED, align: 'right' });
    ry -= 11.5;
  });
  if (o.copyLabel) { c.text(o.copyLabel.toUpperCase(), c.right, ry - 2, { size: 6.8, bold: true, color: MUTED, align: 'right', spacing: 0.8 }); ry -= 12; }

  let lineY = Math.min(leftBottom, ry) - 8;
  if (o.template === 'classic') {
    c.line(c.left, lineY, c.right, lineY, t.accent, 1.6);
    c.line(c.left, lineY - 3, c.right, lineY - 3, t.accent, 0.5);
    lineY -= 3;
  } else if (modern) {
    c.line(c.left, lineY, c.right, lineY, LINE, 0.7);
  } else {
    c.line(c.left, lineY, c.right, lineY, t.accent, 1.1);
  }
  c.y = lineY - 16;
}

const titleCase = (s: string) => s.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase()).replace(/\bRa\b/, 'RA');

function headerCentered(c: Canvas, d: PdfDocInput, t: Theme, logo: PDFImage | null) {
  const o = d.options;
  const mid = A4.width / 2;
  let y = A4.height - 32;
  if (o.showLogo && logo) {
    c.drawImageFit(logo, mid - 70, y, 140, 50, 'center');
    y -= 56;
  }
  c.wrap(d.company.company_name, 19, c.width, true).forEach((line) => {
    c.text(line, mid, y, { size: 19, bold: true, color: t.mono ? INK : t.accent, align: 'center', spacing: 0.6 });
    y -= 22;
  });
  if (d.company.business_type) { c.text(d.company.business_type, mid, y, { size: 8.4, color: MUTED, align: 'center' }); y -= 13; }
  const info = companyLines(c, d, 420);
  [...info.address, ...info.contact].forEach((line) => { c.text(line, mid, y, { size: 7.8, color: MUTED, align: 'center' }); y -= 10.4; });
  if (info.tax) { c.text(info.tax, mid, y - 1, { size: 7.8, bold: true, align: 'center' }); y -= 12; }
  y -= 6;
  const ruleColor = t.mono ? INK : t.accent;
  c.line(c.left, y, c.right, y, ruleColor, 1.2);
  y -= 8;
  c.text(d.title, mid, y, { size: 12.5, bold: true, color: ruleColor, align: 'center', spacing: 2 });
  if (o.copyLabel) c.text(o.copyLabel.toUpperCase(), c.right, y + 1, { size: 6.6, bold: true, color: MUTED, align: 'right', spacing: 0.6 });
  y -= 19;
  c.line(c.left, y, c.right, y, ruleColor, 0.5);
  c.y = y - 14;
}

// ---------------------------------------------------------------------------
// Parties & details
// ---------------------------------------------------------------------------

type Line = { text: string; size: number; bold?: boolean; color?: RGB; gap?: number; right?: string };

function partyBlock(c: Canvas, d: PdfDocInput, t: Theme) {
  const o = d.options;
  const gap = 10;
  const pad = t.party === 'plain' ? 0 : 9;
  const showProject = Boolean(o.showProjectDetails && d.project && (d.project.name || d.project.location));
  const detailRows: [string, string][] = [
    ...(o.headerLayout === 'centered' ? [['Number', d.number] as [string, string], ['Date', d.date] as [string, string], ...d.headerDates.map((h) => [h.label, h.value] as [string, string])] : []),
    ...d.details,
  ].filter(([, v]) => v && v !== '—');

  const fractions = showProject ? [0.36, 0.3, 0.34] : [0.56, 0.44];
  const usable = c.width - gap * (fractions.length - 1);
  const widths = fractions.map((f) => usable * f);

  const label = (text: string): Line => ({ text, size: 6.9, bold: true, color: t.label, gap: 4 });
  const columns: Line[][] = [];

  const cw0 = widths[0] - pad * 2;
  const cust = d.customer;
  const billTo: Line[] = [label(d.kind === 'invoice' ? 'BILL TO' : 'PREPARED FOR')];
  c.wrap(cust.name || 'Customer', 10.5, cw0, true).forEach((l) => billTo.push({ text: l, size: 10.5, bold: true, gap: 1 }));
  if (cust.address) c.wrap(cust.address, 8, cw0).forEach((l) => billTo.push({ text: l, size: 8, color: MUTED }));
  if (cust.phone) billTo.push({ text: `Ph: ${cust.phone}`, size: 8, color: MUTED });
  if (cust.email) c.wrap(cust.email, 8, cw0).forEach((l) => billTo.push({ text: l, size: 8, color: MUTED }));
  if (cust.gstin) billTo.push({ text: `GSTIN: ${cust.gstin}`, size: 8, bold: true });
  if (cust.state) billTo.push({ text: `State: ${cust.state}`, size: 8, color: MUTED });
  columns.push(billTo);

  if (showProject && d.project) {
    const cw = widths[1] - pad * 2;
    const p = d.project;
    const proj: Line[] = [label('PROJECT / SITE')];
    if (p.name) c.wrap(p.name, 9.4, cw, true).forEach((l) => proj.push({ text: l, size: 9.4, bold: true, gap: 1 }));
    if (p.code) proj.push({ text: `Project ID: ${p.code}`, size: 8, color: MUTED });
    if (p.type) c.wrap(p.type, 8, cw).forEach((l) => proj.push({ text: l, size: 8, color: MUTED }));
    if (p.location) c.wrap(`Site: ${p.location}`, 8, cw).forEach((l) => proj.push({ text: l, size: 8, color: MUTED }));
    columns.push(proj);
  }

  const cwd = widths[widths.length - 1] - pad * 2;
  const det: Line[] = [label(d.kind === 'invoice' ? 'BILL DETAILS' : d.kind === 'estimate' ? 'ESTIMATE DETAILS' : 'QUOTATION DETAILS')];
  detailRows.forEach(([k, v]) => {
    const labelW = c.textWidth(k, 7.8) + 8;
    if (c.textWidth(v, 8, true) <= cwd - labelW) det.push({ text: k, size: 7.8, color: MUTED, right: v });
    else {
      det.push({ text: k, size: 7.8, color: MUTED });
      c.wrap(v, 8, cwd, true).forEach((l) => det.push({ text: l, size: 8, bold: true }));
    }
  });
  columns.push(det);

  const lineH = (l: Line) => l.size * 1.32 + (l.gap ?? 0);
  const heights = columns.map((col) => col.reduce((h, l) => h + lineH(l), 0));
  const blockH = Math.max(...heights) + pad * 2 - 2;
  c.ensure(blockH + 8);
  const top = c.y;

  let x = c.left;
  columns.forEach((col, i) => {
    const w = widths[i];
    if (t.party === 'box') c.rect(x, top, w, blockH, { stroke: t.mono ? INK : tint(t.accent, 0.6), strokeWidth: t.mono ? 0.6 : 0.7, radius: t.mono ? 0 : 4 });
    if (t.party === 'tint') {
      c.rect(x, top, w, blockH, { fill: t.softer, radius: 5 });
      c.rect(x, top, 2.6, blockH, { fill: d.options.template === 'corporate' ? t.second : t.accent });
    }
    let y = top - pad;
    col.forEach((l) => {
      c.text(l.text, x + pad + (t.party === 'tint' ? 3 : 0), y, { size: l.size, bold: l.bold, color: l.color ?? INK, spacing: l.size < 7.2 ? 0.7 : 0 });
      if (l.right) c.text(l.right, x + w - pad, y, { size: 8, bold: true, align: 'right' });
      y -= lineH(l);
    });
    x += w + gap;
  });
  c.y = top - blockH - 14;
}

// ---------------------------------------------------------------------------
// Line items table
// ---------------------------------------------------------------------------

type Col = { key: string; label: string; width: number; align: 'left' | 'right' | 'center'; value: (item: LineItem, i: number) => string };

function buildColumns(c: Canvas, d: PdfDocInput): { cols: Col[]; descIndex: number } {
  const o = d.options;
  const lines = d.calc.lines;
  const lineByKey = new Map(lines.map((l) => [l.key, l]));
  const L = (item: LineItem) => lineByKey.get(item.key)!;
  const anyDiscount = lines.some((l) => l.discount > 0);
  const taxCol = o.showTaxColumn && d.taxMode !== 'none';
  const discCol = o.showDiscountColumn && anyDiscount;
  const dim = (v: number | null) => (v === null || v === undefined ? '—' : fmtQty(v));
  const cols: Col[] = [];
  if (o.showSerial) cols.push({ key: 'sno', label: '#', width: 22, align: 'center', value: (_, i) => String(i + 1) });
  cols.push({ key: 'desc', label: d.billingMode === 'stage' ? 'Stage / Description of work' : 'Description of work', width: 0, align: 'left', value: (it) => it.description });

  if (d.billingMode === 'measurement') {
    cols.push({ key: 'nos', label: 'Nos', width: 28, align: 'right', value: (it) => dim(it.nos) });
    cols.push({ key: 'l', label: 'L', width: 34, align: 'right', value: (it) => dim(it.length) });
    cols.push({ key: 'b', label: 'B', width: 34, align: 'right', value: (it) => dim(it.breadth) });
    cols.push({ key: 'h', label: 'H/D', width: 34, align: 'right', value: (it) => dim(it.height) });
    cols.push({ key: 'qty', label: 'Qty', width: 44, align: 'right', value: (it) => fmtQty(L(it).quantity) });
    if (o.showUnit) cols.push({ key: 'unit', label: 'Unit', width: 34, align: 'center', value: (it) => it.unit || '—' });
    cols.push({ key: 'rate', label: 'Rate', width: 58, align: 'right', value: (it) => money(L(it).rate) });
  } else if (d.billingMode === 'stage') {
    cols.push({ key: 'pct', label: 'Stage %', width: 52, align: 'right', value: (it) => `${fmtQty(L(it).quantity)}%` });
    if (anyDiscount) cols.push({ key: 'value', label: 'Stage value', width: 78, align: 'right', value: (it) => money(L(it).gross) });
  } else if (d.ra?.enabled && d.ra.showQuantities) {
    if (o.showUnit) cols.push({ key: 'unit', label: 'Unit', width: 34, align: 'center', value: (it) => it.unit || '—' });
    cols.push({ key: 'rate', label: 'Rate', width: 56, align: 'right', value: (it) => money(L(it).rate) });
    cols.push({ key: 'prev', label: 'Prev. Qty', width: 46, align: 'right', value: (it) => fmtQty(it.prev_quantity) });
    cols.push({ key: 'qty', label: 'This Bill', width: 46, align: 'right', value: (it) => fmtQty(L(it).quantity) });
    cols.push({ key: 'cum', label: 'Cum. Qty', width: 46, align: 'right', value: (it) => fmtQty(Number(it.prev_quantity || 0) + L(it).quantity) });
  } else {
    cols.push({ key: 'qty', label: 'Qty', width: 46, align: 'right', value: (it) => fmtQty(L(it).quantity) });
    if (o.showUnit) cols.push({ key: 'unit', label: 'Unit', width: 38, align: 'center', value: (it) => it.unit || '—' });
    cols.push({ key: 'rate', label: 'Rate', width: 64, align: 'right', value: (it) => money(L(it).rate) });
  }
  if (discCol) cols.push({ key: 'disc', label: d.lineDiscountType === 'percent' ? 'Disc %' : 'Disc', width: 44, align: 'right', value: (it) => (L(it).discount ? (d.lineDiscountType === 'percent' ? `${fmtQty(it.discount)}%` : money(L(it).discount)) : '—') });
  if (taxCol) cols.push({ key: 'tax', label: 'GST', width: 34, align: 'right', value: (it) => (it.exempt ? 'Exempt' : `${fmtQty(L(it).taxRate)}%`) });
  cols.push({ key: 'amount', label: 'Amount (₹)', width: 74, align: 'right', value: (it) => money(L(it).net) });

  const fixed = cols.reduce((s, col) => s + col.width, 0);
  const descIndex = cols.findIndex((col) => col.key === 'desc');
  cols[descIndex].width = Math.max(90, c.width - fixed);
  return { cols, descIndex };
}

function itemsTable(c: Canvas, d: PdfDocInput, t: Theme) {
  const o = d.options;
  const style = o.tableStyle;
  const { cols, descIndex } = buildColumns(c, d);
  const headerH = 22;
  const pad = 4.5;
  const size = d.billingMode === 'measurement' ? 8 : 8.4;
  const lh = size * 1.3;
  const subSize = 7.1;
  const subLh = subSize * 1.3;
  const headerFill = style === 'striped' ? t.accent : style === 'bordered' ? t.soft : style === 'grid' ? (t.mono ? rgb(0.9, 0.9, 0.9) : t.soft) : undefined;
  const headerText = style === 'striped' ? t.onAccent : t.mono ? INK : style === 'minimal' ? MUTED : t.accent;
  const gridColor = t.mono ? rgb(0.35, 0.35, 0.35) : tint(t.accent, 0.72);

  const drawVerticals = (top: number, h: number) => {
    let x = c.left;
    c.line(x, top, x, top - h, gridColor, 0.5);
    cols.forEach((col) => { x += col.width; c.line(x, top, x, top - h, gridColor, 0.5); });
  };

  const drawHeader = () => {
    c.ensure(headerH + 30);
    const top = c.y;
    if (headerFill) c.rect(c.left, top, c.width, headerH, { fill: headerFill });
    if (style === 'minimal') c.line(c.left, top - headerH, c.right, top - headerH, t.mono ? INK : t.accent, 1);
    if (style === 'grid') { drawVerticals(top, headerH); c.line(c.left, top, c.right, top, gridColor, 0.5); c.line(c.left, top - headerH, c.right, top - headerH, gridColor, 0.5); }
    if (style === 'bordered') c.line(c.left, top - headerH, c.right, top - headerH, tint(t.accent, 0.5), 0.8);
    let x = c.left;
    cols.forEach((col) => {
      const label = style === 'minimal' ? col.label.toUpperCase() : col.label;
      const anchor = col.align === 'right' ? x + col.width - pad : col.align === 'center' ? x + col.width / 2 : x + pad;
      c.text(label, anchor, top - 7.4, { size: style === 'minimal' ? 6.8 : 7.6, bold: true, color: headerText, align: col.align, spacing: style === 'minimal' ? 0.5 : 0 });
      x += col.width;
    });
    c.y = top - headerH;
  };

  const capacity = A4.height - 50 - c.bottomLimit - headerH - 10;
  drawHeader();
  let segmentTop = c.y;

  const closeSegment = () => {
    if (style === 'bordered') {
      c.line(c.left, segmentTop + headerH, c.left, c.y, tint(t.accent, 0.6), 0.6);
      c.line(c.right, segmentTop + headerH, c.right, c.y, tint(t.accent, 0.6), 0.6);
      c.line(c.left, c.y, c.right, c.y, tint(t.accent, 0.6), 0.6);
    }
  };

  const newPage = () => {
    closeSegment();
    c.addPage();
    drawHeader();
    segmentTop = c.y;
  };

  d.items.forEach((item, index) => {
    const descW = cols[descIndex].width - pad * 2;
    const descLines = c.wrap(item.description || '—', size, descW);
    const subs: string[] = [];
    if (o.showHsn && item.hsn_sac) subs.push(`HSN/SAC: ${item.hsn_sac}`);
    if (item.exempt && !(o.showTaxColumn && d.taxMode !== 'none')) subs.push('GST exempt');
    const subLines = subs.flatMap((s) => c.wrap(s, subSize, descW));
    type RowLine = { text: string; sub: boolean };
    let pending: RowLine[] = [...descLines.map((text) => ({ text, sub: false })), ...subLines.map((text) => ({ text, sub: true }))];
    const heightOf = (ls: RowLine[]) => ls.reduce((h, l) => h + (l.sub ? subLh : lh), 0) + pad * 2;
    let firstChunk = true;

    while (pending.length) {
      let chunk = pending;
      if (heightOf(pending) > c.remaining) {
        if (heightOf(pending) <= capacity && firstChunk) { newPage(); continue; }
        // split a very tall row across pages
        let h = pad * 2;
        let count = 0;
        for (const l of pending) {
          const next = h + (l.sub ? subLh : lh);
          if (next > c.remaining) break;
          h = next;
          count += 1;
        }
        if (count < 2) { newPage(); continue; }
        chunk = pending.slice(0, count);
      }
      const rowH = Math.max(heightOf(chunk), firstChunk ? 19 : 0);
      const top = c.y;
      if (style === 'striped' && index % 2 === 1) c.rect(c.left, top, c.width, rowH, { fill: t.softer });
      if (style === 'grid') { drawVerticals(top, rowH); }

      let x = c.left;
      cols.forEach((col, ci) => {
        if (ci === descIndex) {
          let ly = top - pad;
          chunk.forEach((l) => {
            c.text(l.text, x + pad, ly, { size: l.sub ? subSize : size, color: l.sub ? MUTED : INK });
            ly -= l.sub ? subLh : lh;
          });
        } else if (firstChunk) {
          const anchor = col.align === 'right' ? x + col.width - pad : col.align === 'center' ? x + col.width / 2 : x + pad;
          c.text(col.value(item, index), anchor, top - pad, { size, bold: col.key === 'amount', align: col.align, color: col.key === 'sno' ? MUTED : INK });
        }
        x += col.width;
      });
      c.y = top - rowH;
      if (style === 'grid') c.line(c.left, c.y, c.right, c.y, gridColor, 0.5);
      else if (style === 'bordered' || style === 'minimal') c.line(c.left, c.y, c.right, c.y, style === 'minimal' ? LINE : tint(t.accent, 0.82), 0.5);
      pending = pending.slice(chunk.length);
      firstChunk = false;
      if (pending.length) newPage();
    }
  });

  if (!d.items.length) {
    c.text('No line items', c.left + c.width / 2, c.y - 8, { size: 8, color: MUTED, align: 'center' });
    c.y -= 24;
  }
  closeSegment();
  if (style === 'striped') c.line(c.left, c.y, c.right, c.y, t.accent, 0.8);
  c.y -= 14;
}

// ---------------------------------------------------------------------------
// Totals, tax summary, bank details
// ---------------------------------------------------------------------------

type Block = { height: number; draw: (x: number, top: number, w: number) => void };

function summary(c: Canvas, d: PdfDocInput, t: Theme) {
  const o = d.options;
  const r = d.calc;
  const gap = 16;
  const rightW = 214;
  const leftW = c.width - rightW - gap;

  // ---- right column: totals ---------------------------------------------------
  type TRow = { label: string; value: string; strong?: 'grand' | 'net' | 'balance'; muted?: boolean };
  const rows: TRow[] = [];
  rows.push({ label: d.taxMode === 'inclusive' ? 'Subtotal (incl. GST)' : 'Subtotal', value: inr(r.subtotal) });
  r.charges.forEach((ch) => rows.push({ label: `Add: ${ch.label}`, value: inr(ch.amount) }));
  if (r.discount_total > 0) rows.push({ label: `Less: Discount${d.discountPercent ? ` (${fmtQty(d.discountPercent)}%)` : ''}`, value: `-${inr(r.discount_total)}` });
  if (d.taxMode !== 'none') {
    rows.push({ label: 'Taxable value', value: inr(r.taxable_amount), muted: d.taxMode === 'inclusive' });
    const single = r.tax_breakdown.filter((b) => b.tax > 0);
    const oneRate = single.length === 1 ? single[0].rate : null;
    if (d.taxType === 'IGST') rows.push({ label: oneRate !== null ? `IGST @ ${fmtQty(oneRate)}%` : 'IGST', value: inr(r.igst_total) });
    else {
      rows.push({ label: oneRate !== null ? `CGST @ ${fmtQty(oneRate / 2)}%` : 'CGST', value: inr(r.cgst_total) });
      rows.push({ label: oneRate !== null ? `SGST @ ${fmtQty(oneRate / 2)}%` : 'SGST', value: inr(r.sgst_total) });
    }
  }
  if (r.round_off !== 0) rows.push({ label: 'Round off', value: `${r.round_off > 0 ? '+' : ''}${money(r.round_off)}` });
  rows.push({ label: d.kind === 'invoice' ? 'Grand Total' : 'Total Amount', value: inr(r.grand_total), strong: 'grand' });
  if (d.kind === 'invoice') {
    r.deductions.forEach((ded) => rows.push({ label: `Less: ${ded.label}${ded.mode === 'percent' ? ` @ ${fmtQty(ded.value)}%` : ''}`, value: `-${inr(ded.amount)}` }));
    if (r.deductions.length) rows.push({ label: 'Net Payable', value: inr(r.net_payable), strong: 'net' });
    if (d.showPayments && o.showPaymentSummary) {
      const anyPaid = r.advance_paid > 0 || r.previous_payments > 0 || r.amount_paid > 0;
      if (r.advance_paid > 0) rows.push({ label: 'Less: Advance received', value: `-${inr(r.advance_paid)}` });
      if (r.previous_payments > 0) rows.push({ label: 'Less: Previous payments', value: `-${inr(r.previous_payments)}` });
      if (r.amount_paid > 0) rows.push({ label: 'Less: Amount received', value: `-${inr(r.amount_paid)}` });
      if (anyPaid) rows.push({ label: 'Balance Due', value: inr(r.balance_due), strong: 'balance' });
    }
  }
  const rowH = 15.5;
  const strongH = 24;
  const totalsH = rows.reduce((h, row) => h + (row.strong ? strongH + 3 : rowH), 0) + 12;

  const drawTotals = (x: number, top: number, w: number) => {
    if (t.totals === 'box') c.rect(x, top, w, totalsH, { stroke: t.mono ? INK : tint(t.accent, 0.55), strokeWidth: 0.7, radius: t.mono ? 0 : 4 });
    if (t.totals === 'band') c.rect(x, top, w, totalsH, { fill: t.softer, radius: 5 });
    let y = top - 7;
    rows.forEach((row) => {
      if (row.strong) {
        y -= 1.5;
        const fill = row.strong === 'balance' ? (t.mono ? INK : d.options.template === 'corporate' ? t.second : shade(t.accent, 0.12)) : t.accent;
        const onFill = luminance(fill) > 0.6 ? INK : WHITE;
        if (t.totals === 'lines') {
          c.line(x, y, x + w, y, t.mono ? INK : t.accent, 1.1);
          c.text(row.label, x + 2, y - 7, { size: 9.6, bold: true, color: t.mono ? INK : t.accent });
          c.text(row.value, x + w - 2, y - 6.5, { size: 11, bold: true, color: t.mono ? INK : t.accent, align: 'right' });
        } else {
          c.rect(x + 4, y, w - 8, strongH, { fill, radius: t.mono ? 0 : 3.5 });
          c.text(row.label, x + 12, y - 7.6, { size: 9.4, bold: true, color: onFill });
          c.text(row.value, x + w - 12, y - 7, { size: 10.8, bold: true, color: onFill, align: 'right' });
        }
        y -= strongH + 1.5;
      } else {
        c.text(row.label, x + 10, y - 3.5, { size: 8.2, color: row.muted ? MUTED : rgb(0.27, 0.31, 0.37) });
        c.text(row.value, x + w - 10, y - 3.5, { size: 8.4, bold: row.label === 'Subtotal' || row.label === 'Taxable value', align: 'right', color: row.muted ? MUTED : INK });
        y -= rowH;
      }
    });
  };

  // ---- left column blocks -----------------------------------------------------
  const blocks: Block[] = [];

  if (d.kind === 'invoice' && d.ra?.enabled) {
    const raRows: [string, string][] = [
      ['Value of work done up to previous bill', inr(r.ra.previous)],
      ['Value of work done in this bill', inr(r.ra.current)],
      ['Cumulative value of work done', inr(r.ra.cumulative)],
    ];
    const h = 18 + raRows.length * 13.5 + 8;
    blocks.push({
      height: h,
      draw: (x, top, w) => {
        c.rect(x, top, w, h, { fill: t.softer, radius: t.mono ? 0 : 4, stroke: t.mono ? INK : undefined, strokeWidth: 0.5 });
        c.text(`RUNNING ACCOUNT ABSTRACT${d.ra?.number ? `  ·  ${d.ra.number}` : ''}`, x + 9, top - 8, { size: 6.9, bold: true, color: t.label, spacing: 0.6 });
        raRows.forEach(([k, v], i) => {
          const y = top - 22 - i * 13.5;
          c.text(k, x + 9, y, { size: 8, color: i === 2 ? INK : MUTED, bold: i === 2 });
          c.text(v, x + w - 9, y, { size: 8.2, bold: true, align: 'right' });
        });
      },
    });
  }

  if (o.showAmountInWords) {
    const words = amountInWords(r.grand_total);
    const lines = c.wrap(words, 8.4, leftW - 18, true);
    const extra = d.kind === 'invoice' && r.deductions.length ? c.wrap(`Net payable: ${amountInWords(r.net_payable)}`, 7.6, leftW - 18) : [];
    const h = 18 + lines.length * 11.2 + extra.length * 10 + 8;
    blocks.push({
      height: h,
      draw: (x, top, w) => {
        c.rect(x, top, w, h, { stroke: t.mono ? INK : LINE, strokeWidth: 0.6, radius: t.mono ? 0 : 4 });
        c.text(d.kind === 'invoice' ? 'INVOICE TOTAL IN WORDS' : 'AMOUNT IN WORDS', x + 9, top - 8, { size: 6.9, bold: true, color: t.label, spacing: 0.6 });
        lines.forEach((line, i) => c.text(line, x + 9, top - 21 - i * 11.2, { size: 8.4, bold: true }));
        extra.forEach((line, i) => c.text(line, x + 9, top - 21 - lines.length * 11.2 - i * 10, { size: 7.6, color: MUTED }));
      },
    });
  }

  const tb = r.tax_breakdown.filter((b) => b.taxable !== 0);
  if (o.showTaxSummary && d.taxMode !== 'none' && tb.length) {
    const igst = d.taxType === 'IGST';
    const headers = igst ? ['GST Rate', 'Taxable', 'IGST', 'Total Tax'] : ['GST Rate', 'Taxable', 'CGST', 'SGST', 'Total Tax'];
    const data = tb.map((b) => (igst
      ? [b.exempt ? 'Exempt' : `${fmtQty(b.rate)}%`, money(b.taxable), money(b.igst), money(b.tax)]
      : [b.exempt ? 'Exempt' : `${fmtQty(b.rate)}%`, money(b.taxable), money(b.cgst), money(b.sgst), money(b.tax)]));
    data.push(igst
      ? ['Total', money(r.taxable_amount), money(r.igst_total), money(r.tax_total)]
      : ['Total', money(r.taxable_amount), money(r.cgst_total), money(r.sgst_total), money(r.tax_total)]);
    const rh = 13;
    const h = 16 + rh * (data.length + 1) + 4;
    blocks.push({
      height: h,
      draw: (x, top, w) => {
        c.text('GST SUMMARY', x, top - 2, { size: 6.9, bold: true, color: t.label, spacing: 0.6 });
        const colW = w / headers.length;
        let y = top - 15;
        c.rect(x, y, w, rh, { fill: t.soft });
        headers.forEach((hd, i) => c.text(hd, i === 0 ? x + 6 : x + colW * (i + 1) - 6, y - 3.4, { size: 7, bold: true, color: t.mono ? INK : t.accent, align: i === 0 ? 'left' : 'right' }));
        y -= rh;
        data.forEach((row, ri) => {
          const last = ri === data.length - 1;
          if (last) c.line(x, y, x + w, y, LINE, 0.6);
          row.forEach((cell, i) => c.text(cell, i === 0 ? x + 6 : x + colW * (i + 1) - 6, y - 3.4, { size: 7.4, bold: last, align: i === 0 ? 'left' : 'right' }));
          y -= rh;
        });
      },
    });
  }

  const co = d.company;
  const bankRows: [string, string][] = o.showBankDetails ? ([
    ['Bank', co.bank_name || ''], ['A/c name', co.bank_account_name || ''], ['A/c no.', co.bank_account_number || ''],
    ['IFSC', co.bank_ifsc || ''], ['Branch', co.bank_branch || ''],
  ] as [string, string][]).filter(([, v]) => v) : [];
  const upiText = o.showUpiQr && co.upi_id
    ? `upi://pay?pa=${encodeURIComponent(co.upi_id)}&pn=${encodeURIComponent(co.company_name)}${d.upiAmount && d.upiAmount > 0 ? `&am=${d.upiAmount.toFixed(2)}` : ''}&cu=INR&tn=${encodeURIComponent(d.number)}`
    : '';
  if (bankRows.length || upiText) {
    const qrSize = upiText ? 66 : 0;
    const h = Math.max(18 + bankRows.length * 11.5 + (co.upi_id ? 11.5 : 0) + 6, qrSize + 20);
    blocks.push({
      height: h,
      draw: (x, top, w) => {
        c.rect(x, top, w, h, { stroke: t.mono ? INK : LINE, strokeWidth: 0.6, radius: t.mono ? 0 : 4 });
        c.text('PAYMENT DETAILS', x + 9, top - 8, { size: 6.9, bold: true, color: t.label, spacing: 0.6 });
        let y = top - 21;
        bankRows.forEach(([k, v]) => {
          c.text(k, x + 9, y, { size: 7.8, color: MUTED });
          c.text(v, x + 62, y, { size: 7.9, bold: true });
          y -= 11.5;
        });
        if (co.upi_id) {
          c.text('UPI ID', x + 9, y, { size: 7.8, color: MUTED });
          c.text(co.upi_id, x + 62, y, { size: 7.9, bold: true });
        }
        if (upiText) {
          const qx = x + w - qrSize - 8;
          c.qr(upiText, qx, top - 8, qrSize, t.mono ? INK : shade(t.accent, 0.25));
          c.text('Scan to pay', qx + qrSize / 2, top - 8 - qrSize - 1, { size: 6.4, color: MUTED, align: 'center' });
        }
      },
    });
  }

  if (o.showNotes && d.notes?.trim()) {
    const lines = c.wrap(d.notes, 7.9, leftW);
    const h = 14 + lines.length * 10.4 + 2;
    blocks.push({
      height: h,
      draw: (x, top) => {
        c.text('NOTES', x, top - 2, { size: 6.9, bold: true, color: t.label, spacing: 0.6 });
        lines.forEach((l, i) => c.text(l, x, top - 14 - i * 10.4, { size: 7.9, color: rgb(0.27, 0.31, 0.37) }));
      },
    });
  }

  const blockGap = 9;
  const paidH = d.paid ? 34 : 0;
  const leftH = blocks.reduce((h, b) => h + b.height, 0) + Math.max(0, blocks.length - 1) * blockGap;
  // Keep totals together; let the left-hand blocks flow onto the next page when needed.
  if (totalsH + paidH > c.remaining || (blocks.length && Math.max(leftH, totalsH) > c.remaining && blocks[0].height > c.remaining)) c.addPage();

  const top = c.y;
  const totalsPage = c.page;
  drawTotals(c.left + leftW + gap, top, rightW);
  if (d.paid) {
    const sy = top - totalsH - 8;
    const sx = c.left + leftW + gap + rightW / 2;
    c.rect(sx - 38, sy, 76, 22, { stroke: rgb(0.1, 0.55, 0.3), strokeWidth: 1.6, radius: 4 });
    c.text('PAID', sx, sy - 5.5, { size: 12, bold: true, color: rgb(0.1, 0.55, 0.3), align: 'center', spacing: 3 });
  }
  const totalsBottom = top - totalsH - paidH;
  let y = top;
  blocks.forEach((b) => {
    if (y - b.height < c.bottomLimit) {
      c.addPage();
      y = c.y;
    }
    b.draw(c.left, y, leftW);
    y -= b.height + blockGap;
  });
  const endY = y + (blocks.length ? blockGap : 0);
  c.y = (c.page === totalsPage ? Math.min(endY, totalsBottom) : endY) - 16;
  if (d.taxMode === 'inclusive') {
    c.ensure(14);
    c.text('All rates are inclusive of GST; tax shown has been extracted from the rates.', c.left, c.y + 6, { size: 7, color: MUTED });
    c.y -= 6;
  }
}

// ---------------------------------------------------------------------------
// Terms & signatures
// ---------------------------------------------------------------------------

function termsBlock(c: Canvas, d: PdfDocInput, t: Theme) {
  const o = d.options;
  const sections: { title: string; text: string }[] = [];
  if (d.paymentTerms?.trim()) sections.push({ title: 'PAYMENT TERMS', text: d.paymentTerms });
  if (o.showTerms && d.terms?.trim()) sections.push({ title: 'TERMS & CONDITIONS', text: d.terms });
  sections.forEach((s) => {
    const lines = c.wrap(s.text, 7.7, c.width);
    c.ensure(14 + Math.min(lines.length, 3) * 10.2);
    c.text(s.title, c.left, c.y, { size: 6.9, bold: true, color: t.label, spacing: 0.6 });
    c.y -= 12;
    lines.forEach((line) => {
      c.ensure(10.2);
      c.text(line, c.left, c.y, { size: 7.7, color: rgb(0.27, 0.31, 0.37) });
      c.y -= 10.2;
    });
    c.y -= 8;
  });
}

function signatureBlock(c: Canvas, d: PdfDocInput, t: Theme, signature: PDFImage | null, stamp: PDFImage | null) {
  const o = d.options;
  if (!o.showCustomerSignature && !o.showAuthorizedSignature && !o.showStamp) return;
  const h = 92;
  c.ensure(h + 6);
  const top = c.y - 4;
  const w = c.width;
  const lineY = top - h + 22;

  if (o.showCustomerSignature) {
    c.line(c.left, lineY, c.left + 150, lineY, MUTED, 0.6);
    c.text(o.customerSignatureLabel || "Customer's Signature", c.left, lineY - 6, { size: 7.8, color: MUTED });
    c.text(d.customer.name ?? '', c.left, lineY - 17, { size: 7.4, color: tint(MUTED, 0.2) });
  }

  if (o.showStamp) {
    const cx = c.left + w / 2;
    if (stamp) c.drawImageFit(stamp, cx - 38, top - 6, 76, 64);
    else {
      c.page.drawEllipse({ x: cx, y: top - 40, xScale: 32, yScale: 32, borderColor: tint(MUTED, 0.45), borderWidth: 0.7, borderDashArray: [2.5, 2.5] });
      c.text('Company Seal', cx, top - 37, { size: 6.6, color: tint(MUTED, 0.3), align: 'center' });
    }
  }

  if (o.showAuthorizedSignature) {
    const right = c.right;
    c.text(`For ${d.company.company_name}`, right, top, { size: 8.2, bold: true, align: 'right', color: t.mono ? INK : t.accent });
    if (signature) c.drawImageFit(signature, right - 130, top - 14, 130, 38, 'right');
    c.line(right - 150, lineY, right, lineY, MUTED, 0.6);
    c.text(o.authorizedSignatureLabel || 'Authorised Signatory', right, lineY - 6, { size: 7.8, color: MUTED, align: 'right' });
    const who = [d.company.authorized_signatory, d.company.signatory_designation].filter(Boolean).join(', ');
    if (who) c.text(who, right, lineY - 17, { size: 7.4, color: tint(MUTED, 0.2), align: 'right' });
  }
  c.y = top - h;
}
