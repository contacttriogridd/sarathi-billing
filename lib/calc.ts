/**
 * The single source of truth for every billing calculation in the app.
 * The editor, the stored totals, reports and the PDF engine all call
 * `computeDocument`, so on-screen and printed figures can never drift apart.
 *
 * Order of operations
 *  1. line gross = qty × rate (qty from measurements L×B×H×Nos in MB mode,
 *     or stage % × contract value in stage-wise mode)
 *  2. line discount (percent or amount) → line net
 *  3. + additional charges (transport, labour, material, other)
 *  4. − document discount, allocated pro-rata so GST is levied on the
 *     discounted value
 *  5. GST per rate slab (exclusive adds tax, inclusive extracts it,
 *     none = non-GST). CGST+SGST split equally, or IGST.
 *  6. round-off to the nearest rupee → grand total
 *  7. − deductions (retention, TDS, advance recovery, material, other)
 *     → net payable
 *  8. − advance paid − previous payments − payments received → balance due
 */
import type { BillingMode, Charge, Deduction, DiscountType, LineItem, RaDetails, StageDetails, TaxBreakdownRow, TaxMode, TaxType } from '@/lib/types';
import { num, round2, round3 } from '@/lib/format';

export type CalcInput = {
  billing_mode: BillingMode;
  items: LineItem[];
  tax_mode: TaxMode;
  tax_type: TaxType;
  line_discount_type: DiscountType;
  discount_type: DiscountType;
  discount_value: number;
  charges: Charge[];
  round_off_enabled: boolean;
  stage_details?: StageDetails;
  deductions?: Deduction[];
  ra_details?: RaDetails;
  advance_paid?: number;
  previous_payments?: number;
  amount_paid?: number;
};

export type LineResult = {
  key: string;
  quantity: number;
  rate: number;
  gross: number;
  discount: number;
  net: number;
  taxRate: number;
  exempt: boolean;
};

export type CalcResult = {
  lines: LineResult[];
  charges: { key: string; label: string; amount: number; taxRate: number }[];
  subtotal: number;
  charges_total: number;
  discount_total: number;
  taxable_amount: number;
  cgst_total: number;
  sgst_total: number;
  igst_total: number;
  tax_total: number;
  total_before_round: number;
  round_off: number;
  grand_total: number;
  tax_breakdown: TaxBreakdownRow[];
  deductions: { key: string; label: string; mode: DiscountType; value: number; basis: 'taxable' | 'total'; amount: number }[];
  deductions_total: number;
  net_payable: number;
  advance_paid: number;
  previous_payments: number;
  amount_paid: number;
  balance_due: number;
  ra: { previous: number; current: number; cumulative: number };
};

const isSet = (v: number | null | undefined) => v !== null && v !== undefined && Number.isFinite(Number(v));

/** Measurement-book quantity: Nos × L × B × H, ignoring blank dimensions. */
export const measuredQuantity = (item: Pick<LineItem, 'length' | 'breadth' | 'height' | 'nos'>) => {
  const dims = [item.length, item.breadth, item.height].filter(isSet).map(Number);
  const hasNos = isSet(item.nos);
  if (!dims.length && !hasNos) return 0;
  const product = dims.reduce((acc, d) => acc * d, 1);
  return round3((hasNos ? Number(item.nos) : 1) * product);
};

export const lineQuantity = (item: LineItem, mode: BillingMode) =>
  (mode === 'measurement' && item.item_type === 'measurement' ? measuredQuantity(item) : round3(num(item.quantity)));

export const stageRate = (stage: StageDetails | undefined) => num(stage?.contract_value) / 100;

export function computeDocument(input: CalcInput): CalcResult {
  const taxMode = input.tax_mode;
  const contract = num(input.stage_details?.contract_value);

  // 1–2. Lines
  const lines: LineResult[] = input.items.map((item) => {
    const quantity = lineQuantity(item, input.billing_mode);
    const isStage = input.billing_mode === 'stage' && item.item_type === 'stage' && contract > 0;
    const rate = isStage ? contract / 100 : num(item.rate);
    const gross = isStage ? round2((contract * quantity) / 100) : round2(quantity * rate);
    const rawDiscount = num(item.discount);
    const discount = input.line_discount_type === 'percent'
      ? round2((gross * Math.min(Math.max(rawDiscount, 0), 100)) / 100)
      : Math.min(Math.max(round2(rawDiscount), 0), Math.max(gross, 0));
    const net = round2(gross - discount);
    const exempt = Boolean(item.exempt);
    const taxRate = taxMode === 'none' || exempt ? 0 : Math.max(0, num(item.tax_rate));
    return { key: item.key, quantity, rate, gross, discount, net, taxRate, exempt };
  });

  // 3. Charges
  const charges = input.charges
    .filter((c) => num(c.amount) !== 0)
    .map((c) => ({ key: c.key, label: c.label || 'Additional charges', amount: round2(num(c.amount)), taxRate: taxMode === 'none' ? 0 : Math.max(0, num(c.tax_rate)) }));

  const subtotal = round2(lines.reduce((s, l) => s + l.net, 0));
  const charges_total = round2(charges.reduce((s, c) => s + c.amount, 0));
  const base = round2(subtotal + charges_total);

  // 4. Document discount (allocated pro-rata)
  const discountValue = Math.max(0, num(input.discount_value));
  let discount_total = input.discount_type === 'percent'
    ? round2((base * Math.min(discountValue, 100)) / 100)
    : round2(discountValue);
  discount_total = Math.min(discount_total, Math.max(base, 0));

  type Unit = { amount: number; taxRate: number; exempt: boolean };
  const units: Unit[] = [
    ...lines.map((l) => ({ amount: l.net, taxRate: l.taxRate, exempt: l.exempt })),
    ...charges.map((c) => ({ amount: c.amount, taxRate: c.taxRate, exempt: false })),
  ];
  if (discount_total > 0 && base > 0) {
    let allocated = 0;
    let largest = 0;
    units.forEach((u, i) => {
      const share = round2((discount_total * u.amount) / base);
      allocated += share;
      u.amount = round2(u.amount - share);
      if (Math.abs(u.amount) > Math.abs(units[largest].amount)) largest = i;
    });
    const remainder = round2(discount_total - allocated);
    if (remainder !== 0 && units.length) units[largest].amount = round2(units[largest].amount - remainder);
  }

  // 5. Tax per slab
  const groups = new Map<string, { rate: number; exempt: boolean; gross: number }>();
  units.forEach((u) => {
    const key = taxMode === 'none' ? 'NONE' : u.exempt ? 'EXEMPT' : `R${u.taxRate}`;
    const g = groups.get(key) ?? { rate: u.taxRate, exempt: u.exempt, gross: 0 };
    g.gross = round2(g.gross + u.amount);
    groups.set(key, g);
  });

  const tax_breakdown: TaxBreakdownRow[] = [];
  let taxable_amount = 0;
  let cgst_total = 0;
  let sgst_total = 0;
  let igst_total = 0;
  for (const [key, g] of Array.from(groups.entries()).sort((a, b) => a[1].rate - b[1].rate)) {
    let taxable = g.gross;
    let tax = 0;
    if (taxMode === 'exclusive' && g.rate > 0) tax = round2((taxable * g.rate) / 100);
    if (taxMode === 'inclusive' && g.rate > 0) {
      taxable = round2(g.gross / (1 + g.rate / 100));
      tax = round2(g.gross - taxable);
    }
    let cgst = 0;
    let sgst = 0;
    let igst = 0;
    if (input.tax_type === 'IGST') igst = tax;
    else {
      cgst = round2(tax / 2);
      sgst = round2(tax - cgst);
    }
    taxable_amount += taxable;
    cgst_total += cgst;
    sgst_total += sgst;
    igst_total += igst;
    if (taxMode !== 'none') tax_breakdown.push({ key, rate: g.rate, exempt: g.exempt, taxable, cgst, sgst, igst, tax });
  }
  taxable_amount = round2(taxable_amount);
  cgst_total = round2(cgst_total);
  sgst_total = round2(sgst_total);
  igst_total = round2(igst_total);
  const tax_total = round2(cgst_total + sgst_total + igst_total);

  // 6. Round-off
  const total_before_round = round2(taxable_amount + tax_total);
  const grand_total = input.round_off_enabled ? Math.round(total_before_round) : total_before_round;
  const round_off = round2(grand_total - total_before_round);

  // 7. Deductions
  const deductions = (input.deductions ?? [])
    .filter((d) => num(d.value) > 0)
    .map((d) => {
      const basisAmount = d.basis === 'taxable' ? taxable_amount : grand_total;
      const value = num(d.value);
      const amt = d.mode === 'percent' ? round2((basisAmount * Math.min(value, 100)) / 100) : round2(value);
      return { key: d.key, label: d.label || 'Deduction', mode: d.mode, value, basis: d.basis, amount: amt };
    });
  const deductions_total = round2(deductions.reduce((s, d) => s + d.amount, 0));
  const net_payable = round2(grand_total - deductions_total);

  // 8. Payments
  const advance_paid = round2(Math.max(0, num(input.advance_paid)));
  const previous_payments = round2(Math.max(0, num(input.previous_payments)));
  const amount_paid = round2(Math.max(0, num(input.amount_paid)));
  const balance_due = round2(net_payable - advance_paid - previous_payments - amount_paid);

  const previous = round2(num(input.ra_details?.previous_bill_amount));
  const ra = { previous, current: taxable_amount, cumulative: round2(previous + taxable_amount) };

  return {
    lines, charges, subtotal, charges_total, discount_total, taxable_amount, cgst_total, sgst_total, igst_total, tax_total,
    total_before_round, round_off, grand_total, tax_breakdown, deductions, deductions_total, net_payable,
    advance_paid, previous_payments, amount_paid, balance_due, ra,
  };
}

/** Totals in the shape stored on the invoice / quotation row. */
export const storedTotals = (r: CalcResult) => ({
  subtotal: r.subtotal,
  charges_total: r.charges_total,
  discount_total: r.discount_total,
  taxable_amount: r.taxable_amount,
  cgst_total: r.cgst_total,
  sgst_total: r.sgst_total,
  igst_total: r.igst_total,
  tax_total: r.tax_total,
  round_off: r.round_off,
  grand_total: r.grand_total,
  tax_breakdown: r.tax_breakdown,
});
