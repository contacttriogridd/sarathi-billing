export type Role = 'admin' | 'staff';

export type Profile = {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  active: boolean;
  created_at: string;
};

export type TaxMode = 'exclusive' | 'inclusive' | 'none';
export type TaxType = 'CGST_SGST' | 'IGST';
export type BillingMode = 'standard' | 'measurement' | 'stage';
export type DiscountType = 'percent' | 'amount';
export type ItemType = BillingMode;

export type TemplateId = 'classic' | 'modern' | 'corporate' | 'premium' | 'mono';
export type PdfFont = 'sans' | 'modern' | 'serif';
export type TableStyle = 'striped' | 'bordered' | 'minimal' | 'grid';
export type HeaderLayout = 'standard' | 'centered' | 'banner';

export type PdfOptions = {
  template: TemplateId;
  accentColor: string;
  secondaryColor: string;
  font: PdfFont;
  tableStyle: TableStyle;
  headerLayout: HeaderLayout;
  footerText: string;
  showLogo: boolean;
  showGstin: boolean;
  showPan: boolean;
  showHsn: boolean;
  showSerial: boolean;
  showUnit: boolean;
  showDiscountColumn: boolean;
  showTaxColumn: boolean;
  showTaxSummary: boolean;
  showAmountInWords: boolean;
  showBankDetails: boolean;
  showUpiQr: boolean;
  showTerms: boolean;
  showNotes: boolean;
  showCustomerSignature: boolean;
  showAuthorizedSignature: boolean;
  showStamp: boolean;
  showProjectDetails: boolean;
  showPaymentSummary: boolean;
  showPageNumbers: boolean;
  customerSignatureLabel: string;
  authorizedSignatureLabel: string;
  copyLabel: string;
};

export type CompanySettings = {
  id: number;
  company_name: string;
  business_type: string;
  address: string;
  state: string;
  phone: string;
  email: string;
  website: string;
  gstin: string;
  pan: string;
  bank_name: string;
  bank_account_name: string;
  bank_account_number: string;
  bank_ifsc: string;
  bank_branch: string;
  upi_id: string;
  authorized_signatory: string;
  signatory_designation: string;
  logo_url: string;
  signature_url: string;
  stamp_url: string;
  invoice_prefix: string;
  invoice_next_number: number;
  quotation_prefix: string;
  quotation_next_number: number;
  estimate_prefix: string;
  estimate_next_number: number;
  receipt_prefix: string;
  receipt_next_number: number;
  number_format: string;
  number_padding: number;
  currency: string;
  default_tax_mode: TaxMode;
  default_tax_type: TaxType;
  default_tax_rate: number;
  round_off_enabled: boolean;
  default_due_days: number;
  quotation_validity_days: number;
  default_payment_terms: string;
  terms_invoice: string;
  terms_quotation: string;
  terms_estimate: string;
  receipt_note: string;
  pdf_settings: Partial<PdfOptions>;
  updated_at?: string;
};

/** Company details frozen onto a document when it is saved (no images). */
export type CompanySnapshot = Omit<CompanySettings,
  'id' | 'logo_url' | 'signature_url' | 'stamp_url' | 'pdf_settings' | 'updated_at' |
  'invoice_next_number' | 'quotation_next_number' | 'estimate_next_number' | 'receipt_next_number'>;

export type Customer = {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  state: string;
  gstin: string;
  customer_type: string;
  notes: string;
  created_at: string;
  updated_at?: string;
};

export type ProjectStatus = 'Planning' | 'In Progress' | 'On Hold' | 'Completed' | 'Cancelled';

export type Project = {
  id: string;
  project_code: string;
  project_name: string;
  customer_id: string;
  location: string;
  project_type: string;
  start_date: string | null;
  expected_completion_date: string | null;
  status: ProjectStatus;
  estimated_budget: number;
  description: string;
  created_at: string;
  updated_at?: string;
};

export type LineItem = {
  id?: string;
  /** client-only stable key for React lists */
  key: string;
  position: number;
  item_type: ItemType;
  description: string;
  hsn_sac: string;
  unit: string;
  quantity: number;
  rate: number;
  discount: number;
  tax_rate: number;
  exempt: boolean;
  length: number | null;
  breadth: number | null;
  height: number | null;
  nos: number | null;
  prev_quantity: number;
  amount: number;
};

export type Charge = { key: string; label: string; amount: number; tax_rate: number };

export type DeductionKey = 'retention' | 'tds' | 'advance_recovery' | 'material' | 'other';
export type Deduction = {
  key: string;
  type: DeductionKey;
  label: string;
  mode: DiscountType;
  value: number;
  basis: 'taxable' | 'total';
};

export type TaxBreakdownRow = {
  key: string;
  rate: number;
  exempt: boolean;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  tax: number;
};

export type StageDetails = { contract_value?: number };
export type RaDetails = { ra_number?: string; previous_bill_amount?: number; show_quantities?: boolean };

export type InvoiceStatus = 'Draft' | 'Sent' | 'Partially Paid' | 'Paid' | 'Cancelled';
export type DisplayStatus = InvoiceStatus | 'Overdue';

export type DocumentSnapshot = {
  company?: CompanySnapshot;
  customer?: Partial<Customer>;
  project?: Partial<Project>;
};

type DocumentTotals = {
  subtotal: number;
  charges_total: number;
  discount_total: number;
  taxable_amount: number;
  cgst_total: number;
  sgst_total: number;
  igst_total: number;
  tax_total: number;
  round_off: number;
  grand_total: number;
  tax_breakdown: TaxBreakdownRow[];
};

type DocumentCommon = DocumentTotals & {
  id: string;
  customer_id: string | null;
  project_id: string | null;
  billing_mode: BillingMode;
  tax_mode: TaxMode;
  tax_type: TaxType;
  line_discount_type: DiscountType;
  discount_type: DiscountType;
  discount_value: number;
  charges: Charge[];
  round_off_enabled: boolean;
  stage_details: StageDetails;
  notes: string;
  internal_notes: string;
  terms: string;
  pdf_options: Partial<PdfOptions>;
  snapshot: DocumentSnapshot;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  items?: LineItem[];
};

export type Invoice = DocumentCommon & {
  invoice_number: string;
  invoice_date: string;
  due_date: string | null;
  invoice_type: string;
  status: InvoiceStatus;
  work_order_number: string;
  reference_number: string;
  place_of_supply: string;
  payment_terms: string;
  deductions: Deduction[];
  ra_details: RaDetails;
  advance_paid: number;
  previous_payments: number;
  deductions_total: number;
  net_payable: number;
  amount_paid: number;
  balance_due: number;
  source_quotation_id: string | null;
  sent_at: string | null;
  last_reminder_at: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  cancel_reason: string;
};

export type QuotationKind = 'quotation' | 'estimate';
export type QuotationStatus = 'Draft' | 'Sent' | 'Approved' | 'Rejected' | 'Expired' | 'Converted';

export type Quotation = DocumentCommon & {
  doc_kind: QuotationKind;
  quotation_number: string;
  quotation_date: string;
  valid_until: string | null;
  subject: string;
  status: QuotationStatus;
  converted_invoice_id: string | null;
};

export type PaymentMethod = 'Cash' | 'UPI' | 'Bank Transfer' | 'Cheque' | 'Other';

export type Payment = {
  id: string;
  receipt_number: string;
  invoice_id: string;
  customer_id: string | null;
  amount: number;
  payment_date: string;
  method: PaymentMethod;
  reference: string;
  notes: string;
  created_by: string | null;
  created_at: string;
};

export type Expense = {
  id: string;
  expense_date: string;
  category: string;
  project_id: string | null;
  vendor: string;
  description: string;
  amount: number;
  payment_method: string;
  reference: string;
  notes: string;
  /** set when the expense is the wage of a labour attendance day (managed by the database) */
  attendance_id: string | null;
  created_at: string;
};

export type Labourer = {
  id: string;
  labour_code: string;
  name: string;
  phone: string;
  trade: string;
  daily_wage: number;
  /** per overtime hour */
  overtime_rate: number;
  default_project_id: string | null;
  joined_on: string | null;
  active: boolean;
  notes: string;
  created_at: string;
  updated_at?: string;
};

export type AttendanceStatus = 'Present' | 'Half day' | 'Absent';

export type Attendance = {
  id: string;
  labourer_id: string;
  project_id: string | null;
  work_date: string;
  status: AttendanceStatus;
  overtime_hours: number;
  /** rates copied from the labourer when the day was marked */
  daily_wage: number;
  overtime_rate: number;
  /** wage for the day, computed in the database */
  amount: number;
  notes: string;
  created_at: string;
  updated_at: string;
};

export type LabourPaymentKind = 'Wages' | 'Advance';

export type LabourPayment = {
  id: string;
  labourer_id: string;
  project_id: string | null;
  payment_date: string;
  kind: LabourPaymentKind;
  amount: number;
  method: string;
  reference: string;
  notes: string;
  created_at: string;
};

export type CatalogItem = {
  id: string;
  name: string;
  category: string;
  unit: string;
  rate: number;
  tax_rate: number;
  hsn_sac: string;
  description: string;
  active: boolean;
  created_at: string;
};

export type AuditLog = {
  id: number;
  entity_type: string;
  entity_id: string | null;
  entity_label: string;
  action: string;
  details: { changes?: Record<string, { from: unknown; to: unknown }>; amount?: number; grand_total?: number; invoice_id?: string; customer_id?: string };
  actor_id: string | null;
  actor_email: string;
  created_at: string;
};
