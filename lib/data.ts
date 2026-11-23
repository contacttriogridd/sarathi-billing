import { supabase } from '@/lib/supabase';
import { DEFAULT_SETTINGS, uid } from '@/lib/constants';
import type {
  Attendance, AttendanceStatus, AuditLog, CatalogItem, CompanySettings, Customer, Expense, Invoice, Labourer, LabourPayment, LineItem, Payment, Profile, Project, Quotation,
} from '@/lib/types';

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export const friendlyError = (error: unknown): string => {
  const e = (error ?? {}) as { message?: string; code?: string; details?: string };
  const msg = e.message || String(error);
  if (e.code === '23503') {
    if (/labour_attendance|labour_payments/.test(msg)) return 'This labourer has attendance or payments recorded and cannot be removed. Mark them inactive instead.';
    return 'This record is linked to other records (projects, invoices or payments) and cannot be removed.';
  }
  if (e.code === '23505') {
    if (msg.includes('invoice_number')) return 'That invoice number is already in use.';
    if (msg.includes('quotation_number')) return 'That quotation / estimate number is already in use.';
    if (msg.includes('project_code')) return 'That project ID is already in use.';
    if (msg.includes('labour_code')) return 'That Labour ID is already in use.';
    if (msg.includes('labour_attendance_one_per_day')) return 'Attendance for this labourer on that date is already marked.';
    return 'A record with the same unique value already exists.';
  }
  if (e.code === '23514') return 'One of the values is outside the allowed range. Please check the form.';
  if (e.code === '42501' || /row-level security|permission denied/i.test(msg)) return 'You do not have permission to do that. Please ask an administrator.';
  if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) return 'Network error — please check your internet connection and try again.';
  if (isMissingLabourSchema(error)) return LABOUR_SETUP_MESSAGE;
  if (e.code === 'PGRST202' || /Could not find the function/i.test(msg)) return 'Database functions are missing. Please run the Supabase schema script (see README).';
  if (e.code === '42P01' || /relation .* does not exist|Could not find the table/i.test(msg)) return 'Database tables are missing. Please run the Supabase schema script (see README).';
  return msg.replace(/^ERROR:\s*/, '');
};

export const LABOUR_SETUP_MESSAGE = 'Labour attendance needs a one-time database update: run supabase/migrations/20261123120000_labour_attendance.sql in the Supabase SQL Editor (see README).';

/** True when the labour tables (or expenses.attendance_id) have not been created yet. */
export const isMissingLabourSchema = (error: unknown) => {
  const e = (error ?? {}) as { message?: string; code?: string };
  const msg = e.message || String(error);
  return /labourers|labour_attendance|labour_payments|attendance_id/.test(msg)
    && (e.code === '42P01' || e.code === 'PGRST205' || e.code === '42703' || e.code === 'PGRST204' || /does not exist|Could not find/i.test(msg));
};

const check = <T>(result: { data: T; error: unknown }): T => {
  if (result.error) throw result.error;
  return result.data;
};

// ---------------------------------------------------------------------------
// Generic loaders
// ---------------------------------------------------------------------------

async function fetchAll<T>(table: string, order: { column: string; ascending?: boolean }, select = '*'): Promise<T[]> {
  const pageSize = 1000;
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase.from(table).select(select).order(order.column, { ascending: order.ascending ?? false }).range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as T[]));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

const n = (v: unknown) => (v === null || v === undefined || v === '' ? 0 : Number(v));

const normInvoice = (r: Invoice): Invoice => ({
  ...r,
  charges: r.charges ?? [], deductions: r.deductions ?? [], stage_details: r.stage_details ?? {}, ra_details: r.ra_details ?? {},
  pdf_options: r.pdf_options ?? {}, snapshot: r.snapshot ?? {}, tax_breakdown: r.tax_breakdown ?? [],
  discount_value: n(r.discount_value), advance_paid: n(r.advance_paid), previous_payments: n(r.previous_payments),
  subtotal: n(r.subtotal), charges_total: n(r.charges_total), discount_total: n(r.discount_total), taxable_amount: n(r.taxable_amount),
  cgst_total: n(r.cgst_total), sgst_total: n(r.sgst_total), igst_total: n(r.igst_total), tax_total: n(r.tax_total), round_off: n(r.round_off),
  grand_total: n(r.grand_total), deductions_total: n(r.deductions_total), net_payable: n(r.net_payable), amount_paid: n(r.amount_paid), balance_due: n(r.balance_due),
});

const normQuotation = (r: Quotation): Quotation => ({
  ...r,
  charges: r.charges ?? [], stage_details: r.stage_details ?? {}, pdf_options: r.pdf_options ?? {}, snapshot: r.snapshot ?? {}, tax_breakdown: r.tax_breakdown ?? [],
  discount_value: n(r.discount_value), subtotal: n(r.subtotal), charges_total: n(r.charges_total), discount_total: n(r.discount_total),
  taxable_amount: n(r.taxable_amount), cgst_total: n(r.cgst_total), sgst_total: n(r.sgst_total), igst_total: n(r.igst_total),
  tax_total: n(r.tax_total), round_off: n(r.round_off), grand_total: n(r.grand_total),
});

export const normItem = (r: Record<string, unknown>): LineItem => ({
  id: r.id as string,
  key: (r.id as string) || uid(),
  position: n(r.position),
  item_type: (r.item_type as LineItem['item_type']) || 'standard',
  description: (r.description as string) ?? '',
  hsn_sac: (r.hsn_sac as string) ?? '',
  unit: (r.unit as string) ?? '',
  quantity: n(r.quantity),
  rate: n(r.rate),
  discount: n(r.discount),
  tax_rate: n(r.tax_rate),
  exempt: Boolean(r.exempt),
  length: r.length === null || r.length === undefined ? null : n(r.length),
  breadth: r.breadth === null || r.breadth === undefined ? null : n(r.breadth),
  height: r.height === null || r.height === undefined ? null : n(r.height),
  nos: r.nos === null || r.nos === undefined ? null : n(r.nos),
  prev_quantity: n(r.prev_quantity),
  amount: n(r.amount),
});

export const loaders = {
  settings: async (): Promise<CompanySettings> => {
    const row = check(await supabase.from('company_settings').select('*').eq('id', 1).maybeSingle());
    return { ...DEFAULT_SETTINGS, ...(row ?? {}), pdf_settings: (row as CompanySettings | null)?.pdf_settings ?? {} } as CompanySettings;
  },
  customers: () => fetchAll<Customer>('customers', { column: 'name', ascending: true }),
  projects: () => fetchAll<Project>('projects', { column: 'created_at' }).then((rows) => rows.map((p) => ({ ...p, estimated_budget: n(p.estimated_budget) }))),
  invoices: () => fetchAll<Invoice>('invoices', { column: 'invoice_date' }).then((rows) => rows.map(normInvoice)),
  quotations: () => fetchAll<Quotation>('quotations', { column: 'quotation_date' }).then((rows) => rows.map(normQuotation)),
  payments: () => fetchAll<Payment>('payments', { column: 'payment_date' }).then((rows) => rows.map((p) => ({ ...p, amount: n(p.amount) }))),
  expenses: () => fetchAll<Expense>('expenses', { column: 'expense_date' }).then((rows) => rows.map((e) => ({ ...e, amount: n(e.amount), attendance_id: e.attendance_id ?? null }))),
  labourers: () => fetchAll<Labourer>('labourers', { column: 'name', ascending: true })
    .then((rows) => rows.map((l) => ({ ...l, daily_wage: n(l.daily_wage), overtime_rate: n(l.overtime_rate) }))),
  attendance: () => fetchAll<Attendance>('labour_attendance', { column: 'work_date' })
    .then((rows) => rows.map((a) => ({ ...a, overtime_hours: n(a.overtime_hours), daily_wage: n(a.daily_wage), overtime_rate: n(a.overtime_rate), amount: n(a.amount) }))),
  labourPayments: () => fetchAll<LabourPayment>('labour_payments', { column: 'payment_date' }).then((rows) => rows.map((p) => ({ ...p, amount: n(p.amount) }))),
  catalog: () => fetchAll<CatalogItem>('catalog_items', { column: 'name', ascending: true }).then((rows) => rows.map((c) => ({ ...c, rate: n(c.rate), tax_rate: n(c.tax_rate) }))),
  profiles: () => fetchAll<Profile>('profiles', { column: 'created_at', ascending: true }),
};

export type CollectionKey = keyof typeof loaders;

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

export const getInvoice = async (id: string) => {
  const row = check(await supabase.from('invoices').select('*, items:invoice_items(*)').eq('id', id).order('position', { referencedTable: 'invoice_items', ascending: true }).maybeSingle());
  if (!row) return null;
  const { items, ...rest } = row as Invoice & { items: Record<string, unknown>[] };
  return { ...normInvoice(rest as Invoice), items: (items ?? []).map(normItem).sort((a, b) => a.position - b.position) };
};

export const getQuotation = async (id: string) => {
  const row = check(await supabase.from('quotations').select('*, items:quotation_items(*)').eq('id', id).order('position', { referencedTable: 'quotation_items', ascending: true }).maybeSingle());
  if (!row) return null;
  const { items, ...rest } = row as Quotation & { items: Record<string, unknown>[] };
  return { ...normQuotation(rest as Quotation), items: (items ?? []).map(normItem).sort((a, b) => a.position - b.position) };
};

export const itemsPayload = (items: LineItem[], amounts: number[]) =>
  items.map((it, i) => ({
    position: i + 1, item_type: it.item_type, description: it.description.trim(), hsn_sac: it.hsn_sac.trim(), unit: it.unit.trim(),
    quantity: it.quantity, rate: it.rate, discount: it.discount, tax_rate: it.tax_rate, exempt: it.exempt,
    length: it.length, breadth: it.breadth, height: it.height, nos: it.nos, prev_quantity: it.prev_quantity, amount: amounts[i] ?? 0,
  }));

export const saveInvoiceRpc = async (invoice: Record<string, unknown>, items: Record<string, unknown>[]) =>
  normInvoice(check(await supabase.rpc('save_invoice', { p_invoice: invoice, p_items: items })) as Invoice);

export const saveQuotationRpc = async (quotation: Record<string, unknown>, items: Record<string, unknown>[]) =>
  normQuotation(check(await supabase.rpc('save_quotation', { p_quotation: quotation, p_items: items })) as Quotation);

export const updateInvoice = async (id: string, patch: Partial<Invoice>) => check(await supabase.from('invoices').update(patch).eq('id', id).select('id'));
export const deleteInvoice = async (id: string) => check(await supabase.from('invoices').delete().eq('id', id));
export const updateQuotation = async (id: string, patch: Partial<Quotation>) => check(await supabase.from('quotations').update(patch).eq('id', id).select('id'));
export const deleteQuotation = async (id: string) => check(await supabase.from('quotations').delete().eq('id', id));

// ---------------------------------------------------------------------------
// Simple tables
// ---------------------------------------------------------------------------

const strip = <T extends Record<string, unknown>>(row: T, keys: string[]) => {
  const copy: Record<string, unknown> = { ...row };
  keys.forEach((k) => delete copy[k]);
  return copy;
};

export const upsertRow = async <T>(table: string, row: Record<string, unknown>): Promise<T> => {
  const clean = strip(row, ['created_at', 'updated_at', 'created_by']);
  if (clean.id) {
    const { id, ...rest } = clean;
    return check(await supabase.from(table).update(rest).eq('id', id as string).select().single()) as T;
  }
  delete clean.id;
  return check(await supabase.from(table).insert(clean).select().single()) as T;
};

export const deleteRow = async (table: string, id: string) => {
  const { data, error } = await supabase.from(table).delete().eq('id', id).select('id');
  if (error) throw error;
  if (!data?.length) throw new Error('You do not have permission to delete this record. Only administrators can delete.');
};

export const saveSettings = async (patch: Partial<CompanySettings>) => {
  const clean = strip(patch as Record<string, unknown>, ['id', 'updated_at']);
  const data = check(await supabase.from('company_settings').update(clean).eq('id', 1).select().maybeSingle());
  if (!data) throw new Error('Only administrators can change company settings.');
  return data as CompanySettings;
};

export const fetchAudit = async (opts: { entityId?: string; entityIds?: string[]; limit?: number } = {}) => {
  let q = supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(opts.limit ?? 50);
  if (opts.entityId) q = q.eq('entity_id', opts.entityId);
  if (opts.entityIds?.length) q = q.in('entity_id', opts.entityIds);
  return check(await q) as AuditLog[];
};

// ---------------------------------------------------------------------------
// Labour attendance
// ---------------------------------------------------------------------------

export type AttendanceWrite = {
  labourer_id: string; work_date: string; status?: AttendanceStatus; project_id?: string | null;
  overtime_hours?: number; daily_wage?: number; overtime_rate?: number; notes?: string;
};

/**
 * Marks attendance — one row per labourer per day, so an existing day is updated in place.
 * The database works out the wage and keeps the matching Labour expense in sync.
 * Rows in one call must have the same fields (missing fields would be sent as null).
 */
export const saveAttendance = async (rows: AttendanceWrite[], opts: { onlyNew?: boolean } = {}): Promise<Attendance[]> => {
  if (!rows.length) return [];
  // onlyNew: days someone else marked in the meantime are left untouched
  const data = check(await supabase.from('labour_attendance').upsert(rows, { onConflict: 'labourer_id,work_date', ignoreDuplicates: !!opts.onlyNew }).select());
  return ((data ?? []) as Attendance[]).map((a) => ({ ...a, overtime_hours: n(a.overtime_hours), daily_wage: n(a.daily_wage), overtime_rate: n(a.overtime_rate), amount: n(a.amount) }));
};

/** Applies new rates to a labourer's attendance on or after a date; wages and expenses are recomputed by the database. */
export const repriceAttendance = async (labourerId: string, fromDate: string, dailyWage: number, overtimeRate: number) => {
  const data = check(await supabase.from('labour_attendance').update({ daily_wage: dailyWage, overtime_rate: overtimeRate })
    .eq('labourer_id', labourerId).gte('work_date', fromDate).select('id'));
  return (data ?? []).length;
};

// ---------------------------------------------------------------------------
// Shareable PDF links (private bucket + signed URL)
// ---------------------------------------------------------------------------

export const uploadShareablePdf = async (path: string, bytes: Uint8Array, days = 30) => {
  const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
  const up = await supabase.storage.from('documents').upload(path, blob, { upsert: true, contentType: 'application/pdf', cacheControl: '60' });
  if (up.error) throw up.error;
  const signed = await supabase.storage.from('documents').createSignedUrl(path, days * 86400, { download: path.split('/').pop() });
  if (signed.error) throw signed.error;
  return signed.data.signedUrl;
};

// ---------------------------------------------------------------------------
// Backup & restore
// ---------------------------------------------------------------------------

// labour_attendance must come before expenses (expenses.attendance_id references it)
const BACKUP_TABLES = ['customers', 'projects', 'catalog_items', 'labourers', 'labour_attendance', 'labour_payments', 'expenses', 'quotations', 'quotation_items', 'invoices', 'invoice_items', 'payments'] as const;
const LABOUR_TABLES: readonly string[] = ['labourers', 'labour_attendance', 'labour_payments'];

export const exportBackup = async () => {
  const settings = check(await supabase.from('company_settings').select('*').eq('id', 1).maybeSingle());
  const data: Record<string, unknown[]> = {};
  for (const table of BACKUP_TABLES) {
    try {
      data[table] = await fetchAll<Record<string, unknown>>(table, { column: 'created_at', ascending: true });
    } catch (e) {
      // databases without the labour update simply have no labour data to back up
      if (LABOUR_TABLES.includes(table) && isMissingLabourSchema(e)) continue;
      throw e;
    }
  }
  return { app: 'sarathi-billing', version: 1, exported_at: new Date().toISOString(), company_settings: settings, data };
};

export const restoreBackup = async (backup: { app?: string; company_settings?: Record<string, unknown>; data?: Record<string, Record<string, unknown>[]> }, onProgress?: (msg: string) => void) => {
  if (backup.app !== 'sarathi-billing' || !backup.data) throw new Error('This file is not a Sarathi Associates backup.');
  if (backup.company_settings) {
    onProgress?.('Company settings');
    await saveSettings(backup.company_settings as Partial<CompanySettings>);
  }
  const strippedCols: Record<string, string[]> = {
    invoices: ['created_by', 'cancelled_by'],
    quotations: ['created_by', 'converted_invoice_id'],
    payments: ['created_by'],
    customers: ['created_by'],
    projects: ['created_by'],
    expenses: ['created_by'],
    labourers: ['created_by'],
    labour_attendance: ['created_by', 'updated_by'],
    labour_payments: ['created_by'],
  };
  for (const table of BACKUP_TABLES) {
    // attendance wages are re-created as expenses by the database when attendance is restored
    const source = (backup.data[table] ?? []).filter((r) => table !== 'expenses' || !r.attendance_id);
    const rows = source.map((r) => strip(r, strippedCols[table] ?? []));
    if (!rows.length) continue;
    onProgress?.(`${table.replace('_', ' ')} (${rows.length})`);
    if (table === 'invoices') {
      // insert as drafts first so items can be restored, then re-apply status
      const statuses = rows.map((r) => ({ id: r.id, status: r.status, cancel_reason: r.cancel_reason }));
      for (let i = 0; i < rows.length; i += 500) {
        check(await supabase.from('invoices').upsert(rows.slice(i, i + 500).map((r) => ({ ...r, status: 'Draft', amount_paid: 0 })), { onConflict: 'id' }));
      }
      (backup as { _invoiceStatuses?: typeof statuses })._invoiceStatuses = statuses;
      continue;
    }
    if (table === 'payments') {
      const statuses = (backup as { _invoiceStatuses?: { id: unknown; status: unknown; cancel_reason: unknown }[] })._invoiceStatuses ?? [];
      for (const s of statuses) {
        if (s.status !== 'Draft' && s.status !== 'Cancelled') check(await supabase.from('invoices').update({ status: 'Sent' }).eq('id', s.id as string).select('id'));
      }
      for (let i = 0; i < rows.length; i += 500) check(await supabase.from('payments').upsert(rows.slice(i, i + 500), { onConflict: 'id' }));
      for (const s of statuses) {
        if (s.status === 'Cancelled') check(await supabase.from('invoices').update({ status: 'Cancelled', cancel_reason: s.cancel_reason ?? '' }).eq('id', s.id as string).select('id'));
        else if (s.status !== 'Draft') await supabase.rpc('recalc_invoice', { p_invoice_id: s.id });
      }
      continue;
    }
    for (let i = 0; i < rows.length; i += 500) check(await supabase.from(table).upsert(rows.slice(i, i + 500), { onConflict: 'id' }));
  }
  const statuses = (backup as { _invoiceStatuses?: { id: unknown; status: unknown; cancel_reason: unknown }[] })._invoiceStatuses ?? [];
  if (!(backup.data.payments ?? []).length) {
    for (const s of statuses) {
      if (s.status === 'Cancelled') check(await supabase.from('invoices').update({ status: 'Cancelled', cancel_reason: s.cancel_reason ?? '' }).eq('id', s.id as string).select('id'));
      else if (s.status !== 'Draft') { check(await supabase.from('invoices').update({ status: 'Sent' }).eq('id', s.id as string).select('id')); await supabase.rpc('recalc_invoice', { p_invoice_id: s.id }); }
    }
  }
};
