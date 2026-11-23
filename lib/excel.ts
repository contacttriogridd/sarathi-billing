import type { Row, Worksheet } from 'exceljs';
import { reportTables, type ReportColumn, type ReportSpec } from '@/lib/report-spec';
import { downloadBytes } from '@/lib/share';

const NAVY = 'FF10294A';
const align = (col: ReportColumn) => (col.align === 'right' ? 'right' : col.align === 'center' ? 'center' : 'left') as 'right' | 'center' | 'left';

const writeHeader = (row: Row, columns: ReportColumn[]) => {
  columns.forEach((col, i) => {
    const cell = row.getCell(i + 1);
    cell.value = col.label;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
    cell.alignment = { horizontal: align(col), vertical: 'middle' };
  });
  row.height = 20;
};

const writeRow = (ws: Worksheet, rIndex: number, columns: ReportColumn[], row: Record<string, unknown>, bold = false) => {
  const r = ws.getRow(rIndex);
  columns.forEach((col, i) => {
    const raw = row[col.key];
    const cell = r.getCell(i + 1);
    if ((col.format === 'money' || col.format === 'number') && raw !== null && raw !== undefined && raw !== '' && !Number.isNaN(Number(raw))) {
      cell.value = Number(raw);
      cell.numFmt = col.format === 'money' ? '[$₹-4009]#,##,##0.00' : '#,##0.###';
    } else {
      cell.value = raw === null || raw === undefined ? '' : String(raw);
    }
    cell.alignment = { horizontal: align(col), wrapText: true, vertical: 'top' };
    if (bold) {
      cell.font = { bold: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EEF6' } };
    }
  });
};

/** Exports a report spec to a formatted .xlsx workbook (exceljs is loaded on demand). */
export async function exportReportExcel(spec: ReportSpec, filename: string, companyName: string) {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = companyName;
  wb.created = new Date();
  const tables = reportTables(spec);
  const single = tables.length === 1 && tables[0].main;
  const ws = wb.addWorksheet(spec.title.slice(0, 31).replace(/[\\/*?:[\]]/g, ''), single ? { views: [{ state: 'frozen', ySplit: 4 }] } : {});
  const span = Math.max(2, ...tables.map((t) => t.columns.length));

  ws.mergeCells(1, 1, 1, span);
  ws.getCell(1, 1).value = companyName;
  ws.getCell(1, 1).font = { bold: true, size: 14, color: { argb: NAVY } };
  ws.mergeCells(2, 1, 2, span);
  ws.getCell(2, 1).value = `${spec.title}${spec.subtitle ? ` — ${spec.subtitle}` : ''}`;
  ws.getCell(2, 1).font = { size: 11, color: { argb: 'FF475569' } };

  let r = 4;
  if (!single && spec.info?.length) {
    spec.info.forEach((item) => {
      ws.getCell(r, 1).value = item.label;
      ws.getCell(r, 1).font = { bold: true, color: { argb: 'FF475569' } };
      ws.mergeCells(r, 2, r, span);
      ws.getCell(r, 2).value = item.value;
      r += 1;
    });
    r += 1;
  }

  // column widths from the longest value in each column position across all tables
  const widths: number[] = [];
  tables.forEach((table) => {
    if (table.title) {
      ws.getCell(r, 1).value = table.title;
      ws.getCell(r, 1).font = { bold: true, size: 12, color: { argb: NAVY } };
      r += 1;
    }
    writeHeader(ws.getRow(r), table.columns);
    r += 1;
    if (!table.rows.length) {
      ws.getCell(r, 1).value = table.empty ?? 'No records for the selected period.';
      ws.getCell(r, 1).font = { italic: true, color: { argb: 'FF64748B' } };
      r += 1;
    }
    table.rows.forEach((row) => { writeRow(ws, r, table.columns, row); r += 1; });
    if (table.totals && table.rows.length) { writeRow(ws, r, table.columns, table.totals, true); r += 1; }
    r += 1;
    table.columns.forEach((col, i) => {
      const longest = Math.max(col.label.length, ...table.rows.slice(0, 500).map((row) => String(row[col.key] ?? '').length));
      widths[i] = Math.max(widths[i] ?? 0, Math.min(Math.max(col.format === 'money' ? 16 : 10, longest + 2), 48));
    });
  });
  widths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });

  if (spec.note) {
    ws.mergeCells(r, 1, r, span);
    ws.getCell(r, 1).value = spec.note;
    ws.getCell(r, 1).font = { italic: true, size: 9, color: { argb: 'FF64748B' } };
  }

  const facts = [...(spec.info ?? []), ...(spec.summary ?? [])];
  if (facts.length) {
    const s = wb.addWorksheet('Summary');
    s.getColumn(1).width = 32;
    s.getColumn(2).width = 40;
    facts.forEach((item, i) => {
      s.getCell(i + 1, 1).value = item.label;
      s.getCell(i + 1, 1).font = { bold: true };
      s.getCell(i + 1, 2).value = item.value;
    });
  }

  const buffer = await wb.xlsx.writeBuffer();
  downloadBytes(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename);
}
