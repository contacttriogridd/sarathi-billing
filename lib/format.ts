const inr2 = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const inr0 = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
const qtyFmt = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 });

export const num = (value: unknown): number => {
  const n = typeof value === 'number' ? value : parseFloat(String(value ?? ''));
  return Number.isFinite(n) ? n : 0;
};

export const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
export const round3 = (value: number) => Math.round((value + Number.EPSILON) * 1000) / 1000;

/** ₹1,23,456.00 — Indian digit grouping. Negative values render as -₹… */
export const inr = (value: unknown, decimals = 2) => {
  const n = num(value);
  const body = decimals === 0 ? inr0.format(Math.abs(Math.round(n))) : inr2.format(Math.abs(n));
  return `${n < 0 ? '-' : ''}₹${body}`;
};

/** 1,23,456.00 without currency symbol (for table cells). */
export const amount = (value: unknown) => {
  const n = num(value);
  return `${n < 0 ? '-' : ''}${inr2.format(Math.abs(n))}`;
};

export const qty = (value: unknown) => qtyFmt.format(num(value));

/** ₹12.5L, ₹1.2Cr — compact Indian notation for dashboards. */
export const inrCompact = (value: unknown) => {
  const n = num(value);
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1e7) return `${sign}₹${(abs / 1e7).toFixed(abs >= 1e9 ? 0 : 2).replace(/\.?0+$/, '')}Cr`;
  if (abs >= 1e5) return `${sign}₹${(abs / 1e5).toFixed(2).replace(/\.?0+$/, '')}L`;
  if (abs >= 1e3) return `${sign}₹${(abs / 1e3).toFixed(1).replace(/\.0$/, '')}K`;
  return `${sign}₹${inr0.format(abs)}`;
};

export const pct = (value: unknown) => `${qtyFmt.format(num(value))}%`;

// --- Dates --------------------------------------------------------------------

export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const daysBetween = (fromISO: string, toISO: string) =>
  Math.round((new Date(`${toISO}T00:00:00`).getTime() - new Date(`${fromISO}T00:00:00`).getTime()) / 86400000);

const dateFmt = new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
const dateTimeFmt = new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });

export const fmtDate = (value: string | null | undefined) => {
  if (!value) return '—';
  const d = value.length <= 10 ? new Date(`${value}T00:00:00`) : new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : dateFmt.format(d);
};

export const fmtDateTime = (value: string | null | undefined) => {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : dateTimeFmt.format(d);
};

export const relativeTime = (value: string) => {
  const diff = (Date.now() - new Date(value).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
  return fmtDate(value);
};

export const monthKey = (iso: string) => iso.slice(0, 7);
export const monthLabel = (key: string) => {
  const [y, m] = key.split('-').map(Number);
  return new Intl.DateTimeFormat('en-IN', { month: 'short', year: '2-digit' }).format(new Date(y, m - 1, 1));
};

/** Indian financial year label for a date, e.g. 2026-27 */
export const financialYear = (iso: string) => {
  const d = new Date(`${iso}T00:00:00`);
  const y = d.getFullYear();
  return d.getMonth() >= 3 ? `${y}-${String((y + 1) % 100).padStart(2, '0')}` : `${y - 1}-${String(y % 100).padStart(2, '0')}`;
};

export const formatDocumentNumber = (format: string, prefix: string, seq: number, padding: number, iso: string) => {
  const year = iso.slice(0, 4);
  return (format || '{PREFIX}/{FY}/{SEQ}')
    .replace('{PREFIX}', prefix)
    .replace('{FY}', financialYear(iso))
    .replace('{YYYY}', year)
    .replace('{SEQ}', String(seq).padStart(padding, '0'));
};

// --- Amount in words (Indian system) ---------------------------------------------

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve',
  'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

const twoDigits = (n: number) => (n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ''}`);
const threeDigits = (n: number) => {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  return [h ? `${ONES[h]} Hundred` : '', rest ? twoDigits(rest) : ''].filter(Boolean).join(' ');
};

const indianWords = (n: number): string => {
  if (n === 0) return 'Zero';
  const crore = Math.floor(n / 1e7);
  const lakh = Math.floor((n % 1e7) / 1e5);
  const thousand = Math.floor((n % 1e5) / 1e3);
  const rest = n % 1000;
  return [
    crore ? `${crore >= 1000 ? indianWords(crore) : threeDigits(crore)} Crore` : '',
    lakh ? `${twoDigits(lakh)} Lakh` : '',
    thousand ? `${twoDigits(thousand)} Thousand` : '',
    rest ? threeDigits(rest) : '',
  ].filter(Boolean).join(' ');
};

/** "Indian Rupees One Lakh Twenty Three Thousand Four Hundred Fifty Six and Fifty Paise Only" */
export const amountInWords = (value: number) => {
  const n = Math.abs(round2(num(value)));
  const rupees = Math.floor(n);
  const paise = Math.round((n - rupees) * 100);
  const words = `Indian Rupees ${indianWords(rupees)}${paise ? ` and ${twoDigits(paise)} Paise` : ''} Only`;
  return value < 0 ? `Minus ${words}` : words;
};

// --- Misc -----------------------------------------------------------------------

/** Normalises an Indian phone number to 91XXXXXXXXXX for wa.me links. */
export const whatsappNumber = (phone: string) => {
  const digits = (phone || '').replace(/\D/g, '');
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 11 && digits.startsWith('0')) return `91${digits.slice(1)}`;
  return digits;
};

export const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('') || '?';

export const slug = (value: string) => value.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '');

export const isValidGstin = (gstin: string) => !gstin || /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstin.toUpperCase());
export const isValidPan = (pan: string) => !pan || /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan.toUpperCase());
export const isValidEmail = (email: string) => !email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
export const isValidPhone = (phone: string) => !phone || phone.replace(/\D/g, '').length >= 10;
