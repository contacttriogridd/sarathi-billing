import type { ReportSpec } from '@/lib/pdf/report';
import { downloadBytes } from '@/lib/share';

/** Exports a report spec to a formatted .xlsx workbook (exceljs is loaded on demand). */
export async function exportReportExcel(spec: ReportSpec, filename: string, companyName: string) {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = companyName;
  wb.created = new Date();
  const ws = wb.addWorksheet(spec.title.slice(0, 31).replace(/[\\/*?:[\]]/g, ''), { views: [{ state: 'frozen', ySplit: 4 }] });

  ws.mergeCells(1, 1, 1, Math.max(spec.columns.length, 2));
  ws.getCell(1, 1).value = companyName;
  ws.getCell(1, 1).font = { bold: true, size: 14, color: { argb: 'FF10294A' } };
  ws.mergeCells(2, 1, 2, Math.max(spec.columns.length, 2));
  ws.getCell(2, 1).value = `${spec.title}${spec.subtitle ? ` — ${spec.subtitle}` : ''}`;
  ws.getCell(2, 1).font = { size: 11, color: { argb: 'FF475569' } };

  const header = ws.getRow(4);
  spec.columns.forEach((col, i) => {
    const cell = header.getCell(i + 1);
    cell.value = col.label;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF10294A' } };
    cell.alignment = { horizontal: col.align === 'right' ? 'right' : col.align === 'center' ? 'center' : 'left', vertical: 'middle' };
  });
  header.height = 20;

  const writeRow = (row: Record<string, unknown>, rIndex: number, bold = false) => {
    const r = ws.getRow(rIndex);
    spec.columns.forEach((col, i) => {
      const raw = row[col.key];
      const cell = r.getCell(i + 1);
      if ((col.format === 'money' || col.format === 'number') && raw !== null && raw !== undefined && raw !== '' && !Number.isNaN(Number(raw))) {
        cell.value = Number(raw);
        cell.numFmt = col.format === 'money' ? '[$₹-4009]#,##,##0.00' : '#,##0.###';
      } else {
        cell.value = raw === null || raw === undefined ? '' : String(raw);
      }
      cell.alignment = { horizontal: col.align === 'right' ? 'right' : col.align === 'center' ? 'center' : 'left', wrapText: true, vertical: 'top' };
      if (bold) {
        cell.font = { bold: true };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EEF6' } };
      }
    });
  };
  spec.rows.forEach((row, i) => writeRow(row, 5 + i));
  if (spec.totals) writeRow(spec.totals, 5 + spec.rows.length, true);

  spec.columns.forEach((col, i) => {
    const longest = Math.max(col.label.length, ...spec.rows.slice(0, 500).map((r) => String(r[col.key] ?? '').length));
    ws.getColumn(i + 1).width = Math.min(Math.max(col.format === 'money' ? 16 : 10, longest + 2), 48);
  });

  if (spec.summary?.length) {
    const s = wb.addWorksheet('Summary');
    s.getColumn(1).width = 32;
    s.getColumn(2).width = 24;
    spec.summary.forEach((item, i) => {
      s.getCell(i + 1, 1).value = item.label;
      s.getCell(i + 1, 1).font = { bold: true };
      s.getCell(i + 1, 2).value = item.value;
    });
  }

  const buffer = await wb.xlsx.writeBuffer();
  downloadBytes(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename);
}
