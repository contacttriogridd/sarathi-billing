import { round2 } from '@/lib/format';
import type { Attendance, AttendanceStatus, Labourer, LabourPayment } from '@/lib/types';

/** Share of a day's wage earned for each attendance status (mirrors attendance_before_write in the database). */
export const STATUS_FACTOR: Record<AttendanceStatus, number> = { Present: 1, 'Half day': 0.5, Absent: 0 };

export const STATUS_TONE: Record<AttendanceStatus, { active: string; cell: string; dot: string; short: string }> = {
  Present: { active: 'bg-emerald-600 text-white ring-emerald-600', cell: 'bg-emerald-50 text-emerald-800 ring-emerald-200', dot: 'bg-emerald-500', short: 'P' },
  'Half day': { active: 'bg-amber-500 text-white ring-amber-500', cell: 'bg-amber-50 text-amber-800 ring-amber-200', dot: 'bg-amber-500', short: '½' },
  Absent: { active: 'bg-red-600 text-white ring-red-600', cell: 'bg-red-50 text-red-700 ring-red-200', dot: 'bg-red-500', short: 'A' },
};

/** Wage for one day — the same formula the database uses, for previews before saving. */
export const attendanceAmount = (status: AttendanceStatus, dailyWage: number, overtimeHours: number, overtimeRate: number) =>
  status === 'Absent' ? 0 : round2(dailyWage * STATUS_FACTOR[status] + (overtimeHours || 0) * overtimeRate);

/** Suggested overtime rate per hour for an 8-hour day. */
export const suggestedOvertimeRate = (dailyWage: number) => round2(dailyWage / 8);

export type AttendanceTotals = { entries: number; present: number; half: number; absent: number; otHours: number; manDays: number; wages: number };

export const summariseAttendance = (rows: Attendance[]): AttendanceTotals => {
  const t: AttendanceTotals = { entries: rows.length, present: 0, half: 0, absent: 0, otHours: 0, manDays: 0, wages: 0 };
  rows.forEach((a) => {
    if (a.status === 'Present') t.present += 1;
    else if (a.status === 'Half day') t.half += 1;
    else t.absent += 1;
    t.otHours += a.overtime_hours;
    t.manDays += STATUS_FACTOR[a.status] ?? 0;
    t.wages += a.amount;
  });
  t.otHours = round2(t.otHours);
  t.manDays = round2(t.manDays);
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
