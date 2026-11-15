'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertCircle, ArrowLeft, Building2, Calculator, CheckCircle2, ChevronDown, ClipboardList, Eye, FileText, Layers, Loader2, MinusCircle,
  Palette, Percent, Plus, Ruler, Save, Send, StickyNote, Trash2, Wallet,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useAuth, useData } from '@/components/providers';
import { Card, CardTitle, Field, KeyValue, NumberInput, Segmented, SelectNative, TextInput, Toggle } from '@/components/common';
import { CustomerPicker, ProjectPicker } from '@/components/forms';
import { ItemsEditor, blankItem } from '@/components/editor/items-editor';
import { DesignPanel } from '@/components/editor/design-panel';
import { PdfPreviewDialog, type PdfJob } from '@/components/pdf-viewer';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { computeDocument } from '@/lib/calc';
import { DEDUCTION_PRESETS, INDIAN_STATES, INVOICE_TYPES, QUOTATION_STATUSES, RA_TYPES, defaultCharges, defaultDeductions, uid } from '@/lib/constants';
import { friendlyError, saveInvoiceRpc, saveQuotationRpc } from '@/lib/data';
import { addDays, amountInWords, formatDocumentNumber, inr, relativeTime, round2, slug, todayISO } from '@/lib/format';
import { generateInvoicePdf, generateQuotationPdf } from '@/lib/pdf/lazy';
import { optionsFor } from '@/lib/pdf/options';
import type {
  BillingMode, Charge, CompanySettings, CompanySnapshot, Customer, Deduction, DiscountType, Invoice, LineItem, PdfOptions, Project, Quotation,
  QuotationStatus, RaDetails, StageDetails, TaxMode, TaxType,
} from '@/lib/types';

export type DocKind = 'invoice' | 'quotation' | 'estimate';

export type Draft = {
  id?: string;
  number: string;
  date: string;
  secondary_date: string | null;
  status: string;
  customer_id: string | null;
  project_id: string | null;
  invoice_type: string;
  work_order_number: string;
  reference_number: string;
  place_of_supply: string;
  payment_terms: string;
  subject: string;
  billing_mode: BillingMode;
  tax_mode: TaxMode;
  tax_type: TaxType;
  line_discount_type: DiscountType;
  discount_type: DiscountType;
  discount_value: number;
  charges: Charge[];
  deductions: Deduction[];
  round_off_enabled: boolean;
  stage_details: StageDetails;
  ra_details: RaDetails;
  advance_paid: number;
  previous_payments: number;
  amount_paid: number;
  items: LineItem[];
  notes: string;
  internal_notes: string;
  terms: string;
  pdf_options: Partial<PdfOptions>;
  source_quotation_id: string | null;
};

const BASE_PATH: Record<DocKind, string> = { invoice: '/invoices', quotation: '/quotations', estimate: '/estimates' };
const LABEL: Record<DocKind, string> = { invoice: 'Invoice', quotation: 'Quotation', estimate: 'Estimate' };

const mergeCharges = (charges: Charge[] | undefined, rate: number) => {
  const defaults = defaultCharges(rate);
  const list = (charges ?? []).map((c) => ({ ...c, key: c.key || uid() }));
  defaults.forEach((d) => { if (!list.some((c) => c.label === d.label)) list.push(d); });
  return list;
};

const mergeDeductions = (deductions: Deduction[] | undefined) => {
  const list = (deductions ?? []).map((d) => ({ ...d, key: d.key || uid() }));
  defaultDeductions().forEach((d) => { if (!list.some((x) => x.type === d.type)) list.push(d); });
  return list;
};

export const newDraft = (kind: DocKind, s: CompanySettings): Draft => {
  const date = todayISO();
  return {
    number: '', date,
    secondary_date: kind === 'invoice' ? addDays(date, s.default_due_days) : addDays(date, s.quotation_validity_days),
    status: 'Draft', customer_id: null, project_id: null, invoice_type: 'Standard Tax Invoice', work_order_number: '', reference_number: '',
    place_of_supply: s.state || 'Tamil Nadu', payment_terms: kind === 'invoice' ? s.default_payment_terms : '', subject: '',
    billing_mode: 'standard', tax_mode: s.default_tax_mode, tax_type: s.default_tax_type, line_discount_type: 'percent', discount_type: 'amount', discount_value: 0,
    charges: defaultCharges(s.default_tax_rate), deductions: defaultDeductions(), round_off_enabled: s.round_off_enabled,
    stage_details: {}, ra_details: {}, advance_paid: 0, previous_payments: 0, amount_paid: 0,
    items: [blankItem('standard', s.default_tax_rate)],
    notes: '', internal_notes: '',
    terms: kind === 'invoice' ? s.terms_invoice : kind === 'quotation' ? s.terms_quotation : s.terms_estimate,
    pdf_options: { ...optionsFor(s, undefined) },
    source_quotation_id: null,
  };
};

export const draftFromInvoice = (inv: Invoice, s: CompanySettings, duplicate = false): Draft => {
  const date = todayISO();
  return {
    id: duplicate ? undefined : inv.id,
    number: duplicate ? '' : inv.invoice_number,
    date: duplicate ? date : inv.invoice_date,
    secondary_date: duplicate ? addDays(date, s.default_due_days) : inv.due_date,
    status: duplicate ? 'Draft' : inv.status,
    customer_id: inv.customer_id, project_id: inv.project_id, invoice_type: inv.invoice_type,
    work_order_number: inv.work_order_number, reference_number: duplicate ? '' : inv.reference_number, place_of_supply: inv.place_of_supply,
    payment_terms: inv.payment_terms, subject: '', billing_mode: inv.billing_mode, tax_mode: inv.tax_mode, tax_type: inv.tax_type,
    line_discount_type: inv.line_discount_type, discount_type: inv.discount_type, discount_value: inv.discount_value,
    charges: mergeCharges(inv.charges, s.default_tax_rate), deductions: mergeDeductions(inv.deductions), round_off_enabled: inv.round_off_enabled,
    stage_details: inv.stage_details ?? {}, ra_details: duplicate ? { ...inv.ra_details, ra_number: '' } : inv.ra_details ?? {},
    advance_paid: duplicate ? 0 : inv.advance_paid, previous_payments: duplicate ? 0 : inv.previous_payments, amount_paid: duplicate ? 0 : inv.amount_paid,
    items: (inv.items ?? []).map((it) => ({ ...it, key: uid(), id: undefined })),
    notes: inv.notes, internal_notes: duplicate ? '' : inv.internal_notes, terms: inv.terms, pdf_options: inv.pdf_options ?? {},
    source_quotation_id: duplicate ? null : inv.source_quotation_id,
  };
};

export const draftFromQuotation = (q: Quotation, s: CompanySettings, target: DocKind, duplicate = false): Draft => {
  const date = todayISO();
  const toInvoice = target === 'invoice';
  return {
    id: duplicate || toInvoice ? undefined : q.id,
    number: duplicate || toInvoice ? '' : q.quotation_number,
    date: duplicate || toInvoice ? date : q.quotation_date,
    secondary_date: toInvoice ? addDays(date, s.default_due_days) : duplicate ? addDays(date, s.quotation_validity_days) : q.valid_until,
    status: duplicate || toInvoice ? 'Draft' : q.status,
    customer_id: q.customer_id, project_id: q.project_id, invoice_type: 'Standard Tax Invoice', work_order_number: '', reference_number: toInvoice ? q.quotation_number : '',
    place_of_supply: q.snapshot?.customer?.state || s.state, payment_terms: toInvoice ? s.default_payment_terms : '', subject: toInvoice ? '' : q.subject,
    billing_mode: q.billing_mode, tax_mode: q.tax_mode, tax_type: q.tax_type, line_discount_type: q.line_discount_type, discount_type: q.discount_type,
    discount_value: q.discount_value, charges: mergeCharges(q.charges, s.default_tax_rate), deductions: defaultDeductions(), round_off_enabled: q.round_off_enabled,
    stage_details: q.stage_details ?? {}, ra_details: {}, advance_paid: 0, previous_payments: 0, amount_paid: 0,
    items: (q.items ?? []).map((it) => ({ ...it, key: uid(), id: undefined })),
    notes: q.notes, internal_notes: '', terms: toInvoice ? s.terms_invoice : q.terms, pdf_options: q.pdf_options ?? {},
    source_quotation_id: toInvoice ? q.id : null,
  };
};

export const companySnapshot = (s: CompanySettings): CompanySnapshot => {
  const { id, logo_url, signature_url, stamp_url, pdf_settings, updated_at, invoice_next_number, quotation_next_number, estimate_next_number, receipt_next_number, ...rest } = s;
  return rest;
};

const pickCustomer = (c?: Customer) => (c ? { name: c.name, phone: c.phone, email: c.email, address: c.address, state: c.state, gstin: c.gstin, customer_type: c.customer_type } : undefined);
const pickProject = (p?: Project) => (p ? { project_name: p.project_name, project_code: p.project_code, location: p.location, project_type: p.project_type } : undefined);

type Built = { invoice?: Invoice; quotation?: Quotation; items: LineItem[] };

export function DocumentEditor({ kind, initial, existing, restoreKey }: { kind: DocKind; initial: Draft; existing?: Invoice | Quotation | null; restoreKey?: string }) {
  const router = useRouter();
  const { isAdmin } = useAuth();
  const { settings, customers, projects, invoices, quotations, customerById, projectById, refresh } = useData();
  const [draft, setDraft] = useState<Draft>(initial);
  const [saving, setSaving] = useState<null | 'draft' | 'issue' | 'autosave'>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [lastSaved, setLastSaved] = useState<string | null>(existing?.updated_at ?? null);
  const [preview, setPreview] = useState<PdfJob | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [designOpen, setDesignOpen] = useState(false);
  const [restore, setRestore] = useState<{ savedAt: string; draft: Draft } | null>(null);
  const savedJson = useRef(JSON.stringify(initial));
  const isInvoice = kind === 'invoice';
  const localKey = `sarathi:draft:${kind}`;

  const set = useCallback((patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch })), []);
  const customer = draft.customer_id ? customerById.get(draft.customer_id) : undefined;
  const project = draft.project_id ? projectById.get(draft.project_id) : undefined;
  const isRa = isInvoice && RA_TYPES.includes(draft.invoice_type);
  const issued = Boolean(existing && existing.status !== 'Draft');
  const pdfOptions = useMemo(() => optionsFor(settings, draft.pdf_options), [settings, draft.pdf_options]);

  const calc = useMemo(() => computeDocument({ ...draft, deductions: isInvoice ? draft.deductions : [], ra_details: draft.ra_details }), [draft, isInvoice]);

  const nextNumberPreview = useMemo(() => {
    const [prefix, seq] = isInvoice ? [settings.invoice_prefix, settings.invoice_next_number] : kind === 'quotation' ? [settings.quotation_prefix, settings.quotation_next_number] : [settings.estimate_prefix, settings.estimate_next_number];
    return formatDocumentNumber(settings.number_format, prefix, seq, settings.number_padding, draft.date || todayISO());
  }, [settings, kind, isInvoice, draft.date]);

  // -------- local recovery for brand-new documents --------
  useEffect(() => {
    if (initial.id || !restoreKey) return;
    try {
      const raw = localStorage.getItem(localKey);
      if (raw) {
        const parsed = JSON.parse(raw) as { savedAt: string; draft: Draft; restoreKey: string };
        if (parsed.restoreKey === restoreKey && JSON.stringify(parsed.draft) !== JSON.stringify(initial)) setRestore(parsed);
      }
    } catch { /* storage unavailable */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (draft.id || !restoreKey) return;
    const t = setTimeout(() => {
      try {
        if (JSON.stringify(draft) !== savedJson.current) localStorage.setItem(localKey, JSON.stringify({ savedAt: new Date().toISOString(), draft, restoreKey }));
      } catch { /* ignore */ }
    }, 700);
    return () => clearTimeout(t);
  }, [draft, localKey, restoreKey]);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (JSON.stringify(draft) !== savedJson.current) { e.preventDefault(); e.returnValue = ''; }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [draft]);

  // -------- smart defaults when customer / type change --------
  const pickCustomerId = (id: string | null) => {
    const c = id ? customerById.get(id) : undefined;
    const patch: Partial<Draft> = { customer_id: id };
    if (draft.project_id && projectById.get(draft.project_id)?.customer_id !== id) patch.project_id = null;
    if (c) {
      patch.place_of_supply = c.state || settings.state;
      if (draft.tax_mode !== 'none') patch.tax_type = c.state && settings.state && c.state !== settings.state ? 'IGST' : 'CGST_SGST';
    }
    set(patch);
  };

  const raSuggestion = useMemo(() => {
    if (!isRa || !draft.project_id) return null;
    const previous = invoices.filter((i) => i.project_id === draft.project_id && i.id !== draft.id && RA_TYPES.includes(i.invoice_type) && i.status !== 'Cancelled' && i.status !== 'Draft');
    return { count: previous.length, amount: round2(previous.reduce((s, i) => s + i.taxable_amount, 0)), next: `RA-${String(previous.length + 1).padStart(2, '0')}` };
  }, [isRa, draft.project_id, draft.id, invoices]);

  const stageBilled = useMemo(() => {
    if (draft.billing_mode !== 'stage' || !draft.project_id) return null;
    const prev = invoices.filter((i) => i.project_id === draft.project_id && i.id !== draft.id && i.billing_mode === 'stage' && i.status !== 'Cancelled');
    return { count: prev.length, amount: prev.reduce((s, i) => s + i.subtotal, 0) };
  }, [draft.billing_mode, draft.project_id, draft.id, invoices]);

  const setMode = (mode: BillingMode) => {
    if (mode === draft.billing_mode) return;
    const hasContent = draft.items.some((i) => i.description.trim() || i.rate);
    const items = hasContent ? draft.items.map((i) => ({ ...i, item_type: mode, unit: mode === 'stage' ? '%' : i.unit === '%' ? 'Nos' : i.unit })) : [blankItem(mode, settings.default_tax_rate)];
    set({ billing_mode: mode, items, stage_details: mode === 'stage' ? { contract_value: draft.stage_details.contract_value || project?.estimated_budget || 0 } : draft.stage_details });
  };

  // -------- build / validate --------
  const build = useCallback((status: string): Built => {
    const lines = calc.lines;
    const items: LineItem[] = draft.items.map((it, i) => ({ ...it, position: i + 1, quantity: lines[i]?.quantity ?? it.quantity, rate: lines[i]?.rate ?? it.rate, amount: lines[i]?.net ?? 0, discount: draft.billing_mode === 'measurement' || draft.billing_mode === 'stage' ? 0 : it.discount }));
    const keepCompany = issued && existing?.snapshot?.company;
    const snapshot = { company: keepCompany ? existing!.snapshot.company : companySnapshot(settings), customer: pickCustomer(customer), project: pickProject(project) };
    const totals = {
      subtotal: calc.subtotal, charges_total: calc.charges_total, discount_total: calc.discount_total, taxable_amount: calc.taxable_amount,
      cgst_total: calc.cgst_total, sgst_total: calc.sgst_total, igst_total: calc.igst_total, tax_total: calc.tax_total, round_off: calc.round_off,
      grand_total: calc.grand_total, tax_breakdown: calc.tax_breakdown,
    };
    const common = {
      id: draft.id ?? '', customer_id: draft.customer_id, project_id: draft.project_id, billing_mode: draft.billing_mode, tax_mode: draft.tax_mode, tax_type: draft.tax_type,
      line_discount_type: draft.line_discount_type, discount_type: draft.discount_type, discount_value: draft.discount_value,
      charges: draft.charges.filter((c) => c.amount !== 0 || !defaultCharges(0).some((d) => d.label === c.label)), round_off_enabled: draft.round_off_enabled,
      stage_details: draft.billing_mode === 'stage' ? draft.stage_details : {}, notes: draft.notes, internal_notes: draft.internal_notes, terms: draft.terms,
      pdf_options: draft.pdf_options, snapshot, created_by: null, created_at: existing?.created_at ?? '', updated_at: '', ...totals,
    };
    if (isInvoice) {
      const inv: Invoice = {
        ...common, invoice_number: draft.number.trim() || nextNumberPreview, invoice_date: draft.date, due_date: draft.secondary_date || null,
        invoice_type: draft.invoice_type, status: status as Invoice['status'], work_order_number: draft.work_order_number, reference_number: draft.reference_number,
        place_of_supply: draft.place_of_supply, payment_terms: draft.payment_terms, deductions: draft.deductions.filter((d) => d.value > 0),
        ra_details: isRa ? draft.ra_details : {}, advance_paid: draft.advance_paid, previous_payments: draft.previous_payments,
        deductions_total: calc.deductions_total, net_payable: calc.net_payable, amount_paid: draft.amount_paid, balance_due: calc.balance_due,
        source_quotation_id: draft.source_quotation_id, sent_at: null, last_reminder_at: null, cancelled_at: null, cancelled_by: null, cancel_reason: '',
      };
      return { invoice: inv, items };
    }
    const q: Quotation = {
      ...common, doc_kind: kind === 'estimate' ? 'estimate' : 'quotation', quotation_number: draft.number.trim() || nextNumberPreview, quotation_date: draft.date,
      valid_until: draft.secondary_date || null, subject: draft.subject, status: status as QuotationStatus, converted_invoice_id: null,
    };
    return { quotation: q, items };
  }, [calc, draft, settings, customer, project, isInvoice, isRa, issued, existing, kind, nextNumberPreview]);

  const validate = (intent: 'draft' | 'issue') => {
    const errs: string[] = [];
    if (!draft.date) errs.push('Enter the document date.');
    if (draft.secondary_date && draft.date && draft.secondary_date < draft.date) errs.push(isInvoice ? 'Due date cannot be before the invoice date.' : 'Valid-until date cannot be before the quotation date.');
    if (draft.number.trim()) {
      const clash = isInvoice
        ? invoices.some((i) => i.invoice_number.toLowerCase() === draft.number.trim().toLowerCase() && i.id !== draft.id)
        : quotations.some((q) => q.quotation_number.toLowerCase() === draft.number.trim().toLowerCase() && q.id !== draft.id);
      if (clash) errs.push(`Number ${draft.number.trim()} is already used.`);
    }
    const filled = draft.items.filter((i) => i.description.trim() || i.rate || (i.quantity && draft.billing_mode !== 'standard'));
    if (filled.some((i) => !i.description.trim())) errs.push('Every line item needs a description.');
    if (draft.billing_mode === 'stage') {
      if (!(Number(draft.stage_details.contract_value) > 0)) errs.push('Enter the total contract value for stage-wise billing.');
      const total = draft.items.reduce((s, i) => s + (Number(i.quantity) || 0), 0);
      if (total > 100) errs.push('Stage percentages in this bill add up to more than 100%.');
    }
    if (intent === 'issue') {
      if (!draft.customer_id) errs.push('Select a customer.');
      if (!filled.length || calc.grand_total <= 0) errs.push('Add at least one line item with an amount.');
      if (isInvoice && draft.advance_paid + draft.previous_payments > calc.net_payable + 0.01) errs.push('Advance and previous payments are more than the net payable amount.');
    }
    return errs;
  };

  const save = async (intent: 'draft' | 'issue' | 'autosave') => {
    if (saving) return;
    const errs = validate(intent === 'issue' ? 'issue' : 'draft');
    if (errs.length) {
      if (intent === 'autosave') return;
      setErrors(errs);
      toast.error(errs[0]);
      return;
    }
    setErrors([]);
    const status = intent === 'issue' && draft.status === 'Draft' ? 'Sent' : draft.status;
    const built = build(status);
    const cleanItems = built.items.filter((i) => i.description.trim() || i.rate || i.quantity).map((it, i) => ({
      position: i + 1, item_type: it.item_type, description: it.description.trim(), hsn_sac: it.hsn_sac.trim(), unit: it.unit.trim(), quantity: it.quantity, rate: it.rate,
      discount: it.discount, tax_rate: it.tax_rate, exempt: it.exempt, length: it.length, breadth: it.breadth, height: it.height, nos: it.nos, prev_quantity: it.prev_quantity, amount: it.amount,
    }));
    setSaving(intent);
    try {
      let id: string;
      let number: string;
      if (isInvoice) {
        const { id: _i, created_at, updated_at, created_by, amount_paid, balance_due, sent_at, last_reminder_at, cancelled_at, cancelled_by, cancel_reason, ...payload } = built.invoice!;
        const saved = await saveInvoiceRpc({ ...payload, id: draft.id ?? null, invoice_number: draft.number.trim() || null }, cleanItems);
        id = saved.id; number = saved.invoice_number;
        await refresh('invoices', 'settings', 'quotations');
      } else {
        const { id: _i, created_at, updated_at, created_by, converted_invoice_id, ...payload } = built.quotation!;
        const saved = await saveQuotationRpc({ ...payload, id: draft.id ?? null, quotation_number: draft.number.trim() || null }, cleanItems);
        id = saved.id; number = saved.quotation_number;
        await refresh('quotations', 'settings');
      }
      // Keep any edits typed while the save was in flight; mark only the saved snapshot as clean.
      savedJson.current = JSON.stringify({ ...draft, id, number, status });
      setDraft((current) => ({ ...current, id, number, status }));
      setLastSaved(new Date().toISOString());
      try { localStorage.removeItem(localKey); } catch { /* ignore */ }
      if (intent === 'autosave') return;
      toast.success(intent === 'issue' ? `${LABEL[kind]} ${number} saved` : `Draft ${number} saved`);
      if (intent === 'issue') router.push(`${BASE_PATH[kind]}/${id}`);
      else if (!draft.id) router.replace(`${BASE_PATH[kind]}/${id}/edit`);
    } catch (e) {
      const msg = friendlyError(e);
      if (intent !== 'autosave') { setErrors([msg]); toast.error(msg); }
    } finally {
      setSaving(null);
    }
  };

  // -------- autosave existing drafts to the database --------
  useEffect(() => {
    if (!draft.id || draft.status !== 'Draft') return;
    const json = JSON.stringify(draft);
    if (json === savedJson.current) return;
    const t = setTimeout(() => { void save('autosave'); }, 4000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  const openPreview = async () => {
    setPreviewBusy(true);
    try {
      const built = build(draft.status);
      const bytes = built.invoice
        ? await generateInvoicePdf(built.invoice, built.items, settings, customer, project)
        : await generateQuotationPdf(built.quotation!, built.items, settings, customer, project);
      const number = built.invoice?.invoice_number ?? built.quotation!.quotation_number;
      setPreview({ bytes, filename: `${slug(number)}.pdf`, share: { phone: customer?.phone, message: `${LABEL[kind]} ${number} from ${settings.company_name} for ${inr(calc.grand_total)}.`, path: `${kind}s/${draft.id ?? 'unsaved'}/${slug(number)}.pdf` } });
      setPreviewOpen(true);
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setPreviewBusy(false);
    }
  };

  const dirty = JSON.stringify(draft) !== savedJson.current;
  const lockedForStaff = issued && !isAdmin && isInvoice;
  const cancelled = existing?.status === 'Cancelled';

  if (lockedForStaff || cancelled) {
    return (
      <Card className="mx-auto max-w-lg p-8 text-center">
        <AlertCircle className="mx-auto mb-3 h-8 w-8 text-brand-orange" />
        <h2 className="text-lg font-semibold">This {LABEL[kind].toLowerCase()} can&apos;t be edited</h2>
        <p className="mt-1 text-sm text-muted-foreground">{cancelled ? 'Cancelled documents are kept unchanged for the audit trail.' : 'Issued invoices can only be edited by an administrator. You can duplicate it instead.'}</p>
        <button onClick={() => router.push(`${BASE_PATH[kind]}/${existing?.id}`)} className="mt-5 h-10 rounded-xl bg-brand-navy px-5 text-sm font-semibold text-white">Back to {LABEL[kind].toLowerCase()}</button>
      </Card>
    );
  }

  // ---------------------------------------------------------------------------
  // Summary panel (shared by desktop sidebar and mobile sheet)
  // ---------------------------------------------------------------------------
  const oneRate = calc.tax_breakdown.filter((b) => b.tax > 0);
  const singleRate = oneRate.length === 1 ? oneRate[0].rate : null;
  const Summary = (
    <div className="space-y-4">
      <div>
        <KeyValue label={draft.tax_mode === 'inclusive' ? 'Subtotal (incl. GST)' : 'Subtotal'} value={inr(calc.subtotal)} />
        {calc.charges.map((c) => <KeyValue key={c.key} label={c.label} value={inr(c.amount)} />)}
        {calc.discount_total > 0 && <KeyValue label="Discount" value={`−${inr(calc.discount_total)}`} />}
        {draft.tax_mode !== 'none' && (
          <>
            <KeyValue label="Taxable value" value={inr(calc.taxable_amount)} />
            {draft.tax_type === 'IGST'
              ? <KeyValue label={`IGST${singleRate !== null ? ` @ ${singleRate}%` : ''}`} value={inr(calc.igst_total)} />
              : <><KeyValue label={`CGST${singleRate !== null ? ` @ ${singleRate / 2}%` : ''}`} value={inr(calc.cgst_total)} /><KeyValue label={`SGST${singleRate !== null ? ` @ ${singleRate / 2}%` : ''}`} value={inr(calc.sgst_total)} /></>}
          </>
        )}
        {calc.round_off !== 0 && <KeyValue label="Round off" value={calc.round_off.toFixed(2)} />}
      </div>
      <div className="rounded-xl bg-brand-navy px-4 py-3 text-white">
        <div className="flex items-center justify-between"><span className="text-sm text-white/70">{isInvoice ? 'Grand total' : 'Total amount'}</span><span className="num text-xl font-semibold">{inr(calc.grand_total)}</span></div>
        <p className="mt-1 text-[11px] leading-snug text-white/60">{amountInWords(calc.grand_total)}</p>
      </div>
      {isInvoice && (calc.deductions.length > 0 || calc.advance_paid > 0 || calc.previous_payments > 0 || calc.amount_paid > 0) && (
        <div>
          {calc.deductions.map((d) => <KeyValue key={d.key} label={`Less ${d.label}`} value={`−${inr(d.amount)}`} />)}
          {calc.deductions.length > 0 && <KeyValue label="Net payable" value={inr(calc.net_payable)} strong />}
          {calc.advance_paid > 0 && <KeyValue label="Advance received" value={`−${inr(calc.advance_paid)}`} />}
          {calc.previous_payments > 0 && <KeyValue label="Previous payments" value={`−${inr(calc.previous_payments)}`} />}
          {calc.amount_paid > 0 && <KeyValue label="Payments received" value={`−${inr(calc.amount_paid)}`} />}
          <div className="mt-2 flex items-center justify-between rounded-xl bg-brand-orange-soft px-4 py-2.5"><span className="text-sm font-medium text-brand-orange-dark">Balance due</span><span className="num text-lg font-semibold text-brand-orange-dark">{inr(calc.balance_due)}</span></div>
        </div>
      )}
      {errors.length > 0 && (
        <div className="space-y-1 rounded-xl bg-red-50 p-3 text-sm text-red-700">{errors.map((e) => <p key={e} className="flex gap-2"><AlertCircle size={15} className="mt-0.5 shrink-0" />{e}</p>)}</div>
      )}
      <div className="grid gap-2">
        <button onClick={openPreview} disabled={previewBusy} className="flex h-11 items-center justify-center gap-2 rounded-xl border bg-white text-sm font-semibold text-brand-ink hover:bg-slate-50">{previewBusy ? <Loader2 size={16} className="animate-spin" /> : <Eye size={16} />} Preview PDF</button>
        {draft.status === 'Draft' && <button onClick={() => save('draft')} disabled={!!saving} className="flex h-11 items-center justify-center gap-2 rounded-xl border bg-white text-sm font-semibold text-brand-ink hover:bg-slate-50 disabled:opacity-60">{saving === 'draft' ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Save draft</button>}
        <button onClick={() => save('issue')} disabled={!!saving} className="flex h-12 items-center justify-center gap-2 rounded-xl bg-brand-orange text-sm font-semibold text-white shadow-md shadow-brand-orange/30 hover:bg-brand-orange-dark disabled:opacity-60">
          {saving === 'issue' ? <Loader2 size={16} className="animate-spin" /> : draft.status === 'Draft' ? <Send size={16} /> : <CheckCircle2 size={16} />}
          {draft.status === 'Draft' ? `Save & ${isInvoice ? 'issue invoice' : `finalise ${LABEL[kind].toLowerCase()}`}` : 'Save changes'}
        </button>
      </div>
      <p className="text-center text-xs text-muted-foreground">
        {saving === 'autosave' ? 'Autosaving…' : dirty ? (draft.id && draft.status === 'Draft' ? 'Unsaved changes · autosaves in a moment' : 'Unsaved changes') : lastSaved ? `All changes saved · ${relativeTime(lastSaved)}` : 'Draft is kept on this device until saved'}
      </p>
    </div>
  );

  const numberLabel = isInvoice ? 'Invoice number' : kind === 'quotation' ? 'Quotation number' : 'Estimate number';

  return (
    <div className="animate-in-up">
      <div className="mb-5 flex items-center gap-3">
        <button onClick={() => router.back()} className="grid h-10 w-10 place-items-center rounded-xl border bg-white hover:bg-slate-50" aria-label="Back"><ArrowLeft size={18} /></button>
        <div className="min-w-0">
          <p className="label-eyebrow text-brand-orange">{draft.id ? `Edit ${LABEL[kind].toLowerCase()}` : `New ${LABEL[kind].toLowerCase()}`}</p>
          <h1 className="truncate text-xl font-semibold tracking-tight text-brand-ink sm:text-2xl">{draft.number || nextNumberPreview}{!draft.number && <span className="ml-2 text-sm font-normal text-muted-foreground">(auto)</span>}</h1>
        </div>
      </div>

      {restore && (
        <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900 sm:flex-row sm:items-center sm:justify-between">
          <span>You have an unsaved {LABEL[kind].toLowerCase()} from {relativeTime(restore.savedAt)}. Restore it?</span>
          <div className="flex gap-2">
            <button onClick={() => { setDraft(restore.draft); setRestore(null); }} className="h-9 rounded-lg bg-sky-700 px-4 font-semibold text-white">Restore</button>
            <button onClick={() => { try { localStorage.removeItem(localKey); } catch { /* ignore */ } setRestore(null); }} className="h-9 rounded-lg px-3 font-medium hover:bg-sky-100">Discard</button>
          </div>
        </div>
      )}
      {issued && isInvoice && <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">You are editing an issued invoice as an administrator. The change is recorded in the audit history, and the original company details on the bill are preserved.</div>}

      <div className="grid gap-5 min-[1700px]:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-5">
          {/* Document details */}
          <Card>
            <CardTitle title="Document details" icon={FileText} />
            <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
              {isInvoice && (
                <Field label="Invoice type" className="sm:col-span-2">
                  <SelectNative value={draft.invoice_type} onChange={(e) => set({ invoice_type: e.target.value })}>{INVOICE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.value}</option>)}</SelectNative>
                </Field>
              )}
              {!isInvoice && (
                <Field label="Status" className="sm:col-span-2">
                  <SelectNative value={draft.status} onChange={(e) => set({ status: e.target.value })}>{QUOTATION_STATUSES.filter((s) => s !== 'Converted' || draft.status === 'Converted').map((s) => <option key={s}>{s}</option>)}</SelectNative>
                </Field>
              )}
              <Field label={numberLabel} className="sm:col-span-2" hint={draft.id ? undefined : 'Leave blank to use the next automatic number'}>
                <TextInput value={draft.number} onChange={(e) => set({ number: e.target.value })} placeholder={nextNumberPreview} disabled={issued && !isAdmin} />
              </Field>
              <Field label={isInvoice ? 'Invoice date' : 'Date'} required><TextInput type="date" value={draft.date} onChange={(e) => set({ date: e.target.value })} /></Field>
              <Field label={isInvoice ? 'Due date' : 'Valid until'}>
                <TextInput type="date" value={draft.secondary_date ?? ''} min={draft.date} onChange={(e) => set({ secondary_date: e.target.value || null })} />
              </Field>
              <div className="flex flex-wrap items-end gap-1.5 sm:col-span-2">
                {(isInvoice ? [0, 7, 15, 30, 45] : [7, 15, 30, 60]).map((d) => (
                  <button key={d} type="button" onClick={() => set({ secondary_date: addDays(draft.date, d) })} className={cn('h-8 rounded-lg border px-2.5 text-xs font-medium hover:bg-slate-50', draft.secondary_date === addDays(draft.date, d) && 'border-brand-navy bg-brand-navy/5 text-brand-navy')}>
                    {d === 0 ? 'On receipt' : `${d} days`}
                  </button>
                ))}
              </div>
              {!isInvoice && <Field label="Subject" className="sm:col-span-2 lg:col-span-4"><TextInput value={draft.subject} onChange={(e) => set({ subject: e.target.value })} placeholder="e.g. Quotation for construction of G+1 residence" /></Field>}
            </div>
          </Card>

          {/* Customer & project */}
          <Card>
            <CardTitle title="Customer & project" icon={Building2} />
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <Field label="Customer" required><CustomerPicker value={draft.customer_id} onChange={pickCustomerId} /></Field>
              <Field label="Project"><ProjectPicker value={draft.project_id} customerId={draft.customer_id} onChange={(id) => { const p = id ? projectById.get(id) : undefined; set({ project_id: id, ...(p && !draft.customer_id ? { customer_id: p.customer_id } : {}) }); }} /></Field>
              {customer && (
                <div className="rounded-xl bg-slate-50 p-3 text-sm sm:col-span-2">
                  <p className="font-medium text-brand-ink">{customer.name}</p>
                  <p className="text-muted-foreground">{[customer.address, customer.phone, customer.gstin && `GSTIN ${customer.gstin}`].filter(Boolean).join(' · ') || 'No address on file'}</p>
                  {project && <p className="mt-1 text-muted-foreground">Project: {project.project_name} ({project.project_code}){project.location ? ` · ${project.location}` : ''}</p>}
                </div>
              )}
              {isInvoice && (
                <>
                  <Field label="Work order number"><TextInput value={draft.work_order_number} onChange={(e) => set({ work_order_number: e.target.value })} placeholder="Optional" /></Field>
                  <Field label="Reference number"><TextInput value={draft.reference_number} onChange={(e) => set({ reference_number: e.target.value })} placeholder="PO / quotation ref" /></Field>
                  <Field label="Place of supply"><SelectNative value={draft.place_of_supply} onChange={(e) => set({ place_of_supply: e.target.value })}>{INDIAN_STATES.map((s) => <option key={s}>{s}</option>)}</SelectNative></Field>
                  <Field label="Payment terms"><TextInput value={draft.payment_terms} onChange={(e) => set({ payment_terms: e.target.value })} placeholder="e.g. 50% advance, balance on completion" /></Field>
                </>
              )}
            </div>
          </Card>

          {/* Items */}
          <Card>
            <CardTitle title="Billing items" icon={ClipboardList} description="Add unlimited rows. Long descriptions wrap automatically in the PDF." />
            <div className="space-y-5 p-4 sm:p-5">
              <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
                <Segmented value={draft.billing_mode} onChange={setMode} className="w-full lg:w-auto" options={[
                  { value: 'standard', label: <span className="flex items-center justify-center gap-1.5"><Calculator size={14} className="hidden sm:block" />Standard</span> },
                  { value: 'measurement', label: <span className="flex items-center justify-center gap-1.5"><Ruler size={14} className="hidden sm:block" />Measurement</span> },
                  { value: 'stage', label: <span className="flex items-center justify-center gap-1.5"><Layers size={14} className="hidden sm:block" />Stage-wise</span> },
                ]} />
                <Segmented value={draft.tax_mode} onChange={(v) => set({ tax_mode: v })} className="w-full lg:w-auto" options={[
                  { value: 'exclusive', label: 'GST extra' }, { value: 'inclusive', label: 'GST inclusive' }, { value: 'none', label: 'Non-GST' },
                ]} />
                {draft.tax_mode !== 'none' && <Segmented value={draft.tax_type} onChange={(v) => set({ tax_type: v })} className="w-full lg:w-auto" options={[{ value: 'CGST_SGST', label: 'CGST + SGST' }, { value: 'IGST', label: 'IGST' }]} />}
                {draft.billing_mode === 'standard' && <Segmented value={draft.line_discount_type} onChange={(v) => set({ line_discount_type: v })} size="sm" className="w-full lg:w-auto" options={[{ value: 'percent', label: 'Disc %' }, { value: 'amount', label: 'Disc ₹' }]} />}
              </div>
              {customer && settings.state && customer.state && customer.state !== settings.state && draft.tax_mode !== 'none' && draft.tax_type !== 'IGST' && (
                <p className="flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800"><AlertCircle size={14} /> Customer is in {customer.state} — inter-state supply usually attracts IGST. <button className="font-semibold underline" onClick={() => set({ tax_type: 'IGST' })}>Switch to IGST</button></p>
              )}
              {draft.billing_mode === 'measurement' && <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-muted-foreground">Measurement book: quantity = Nos × Length × Breadth × Height/Depth. Leave a dimension blank to skip it (e.g. area = L × B, running length = L).</p>}
              {draft.billing_mode === 'stage' && (
                <div className="grid gap-3 rounded-xl bg-slate-50 p-3 sm:grid-cols-[220px_1fr] sm:items-end">
                  <Field label="Total contract value (₹)" required><NumberInput value={draft.stage_details.contract_value ?? 0} onValue={(v) => set({ stage_details: { ...draft.stage_details, contract_value: v ?? 0 } })} allowEmpty placeholder="e.g. 2500000" /></Field>
                  <p className="text-xs text-muted-foreground">Each stage is billed as a percentage of the contract value.{stageBilled && stageBilled.count > 0 && <> Previously billed on this project: <b>{inr(stageBilled.amount)}</b> in {stageBilled.count} bill{stageBilled.count > 1 ? 's' : ''}{draft.stage_details.contract_value ? ` (${((stageBilled.amount / Number(draft.stage_details.contract_value)) * 100).toFixed(1)}%)` : ''}.</>} This bill: <b>{draft.items.reduce((s, i) => s + (Number(i.quantity) || 0), 0)}%</b>.</p>
                </div>
              )}
              <ItemsEditor items={draft.items} lines={calc.lines} mode={draft.billing_mode} taxMode={draft.tax_mode} lineDiscountType={draft.line_discount_type}
                defaultTaxRate={settings.default_tax_rate} showPrevQty={isRa && Boolean(draft.ra_details.show_quantities)} onChange={(items) => set({ items })} />
            </div>
          </Card>

          {/* RA */}
          {isRa && (
            <Card>
              <CardTitle title="Running account details" icon={Layers} description="Cumulative work value for this RA / final bill" />
              <div className="grid gap-4 p-5 sm:grid-cols-3">
                <Field label="RA bill number"><TextInput value={draft.ra_details.ra_number ?? ''} onChange={(e) => set({ ra_details: { ...draft.ra_details, ra_number: e.target.value } })} placeholder={raSuggestion?.next ?? 'RA-01'} /></Field>
                <Field label="Work value up to previous bill (₹)" hint={raSuggestion && raSuggestion.count > 0 ? <button type="button" className="font-medium text-brand-navy-3 underline" onClick={() => set({ ra_details: { ...draft.ra_details, previous_bill_amount: raSuggestion.amount, ra_number: draft.ra_details.ra_number || raSuggestion.next } })}>Use {inr(raSuggestion.amount)} from {raSuggestion.count} earlier bill(s)</button> : 'Excluding GST'}>
                  <NumberInput value={draft.ra_details.previous_bill_amount ?? 0} onValue={(v) => set({ ra_details: { ...draft.ra_details, previous_bill_amount: v ?? 0 } })} allowEmpty placeholder="0" />
                </Field>
                <div className="rounded-xl bg-slate-50 p-3 text-sm">
                  <KeyValue label="This bill" value={inr(calc.ra.current)} />
                  <KeyValue label="Cumulative" value={inr(calc.ra.cumulative)} strong />
                </div>
                <div className="sm:col-span-3"><Toggle checked={Boolean(draft.ra_details.show_quantities)} onChange={(v) => set({ ra_details: { ...draft.ra_details, show_quantities: v } })} label="Show previous / this bill / cumulative quantity columns" description="Classic RA bill format for measured items" /></div>
              </div>
            </Card>
          )}

          {/* Charges & discount */}
          <Card>
            <CardTitle title="Additional charges & discount" icon={Percent} />
            <div className="space-y-3 p-5">
              {draft.charges.map((c, i) => (
                <div key={c.key} className="grid grid-cols-[1fr_120px_36px] gap-2 sm:grid-cols-[1fr_160px_90px_36px]">
                  <TextInput value={c.label} onChange={(e) => set({ charges: draft.charges.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} />
                  <NumberInput value={c.amount} allowEmpty placeholder="₹ 0" onValue={(v) => set({ charges: draft.charges.map((x, j) => (j === i ? { ...x, amount: v ?? 0 } : x)) })} className="text-right" />
                  {draft.tax_mode !== 'none'
                    ? <input list="gst-rate-options" className="hidden h-10 rounded-xl border px-2 text-right text-sm sm:block" value={c.tax_rate} onChange={(e) => set({ charges: draft.charges.map((x, j) => (j === i ? { ...x, tax_rate: Number(e.target.value.replace(/[^\d.]/g, '')) || 0 } : x)) })} aria-label="GST %" title="GST %" />
                    : <span className="hidden sm:block" />}
                  <button type="button" onClick={() => set({ charges: draft.charges.filter((_, j) => j !== i) })} className="grid h-10 w-9 place-items-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label="Remove charge"><Trash2 size={15} /></button>
                </div>
              ))}
              <button type="button" onClick={() => set({ charges: [...draft.charges, { key: uid(), label: 'Other charges', amount: 0, tax_rate: settings.default_tax_rate }] })} className="flex items-center gap-1.5 text-sm font-medium text-brand-navy-3 hover:underline"><Plus size={15} /> Add charge</button>
              <div className="mt-2 grid gap-4 border-t pt-4 sm:grid-cols-[auto_1fr_auto] sm:items-end">
                <Field label="Overall discount"><Segmented value={draft.discount_type} onChange={(v) => set({ discount_type: v })} options={[{ value: 'amount', label: '₹ Amount' }, { value: 'percent', label: '% Percent' }]} /></Field>
                <Field label={draft.discount_type === 'percent' ? 'Discount %' : 'Discount ₹'} hint={calc.discount_total > 0 ? `${inr(calc.discount_total)} off, applied before GST` : undefined}><NumberInput value={draft.discount_value} allowEmpty placeholder="0" onValue={(v) => set({ discount_value: v ?? 0 })} /></Field>
                <div className="sm:pb-1"><Toggle checked={draft.round_off_enabled} onChange={(v) => set({ round_off_enabled: v })} label="Round off total" /></div>
              </div>
            </div>
          </Card>

          {isInvoice && (
            <Card>
              <CardTitle title="Deductions" icon={MinusCircle} description="Retention, TDS, advance recovery and other deductions reduce the net payable" />
              <div className="space-y-3 p-5">
                {draft.deductions.map((d, i) => {
                  const computed = calc.deductions.find((x) => x.key === d.key);
                  const update = (patch: Partial<Deduction>) => set({ deductions: draft.deductions.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
                  return (
                    <div key={d.key} className="grid grid-cols-2 gap-2 rounded-xl border p-3 sm:grid-cols-[1.4fr_110px_110px_150px_110px] sm:items-center sm:border-0 sm:p-0">
                      <TextInput value={d.label} onChange={(e) => update({ label: e.target.value })} className="col-span-2 sm:col-span-1" title={DEDUCTION_PRESETS[d.type]?.hint} />
                      <Segmented size="sm" value={d.mode} onChange={(v) => update({ mode: v })} options={[{ value: 'percent', label: '%' }, { value: 'amount', label: '₹' }]} />
                      <NumberInput value={d.value} allowEmpty placeholder="0" onValue={(v) => update({ value: v ?? 0 })} className="text-right" />
                      <SelectNative value={d.basis} disabled={d.mode === 'amount'} onChange={(e) => update({ basis: e.target.value as Deduction['basis'] })} className="text-xs"><option value="taxable">on taxable value</option><option value="total">on invoice total</option></SelectNative>
                      <span className="num text-right text-sm font-semibold text-red-600">{computed ? `−${inr(computed.amount)}` : '—'}</span>
                    </div>
                  );
                })}
                <button type="button" onClick={() => set({ deductions: [...draft.deductions, { key: uid(), type: 'other', label: 'Other deduction', mode: 'amount', value: 0, basis: 'total' }] })} className="flex items-center gap-1.5 text-sm font-medium text-brand-navy-3 hover:underline"><Plus size={15} /> Add deduction</button>
              </div>
            </Card>
          )}

          {isInvoice && (
            <Card>
              <CardTitle title="Advance & previous payments" icon={Wallet} description="Payments recorded later are added automatically" />
              <div className="grid gap-4 p-5 sm:grid-cols-3">
                <Field label="Advance received (₹)"><NumberInput value={draft.advance_paid} allowEmpty placeholder="0" onValue={(v) => set({ advance_paid: v ?? 0 })} /></Field>
                <Field label="Previous payments (₹)"><NumberInput value={draft.previous_payments} allowEmpty placeholder="0" onValue={(v) => set({ previous_payments: v ?? 0 })} /></Field>
                <div className="rounded-xl bg-brand-orange-soft p-3"><p className="text-xs text-brand-orange-dark">Balance due</p><p className="num text-lg font-semibold text-brand-orange-dark">{inr(calc.balance_due)}</p></div>
              </div>
            </Card>
          )}

          <Card>
            <CardTitle title="Notes & terms" icon={StickyNote} />
            <div className="grid gap-4 p-5">
              <Field label="Notes (printed)"><Textarea value={draft.notes} onChange={(e) => set({ notes: e.target.value })} rows={2} className="rounded-xl" placeholder="Message to the customer" /></Field>
              <Field label="Terms & conditions (printed)"><Textarea value={draft.terms} onChange={(e) => set({ terms: e.target.value })} rows={4} className="rounded-xl" /></Field>
              <Field label="Internal notes" hint="Visible to your team only — never printed"><Textarea value={draft.internal_notes} onChange={(e) => set({ internal_notes: e.target.value })} rows={2} className="rounded-xl" /></Field>
            </div>
          </Card>

          <Card>
            <button type="button" onClick={() => setDesignOpen(!designOpen)} className="flex w-full items-center justify-between px-5 py-4 text-left">
              <span className="flex items-center gap-3"><span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-navy/5 text-brand-navy"><Palette size={16} /></span><span><span className="block text-[15px] font-semibold text-brand-ink">PDF design for this document</span><span className="block text-xs text-muted-foreground">{pdfOptions.template === 'corporate' ? 'Construction Corporate' : pdfOptions.template} template · customise colours, fonts and fields</span></span></span>
              <ChevronDown size={18} className={cn('transition', designOpen && 'rotate-180')} />
            </button>
            {designOpen && <div className="border-t p-5"><DesignPanel value={pdfOptions} compact onChange={(patch) => set({ pdf_options: { ...pdfOptions, ...patch } })} /></div>}
          </Card>
        </div>

        <aside className="hidden min-[1700px]:block">
          <div className="sticky top-24"><Card className="p-5">{Summary}</Card></div>
        </aside>
      </div>

      {/* Mobile / tablet sticky total bar */}
      <div className="fixed inset-x-0 bottom-16 z-20 border-t bg-white/95 px-4 py-3 backdrop-blur-md lg:bottom-0 lg:left-[248px] min-[1700px]:hidden">
        <div className="mx-auto flex max-w-5xl items-center gap-3">
          <button onClick={() => setSummaryOpen(true)} className="min-w-0 flex-1 text-left">
            <span className="block text-[11px] text-muted-foreground">{isInvoice && calc.balance_due !== calc.grand_total ? 'Balance due' : 'Total'} · tap for details</span>
            <span className="num block truncate text-lg font-semibold text-brand-ink">{inr(isInvoice ? calc.balance_due : calc.grand_total)}</span>
          </button>
          <button onClick={openPreview} disabled={previewBusy} className="grid h-11 w-11 place-items-center rounded-xl border" aria-label="Preview PDF">{previewBusy ? <Loader2 size={17} className="animate-spin" /> : <Eye size={17} />}</button>
          <button onClick={() => save('issue')} disabled={!!saving} className="flex h-11 items-center gap-2 rounded-xl bg-brand-orange px-4 text-sm font-semibold text-white disabled:opacity-60">{saving === 'issue' ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}Save</button>
        </div>
      </div>
      <div className="h-20 min-[1700px]:hidden" />

      <Sheet open={summaryOpen} onOpenChange={setSummaryOpen}>
        <SheetContent side="bottom" className="max-h-[88vh] overflow-y-auto rounded-t-3xl">
          <SheetHeader className="mb-3 text-left"><SheetTitle>Summary</SheetTitle></SheetHeader>
          {Summary}
        </SheetContent>
      </Sheet>

      <PdfPreviewDialog open={previewOpen} onOpenChange={setPreviewOpen} title={`${LABEL[kind]} preview`} job={preview} />
    </div>
  );
}
