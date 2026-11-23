/** Report description shared by the reports page, the PDF renderer and the Excel export (no heavy imports here). */

export type ReportColumn = { key: string; label: string; align?: 'left' | 'right' | 'center'; weight?: number; format?: 'money' | 'text' | 'number' };
export type ReportRow = Record<string, string | number | null | undefined>;
/** An additional titled table, e.g. "Invoices" or "Labour attendance" in a project report. */
export type ReportSection = { title: string; columns: ReportColumn[]; rows: ReportRow[]; totals?: ReportRow; empty?: string };
export type ReportSpec = {
  title: string;
  subtitle?: string;
  columns: ReportColumn[];
  rows: ReportRow[];
  totals?: ReportRow;
  summary?: { label: string; value: string }[];
  /** key facts printed under the header, e.g. project, customer, site */
  info?: { label: string; value: string }[];
  /** further tables printed after the main one (the main table may be empty) */
  sections?: ReportSection[];
  /** footnote printed after the tables */
  note?: string;
};

/** All tables of a report: the main table (if it has columns) followed by the sections. */
export const reportTables = (spec: ReportSpec): (ReportSection & { main?: boolean })[] => [
  ...(spec.columns.length ? [{ title: '', columns: spec.columns, rows: spec.rows, totals: spec.totals, main: true }] : []),
  ...(spec.sections ?? []),
];
