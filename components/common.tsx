'use client';

import { forwardRef, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Building2, Loader2, Search, X, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { STATUS_STYLES } from '@/lib/status';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Textarea } from '@/components/ui/textarea';

export function BrandMark({ className, size = 36 }: { className?: string; size?: number }) {
  return (
    <span className={cn('relative grid place-items-center rounded-xl bg-brand-navy text-white shadow-sm', className)} style={{ width: size, height: size }}>
      <Building2 size={size * 0.5} strokeWidth={2} />
      <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-brand-orange" />
    </span>
  );
}

export function PageHeader({ title, description, actions, eyebrow }: { title: string; description?: React.ReactNode; actions?: React.ReactNode; eyebrow?: string }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <p className="label-eyebrow mb-1.5 text-brand-orange">{eyebrow}</p>}
        <h1 className="truncate text-2xl font-semibold tracking-tight text-brand-ink sm:text-[28px]">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 sm:shrink-0">{actions}</div>}
    </div>
  );
}

export function Card({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('card-surface', className)} {...props}>{children}</div>;
}

export function CardTitle({ title, description, action, icon: Icon }: { title: string; description?: string; action?: React.ReactNode; icon?: LucideIcon }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border/70 px-5 py-4">
      <div className="flex min-w-0 items-start gap-3">
        {Icon && <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-navy/5 text-brand-navy"><Icon size={16} /></span>}
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold text-brand-ink">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

export function StatCard({ label, value, hint, icon: Icon, tone = 'navy', onClick }: { label: string; value: React.ReactNode; hint?: React.ReactNode; icon: LucideIcon; tone?: 'navy' | 'orange' | 'green' | 'red' | 'sky' | 'slate'; onClick?: () => void }) {
  const tones = {
    navy: 'bg-brand-navy/[0.07] text-brand-navy',
    orange: 'bg-brand-orange/10 text-brand-orange-dark',
    green: 'bg-emerald-50 text-emerald-600',
    red: 'bg-red-50 text-red-600',
    sky: 'bg-sky-50 text-sky-600',
    slate: 'bg-slate-100 text-slate-600',
  };
  const Comp = onClick ? 'button' : 'div';
  return (
    <Comp onClick={onClick} className={cn('card-surface group flex w-full flex-col gap-3 p-4 text-left transition sm:p-5', onClick && 'hover:-translate-y-0.5 hover:shadow-md')}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground sm:text-[13px]">{label}</span>
        <span className={cn('grid h-8 w-8 place-items-center rounded-lg', tones[tone])}><Icon size={16} /></span>
      </div>
      <div className="num truncate text-xl font-semibold tracking-tight text-brand-ink sm:text-[26px]">{value}</div>
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
    </Comp>
  );
}

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <span className={cn('inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset', STATUS_STYLES[status] ?? 'bg-slate-100 text-slate-600 ring-slate-200', className)}>
      {status}
    </span>
  );
}

export function EmptyState({ icon: Icon, title, description, action }: { icon: LucideIcon; title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <span className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-brand-navy/5 text-brand-navy"><Icon size={24} /></span>
      <h3 className="text-base font-semibold text-brand-ink">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('h-4 w-4 animate-spin', className)} />;
}

export function LoadingPanel({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex min-h-[40vh] items-center justify-center gap-3 text-sm text-muted-foreground">
      <Spinner className="h-5 w-5 text-brand-navy" /> {label}
    </div>
  );
}

export function Field({ label, hint, error, required, className, children }: { label: string; hint?: React.ReactNode; error?: string; required?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <label className={cn('block min-w-0', className)}>
      <span className="mb-1.5 block text-[13px] font-medium text-slate-700">
        {label}{required && <span className="ml-0.5 text-brand-orange">*</span>}
      </span>
      {children}
      {error ? <span className="mt-1 block text-xs text-destructive">{error}</span> : hint ? <span className="mt-1 block text-xs text-muted-foreground">{hint}</span> : null}
    </label>
  );
}

export const inputClass = 'flex h-11 w-full rounded-xl border border-input bg-white px-3.5 text-[15px] text-brand-ink shadow-[0_1px_0_rgba(16,41,74,0.03)] outline-none transition placeholder:text-slate-400 focus:border-brand-navy-3 focus:ring-4 focus:ring-brand-navy/10 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:opacity-70 sm:h-10 sm:text-sm';

export const TextInput = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn(inputClass, className)} {...props} />
));
TextInput.displayName = 'TextInput';

/** Chevron arrow background used by native selects. */
export const selectChevron = 'appearance-none bg-[url("data:image/svg+xml;utf8,<svg xmlns=%27http://www.w3.org/2000/svg%27 width=%2716%27 height=%2716%27 fill=%27none%27 stroke=%27%2364748b%27 stroke-width=%272%27 viewBox=%270 0 24 24%27><path d=%27m6 9 6 6 6-6%27/></svg>")] bg-no-repeat';

export function SelectNative({ className, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(inputClass, selectChevron, 'bg-[length:16px] bg-[right_10px_center] pr-9', className)} {...props}>
      {children}
    </select>
  );
}

const parseNum = (text: string) => (text === '' || text === '-' || text === '.' || text === '-.' ? null : Number(text));

/** Number input that keeps the user's raw text while typing (e.g. "12." or "") and reports parsed numbers. */
export function NumberInput({ value, onValue, allowEmpty = false, allowNegative = false, format, className, ...props }: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & { value: number | null | undefined; onValue: (v: number | null) => void; allowEmpty?: boolean; allowNegative?: boolean; /** display format while not being edited, e.g. 1,80,000.00 */ format?: (v: number) => string }) {
  // long derived values (e.g. a rate worked out from an amount) are shown to 4 decimals; full precision is kept
  const toText = (v: number | null | undefined) => (v === null || v === undefined || (v === 0 && allowEmpty) ? '' : String(Number.isInteger(v) ? v : Number(v.toFixed(4))));
  const [text, setText] = useState(toText(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    const parsed = parseNum(text);
    if ((parsed ?? (allowEmpty ? null : 0)) !== (value ?? (allowEmpty ? null : 0))) setText(toText(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <input
      inputMode="decimal"
      autoComplete="off"
      className={cn(inputClass, 'num', className)}
      value={format && !focused && value ? format(value) : text}
      onFocus={(e) => { setFocused(true); const el = e.currentTarget; requestAnimationFrame(() => el.select()); }}
      onBlur={() => setFocused(false)}
      onChange={(e) => {
        const t = e.target.value.replace(/,/g, '');
        const pattern = allowNegative ? /^-?\d*\.?\d*$/ : /^\d*\.?\d*$/;
        if (!pattern.test(t)) return;
        setText(t);
        const parsed = parseNum(t);
        onValue(parsed === null ? (allowEmpty ? null : 0) : parsed);
      }}
      {...props}
    />
  );
}

/** Textarea that grows with its content. */
export function AutoTextarea({ className, value, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
  }, [value]);
  return <textarea ref={ref} rows={1} value={value} className={cn(inputClass, 'h-auto min-h-[44px] resize-none py-2.5 leading-snug sm:min-h-[40px] sm:py-2', className)} {...props} />;
}

export function SearchInput({ value, onChange, placeholder = 'Search…', className }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={cn(inputClass, 'pl-10 pr-9')} />
      {value && (
        <button type="button" onClick={() => onChange('')} className="absolute right-2.5 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-md text-slate-400 hover:bg-slate-100" aria-label="Clear search">
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange, className, size = 'md' }: { value: T; options: { value: T; label: React.ReactNode }[]; onChange: (v: T) => void; className?: string; size?: 'sm' | 'md' }) {
  return (
    <div className={cn('inline-flex rounded-xl bg-slate-100 p-1', className)} role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn('flex-1 whitespace-nowrap rounded-lg px-2 font-medium transition sm:px-3', size === 'sm' ? 'h-7 text-xs' : 'h-8 text-[13px]',
            value === o.value ? 'bg-white text-brand-ink shadow-sm' : 'text-slate-500 hover:text-brand-ink')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className="flex w-full items-center justify-between gap-3 rounded-xl px-1 py-2 text-left">
      <span className="min-w-0">
        <span className="block text-sm font-medium text-slate-700">{label}</span>
        {description && <span className="block text-xs text-muted-foreground">{description}</span>}
      </span>
      <span className={cn('relative h-6 w-10 shrink-0 rounded-full transition', checked ? 'bg-brand-navy' : 'bg-slate-300')}>
        <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all', checked ? 'left-[18px]' : 'left-0.5')} />
      </span>
    </button>
  );
}

export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel = 'Confirm', destructive, onConfirm, requireReason, reasonLabel = 'Reason' }: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; description?: React.ReactNode; confirmLabel?: string; destructive?: boolean;
  onConfirm: (reason: string) => Promise<void> | void; requireReason?: boolean; reasonLabel?: string;
}) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setReason(''); }, [open]);
  return (
    <AlertDialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <AlertDialogContent className="max-w-md rounded-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && <AlertDialogDescription asChild><div className="text-sm text-muted-foreground">{description}</div></AlertDialogDescription>}
        </AlertDialogHeader>
        {requireReason && (
          <Field label={reasonLabel} required>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} className="rounded-xl" placeholder="This will be recorded in the audit history" />
          </Field>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy} className="rounded-xl">Go back</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy || (requireReason && !reason.trim())}
            className={cn('rounded-xl', destructive && 'bg-destructive hover:bg-destructive/90')}
            onClick={async (e) => {
              e.preventDefault();
              setBusy(true);
              try { await onConfirm(reason.trim()); onOpenChange(false); } finally { setBusy(false); }
            }}
          >
            {busy && <Spinner className="mr-2" />}{confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function KeyValue({ label, value, strong, className }: { label: string; value: React.ReactNode; strong?: boolean; className?: string }) {
  return (
    <div className={cn('flex items-center justify-between gap-4 py-1.5 text-sm', className)}>
      <span className="text-muted-foreground">{label}</span>
      <span className={cn('num text-right text-brand-ink', strong && 'font-semibold')}>{value}</span>
    </div>
  );
}

export function useDebounced<T>(value: T, delay = 250) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export const matches = (query: string, ...fields: (string | null | undefined | number)[]) => {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = fields.map((f) => String(f ?? '')).join(' ').toLowerCase();
  return q.split(/\s+/).every((part) => hay.includes(part));
};
