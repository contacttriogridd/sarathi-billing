import { round2 } from '@/lib/format';
import type { Attendance, AttendanceStatus, Labourer, LabourPayment } from '@/lib/types';

/** Quick choices on the attendance sheet. Any value from 0 to 3 can be entered in the day dialog. */
export const SHIFT_OPTIONS = [0, 0.5, 1, 1.5, 2] as const;
export const MAX_SHIFTS = 3;

const FRACTIONS: Record<string, string> = { '0.5': '½', '1.5': '1½', '2.5': '2½' };
/** 0.5 → ½, 1.5 → 1½, 1.25 → 1.25 */
export const shiftNumber = (n: number) => FRACTIONS[String(n)] ?? String(Number(n.toFixed(2)));
/** "½ shift", "1 shift", "1½ shifts" */
export const fmtShifts = (n: number) => `${shiftNumber(n)} shift${n === 1 || n === 0.5 ? '' : 's'}`;
/** Button / calendar label: A for absent, otherwise the shift count. */
export const shiftShort = (n: number) => (n <= 0 ? 'A' : shiftNumber(n));

/** Colours by shifts worked: absent, part shift, one shift, extra shifts. */
export const shiftTone = (n: number) => (n <= 0
  ? { active: 'bg-red-600 text-white ring-red-600', cell: 'bg-red-50 text-red-700 ring-red-200', dot: 'bg-red-500' }
  : n < 1
    ? { active: 'bg-amber-500 text-white ring-amber-500', cell: 'bg-amber-50 text-amber-800 ring-amber-200', dot: 'bg-amber-500' }
    : n === 1
      ? { active: 'bg-emerald-600 text-white ring-emerald-600', cell: 'bg-emerald-50 text-emerald-800 ring-emerald-200', dot: 'bg-emerald-500' }
      : { active: 'bg-sky-600 text-white ring-sky-600', cell: 'bg-sky-50 text-sky-800 ring-sky-200', dot: 'bg-sky-500' });

/** Mirrors the database: 0 = Absent, under 1 = Half day, 1 or more = Present. */
export const statusFromShifts = (n: number): AttendanceStatus => (n <= 0 ? 'Absent' : n < 1 ? 'Half day' : 'Present');

/** Wage for one day — shifts × rate per shift + overtime, the same formula the database uses. */
export const attendanceAmount = (shifts: number, ratePerShift: number, overtimeHours: number, overtimeRate: number) =>
  shifts <= 0 ? 0 : round2(ratePerShift * shifts + (overtimeHours || 0) * overtimeRate);

/** Suggested overtime rate per hour for an 8-hour shift. */
export const suggestedOvertimeRate = (ratePerShift: number) => round2(ratePerShift / 8);

export type AttendanceTotals = { entries: number; worked: number; absent: number; shifts: number; otHours: number; wages: number };

export const summariseAttendance = (rows: Attendance[]): AttendanceTotals => {
  const t: AttendanceTotals = { entries: rows.length, worked: 0, absent: 0, shifts: 0, otHours: 0, wages: 0 };
  rows.forEach((a) => {
    if (a.shifts > 0) t.worked += 1; else t.absent += 1;
    t.shifts += a.shifts;
    t.otHours += a.overtime_hours;
    t.wages += a.amount;
  });
  t.shifts = round2(t.shifts);
  t.otHours = round2(t.otHours);
  t.wages = round2(t.wages);
  return t;
};

export type LabourBalance = { earned: number; paid: number; advances: number; balance: number };

/** Earned (attendance wages) minus paid (wages + advances). Positive = payable to the labourer, negative = advance outstanding. */
export const labourBalance = (attendance: Attendance[], payments: LabourPayment[]): LabourBalance => {
  const earned = round2(attendance.reduce((s, a) => s + a.amount, 0));
  const paid = round2(payments.reduce((s, p) => s + p.amount, 0));
  const advances = round2(payments.filter((p) => p.kind === 'Advance').reduce((s, p) => s + p.amount, 0));
  return { earned, paid, advances, balance: round2(earned - paid) };
};

export const groupBy = <T, K>(list: T[], key: (item: T) => K) => {
  const map = new Map<K, T[]>();
  list.forEach((item) => {
    const k = key(item);
    const arr = map.get(k);
    if (arr) arr.push(item); else map.set(k, [item]);
  });
  return map;
};

export const labourerLabel = (l: Pick<Labourer, 'name' | 'labour_code'>) => `${l.name} (${l.labour_code})`;

export const fmtHours = (h: number) => `${Number.isInteger(h) ? h : Number(h.toFixed(2))} h`;

/** Monday-first calendar grid for a YYYY-MM month: leading blanks (null) then ISO dates. */
export const monthGrid = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const days = new Date(y, m, 0).getDate();
  const lead = (first.getDay() + 6) % 7;
  const cells: (string | null)[] = Array.from({ length: lead }, () => null);
  for (let d = 1; d <= days; d += 1) cells.push(`${month}-${String(d).padStart(2, '0')}`);
  while (cells.length % 7) cells.push(null);
  return cells;
};

export const shiftMonth = (month: string, delta: number) => {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

export const monthBounds = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  return { from: `${month}-01`, to: `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}` };
};

export const monthTitle = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  return new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' }).format(new Date(y, m - 1, 1));
};

export const weekday = (iso: string) => new Intl.DateTimeFormat('en-IN', { weekday: 'short' }).format(new Date(`${iso}T00:00:00`));
