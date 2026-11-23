import { rgb } from 'pdf-lib';
import { A4, Canvas, INK, LINE, MUTED, WHITE, hex, tint } from '@/lib/pdf/engine';
import { amount as money, fmtDateTime, qty } from '@/lib/format';
import type { CompanySettings } from '@/lib/types';
import { optionsFor } from '@/lib/pdf/options';
import { reportTables, type ReportColumn, type ReportSection, type ReportSpec } from '@/lib/report-spec';

export type { ReportColumn, ReportRow, ReportSection, ReportSpec } from '@/lib/report-spec';

const cell = (value: unknown, format?: ReportColumn['format']) => {
  if (value === null || value === undefined || value === '') return '—';
  if (format === 'money') return money(value);
  if (format === 'number') return qty(value);
  return String(value);
};

/** Tabular report PDF with summary tiles, repeating headers and page numbers. Landscape for wide tables. */
export async function generateReportPdf(spec: ReportSpec, settings: CompanySettings) {
  const o = optionsFor(settings, undefined);
  const accent = o.template === 'mono' ? rgb(0.07, 0.07, 0.07) : hex(o.accentColor);
  const tables = reportTables(spec);
  const landscape = Math.max(0, ...tables.map((t) => t.columns.length)) > 6;
  const W = landscape ? A4.height : A4.width;
  const H = landscape ? A4.width : A4.height;
  const c = await Canvas.create(o.font, { title: spec.title, author: settings.company_name });
  c.margin = { left: 32, right: 32, top: 32, bottom: 50 };

  const addPage = () => {
    c.page = c.pdf.addPage([W, H]);
    c.pages.push(c.page);
    c.y = H - 32;
  };
  // replace default page geometry with report geometry
  c.addPage = () => { addPage(); return c.page; };
  const right = W - 32;
  const width = W - 64;

  addPage();
  c.rect(0, H, W, 5, { fill: accent });
  c.text(settings.company_name, c.left, c.y - 6, { size: 15, bold: true, color: accent });
  c.text(spec.title, right, c.y - 4, { size: 13, bold: true, align: 'right' });
  c.y -= 26;
  c.text(settings.address, c.left, c.y, { size: 7.8, color: MUTED });
  c.text(spec.subtitle || '', right, c.y, { size: 8.4, color: MUTED, align: 'right' });
  c.y -= 12;
  c.text(`Generated ${fmtDateTime(new Date().toISOString())}`, right, c.y, { size: 7.2, color: MUTED, align: 'right' });
  c.y -= 18;
  c.line(c.left, c.y, right, c.y, LINE, 0.7);
  c.y -= 14;

  if (spec.info?.length) {
    const per = landscape ? 4 : 3;
    const colW = width / per;
    for (let i = 0; i < spec.info.length; i += per) {
      const row = spec.info.slice(i, i + per);
      const wrapped = row.map((item) => c.wrap(item.value || '—', 8.6, colW - 12, true).slice(0, 3));
      row.forEach((item, j) => {
        const x = c.left + j * colW;
        c.text(item.label.toUpperCase(), x, c.y, { size: 6.4, bold: true, color: MUTED, spacing: 0.5 });
        wrapped[j].forEach((line, li) => c.text(line, x, c.y - 10 - li * 10.4, { size: 8.6, bold: true, color: INK }));
      });
      c.y -= 16 + Math.max(...wrapped.map((w) => w.length)) * 10.4;
    }
    c.y -= 4;
  }

  if (spec.summary?.length) {
    const per = Math.min(spec.summary.length, landscape ? 6 : 4);
    const gap = 8;
    const tileW = (width - gap * (per - 1)) / per;
    spec.summary.forEach((s, i) => {
      const col = i % per;
      if (col === 0 && i > 0) c.y -= 50;
      const x = c.left + col * (tileW + gap);
      c.rect(x, c.y, tileW, 42, { fill: tint(accent, 0.94), radius: 5 });
      c.text(s.label.toUpperCase(), x + 10, c.y - 9, { size: 6.6, bold: true, color: MUTED, spacing: 0.5 });
      c.text(s.value, x + 10, c.y - 22, { size: 11.5, bold: true, color: INK });
    });
    c.y -= 58;
  }

  const headerH = 20;
  const pad = 4.5;

  const drawTable = (table: ReportSection & { main?: boolean }) => {
    const totalWeight = table.columns.reduce((s, col) => s + (col.weight ?? 1), 0);
    const widths = table.columns.map((col) => (width * (col.weight ?? 1)) / totalWeight);

    const drawHeader = () => {
      c.rect(c.left, c.y, width, headerH, { fill: accent });
      let x = c.left;
      table.columns.forEach((col, i) => {
        const anchor = col.align === 'right' ? x + widths[i] - pad : col.align === 'center' ? x + widths[i] / 2 : x + pad;
        c.text(col.label, anchor, c.y - 6.6, { size: 7.4, bold: true, color: WHITE, align: col.align });
        x += widths[i];
      });
      c.y -= headerH;
    };

    const ensure = (h: number) => {
      if (c.y - h < 50) {
        addPage();
        c.text(`${settings.company_name}  ·  ${spec.title}${table.title ? `  ·  ${table.title}` : ''} (continued)`, c.left, c.y, { size: 8, color: MUTED });
        c.y -= 16;
        drawHeader();
      }
    };

    if (table.title) {
      // keep the section title with its header and first row
      if (c.y - 62 < 50) addPage();
      c.text(table.title, c.left, c.y, { size: 10.5, bold: true, color: accent });
      c.y -= 16;
    }
    drawHeader();

    const drawRow = (row: Record<string, unknown>, index: number, bold = false) => {
      const lines = table.columns.map((col, i) => c.wrap(cell(row[col.key], col.format), 7.8, widths[i] - pad * 2, bold));
      const rowH = Math.max(...lines.map((l) => l.length)) * 10.2 + pad * 2;
      ensure(rowH);
      if (bold) c.rect(c.left, c.y, width, rowH, { fill: tint(accent, 0.9) });
      else if (index % 2 === 1) c.rect(c.left, c.y, width, rowH, { fill: tint(accent, 0.965) });
      let x = c.left;
      table.columns.forEach((col, i) => {
        lines[i].forEach((line, li) => {
          const anchor = col.align === 'right' ? x + widths[i] - pad : col.align === 'center' ? x + widths[i] / 2 : x + pad;
          c.text(line, anchor, c.y - pad - li * 10.2, { size: 7.8, bold, align: col.align });
        });
        x += widths[i];
      });
      c.y -= rowH;
    };

    if (!table.rows.length) {
      c.text(table.empty ?? 'No records for the selected period.', c.left + width / 2, c.y - 12, { size: 8.4, color: MUTED, align: 'center' });
      c.y -= 30;
    }
    table.rows.forEach((row, i) => drawRow(row, i));
    if (table.totals && table.rows.length) drawRow(table.totals, 0, true);
  };

  tables.forEach((table, i) => {
    if (i > 0) c.y -= 18;
    drawTable(table);
  });

  if (spec.note) {
    const lines = c.wrap(spec.note, 7.4, width);
    if (c.y - 14 - lines.length * 10 < 50) addPage();
    c.y -= 14;
    lines.forEach((line) => { c.text(line, c.left, c.y, { size: 7.4, color: MUTED }); c.y -= 10; });
  }

  const total = c.pages.length;
  c.pages.forEach((page, i) => {
    c.page = page;
    c.line(c.left, 36, right, 36, LINE, 0.6);
    c.text(`${settings.company_name}  ·  ${spec.title}`, c.left, 29, { size: 7, color: MUTED });
    c.text(`Page ${i + 1} of ${total}`, right, 29, { size: 7, color: MUTED, align: 'right' });
  });
  return c.save();
}
