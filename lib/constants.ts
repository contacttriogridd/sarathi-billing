import type { Charge, CompanySettings, Deduction, DeductionKey, PdfOptions, TemplateId } from '@/lib/types';

export const COMPANY_DEFAULTS = {
  company_name: 'SARATHI ASSOCIATES',
  business_type: 'Construction and Building Services',
  address: 'Anitha Complex, Perumanallur, Tiruppur, Tamil Nadu, India.',
  state: 'Tamil Nadu',
};

export const UNITS = [
  'Sq.ft', 'Sq.m', 'Cu.ft', 'Cu.m', 'Rft', 'Rmt', 'Nos', 'Bags', 'Kg', 'Ton', 'Litre', 'Hours', 'Days', 'Labour', 'LS', '%',
] as const;

export const UNIT_LABELS: Record<string, string> = {
  'Sq.ft': 'Square feet', 'Sq.m': 'Square metre', 'Cu.ft': 'Cubic feet', 'Cu.m': 'Cubic metre', Rft: 'Running feet',
  Rmt: 'Running metre', Nos: 'Number', Bags: 'Bags', Kg: 'Kilogram', Ton: 'Ton', Litre: 'Litre', Hours: 'Hours', Days: 'Days',
  Labour: 'Labour', LS: 'Lump sum', '%': 'Percent',
};

export const INVOICE_TYPES: { value: string; title: string; short: string }[] = [
  { value: 'Standard Tax Invoice', title: 'TAX INVOICE', short: 'Tax Invoice' },
  { value: 'Construction Work Bill', title: 'CONSTRUCTION WORK BILL', short: 'Work Bill' },
  { value: 'Labour Bill', title: 'LABOUR BILL', short: 'Labour Bill' },
  { value: 'Material Bill', title: 'MATERIAL BILL', short: 'Material Bill' },
  { value: 'Contractor Bill', title: 'CONTRACTOR BILL', short: 'Contractor Bill' },
  { value: 'Running Account (RA) Bill', title: 'RUNNING ACCOUNT BILL', short: 'RA Bill' },
  { value: 'Final Bill', title: 'FINAL BILL', short: 'Final Bill' },
  { value: 'Advance Payment Bill', title: 'ADVANCE PAYMENT BILL', short: 'Advance Bill' },
  { value: 'Proforma Invoice', title: 'PROFORMA INVOICE', short: 'Proforma' },
];

export const RA_TYPES = ['Running Account (RA) Bill', 'Final Bill'];

export const invoiceTitle = (type: string, taxMode: string) => {
  if (type === 'Standard Tax Invoice' && taxMode === 'none') return 'INVOICE';
  return INVOICE_TYPES.find((t) => t.value === type)?.title ?? 'INVOICE';
};

export const PROJECT_TYPES = [
  'Residential construction', 'Commercial construction', 'Building renovation', 'Interior work', 'Electrical work',
  'Plumbing work', 'Painting', 'Civil works', 'Other',
];

export const PROJECT_STATUSES = ['Planning', 'In Progress', 'On Hold', 'Completed', 'Cancelled'] as const;
export const CUSTOMER_TYPES = ['Individual', 'Business', 'Builder / Developer', 'Government', 'Contractor', 'Other'];
export const PAYMENT_METHODS = ['Cash', 'UPI', 'Bank Transfer', 'Cheque', 'Other'] as const;
export const INVOICE_STATUSES = ['Draft', 'Sent', 'Partially Paid', 'Paid', 'Overdue', 'Cancelled'] as const;
export const QUOTATION_STATUSES = ['Draft', 'Sent', 'Approved', 'Rejected', 'Expired', 'Converted'] as const;
export const EXPENSE_CATEGORIES = ['Material', 'Labour', 'Subcontractor', 'Equipment', 'Transport', 'Fuel', 'Site expenses', 'Office', 'Salary', 'Other'];
export const CATALOG_CATEGORIES = ['Material', 'Labour', 'Work', 'Equipment', 'Service'];
export const LABOUR_TRADES = [
  'Mason', 'Helper', 'Carpenter', 'Bar bender', 'Centring', 'Electrician', 'Plumber', 'Painter', 'Tile layer',
  'Welder', 'Fabricator', 'Operator', 'Driver', 'Watchman', 'Supervisor', 'Other',
];
/** Standard wage per shift by trade (lower-case keys). Only a starting suggestion when adding a labourer; the rate already paid to others of the same trade takes precedence. */
export const STANDARD_WAGE_PER_SHIFT: Record<string, number> = { helper: 700 };
export const ATTENDANCE_STATUSES = ['Present', 'Half day', 'Absent'] as const;
export const LABOUR_PAYMENT_KINDS = ['Wages', 'Advance'] as const;
export const GST_RATES = [0, 5, 12, 18, 28];

export const CONSTRUCTION_STAGES = [
  'Foundation', 'Basement', 'Ground floor', 'First floor', 'Roofing', 'Electrical', 'Plumbing', 'Finishing', 'Final handover',
];

export const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh',
  'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland',
  'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand',
  'West Bengal', 'Andaman and Nicobar Islands', 'Chandigarh', 'Dadra and Nagar Haveli and Daman and Diu', 'Delhi',
  'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry',
];

/** Starter catalogue suggestions (loaded only when the user asks for them). */
export const STARTER_ITEMS: { name: string; category: string; unit: string; tax_rate: number; hsn_sac: string }[] = [
  { name: 'Foundation work (excavation, PCC & footing)', category: 'Work', unit: 'Cu.m', tax_rate: 18, hsn_sac: '995411' },
  { name: 'Brickwork in cement mortar 1:6', category: 'Work', unit: 'Cu.m', tax_rate: 18, hsn_sac: '995411' },
  { name: 'Cement (OPC 53 grade)', category: 'Material', unit: 'Bags', tax_rate: 28, hsn_sac: '2523' },
  { name: 'TMT steel bars Fe 550', category: 'Material', unit: 'Kg', tax_rate: 18, hsn_sac: '7214' },
  { name: 'River sand / M-sand', category: 'Material', unit: 'Cu.ft', tax_rate: 5, hsn_sac: '2505' },
  { name: 'Blue metal aggregate 20mm', category: 'Material', unit: 'Cu.ft', tax_rate: 5, hsn_sac: '2517' },
  { name: 'RCC concrete work M20', category: 'Work', unit: 'Cu.m', tax_rate: 18, hsn_sac: '995411' },
  { name: 'Vitrified tile flooring', category: 'Work', unit: 'Sq.ft', tax_rate: 18, hsn_sac: '995454' },
  { name: 'Interior & exterior painting', category: 'Work', unit: 'Sq.ft', tax_rate: 18, hsn_sac: '995473' },
  { name: 'Electrical installation & wiring', category: 'Work', unit: 'Nos', tax_rate: 18, hsn_sac: '995461' },
  { name: 'Plumbing & sanitary installation', category: 'Work', unit: 'LS', tax_rate: 18, hsn_sac: '995465' },
  { name: 'Mason labour charges', category: 'Labour', unit: 'Days', tax_rate: 18, hsn_sac: '995411' },
  { name: 'Helper labour charges', category: 'Labour', unit: 'Days', tax_rate: 18, hsn_sac: '995411' },
  { name: 'Transportation charges', category: 'Service', unit: 'LS', tax_rate: 18, hsn_sac: '996511' },
  { name: 'Plastering in CM 1:4 (12mm)', category: 'Work', unit: 'Sq.ft', tax_rate: 18, hsn_sac: '995411' },
  { name: 'Waterproofing treatment', category: 'Work', unit: 'Sq.ft', tax_rate: 18, hsn_sac: '995411' },
];

export const DESCRIPTION_SUGGESTIONS = STARTER_ITEMS.map((item) => item.name);

export const TEMPLATES: { id: TemplateId; name: string; description: string; defaults: Partial<PdfOptions> }[] = [
  { id: 'classic', name: 'Classic Professional', description: 'Timeless letterhead with bordered table and serif headings.',
    defaults: { headerLayout: 'standard', tableStyle: 'bordered', font: 'serif', accentColor: '#0f3460' } },
  { id: 'modern', name: 'Modern Minimal', description: 'Airy layout, hairline rules and a geometric typeface.',
    defaults: { headerLayout: 'standard', tableStyle: 'minimal', font: 'modern', accentColor: '#1e3a5f' } },
  { id: 'corporate', name: 'Construction Corporate', description: 'Bold navy banner with a construction-orange accent stripe.',
    defaults: { headerLayout: 'banner', tableStyle: 'striped', font: 'sans', accentColor: '#10294a', secondaryColor: '#ee8a2f' } },
  { id: 'premium', name: 'Premium Blue', description: 'Rich blue header and highlighted totals for a premium feel.',
    defaults: { headerLayout: 'banner', tableStyle: 'bordered', font: 'sans', accentColor: '#0b4ea2', secondaryColor: '#c9a227' } },
  { id: 'mono', name: 'Simple Black & White', description: 'Printer-friendly monochrome with a full grid table.',
    defaults: { headerLayout: 'centered', tableStyle: 'grid', font: 'sans', accentColor: '#111111', secondaryColor: '#111111' } },
];

export const DEFAULT_PDF_OPTIONS: PdfOptions = {
  template: 'corporate',
  accentColor: '#10294a',
  secondaryColor: '#ee8a2f',
  font: 'sans',
  tableStyle: 'striped',
  headerLayout: 'banner',
  footerText: 'Thank you for your business.',
  showLogo: true,
  showGstin: true,
  showPan: false,
  showHsn: true,
  showSerial: true,
  showUnit: true,
  showDiscountColumn: true,
  showTaxColumn: true,
  showTaxSummary: true,
  showAmountInWords: true,
  showBankDetails: true,
  showUpiQr: true,
  showTerms: true,
  showNotes: true,
  showCustomerSignature: true,
  showAuthorizedSignature: true,
  showStamp: true,
  showProjectDetails: true,
  showPaymentSummary: true,
  showPageNumbers: true,
  customerSignatureLabel: "Customer's Signature",
  authorizedSignatureLabel: 'Authorised Signatory',
  copyLabel: '',
};

export const resolvePdfOptions = (...layers: (Partial<PdfOptions> | undefined | null)[]): PdfOptions => {
  const merged = { ...DEFAULT_PDF_OPTIONS };
  for (const layer of layers) {
    if (!layer) continue;
    for (const [key, value] of Object.entries(layer)) {
      if (value !== undefined && value !== null) (merged as Record<string, unknown>)[key] = value;
    }
  }
  return merged;
};

export const DEDUCTION_PRESETS: Record<DeductionKey, { label: string; mode: 'percent' | 'amount'; basis: 'taxable' | 'total'; hint: string }> = {
  retention: { label: 'Retention', mode: 'percent', basis: 'taxable', hint: 'Security / retention money held back, usually 5%.' },
  tds: { label: 'TDS (u/s 194C)', mode: 'percent', basis: 'taxable', hint: 'Tax deducted at source, 1% individuals / 2% others.' },
  advance_recovery: { label: 'Advance recovery', mode: 'amount', basis: 'total', hint: 'Recovery of mobilisation advance paid earlier.' },
  material: { label: 'Material deduction', mode: 'amount', basis: 'total', hint: 'Value of materials supplied by the client.' },
  other: { label: 'Other deduction', mode: 'amount', basis: 'total', hint: 'Any other agreed deduction.' },
};

let keyCounter = 0;
export const uid = () => {
  keyCounter += 1;
  return `k${Date.now().toString(36)}${keyCounter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
};

export const defaultDeductions = (): Deduction[] =>
  (Object.keys(DEDUCTION_PRESETS) as DeductionKey[]).map((type) => ({
    key: uid(), type, label: DEDUCTION_PRESETS[type].label, mode: DEDUCTION_PRESETS[type].mode, value: 0, basis: DEDUCTION_PRESETS[type].basis,
  }));

export const defaultCharges = (taxRate: number): Charge[] => [
  { key: uid(), label: 'Transportation charges', amount: 0, tax_rate: taxRate },
  { key: uid(), label: 'Labour charges', amount: 0, tax_rate: taxRate },
  { key: uid(), label: 'Material charges', amount: 0, tax_rate: taxRate },
  { key: uid(), label: 'Other charges', amount: 0, tax_rate: taxRate },
];

export const DEFAULT_SETTINGS: CompanySettings = {
  id: 1,
  ...COMPANY_DEFAULTS,
  phone: '', email: '', website: '', gstin: '', pan: '',
  bank_name: '', bank_account_name: '', bank_account_number: '', bank_ifsc: '', bank_branch: '', upi_id: '',
  authorized_signatory: '', signatory_designation: 'Proprietor', logo_url: '', signature_url: '', stamp_url: '',
  invoice_prefix: 'SA', invoice_next_number: 1, quotation_prefix: 'QT', quotation_next_number: 1,
  estimate_prefix: 'EST', estimate_next_number: 1, receipt_prefix: 'RCPT', receipt_next_number: 1,
  number_format: '{PREFIX}/{FY}/{SEQ}', number_padding: 4, currency: 'INR',
  default_tax_mode: 'exclusive', default_tax_type: 'CGST_SGST', default_tax_rate: 18, round_off_enabled: true,
  default_due_days: 15, quotation_validity_days: 30,
  default_payment_terms: 'Payment due within 15 days from the invoice date.',
  terms_invoice: '', terms_quotation: '', terms_estimate: '', receipt_note: 'Thank you for your payment.',
  pdf_settings: {},
};
