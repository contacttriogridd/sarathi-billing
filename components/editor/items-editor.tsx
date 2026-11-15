'use client';

import { useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, BookOpen, Copy, Layers, MoreHorizontal, Plus, Search, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useData } from '@/components/providers';
import { AutoTextarea, NumberInput, inputClass } from '@/components/common';
import { UnitSelect } from '@/components/forms';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CONSTRUCTION_STAGES, DESCRIPTION_SUGGESTIONS, GST_RATES, uid } from '@/lib/constants';
import { amount as money, inr, qty as fmtQty } from '@/lib/format';
import type { LineResult } from '@/lib/calc';
import type { BillingMode, CatalogItem, DiscountType, LineItem, TaxMode } from '@/lib/types';

export const blankItem = (mode: BillingMode, taxRate: number, patch: Partial<LineItem> = {}): LineItem => ({
  key: uid(), position: 0, item_type: mode, description: '', hsn_sac: '', unit: mode === 'stage' ? '%' : mode === 'measurement' ? 'Cu.m' : 'Nos',
  quantity: mode === 'stage' ? 0 : 1, rate: 0, discount: 0, tax_rate: taxRate, exempt: false,
  length: null, breadth: null, height: null, nos: mode === 'measurement' ? 1 : null, prev_quantity: 0, amount: 0, ...patch,
});

type Props = {
  items: LineItem[];
  lines: LineResult[];
  mode: BillingMode;
  taxMode: TaxMode;
  lineDiscountType: DiscountType;
  defaultTaxRate: number;
  showPrevQty: boolean;
  onChange: (items: LineItem[]) => void;
};

function DescriptionInput({ value, onChange, onPick, catalog }: { value: string; onChange: (v: string) => void; onPick: (c: CatalogItem | string) => void; catalog: CatalogItem[] }) {
  const [focus, setFocus] = useState(false);
  const blurTimer = useRef<ReturnType<typeof setTimeout>>();
  const q = value.trim().toLowerCase();
  const suggestions = useMemo(() => {
    if (q.length < 2) return [] as (CatalogItem | string)[];
    const fromCatalog = catalog.filter((c) => c.active && c.name.toLowerCase().includes(q)).slice(0, 6);
    const fromDefaults = catalog.length ? [] : DESCRIPTION_SUGGESTIONS.filter((s) => s.toLowerCase().includes(q)).slice(0, 4);
    return [...fromCatalog, ...fromDefaults].filter((s) => (typeof s === 'string' ? s : s.name).toLowerCase() !== q);
  }, [q, catalog]);

  return (
    <div className="relative">
      <AutoTextarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => { clearTimeout(blurTimer.current); setFocus(true); }}
        onBlur={() => { blurTimer.current = setTimeout(() => setFocus(false), 150); }}
        placeholder="Description of work / material"
        className="text-[15px] sm:text-sm"
      />
      {focus && suggestions.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-xl border bg-white p-1 shadow-xl">
          {suggestions.map((s) => {
            const name = typeof s === 'string' ? s : s.name;
            return (
              <button key={name} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { onPick(s); setFocus(false); }} className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50">
                <span className="min-w-0 truncate">{name}</span>
                {typeof s !== 'string' && <span className="num shrink-0 text-xs text-muted-foreground">{inr(s.rate)} / {s.unit}</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

const cell = 'h-10 px-2 text-[15px] sm:text-sm';

export function ItemsEditor({ items, lines, mode, taxMode, lineDiscountType, defaultTaxRate, showPrevQty, onChange }: Props) {
  const { catalog } = useData();
  const [catalogOpen, setCatalogOpen] = useState(false);
  const lineByKey = new Map(lines.map((l) => [l.key, l]));
  const showTax = taxMode !== 'none';
  const showDisc = mode !== 'measurement' && mode !== 'stage';

  const update = (key: string, patch: Partial<LineItem>) => onChange(items.map((it) => (it.key === key ? { ...it, ...patch } : it)));
  const remove = (key: string) => onChange(items.filter((it) => it.key !== key));
  const duplicate = (key: string) => {
    const i = items.findIndex((it) => it.key === key);
    const copy = { ...items[i], key: uid(), id: undefined };
    onChange([...items.slice(0, i + 1), copy, ...items.slice(i + 1)]);
  };
  const move = (key: string, dir: -1 | 1) => {
    const i = items.findIndex((it) => it.key === key);
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const add = (patch: Partial<LineItem> = {}) => {
    const lastUnit = items[items.length - 1]?.unit;
    const inherit = mode !== 'stage' && lastUnit && !patch.unit ? { unit: lastUnit } : {};
    onChange([...items, blankItem(mode, defaultTaxRate, { ...inherit, ...patch })]);
  };

  /** Typing the line amount works the rate out from the quantity (e.g. 1,200 Sq.ft for ₹1,80,000 → ₹150/Sq.ft). */
  const setAmount = (item: LineItem, value: number | null) => {
    const net = Math.max(0, value ?? 0);
    let gross = net;
    if (showDisc && item.discount > 0) {
      if (lineDiscountType === 'percent') gross = item.discount < 100 ? net / (1 - item.discount / 100) : net;
      else gross = net + item.discount;
    }
    const q = lineByKey.get(item.key)?.quantity ?? item.quantity;
    if (q > 0) update(item.key, { rate: gross / q });
    else if (mode === 'standard') update(item.key, { quantity: 1, rate: gross });
  };
  const pick = (key: string, s: CatalogItem | string) => {
    if (typeof s === 'string') return update(key, { description: s });
    const current = items.find((it) => it.key === key);
    update(key, { description: s.name, unit: s.unit || current?.unit || 'Nos', rate: s.rate || current?.rate || 0, tax_rate: s.tax_rate, hsn_sac: s.hsn_sac || current?.hsn_sac || '' });
  };

  // grid template per mode
  const cols = [
    '26px', 'minmax(0,1fr)',
    ...(mode === 'measurement' ? ['54px', '62px', '62px', '62px', '72px', '72px', '86px'] : []),
    ...(mode === 'stage' ? ['92px'] : []),
    ...(mode === 'standard' && showPrevQty ? ['74px'] : []),
    ...(mode === 'standard' ? ['78px', '78px', '96px'] : []),
    ...(showDisc ? ['68px'] : []),
    ...(showTax ? ['60px'] : []),
    '108px', '32px',
  ].join(' ');

  const headers = [
    '#', mode === 'stage' ? 'Stage / description' : 'Description',
    ...(mode === 'measurement' ? ['Nos', 'L', 'B', 'H / D', 'Qty', 'Unit', 'Rate ₹'] : []),
    ...(mode === 'stage' ? ['Stage %'] : []),
    ...(mode === 'standard' && showPrevQty ? ['Prev. qty'] : []),
    ...(mode === 'standard' ? [showPrevQty ? 'This bill' : 'Qty', 'Unit', 'Rate ₹'] : []),
    ...(showDisc ? [lineDiscountType === 'percent' ? 'Disc %' : 'Disc ₹'] : []),
    ...(showTax ? ['GST %'] : []),
    'Amount ₹', '',
  ];

  const MobileLabel = ({ children }: { children: React.ReactNode }) => <span className="mb-1 block text-[11px] font-medium text-muted-foreground xl:hidden">{children}</span>;

  return (
    <div>
      <datalist id="gst-rate-options">{GST_RATES.map((r) => <option key={r} value={r} />)}</datalist>

      <div className="hidden gap-1.5 border-b px-1 pb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground xl:grid" style={{ gridTemplateColumns: cols }}>
        {headers.map((h, i) => <span key={i} className={cn(i >= 2 && h !== 'Unit' && 'text-right', h === 'Unit' && 'text-center')}>{h}</span>)}
      </div>

      <div className="space-y-3 xl:space-y-0 xl:divide-y">
        {items.map((item, index) => {
          const line = lineByKey.get(item.key);
          return (
            <div key={item.key} className="relative rounded-2xl border bg-white p-3 xl:grid xl:items-start xl:gap-1.5 xl:rounded-none xl:border-0 xl:bg-transparent xl:px-1 xl:py-2.5" style={{ gridTemplateColumns: cols }}>
              <div className="mb-2 flex items-center justify-between pr-9 xl:mb-0 xl:block xl:pr-0 xl:pt-2.5">
                <span className="num text-xs font-semibold text-slate-400">{mode === 'stage' ? `Stage ${index + 1}` : `#${index + 1}`}</span>
                <span className="num text-sm font-semibold text-brand-ink xl:hidden">{money(line?.net ?? 0)}</span>
              </div>

              <div className="min-w-0">
                <DescriptionInput value={item.description} onChange={(v) => update(item.key, { description: v })} onPick={(s) => pick(item.key, s)} catalog={catalog} />
                {mode !== 'stage' && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <input value={item.hsn_sac} onChange={(e) => update(item.key, { hsn_sac: e.target.value })} placeholder="HSN / SAC" className="h-8 w-28 rounded-lg border border-transparent bg-slate-50 px-2 text-xs outline-none focus:border-slate-300 focus:bg-white" />
                    {showTax && (
                      <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
                        <input type="checkbox" checked={item.exempt} onChange={(e) => update(item.key, { exempt: e.target.checked })} className="h-3.5 w-3.5 rounded accent-brand-navy" /> GST exempt
                      </label>
                    )}
                  </div>
                )}
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2 xl:contents">
                {mode === 'measurement' && (
                  <>
                    <label><MobileLabel>Nos</MobileLabel><NumberInput className={cell + ' text-right'} value={item.nos} allowEmpty onValue={(v) => update(item.key, { nos: v })} placeholder="1" /></label>
                    <label><MobileLabel>Length</MobileLabel><NumberInput className={cell + ' text-right'} value={item.length} allowEmpty onValue={(v) => update(item.key, { length: v })} placeholder="L" /></label>
                    <label><MobileLabel>Breadth</MobileLabel><NumberInput className={cell + ' text-right'} value={item.breadth} allowEmpty onValue={(v) => update(item.key, { breadth: v })} placeholder="B" /></label>
                    <label><MobileLabel>Height / depth</MobileLabel><NumberInput className={cell + ' text-right'} value={item.height} allowEmpty onValue={(v) => update(item.key, { height: v })} placeholder="H" /></label>
                    <label><MobileLabel>Quantity</MobileLabel><div className={cn(inputClass, cell, 'num items-center justify-end bg-slate-50 font-medium')}>{fmtQty(line?.quantity ?? 0)}</div></label>
                    <label><MobileLabel>Unit</MobileLabel><UnitSelect className={cn(cell, 'pl-2')} value={item.unit} onChange={(v) => update(item.key, { unit: v })} /></label>
                    <label><MobileLabel>Rate ₹</MobileLabel><NumberInput className={cell + ' text-right'} value={item.rate} allowEmpty onValue={(v) => update(item.key, { rate: v ?? 0 })} placeholder="0.00" /></label>
                  </>
                )}
                {mode === 'stage' && (
                  <label className="col-span-1"><MobileLabel>Stage %</MobileLabel><NumberInput className={cell + ' text-right'} value={item.quantity} allowEmpty onValue={(v) => update(item.key, { quantity: Math.min(v ?? 0, 100) })} placeholder="0" /></label>
                )}
                {mode === 'standard' && (
                  <>
                    {showPrevQty && <label><MobileLabel>Previous qty</MobileLabel><NumberInput className={cell + ' text-right'} value={item.prev_quantity} allowEmpty onValue={(v) => update(item.key, { prev_quantity: v ?? 0 })} placeholder="0" /></label>}
                    <label><MobileLabel>{showPrevQty ? 'This bill qty' : 'Quantity'}</MobileLabel><NumberInput className={cell + ' text-right'} value={item.quantity} allowEmpty onValue={(v) => update(item.key, { quantity: v ?? 0 })} placeholder="0" /></label>
                    <label><MobileLabel>Unit</MobileLabel><UnitSelect className={cn(cell, 'pl-2')} value={item.unit} onChange={(v) => update(item.key, { unit: v })} /></label>
                    <label><MobileLabel>Rate ₹</MobileLabel><NumberInput className={cell + ' text-right'} value={item.rate} allowEmpty onValue={(v) => update(item.key, { rate: v ?? 0 })} placeholder="0.00" /></label>
                  </>
                )}
                {showDisc && <label><MobileLabel>{lineDiscountType === 'percent' ? 'Discount %' : 'Discount ₹'}</MobileLabel><NumberInput className={cell + ' text-right'} value={item.discount} allowEmpty onValue={(v) => update(item.key, { discount: v ?? 0 })} placeholder="0" /></label>}
                {mode !== 'stage' && (
                  <label className="xl:hidden"><MobileLabel>Amount ₹</MobileLabel><NumberInput className={cell + ' text-right font-semibold'} value={line?.net ?? 0} allowEmpty format={money} onValue={(v) => setAmount(item, v)} placeholder="0.00" /></label>
                )}
                {showTax && (
                  <label><MobileLabel>GST %</MobileLabel>
                    <input list="gst-rate-options" inputMode="decimal" disabled={item.exempt} className={cn(inputClass, cell, 'num text-right')} value={item.exempt ? '—' : String(item.tax_rate)}
                      onChange={(e) => update(item.key, { tax_rate: Math.min(100, Number(e.target.value.replace(/[^\d.]/g, '')) || 0) })} />
                  </label>
                )}
              </div>

              <div className="hidden text-right xl:block">
                {mode === 'stage'
                  ? <span className="num block pt-2.5 text-sm font-semibold text-brand-ink">{money(line?.net ?? 0)}</span>
                  : <NumberInput value={line?.net ?? 0} allowEmpty format={money} onValue={(v) => setAmount(item, v)} placeholder="0.00" title="Type an amount to work out the rate automatically"
                      className={cn(cell, 'border-transparent bg-transparent text-right font-semibold shadow-none hover:border-input focus:bg-white')} />}
                {line && line.discount > 0 && <span className="num block text-[11px] text-muted-foreground">−{money(line.discount)}</span>}
              </div>

              <div className="absolute right-2 top-2 xl:static xl:pt-1">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild><button type="button" className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="Row actions"><MoreHorizontal size={16} /></button></DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="rounded-xl">
                    <DropdownMenuItem onSelect={() => duplicate(item.key)}><Copy size={14} className="mr-2" />Duplicate row</DropdownMenuItem>
                    <DropdownMenuItem disabled={index === 0} onSelect={() => move(item.key, -1)}><ArrowUp size={14} className="mr-2" />Move up</DropdownMenuItem>
                    <DropdownMenuItem disabled={index === items.length - 1} onSelect={() => move(item.key, 1)}><ArrowDown size={14} className="mr-2" />Move down</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => remove(item.key)} className="text-red-600 focus:text-red-600"><Trash2 size={14} className="mr-2" />Delete row</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          );
        })}
      </div>

      {!items.length && <p className="rounded-xl border border-dashed py-8 text-center text-sm text-muted-foreground">No items yet — add your first line below.</p>}
      {mode !== 'stage' && items.length > 0 && (
        <p className="mt-3 text-xs text-muted-foreground">
          Tip: enter the quantity (e.g. <b>1,200 Sq.ft</b>) and either the rate <i>or</i> the total amount — type <b>₹1,80,000</b> in Amount and the rate (₹150/Sq.ft) is worked out for you.
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={() => add()} className="flex h-10 items-center gap-2 rounded-xl bg-brand-navy px-4 text-sm font-semibold text-white hover:bg-brand-navy-2"><Plus size={16} />{mode === 'stage' ? 'Add stage' : 'Add item'}</button>
        {mode !== 'stage' && <button type="button" onClick={() => setCatalogOpen(true)} className="flex h-10 items-center gap-2 rounded-xl border bg-white px-4 text-sm font-medium text-brand-ink hover:bg-slate-50"><BookOpen size={16} />From catalogue</button>}
        {mode === 'stage' && (
          <button type="button" onClick={() => {
            const existing = new Set(items.map((i) => i.description.split(' —')[0].trim().toLowerCase()));
            const toAdd = CONSTRUCTION_STAGES.filter((s) => !existing.has(s.toLowerCase())).map((s) => blankItem('stage', defaultTaxRate, { description: s }));
            onChange([...items.filter((i) => i.description.trim() || i.quantity), ...toAdd]);
          }} className="flex h-10 items-center gap-2 rounded-xl border bg-white px-4 text-sm font-medium text-brand-ink hover:bg-slate-50"><Layers size={16} />Add standard stages</button>
        )}
      </div>

      <CatalogPicker open={catalogOpen} onOpenChange={setCatalogOpen} onAdd={(picked) => onChange([...items.filter((i) => i.description.trim() || i.rate), ...picked.map((c) => blankItem(mode, c.tax_rate, { description: c.name, unit: c.unit, rate: c.rate, hsn_sac: c.hsn_sac }))])} />
    </div>
  );
}

function CatalogPicker({ open, onOpenChange, onAdd }: { open: boolean; onOpenChange: (o: boolean) => void; onAdd: (items: CatalogItem[]) => void }) {
  const { catalog } = useData();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const list = catalog.filter((c) => c.active && `${c.name} ${c.category}`.toLowerCase().includes(query.toLowerCase()));
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) { setSelected(new Set()); setQuery(''); } }}>
      <DialogContent className="flex max-h-[90vh] flex-col rounded-2xl sm:max-w-lg">
        <DialogHeader><DialogTitle>Add from catalogue</DialogTitle><DialogDescription>Pick saved materials, labour and work items with their default rates.</DialogDescription></DialogHeader>
        <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search items" className={cn(inputClass, 'pl-9')} /></div>
        <div className="-mx-2 flex-1 overflow-y-auto px-2">
          {!catalog.length && <p className="py-10 text-center text-sm text-muted-foreground">Your catalogue is empty. Add items under <b>Item catalogue</b> to reuse them here.</p>}
          {list.map((c) => (
            <label key={c.id} className={cn('flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-slate-50', selected.has(c.id) && 'bg-brand-navy/5')}>
              <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} className="h-4 w-4 accent-brand-navy" />
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{c.name}</span><span className="text-xs text-muted-foreground">{c.category} · GST {c.tax_rate}%</span></span>
              <span className="num text-sm">{inr(c.rate)}<span className="text-xs text-muted-foreground"> /{c.unit}</span></span>
            </label>
          ))}
        </div>
        <button disabled={!selected.size} onClick={() => { onAdd(catalog.filter((c) => selected.has(c.id))); onOpenChange(false); setSelected(new Set()); }} className="h-11 rounded-xl bg-brand-navy text-sm font-semibold text-white disabled:opacity-50">Add {selected.size || ''} item{selected.size === 1 ? '' : 's'}</button>
      </DialogContent>
    </Dialog>
  );
}
