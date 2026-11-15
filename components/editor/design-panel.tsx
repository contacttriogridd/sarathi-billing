'use client';

import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Field, SelectNative, TextInput, Toggle } from '@/components/common';
import { TEMPLATES } from '@/lib/constants';
import type { PdfOptions, TemplateId } from '@/lib/types';

const SWATCHES = ['#10294a', '#0f3460', '#0b4ea2', '#1e3a5f', '#0f766e', '#7c2d12', '#4c1d95', '#111111'];

function TemplateThumb({ id, accent }: { id: TemplateId; accent: string }) {
  const banner = id === 'corporate' || id === 'premium';
  return (
    <div className="aspect-[3/4] w-full overflow-hidden rounded-lg border bg-white p-1.5">
      {banner ? (
        <div className="h-[22%] rounded-sm" style={{ background: accent, borderBottom: id === 'corporate' ? '3px solid #ee8a2f' : '1.5px solid #c9a227' }} />
      ) : id === 'mono' ? (
        <div className="flex h-[22%] flex-col items-center justify-center gap-1"><div className="h-1.5 w-1/2 rounded bg-zinc-800" /><div className="h-px w-full bg-zinc-800" /></div>
      ) : (
        <div className="flex h-[22%] items-start justify-between border-b pb-1" style={{ borderColor: id === 'classic' ? accent : '#e2e8f0' }}><div className="h-1.5 w-1/3 rounded" style={{ background: accent }} /><div className="h-2 w-1/4 rounded" style={{ background: accent, opacity: 0.8 }} /></div>
      )}
      <div className="mt-1.5 grid grid-cols-3 gap-1">{[0, 1, 2].map((i) => <div key={i} className="h-3 rounded-sm" style={{ background: id === 'modern' ? '#f8fafc' : `${id === 'mono' ? '#f4f4f5' : accent}14`, border: id === 'mono' || id === 'classic' ? '1px solid #d4d4d8' : 'none' }} />)}</div>
      <div className="mt-1.5 h-2 rounded-sm" style={{ background: id === 'corporate' ? accent : id === 'mono' ? '#e4e4e7' : `${accent}26` }} />
      {[0, 1, 2, 3].map((i) => <div key={i} className="mt-1 h-1.5 rounded-sm" style={{ background: i % 2 && id === 'corporate' ? `${accent}12` : '#f1f5f9' }} />)}
      <div className="ml-auto mt-1.5 h-3 w-1/2 rounded-sm" style={{ background: id === 'mono' ? '#27272a' : id === 'modern' ? 'transparent' : accent, borderTop: id === 'modern' ? `1.5px solid ${accent}` : 'none' }} />
    </div>
  );
}

const TOGGLES: { key: keyof PdfOptions; label: string }[] = [
  { key: 'showLogo', label: 'Company logo' },
  { key: 'showGstin', label: 'Company GSTIN' },
  { key: 'showPan', label: 'Company PAN' },
  { key: 'showProjectDetails', label: 'Project / site block' },
  { key: 'showSerial', label: 'Serial number column' },
  { key: 'showUnit', label: 'Unit column' },
  { key: 'showHsn', label: 'HSN / SAC codes' },
  { key: 'showDiscountColumn', label: 'Discount column' },
  { key: 'showTaxColumn', label: 'GST % column' },
  { key: 'showTaxSummary', label: 'GST summary table' },
  { key: 'showAmountInWords', label: 'Amount in words' },
  { key: 'showPaymentSummary', label: 'Advance & balance due' },
  { key: 'showBankDetails', label: 'Bank details' },
  { key: 'showUpiQr', label: 'UPI payment QR code' },
  { key: 'showNotes', label: 'Notes' },
  { key: 'showTerms', label: 'Terms & conditions' },
  { key: 'showCustomerSignature', label: 'Customer signature' },
  { key: 'showAuthorizedSignature', label: 'Authorised signature' },
  { key: 'showStamp', label: 'Company stamp area' },
  { key: 'showPageNumbers', label: 'Page numbers' },
];

export function DesignPanel({ value, onChange, compact }: { value: PdfOptions; onChange: (patch: Partial<PdfOptions>) => void; compact?: boolean }) {
  const mono = value.template === 'mono';
  return (
    <div className="space-y-6">
      <div>
        <p className="mb-2 text-[13px] font-medium text-slate-700">Template</p>
        <div className={cn('grid gap-3', compact ? 'grid-cols-3 sm:grid-cols-5' : 'grid-cols-2 sm:grid-cols-3 xl:grid-cols-5')}>
          {TEMPLATES.map((t) => {
            const active = value.template === t.id;
            return (
              <button key={t.id} type="button" onClick={() => onChange({ template: t.id, ...t.defaults })} className={cn('group relative rounded-xl border-2 p-1.5 text-left transition', active ? 'border-brand-navy shadow-md' : 'border-transparent hover:border-slate-200')}>
                <TemplateThumb id={t.id} accent={active ? value.accentColor : String(t.defaults.accentColor)} />
                <p className="mt-1.5 px-0.5 text-xs font-semibold leading-tight text-brand-ink">{t.name}</p>
                {!compact && <p className="px-0.5 text-[11px] leading-snug text-muted-foreground">{t.description}</p>}
                {active && <span className="absolute right-2.5 top-2.5 grid h-5 w-5 place-items-center rounded-full bg-brand-navy text-white"><Check size={12} /></span>}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Accent colour" hint={mono ? 'Black & White template always prints in monochrome.' : undefined}>
          <div className="flex items-center gap-2">
            <input type="color" value={value.accentColor} disabled={mono} onChange={(e) => onChange({ accentColor: e.target.value })} className="h-10 w-12 cursor-pointer rounded-lg border bg-white p-1" />
            <div className="flex flex-wrap gap-1.5">{SWATCHES.map((c) => <button key={c} type="button" disabled={mono} onClick={() => onChange({ accentColor: c })} className={cn('h-6 w-6 rounded-full ring-offset-2', value.accentColor === c && 'ring-2 ring-brand-navy')} style={{ background: c }} aria-label={c} />)}</div>
          </div>
        </Field>
        <Field label="Highlight colour"><div className="flex items-center gap-2"><input type="color" value={value.secondaryColor} disabled={mono} onChange={(e) => onChange({ secondaryColor: e.target.value })} className="h-10 w-12 cursor-pointer rounded-lg border bg-white p-1" /><span className="text-xs text-muted-foreground">Stripe & balance-due accent</span></div></Field>
        <Field label="Font">
          <SelectNative value={value.font} onChange={(e) => onChange({ font: e.target.value as PdfOptions['font'] })}>
            <option value="sans">Noto Sans — clean</option><option value="modern">Poppins — modern</option><option value="serif">Noto Serif — classic</option>
          </SelectNative>
        </Field>
        <Field label="Table design">
          <SelectNative value={value.tableStyle} onChange={(e) => onChange({ tableStyle: e.target.value as PdfOptions['tableStyle'] })}>
            <option value="striped">Striped rows</option><option value="bordered">Bordered</option><option value="minimal">Minimal lines</option><option value="grid">Full grid</option>
          </SelectNative>
        </Field>
        <Field label="Header layout">
          <SelectNative value={value.headerLayout} onChange={(e) => onChange({ headerLayout: e.target.value as PdfOptions['headerLayout'] })}>
            <option value="banner">Colour banner</option><option value="standard">Logo left, title right</option><option value="centered">Centred letterhead</option>
          </SelectNative>
        </Field>
        <Field label="Copy label" hint='e.g. "Original for recipient"'><TextInput value={value.copyLabel} onChange={(e) => onChange({ copyLabel: e.target.value })} placeholder="Optional" /></Field>
        <Field label="Footer text" className="sm:col-span-2"><TextInput value={value.footerText} onChange={(e) => onChange({ footerText: e.target.value })} placeholder="Thank you for your business." /></Field>
        <Field label="Customer signature label"><TextInput value={value.customerSignatureLabel} onChange={(e) => onChange({ customerSignatureLabel: e.target.value })} /></Field>
        <Field label="Authorised signature label"><TextInput value={value.authorizedSignatureLabel} onChange={(e) => onChange({ authorizedSignatureLabel: e.target.value })} /></Field>
      </div>

      <div>
        <p className="mb-1 text-[13px] font-medium text-slate-700">Show on PDF</p>
        <div className="grid gap-x-6 sm:grid-cols-2">
          {TOGGLES.map((t) => <Toggle key={t.key} checked={Boolean(value[t.key])} onChange={(v) => onChange({ [t.key]: v } as Partial<PdfOptions>)} label={t.label} />)}
        </div>
      </div>
    </div>
  );
}
