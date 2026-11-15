'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Building2, Database, Download, FileText, History, ImagePlus, KeyRound, Landmark, Loader2, Palette, Save, ShieldCheck, Upload, UserCheck, UserX, Users, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth, useData } from '@/components/providers';
import { ActivityTimeline } from '@/components/activity';
import { Card, CardTitle, ConfirmDialog, Field, LoadingPanel, NumberInput, PageHeader, SelectNative, StatusBadge, TextInput, Toggle } from '@/components/common';
import { DesignPanel } from '@/components/editor/design-panel';
import { PdfViewer } from '@/components/pdf-viewer';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { INDIAN_STATES, defaultCharges, uid } from '@/lib/constants';
import { computeDocument, storedTotals } from '@/lib/calc';
import { exportBackup, fetchAudit, friendlyError, restoreBackup, saveSettings, upsertRow } from '@/lib/data';
import { addDays, fmtDate, formatDocumentNumber, isValidEmail, isValidGstin, isValidPan, todayISO } from '@/lib/format';
import { prepareImage } from '@/lib/images';
import { generateInvoicePdf } from '@/lib/pdf/lazy';
import { optionsFor } from '@/lib/pdf/options';
import { downloadBytes } from '@/lib/share';
import { supabase } from '@/lib/supabase';
import type { AuditLog, CompanySettings, Invoice, LineItem, PdfOptions, Profile } from '@/lib/types';

const TABS = [
  { id: 'company', label: 'Company', icon: Building2 },
  { id: 'branding', label: 'Logo & signatures', icon: ImagePlus },
  { id: 'bank', label: 'Bank & UPI', icon: Landmark },
  { id: 'invoicing', label: 'Numbering, tax & terms', icon: FileText },
  { id: 'templates', label: 'Invoice templates', icon: Palette },
  { id: 'team', label: 'Team & access', icon: Users },
  { id: 'account', label: 'My account', icon: KeyRound },
  { id: 'data', label: 'Backup & restore', icon: Database },
  { id: 'activity', label: 'Audit log', icon: History },
] as const;
type TabId = (typeof TABS)[number]['id'];

const sampleItems = (rate: number): LineItem[] => [
  { key: 's1', position: 1, item_type: 'standard', description: 'Earthwork excavation for foundation including disposal of excavated earth within 50 m', hsn_sac: '995411', unit: 'Cu.m', quantity: 42.5, rate: 380, discount: 0, tax_rate: rate, exempt: false, length: null, breadth: null, height: null, nos: null, prev_quantity: 0, amount: 0 },
  { key: 's2', position: 2, item_type: 'standard', description: 'RCC M20 for footings, columns and plinth beam (excluding steel)', hsn_sac: '995411', unit: 'Cu.m', quantity: 18, rate: 6850, discount: 0, tax_rate: rate, exempt: false, length: null, breadth: null, height: null, nos: null, prev_quantity: 0, amount: 0 },
  { key: 's3', position: 3, item_type: 'standard', description: 'Brickwork in CM 1:6 for superstructure', hsn_sac: '995411', unit: 'Cu.m', quantity: 26, rate: 6200, discount: 0, tax_rate: rate, exempt: false, length: null, breadth: null, height: null, nos: null, prev_quantity: 0, amount: 0 },
];

function ImageSlot({ label, hint, value, onChange, disabled, maxWidth, maxHeight, removeWhite }: { label: string; hint: string; value: string; onChange: (v: string) => void; disabled?: boolean; maxWidth: number; maxHeight: number; removeWhite?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [clean, setClean] = useState(Boolean(removeWhite));
  return (
    <div className="rounded-2xl border p-4">
      <p className="text-sm font-semibold text-brand-ink">{label}</p>
      <p className="mb-3 text-xs text-muted-foreground">{hint}</p>
      <div className="grid h-32 place-items-center rounded-xl bg-[repeating-conic-gradient(#f1f5f9_0%_25%,#fff_0%_50%)] bg-[length:16px_16px] ring-1 ring-border">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {value ? <img src={value} alt={label} className="max-h-28 max-w-[90%] object-contain" /> : <ImagePlus className="text-slate-300" size={28} />}
      </div>
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={async (e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        setBusy(true);
        try { onChange(await prepareImage(file, { maxWidth, maxHeight, removeWhite: clean })); } catch (err) { toast.error(friendlyError(err)); } finally { setBusy(false); }
      }} />
      {removeWhite !== undefined && <label className="mt-3 flex items-center gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={clean} onChange={(e) => setClean(e.target.checked)} className="accent-brand-navy" />Make white background transparent</label>}
      <div className="mt-3 flex gap-2">
        <button type="button" disabled={disabled || busy} onClick={() => input.current?.click()} className="flex h-9 flex-1 items-center justify-center gap-2 rounded-lg bg-brand-navy text-sm font-semibold text-white disabled:opacity-50">{busy ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}{value ? 'Replace' : 'Upload'}</button>
        {value && <button type="button" disabled={disabled} onClick={() => onChange('')} className="grid h-9 w-9 place-items-center rounded-lg border text-slate-500 hover:bg-slate-50" aria-label="Remove"><X size={15} /></button>}
      </div>
    </div>
  );
}

function SettingsInner() {
  const params = useSearchParams();
  const { isAdmin, profile, refreshProfile } = useAuth();
  const { settings, profiles, refresh, loading } = useData();
  const [tab, setTab] = useState<TabId>((params.get('tab') as TabId) || 'company');
  const [form, setForm] = useState<CompanySettings>(settings);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<Uint8Array | null>(null);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [backupBusy, setBackupBusy] = useState<string | null>(null);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [fullName, setFullName] = useState(profile?.full_name ?? '');
  const [newPassword, setNewPassword] = useState('');

  useEffect(() => { setForm(settings); }, [settings]);
  useEffect(() => { setFullName(profile?.full_name ?? ''); }, [profile]);
  useEffect(() => { if (tab === 'activity') fetchAudit({ limit: 150 }).then(setLogs).catch((e) => toast.error(friendlyError(e))); }, [tab]);

  const set = (patch: Partial<CompanySettings>) => setForm((f) => ({ ...f, ...patch }));
  const pdf = useMemo(() => optionsFor(form, undefined), [form]);
  const setPdf = (patch: Partial<PdfOptions>) => set({ pdf_settings: { ...pdf, ...patch } });
  const dirty = JSON.stringify(form) !== JSON.stringify(settings);
  const readOnly = !isAdmin;

  // live template preview
  useEffect(() => {
    if (tab !== 'templates') return;
    const t = setTimeout(async () => {
      const items = sampleItems(form.default_tax_rate);
      const inv = {
        id: 'preview', invoice_number: formatDocumentNumber(form.number_format, form.invoice_prefix, form.invoice_next_number, form.number_padding, todayISO()), invoice_date: todayISO(), due_date: addDays(todayISO(), form.default_due_days),
        invoice_type: 'Standard Tax Invoice', status: 'Sent', customer_id: null, project_id: null, work_order_number: 'WO-1024', reference_number: '', place_of_supply: form.state, payment_terms: form.default_payment_terms,
        billing_mode: 'standard', tax_mode: form.default_tax_mode, tax_type: form.default_tax_type, line_discount_type: 'percent', discount_type: 'amount', discount_value: 0,
        charges: [{ ...defaultCharges(form.default_tax_rate)[0], amount: 2500, key: uid() }], deductions: [], round_off_enabled: form.round_off_enabled, stage_details: {}, ra_details: {},
        advance_paid: 50000, previous_payments: 0, amount_paid: 0, notes: 'Thank you for choosing us for your project.', internal_notes: '', terms: form.terms_invoice, pdf_options: {},
        snapshot: { customer: { name: 'Sample Customer Pvt. Ltd.', address: '12, Main Road, Tiruppur, Tamil Nadu 641601', phone: '98765 43210', gstin: '33AAACS1234K1Z2', state: 'Tamil Nadu' }, project: { project_name: 'Commercial Complex — Phase 1', project_code: 'PRJ-0001', location: 'Avinashi Road, Tiruppur', project_type: 'Commercial construction' } },
        source_quotation_id: null, sent_at: null, last_reminder_at: null, cancelled_at: null, cancelled_by: null, cancel_reason: '', created_by: null, created_at: '', updated_at: '',
      } as unknown as Invoice;
      const r = computeDocument({ ...inv, items });
      Object.assign(inv, storedTotals(r), { net_payable: r.net_payable, balance_due: r.balance_due, deductions_total: 0 });
      try { setPreview(await generateInvoicePdf(inv, items, form)); } catch (e) { toast.error(friendlyError(e)); }
    }, 450);
    return () => clearTimeout(t);
  }, [tab, form]);

  const save = async () => {
    if (!form.company_name.trim()) return toast.error('Company name is required');
    if (!isValidGstin(form.gstin)) return toast.error('GSTIN format looks incorrect');
    if (!isValidPan(form.pan)) return toast.error('PAN format looks incorrect');
    if (!isValidEmail(form.email)) return toast.error('Email address looks incorrect');
    if (!/\{SEQ\}/.test(form.number_format)) return toast.error('Number format must include {SEQ}');
    setSaving(true);
    try {
      await saveSettings({ ...form, gstin: form.gstin.toUpperCase().trim(), pan: form.pan.toUpperCase().trim() });
      await refresh('settings');
      toast.success('Settings saved — future documents will use these details');
    } catch (e) { toast.error(friendlyError(e)); } finally { setSaving(false); }
  };

  if (loading) return <LoadingPanel />;

  const numberPreview = (prefix: string, seq: number) => formatDocumentNumber(form.number_format, prefix, seq, form.number_padding, todayISO());

  return (
    <div className="animate-in-up">
      <PageHeader title="Settings" description={isAdmin ? 'Company profile, branding, numbering, templates and team access.' : 'You can view company settings. Only administrators can change them.'} />

      <div className="grid gap-5 lg:grid-cols-[230px_minmax(0,1fr)]">
        <Card className="h-fit p-2 lg:sticky lg:top-24">
          <div className="lg:hidden"><SelectNative value={tab} onChange={(e) => setTab(e.target.value as TabId)}>{TABS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</SelectNative></div>
          <nav className="hidden space-y-0.5 lg:block">
            {TABS.map((t) => (
              <button key={t.id} onClick={() => setTab(t.id)} className={cn('flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm transition', tab === t.id ? 'bg-brand-navy font-semibold text-white' : 'text-slate-600 hover:bg-slate-50')}>
                <t.icon size={16} className={tab === t.id ? 'text-brand-orange' : ''} />{t.label}
                {t.id === 'team' && profiles.some((p) => !p.active) && isAdmin && <span className="ml-auto h-2 w-2 rounded-full bg-brand-orange" />}
              </button>
            ))}
          </nav>
        </Card>

        <div className="min-w-0 space-y-5 pb-20">
          {tab === 'company' && (
            <Card>
              <CardTitle title="Company profile" description="Printed on every invoice, quotation and receipt." icon={Building2} />
              <fieldset disabled={readOnly} className="grid gap-4 p-5 sm:grid-cols-2">
                <Field label="Company name" required className="sm:col-span-2"><TextInput value={form.company_name} onChange={(e) => set({ company_name: e.target.value })} /></Field>
                <Field label="Business type" className="sm:col-span-2"><TextInput value={form.business_type} onChange={(e) => set({ business_type: e.target.value })} /></Field>
                <Field label="Address" className="sm:col-span-2"><Textarea value={form.address} onChange={(e) => set({ address: e.target.value })} rows={2} className="rounded-xl" /></Field>
                <Field label="State" hint="Used to decide CGST+SGST vs IGST"><SelectNative value={form.state} onChange={(e) => set({ state: e.target.value })}>{INDIAN_STATES.map((s) => <option key={s}>{s}</option>)}</SelectNative></Field>
                <Field label="Phone"><TextInput type="tel" value={form.phone} onChange={(e) => set({ phone: e.target.value })} placeholder="+91 …" /></Field>
                <Field label="Email"><TextInput type="email" value={form.email} onChange={(e) => set({ email: e.target.value })} /></Field>
                <Field label="Website"><TextInput value={form.website} onChange={(e) => set({ website: e.target.value })} placeholder="Optional" /></Field>
                <Field label="GSTIN"><TextInput value={form.gstin} maxLength={15} onChange={(e) => set({ gstin: e.target.value.toUpperCase() })} placeholder="33XXXXX0000X1Z5" /></Field>
                <Field label="PAN"><TextInput value={form.pan} maxLength={10} onChange={(e) => set({ pan: e.target.value.toUpperCase() })} /></Field>
                <Field label="Authorised signatory"><TextInput value={form.authorized_signatory} onChange={(e) => set({ authorized_signatory: e.target.value })} placeholder="Name printed under signature" /></Field>
                <Field label="Designation"><TextInput value={form.signatory_designation} onChange={(e) => set({ signatory_designation: e.target.value })} /></Field>
              </fieldset>
            </Card>
          )}

          {tab === 'branding' && (
            <Card>
              <CardTitle title="Logo, signature & stamp" description="Images are optimised automatically and embedded in every PDF." icon={ImagePlus} />
              <div className="grid gap-4 p-5 md:grid-cols-3">
                <ImageSlot label="Company logo" hint="Square or wide PNG/JPG works best" value={form.logo_url} onChange={(v) => set({ logo_url: v })} disabled={readOnly} maxWidth={600} maxHeight={600} />
                <ImageSlot label="Digital signature" hint="Sign on white paper and photograph it" value={form.signature_url} onChange={(v) => set({ signature_url: v })} disabled={readOnly} maxWidth={600} maxHeight={240} removeWhite />
                <ImageSlot label="Company stamp / seal" hint="Printed in the stamp area of invoices" value={form.stamp_url} onChange={(v) => set({ stamp_url: v })} disabled={readOnly} maxWidth={400} maxHeight={400} removeWhite />
              </div>
            </Card>
          )}

          {tab === 'bank' && (
            <Card>
              <CardTitle title="Bank & UPI" description="Shown in the payment section of invoices; UPI ID powers the scan-to-pay QR code." icon={Landmark} />
              <fieldset disabled={readOnly} className="grid gap-4 p-5 sm:grid-cols-2">
                <Field label="Bank name"><TextInput value={form.bank_name} onChange={(e) => set({ bank_name: e.target.value })} /></Field>
                <Field label="Account holder name"><TextInput value={form.bank_account_name} onChange={(e) => set({ bank_account_name: e.target.value })} /></Field>
                <Field label="Account number"><TextInput inputMode="numeric" value={form.bank_account_number} onChange={(e) => set({ bank_account_number: e.target.value.replace(/\s/g, '') })} /></Field>
                <Field label="IFSC"><TextInput value={form.bank_ifsc} maxLength={11} onChange={(e) => set({ bank_ifsc: e.target.value.toUpperCase() })} /></Field>
                <Field label="Branch"><TextInput value={form.bank_branch} onChange={(e) => set({ bank_branch: e.target.value })} /></Field>
                <Field label="UPI ID" hint="e.g. sarathi@okhdfcbank"><TextInput value={form.upi_id} onChange={(e) => set({ upi_id: e.target.value.trim() })} /></Field>
              </fieldset>
            </Card>
          )}

          {tab === 'invoicing' && (
            <>
              <Card>
                <CardTitle title="Document numbering" description="Numbers are allocated atomically by the database — no duplicates even with several users." icon={FileText} />
                <fieldset disabled={readOnly} className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
                  <Field label="Number format" className="sm:col-span-2" hint="Tokens: {PREFIX} {FY} {YYYY} {SEQ}"><TextInput value={form.number_format} onChange={(e) => set({ number_format: e.target.value })} /></Field>
                  <Field label="Sequence digits"><NumberInput value={form.number_padding} onValue={(v) => set({ number_padding: Math.min(8, Math.max(1, Math.round(v ?? 4))) })} /></Field>
                  <div />
                  {([['Invoice', 'invoice_prefix', 'invoice_next_number'], ['Quotation', 'quotation_prefix', 'quotation_next_number'], ['Estimate', 'estimate_prefix', 'estimate_next_number'], ['Receipt', 'receipt_prefix', 'receipt_next_number']] as const).map(([label, pk, nk]) => (
                    <div key={pk} className="rounded-xl border p-3">
                      <p className="mb-2 text-sm font-semibold">{label}</p>
                      <div className="grid grid-cols-2 gap-2">
                        <Field label="Prefix"><TextInput value={form[pk]} onChange={(e) => set({ [pk]: e.target.value.toUpperCase() } as Partial<CompanySettings>)} /></Field>
                        <Field label="Next no."><NumberInput value={form[nk]} onValue={(v) => set({ [nk]: Math.max(1, Math.round(v ?? 1)) } as Partial<CompanySettings>)} /></Field>
                      </div>
                      <p className="mt-2 truncate text-xs text-muted-foreground">Next: <b className="text-brand-ink">{numberPreview(form[pk], form[nk])}</b></p>
                    </div>
                  ))}
                </fieldset>
              </Card>
              <Card>
                <CardTitle title="Tax & payment defaults" />
                <fieldset disabled={readOnly} className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
                  <Field label="Default pricing"><SelectNative value={form.default_tax_mode} onChange={(e) => set({ default_tax_mode: e.target.value as CompanySettings['default_tax_mode'] })}><option value="exclusive">GST extra (exclusive)</option><option value="inclusive">GST inclusive</option><option value="none">Non-GST billing</option></SelectNative></Field>
                  <Field label="Default GST type"><SelectNative value={form.default_tax_type} onChange={(e) => set({ default_tax_type: e.target.value as CompanySettings['default_tax_type'] })}><option value="CGST_SGST">CGST + SGST (intra-state)</option><option value="IGST">IGST (inter-state)</option></SelectNative></Field>
                  <Field label="Default GST rate %"><NumberInput value={form.default_tax_rate} onValue={(v) => set({ default_tax_rate: Math.min(100, v ?? 0) })} /></Field>
                  <Field label="Currency" hint="Indian numbering (lakh / crore) with ₹ symbol"><TextInput value="₹ INR — Indian Rupee" disabled /></Field>
                  <Field label="Default due (days)"><NumberInput value={form.default_due_days} onValue={(v) => set({ default_due_days: Math.max(0, Math.round(v ?? 0)) })} /></Field>
                  <Field label="Quotation validity (days)"><NumberInput value={form.quotation_validity_days} onValue={(v) => set({ quotation_validity_days: Math.max(0, Math.round(v ?? 0)) })} /></Field>
                  <div className="sm:col-span-2 lg:col-span-3"><Toggle checked={form.round_off_enabled} onChange={(v) => set({ round_off_enabled: v })} label="Round off totals to the nearest rupee" /></div>
                  <Field label="Default payment terms" className="sm:col-span-2 lg:col-span-3"><TextInput value={form.default_payment_terms} onChange={(e) => set({ default_payment_terms: e.target.value })} /></Field>
                </fieldset>
              </Card>
              <Card>
                <CardTitle title="Default terms & conditions" description="Pre-filled on new documents; can be edited per document." />
                <fieldset disabled={readOnly} className="grid gap-4 p-5">
                  <Field label="Invoices"><Textarea rows={4} value={form.terms_invoice} onChange={(e) => set({ terms_invoice: e.target.value })} className="rounded-xl" /></Field>
                  <Field label="Quotations"><Textarea rows={4} value={form.terms_quotation} onChange={(e) => set({ terms_quotation: e.target.value })} className="rounded-xl" /></Field>
                  <Field label="Estimates"><Textarea rows={3} value={form.terms_estimate} onChange={(e) => set({ terms_estimate: e.target.value })} className="rounded-xl" /></Field>
                  <Field label="Receipt note"><TextInput value={form.receipt_note} onChange={(e) => set({ receipt_note: e.target.value })} /></Field>
                </fieldset>
              </Card>
            </>
          )}

          {tab === 'templates' && (
            <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <Card>
                <CardTitle title="Default invoice design" description="Applies to new documents. Each document can still be customised individually." icon={Palette} />
                <fieldset disabled={readOnly} className="p-5"><DesignPanel value={pdf} onChange={setPdf} /></fieldset>
              </Card>
              <Card className="overflow-hidden">
                <CardTitle title="Live preview" description="Sample invoice using your current settings" />
                <div className="max-h-[900px] overflow-y-auto bg-slate-100 p-4"><PdfViewer bytes={preview} /></div>
              </Card>
            </div>
          )}

          {tab === 'team' && <TeamPanel profiles={profiles} />}

          {tab === 'account' && (
            <Card>
              <CardTitle title="My account" description={`${profile?.email} · ${profile?.role}`} icon={KeyRound} />
              <div className="grid gap-5 p-5 md:grid-cols-2">
                <form className="space-y-3" onSubmit={async (e) => {
                  e.preventDefault();
                  try { await upsertRow('profiles', { id: profile!.id, full_name: fullName.trim() }); await refreshProfile(); await refresh('profiles'); toast.success('Name updated'); } catch (err) { toast.error(friendlyError(err)); }
                }}>
                  <Field label="Full name"><TextInput value={fullName} onChange={(e) => setFullName(e.target.value)} /></Field>
                  <button className="h-10 rounded-xl bg-brand-navy px-4 text-sm font-semibold text-white">Save name</button>
                </form>
                <form className="space-y-3" onSubmit={async (e) => {
                  e.preventDefault();
                  if (newPassword.length < 8) return toast.error('Use at least 8 characters');
                  const { error } = await supabase.auth.updateUser({ password: newPassword });
                  if (error) toast.error(friendlyError(error)); else { toast.success('Password changed'); setNewPassword(''); }
                }}>
                  <Field label="New password"><TextInput type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" /></Field>
                  <button className="h-10 rounded-xl border px-4 text-sm font-semibold">Change password</button>
                </form>
              </div>
            </Card>
          )}

          {tab === 'data' && (
            <Card>
              <CardTitle title="Backup & restore" description="Your data lives in Supabase (PostgreSQL) with automatic daily backups on paid plans. Keep your own copy too." icon={Database} />
              <div className="grid gap-4 p-5 md:grid-cols-2">
                <div className="rounded-2xl border p-4">
                  <p className="font-semibold">Download a full backup</p>
                  <p className="mt-1 text-sm text-muted-foreground">Customers, projects, catalogue, quotations, invoices with items, payments, expenses and settings — as a single JSON file.</p>
                  <button disabled={!!backupBusy} onClick={async () => {
                    setBackupBusy('export');
                    try { const data = await exportBackup(); downloadBytes(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }), `sarathi-backup-${todayISO()}.json`); toast.success('Backup downloaded'); } catch (e) { toast.error(friendlyError(e)); } finally { setBackupBusy(null); }
                  }} className="mt-4 flex h-10 items-center gap-2 rounded-xl bg-brand-navy px-4 text-sm font-semibold text-white">{backupBusy === 'export' ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}Download backup</button>
                </div>
                <div className="rounded-2xl border p-4">
                  <p className="font-semibold">Restore from a backup</p>
                  <p className="mt-1 text-sm text-muted-foreground">Records are matched by ID and updated or re-created. Nothing else is deleted. Administrators only.</p>
                  <label className={cn('mt-4 flex h-10 w-fit cursor-pointer items-center gap-2 rounded-xl border px-4 text-sm font-semibold hover:bg-slate-50', !isAdmin && 'pointer-events-none opacity-50')}>
                    <Upload size={16} />Choose backup file
                    <input type="file" accept="application/json,.json" className="hidden" onChange={(e) => { setRestoreFile(e.target.files?.[0] ?? null); e.target.value = ''; }} />
                  </label>
                  {backupBusy?.startsWith('Restoring') && <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 size={14} className="animate-spin" />{backupBusy}</p>}
                </div>
              </div>
            </Card>
          )}

          {tab === 'activity' && (
            <Card>
              <CardTitle title="Audit log" description="Every create, edit, cancellation and payment — with who did it and when." icon={History} />
              <div className="p-5"><ActivityTimeline logs={logs} linkEntities empty="No activity recorded yet." /></div>
            </Card>
          )}
        </div>
      </div>

      {dirty && isAdmin && ['company', 'branding', 'bank', 'invoicing', 'templates'].includes(tab) && (
        <div className="fixed inset-x-0 bottom-16 z-20 border-t bg-white/95 px-4 py-3 backdrop-blur-md lg:bottom-0 lg:left-[248px]">
          <div className="mx-auto flex max-w-[1400px] items-center justify-end gap-3 lg:px-4">
            <span className="mr-auto text-sm text-muted-foreground">You have unsaved changes</span>
            <button onClick={() => setForm(settings)} className="h-10 rounded-xl px-4 text-sm font-medium hover:bg-slate-100">Discard</button>
            <button onClick={save} disabled={saving} className="flex h-10 items-center gap-2 rounded-xl bg-brand-orange px-5 text-sm font-semibold text-white">{saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}Save settings</button>
          </div>
        </div>
      )}

      <ConfirmDialog open={!!restoreFile} onOpenChange={(o) => !o && setRestoreFile(null)} title="Restore this backup?" confirmLabel="Restore"
        description={`${restoreFile?.name ?? ''} will be merged into the live database. Existing records with the same IDs will be overwritten with the backup version.`}
        onConfirm={async () => {
          try {
            const json = JSON.parse(await restoreFile!.text());
            await restoreBackup(json, (m) => setBackupBusy(`Restoring ${m}…`));
            await refresh();
            toast.success('Backup restored');
          } catch (e) { toast.error(friendlyError(e)); throw e; } finally { setBackupBusy(null); }
        }} />
    </div>
  );
}

function TeamPanel({ profiles }: { profiles: Profile[] }) {
  const { isAdmin, profile: me } = useAuth();
  const { refresh } = useData();
  const [busy, setBusy] = useState<string | null>(null);
  const update = async (p: Profile, patch: Partial<Profile>, msg: string) => {
    setBusy(p.id);
    try { await upsertRow('profiles', { id: p.id, ...patch }); await refresh('profiles'); toast.success(msg); } catch (e) { toast.error(friendlyError(e)); } finally { setBusy(null); }
  };
  const pending = profiles.filter((p) => !p.active);
  return (
    <Card>
      <CardTitle title="Team & access" description="New sign-ups wait here until an administrator approves them." icon={ShieldCheck} />
      <div className="space-y-2 p-5 text-sm text-muted-foreground">
        <p><b className="text-brand-ink">Admin</b> — full access: settings, team, deletions, editing issued invoices, restore.</p>
        <p><b className="text-brand-ink">Staff</b> — create customers, projects, quotations, invoices, payments and expenses. Cannot delete records or change settings.</p>
        {isAdmin && <p>To add someone, ask them to open the app and choose <i>Create an account</i>, then approve them below.</p>}
      </div>
      {pending.length > 0 && isAdmin && <p className="mx-5 mb-3 rounded-xl bg-brand-orange-soft px-4 py-2.5 text-sm text-brand-orange-dark">{pending.length} account{pending.length > 1 ? 's' : ''} waiting for approval.</p>}
      <div className="divide-y border-t">
        {profiles.map((p) => (
          <div key={p.id} className="flex flex-col gap-3 px-5 py-3 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{p.full_name || p.email}{p.id === me?.id && <span className="ml-2 text-xs font-normal text-muted-foreground">(you)</span>}</p>
              <p className="truncate text-xs text-muted-foreground">{p.email} · joined {fmtDate(p.created_at)}</p>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge status={p.active ? 'Approved' : 'Draft'} className={!p.active ? '!bg-amber-50 !text-amber-700 !ring-amber-200' : ''} />
              <SelectNative value={p.role} disabled={!isAdmin || busy === p.id || p.id === me?.id} onChange={(e) => update(p, { role: e.target.value as Profile['role'] }, 'Role updated')} className="!h-9 w-28 text-sm"><option value="staff">Staff</option><option value="admin">Admin</option></SelectNative>
              {isAdmin && p.id !== me?.id && (p.active
                ? <button disabled={busy === p.id} onClick={() => update(p, { active: false }, 'Access revoked')} className="flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold text-red-600 hover:bg-red-50"><UserX size={14} />Revoke</button>
                : <button disabled={busy === p.id} onClick={() => update(p, { active: true }, 'Access approved')} className="flex h-9 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-xs font-semibold text-white hover:bg-emerald-700"><UserCheck size={14} />Approve</button>)}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

export default function SettingsPage() {
  return <Suspense fallback={<LoadingPanel />}><SettingsInner /></Suspense>;
}
