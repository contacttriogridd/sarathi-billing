'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { CalendarCheck, CheckCheck, ChevronLeft, ChevronRight, HandCoins, HardHat, IndianRupee, MoreHorizontal, UserPlus, Users, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useData } from '@/components/providers';
import { Card, ConfirmDialog, EmptyState, LoadingPanel, PageHeader, SearchInput, Segmented, SelectNative, StatCard, TextInput, matches, useDebounced } from '@/components/common';
import { AttendanceDialog, LabourPaymentDialog, LabourSetupNotice, LabourerDialog, ShiftButtons } from '@/components/labour-forms';
import { friendlyError, saveAttendance } from '@/lib/data';
import { addDays, fmtDate, inr, initials, monthKey, todayISO } from '@/lib/format';
import { attendanceAmount, fmtHours, fmtShifts, groupBy, labourBalance, shiftNumber, shiftTone, statusFromShifts, summariseAttendance, weekday } from '@/lib/labour';
import type { Attendance, Labourer } from '@/lib/types';

type Tab = 'attendance' | 'labourers';
const isoDate = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
const dayKey = (labourerId: string, date: string) => `${labourerId}|${date}`;

function LabourInner() {
  const params = useSearchParams();
  const router = useRouter();
  const { labourers, attendance, labourPayments, projects, projectById, refresh, loading, labourReady } = useData();
  const today = todayISO();
  const [tab, setTab] = useState<Tab>(params.get('tab') === 'labourers' ? 'labourers' : 'attendance');
  const [date, setDate] = useState(() => { const d = isoDate(params.get('date')); return d && d <= today ? d : today; });
  const [projectId, setProjectId] = useState(params.get('project') ?? '');
  const [showAll, setShowAll] = useState(false);
  const [query, setQuery] = useState('');
  const [trade, setTrade] = useState('');
  const [state, setState] = useState<'active' | 'inactive' | 'all'>('active');
  const q = useDebounced(query);
  // rows saved on this page that the shared store hasn't reloaded yet (key: labourer|date)
  const [overrides, setOverrides] = useState<Map<string, Attendance>>(new Map());
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [addOpen, setAddOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [dayEdit, setDayEdit] = useState<Labourer | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // keep the address bar in step, so refresh / back returns to the same sheet
  useEffect(() => {
    const qs = new URLSearchParams();
    if (tab === 'labourers') qs.set('tab', 'labourers');
    if (tab === 'attendance' && date !== today) qs.set('date', date);
    if (tab === 'attendance' && projectId) qs.set('project', projectId);
    const next = `/labour${qs.toString() ? `?${qs}` : ''}`;
    if (next !== `${window.location.pathname}${window.location.search}`) router.replace(next, { scroll: false });
  }, [tab, date, projectId, today, router]);

  useEffect(() => {
    setOverrides((prev) => {
      if (!prev.size) return prev;
      const next = new Map(prev);
      prev.forEach((row, key) => {
        const stored = attendance.find((a) => a.id === row.id);
        if (stored && stored.updated_at >= row.updated_at) next.delete(key);
      });
      return next.size === prev.size ? prev : next;
    });
  }, [attendance]);

  const scheduleRefresh = () => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => { void refresh('attendance', 'expenses'); }, 1200);
  };

  const dayMap = useMemo(() => {
    const m = new Map<string, Attendance>();
    attendance.forEach((a) => { if (a.work_date === date) m.set(a.labourer_id, a); });
    overrides.forEach((a) => { if (a.work_date === date) m.set(a.labourer_id, a); });
    return m;
  }, [attendance, overrides, date]);

  const siteRows = useMemo(() => labourers.filter((l) => {
    const rec = dayMap.get(l.id);
    if (!l.active && !rec) return false;
    if (projectId && !showAll) return rec ? rec.project_id === projectId : l.default_project_id === projectId;
    return true;
  }), [labourers, dayMap, projectId, showAll]);
  const rows = useMemo(() => siteRows.filter((l) => matches(q, l.name, l.labour_code, l.trade, l.phone)), [siteRows, q]);
  const hiddenCount = projectId && !showAll ? labourers.filter((l) => l.active).length - siteRows.filter((l) => l.active).length : 0;
  const dayTotals = useMemo(() => summariseAttendance(siteRows.map((l) => dayMap.get(l.id)).filter((a): a is Attendance => !!a)), [siteRows, dayMap]);
  const unmarked = siteRows.filter((l) => !dayMap.get(l.id) && l.active);
  const siteProjects = useMemo(() => projects.filter((p) => (p.status !== 'Completed' && p.status !== 'Cancelled') || p.id === projectId), [projects, projectId]);

  const mark = async (lab: Labourer, shifts: number) => {
    const rec = dayMap.get(lab.id);
    if (rec?.shifts === shifts) return;
    const key = dayKey(lab.id, date);
    const previous = overrides.get(key);
    const project = rec ? rec.project_id : projectId || lab.default_project_id || null;
    const ot = shifts <= 0 ? 0 : rec?.overtime_hours ?? 0;
    const status = statusFromShifts(shifts);
    const optimistic: Attendance = rec
      ? { ...rec, shifts, status, overtime_hours: ot, amount: attendanceAmount(shifts, rec.daily_wage, ot, rec.overtime_rate) }
      : { id: `pending-${key}`, labourer_id: lab.id, project_id: project, work_date: date, shifts, status, overtime_hours: 0, daily_wage: lab.daily_wage, overtime_rate: lab.overtime_rate, amount: attendanceAmount(shifts, lab.daily_wage, 0, lab.overtime_rate), notes: '', created_at: '', updated_at: '' };
    setOverrides((m) => new Map(m).set(key, optimistic));
    setBusy((s) => new Set(s).add(key));
    try {
      // shift buttons never move someone to another site; an existing day keeps its project and rates
      const [saved] = await saveAttendance([rec
        ? { labourer_id: lab.id, work_date: date, shifts }
        : { labourer_id: lab.id, work_date: date, shifts, project_id: project, daily_wage: lab.daily_wage, overtime_rate: lab.overtime_rate }]);
      if (saved) setOverrides((m) => new Map(m).set(key, saved));
      scheduleRefresh();
    } catch (e) {
      setOverrides((m) => { const next = new Map(m); if (previous) next.set(key, previous); else next.delete(key); return next; });
      toast.error(friendlyError(e));
    } finally {
      setBusy((s) => { const next = new Set(s); next.delete(key); return next; });
    }
  };

  const markAllPresent = async () => {
    try {
      const saved = await saveAttendance(unmarked.map((l) => ({
        labourer_id: l.id, work_date: date, shifts: 1, project_id: projectId || l.default_project_id || null, daily_wage: l.daily_wage, overtime_rate: l.overtime_rate,
      })), { onlyNew: true });
      setOverrides((m) => { const next = new Map(m); saved.forEach((a) => next.set(dayKey(a.labourer_id, a.work_date), a)); return next; });
      scheduleRefresh();
      toast.success(`${saved.length} labourer${saved.length === 1 ? '' : 's'} marked 1 shift · ${inr(saved.reduce((s, a) => s + a.amount, 0))} added to expenses`);
    } catch (e) {
      toast.error(friendlyError(e));
      throw e;
    }
  };

  // ---- labourers tab ----
  const balances = useMemo(() => {
    const att = groupBy(attendance, (a) => a.labourer_id);
    const pays = groupBy(labourPayments, (p) => p.labourer_id);
    const month = monthKey(today);
    return new Map(labourers.map((l) => {
      const list = att.get(l.id) ?? [];
      return [l.id, { ...labourBalance(list, pays.get(l.id) ?? []), month: summariseAttendance(list.filter((a) => monthKey(a.work_date) === month)) }];
    }));
  }, [labourers, attendance, labourPayments, today]);
  const trades = useMemo(() => Array.from(new Set(labourers.map((l) => l.trade).filter(Boolean))).sort(), [labourers]);
  const listed = useMemo(() => labourers.filter((l) => (state === 'all' || (state === 'active' ? l.active : !l.active)) && (!trade || l.trade === trade)
    && matches(q, l.name, l.labour_code, l.trade, l.phone, projectById.get(l.default_project_id ?? '')?.project_name)), [labourers, state, trade, q, projectById]);
  const overview = useMemo(() => {
    const todays = attendance.filter((a) => a.work_date === today && a.shifts > 0).length;
    const month = monthKey(today);
    const monthWages = attendance.filter((a) => monthKey(a.work_date) === month).reduce((s, a) => s + a.amount, 0);
    let payable = 0;
    let advances = 0;
    balances.forEach((b) => { if (b.balance > 0) payable += b.balance; else advances -= b.balance; });
    return { active: labourers.filter((l) => l.active).length, todays, monthWages, payable, advances };
  }, [attendance, labourers, balances, today]);

  if (loading) return <LoadingPanel />;

  const header = (
    <PageHeader eyebrow="Services" title="Labour attendance" description="Mark daily attendance for every labourer. Wages are added to each project's expenses automatically."
      actions={labourReady && <>
        <button onClick={() => setPayOpen(true)} disabled={!labourers.length} className="flex h-10 items-center gap-2 rounded-xl border bg-white px-3.5 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50"><HandCoins size={16} />Pay labourer</button>
        <button onClick={() => setAddOpen(true)} className="flex h-10 items-center gap-2 rounded-xl bg-brand-orange px-4 text-sm font-semibold text-white shadow-sm shadow-brand-orange/30 hover:bg-brand-orange-dark"><UserPlus size={16} />Add labourer</button>
      </>} />
  );
  if (!labourReady) return <div className="animate-in-up">{header}<LabourSetupNotice /></div>;

  return (
    <div className="animate-in-up">
      {header}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Segmented value={tab} onChange={setTab} options={[{ value: 'attendance', label: <span className="flex items-center gap-1.5"><CalendarCheck size={14} />Daily attendance</span> }, { value: 'labourers', label: <span className="flex items-center gap-1.5"><Users size={14} />Labourers ({labourers.length})</span> }]} />
      </div>

      {!labourers.length ? (
        <Card><EmptyState icon={HardHat} title="Add your labourers" description="Add each worker once with their trade and wage per shift. Then mark the shifts they worked each day (½, 1, 1½, 2…) — wages go straight into project expenses."
          action={<button onClick={() => setAddOpen(true)} className="flex h-10 items-center gap-2 rounded-xl bg-brand-navy px-4 text-sm font-semibold text-white"><UserPlus size={16} />Add labourer</button>} /></Card>
      ) : tab === 'attendance' ? (
        <div className="space-y-4">
          <Card className="grid gap-3 p-3 sm:p-4 lg:grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)] lg:items-center">
            <div className="flex items-center gap-1.5">
              <button onClick={() => setDate(addDays(date, -1))} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border bg-white hover:bg-slate-50" aria-label="Previous day"><ChevronLeft size={18} /></button>
              <TextInput type="date" value={date} max={today} onChange={(e) => { const d = isoDate(e.target.value); if (d && d <= today) setDate(d); }} className="w-[150px]" aria-label="Attendance date" />
              <button onClick={() => setDate(addDays(date, 1))} disabled={date >= today} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border bg-white hover:bg-slate-50 disabled:opacity-40" aria-label="Next day"><ChevronRight size={18} /></button>
              {date !== today && <button onClick={() => setDate(today)} className="h-10 rounded-xl px-3 text-sm font-medium text-brand-navy-3 hover:bg-slate-100">Today</button>}
            </div>
            <SelectNative value={projectId} onChange={(e) => { setProjectId(e.target.value); setShowAll(false); }} aria-label="Project / site">
              <option value="">All projects / sites</option>
              {siteProjects.map((p) => <option key={p.id} value={p.id}>{p.project_name} ({p.project_code})</option>)}
            </SelectNative>
            <SearchInput value={query} onChange={setQuery} placeholder="Search labourer, ID, trade…" />
          </Card>

          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-brand-navy px-3 py-1.5 text-sm font-semibold text-white">{weekday(date)}, {fmtDate(date)}</span>
            <span className={cn('rounded-full px-3 py-1.5 text-sm ring-1 ring-inset', shiftTone(1).cell)}>Working <b className="num">{dayTotals.worked}</b></span>
            <span className={cn('rounded-full px-3 py-1.5 text-sm ring-1 ring-inset', shiftTone(2).cell)}>Shifts <b className="num">{shiftNumber(dayTotals.shifts)}</b></span>
            <span className={cn('rounded-full px-3 py-1.5 text-sm ring-1 ring-inset', shiftTone(0).cell)}>Absent <b className="num">{dayTotals.absent}</b></span>
            <span className="rounded-full bg-white px-3 py-1.5 text-sm ring-1 ring-border">Not marked <b className="num">{unmarked.length}</b></span>
            <span className="rounded-full bg-white px-3 py-1.5 text-sm ring-1 ring-border">Wages <b className="num">{inr(dayTotals.wages, 0)}</b>{dayTotals.otHours > 0 ? ` · ${fmtHours(dayTotals.otHours)} OT` : ''}</span>
            {unmarked.length > 0 && (
              <button onClick={() => setConfirmAll(true)} className="ml-auto flex h-9 items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 text-sm font-semibold text-white hover:bg-emerald-700"><CheckCheck size={16} />Mark {unmarked.length} × 1 shift</button>
            )}
          </div>

          {!rows.length ? (
            <Card><EmptyState icon={CalendarCheck} title={q ? 'No labourers match' : 'No labourers at this site'} description={projectId ? 'Labourers appear here when this is their usual site or they were marked here on this date.' : 'All labourers are inactive.'}
              action={hiddenCount > 0 && <button onClick={() => setShowAll(true)} className="h-10 rounded-xl border bg-white px-4 text-sm font-semibold hover:bg-slate-50">Show all labourers</button>} /></Card>
          ) : (
            <Card className="divide-y overflow-hidden">
              {rows.map((l) => {
                const rec = dayMap.get(l.id);
                const key = dayKey(l.id, date);
                const siteId = rec ? rec.project_id : l.default_project_id;
                const site = siteId ? projectById.get(siteId)?.project_name : null;
                const showSite = !projectId ? site : rec && rec.project_id !== projectId ? site ?? 'General' : null;
                return (
                  <div key={l.id} className={cn('flex flex-col gap-2.5 px-4 py-3 sm:flex-row sm:items-center sm:gap-4 sm:px-5', !l.active && 'opacity-70')}>
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <Link href={`/labour/${l.id}`} className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-navy/[0.07] text-xs font-semibold text-brand-navy">{initials(l.name)}</Link>
                      <div className="min-w-0">
                        <Link href={`/labour/${l.id}`} className="block truncate text-sm font-semibold text-brand-ink hover:underline">{l.name}</Link>
                        <p className="truncate text-xs text-muted-foreground">{l.labour_code}{l.trade ? ` · ${l.trade}` : ''} · {inr(rec?.daily_wage ?? l.daily_wage, 0)}/shift{showSite ? ` · ${showSite}` : ''}</p>
                      </div>
                      <p className="num ml-auto shrink-0 text-sm font-semibold sm:hidden">{rec ? inr(rec.amount, 0) : ''}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <ShiftButtons value={rec?.shifts ?? null} onChange={(n) => mark(l, n)} disabled={busy.has(key)} />
                      {rec && rec.shifts > 0 && !([0.5, 1, 1.5, 2] as number[]).includes(rec.shifts) && <span className="rounded-md bg-sky-50 px-1.5 py-0.5 text-[11px] font-semibold text-sky-700">{fmtShifts(rec.shifts)}</span>}
                      {rec && rec.overtime_hours > 0 && <span className="rounded-md bg-sky-50 px-1.5 py-0.5 text-[11px] font-semibold text-sky-700">+{fmtHours(rec.overtime_hours)} OT</span>}
                      <p className="num hidden w-20 text-right text-sm font-semibold sm:block">{rec ? inr(rec.amount, 0) : '—'}</p>
                      <button onClick={() => setDayEdit(l)} className="ml-auto grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 sm:ml-0" aria-label={`Overtime, project and notes for ${l.name}`} title="Overtime, project, wage & notes"><MoreHorizontal size={17} /></button>
                    </div>
                  </div>
                );
              })}
            </Card>
          )}
          {hiddenCount > 0 && rows.length > 0 && (
            <button onClick={() => setShowAll(true)} className="text-sm font-medium text-brand-navy-3 hover:underline">Show all labourers ({hiddenCount} more at other sites)</button>
          )}
          <p className="text-xs text-muted-foreground">Tap the shifts worked (½, 1, 1½, 2) or Absent — it saves straight away. Wages = shifts × wage per shift. Use ⋯ for any other number of shifts, overtime, a different site or the day&apos;s rate.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Active labourers" value={overview.active} icon={Users} hint={`${labourers.length - overview.active} inactive`} />
            <StatCard label="Working today" value={overview.todays} icon={CalendarCheck} tone="green" hint={fmtDate(today)} />
            <StatCard label="Wages this month" value={inr(overview.monthWages, 0)} icon={IndianRupee} tone="sky" hint="Added to project expenses" />
            <StatCard label="Balance payable" value={inr(overview.payable, 0)} icon={Wallet} tone="orange" hint={overview.advances > 0 ? `Advances outstanding ${inr(overview.advances, 0)}` : 'Earned minus paid'} />
          </div>
          <Card className="grid gap-2 p-3 sm:grid-cols-[1fr_200px_160px] sm:p-4">
            <SearchInput value={query} onChange={setQuery} placeholder="Search name, ID, trade, phone, site…" />
            <SelectNative value={trade} onChange={(e) => setTrade(e.target.value)}><option value="">All trades</option>{trades.map((t) => <option key={t}>{t}</option>)}</SelectNative>
            <SelectNative value={state} onChange={(e) => setState(e.target.value as typeof state)}><option value="active">Active</option><option value="inactive">Inactive</option><option value="all">All labourers</option></SelectNative>
          </Card>
          {!listed.length ? <Card><EmptyState icon={Users} title="No labourers match" description="Try another search or filter." /></Card> : (
            <Card className="divide-y overflow-hidden">
              {listed.map((l) => {
                const b = balances.get(l.id);
                const site = l.default_project_id ? projectById.get(l.default_project_id)?.project_name : null;
                return (
                  <Link key={l.id} href={`/labour/${l.id}`} className="flex items-center gap-3 px-4 py-3 transition hover:bg-slate-50/70 sm:px-5">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-navy/[0.07] text-xs font-semibold text-brand-navy">{initials(l.name)}</span>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 truncate text-sm font-semibold text-brand-ink">{l.name}{!l.active && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10.5px] font-medium text-slate-500">Inactive</span>}</p>
                      <p className="truncate text-xs text-muted-foreground">{l.labour_code}{l.trade ? ` · ${l.trade}` : ''}{l.phone ? ` · ${l.phone}` : ''}{site ? ` · ${site}` : ''}</p>
                    </div>
                    <div className="hidden text-right sm:block">
                      <p className="num text-sm font-medium">{inr(l.daily_wage, 0)}<span className="text-xs text-muted-foreground">/shift</span></p>
                      <p className="text-xs text-muted-foreground">{fmtShifts(b?.month.shifts ?? 0)} this month</p>
                    </div>
                    <div className="w-28 text-right">
                      <p className={cn('num text-sm font-semibold', (b?.balance ?? 0) < 0 ? 'text-red-600' : (b?.balance ?? 0) > 0 ? 'text-brand-orange-dark' : 'text-emerald-600')}>{inr(Math.abs(b?.balance ?? 0), 0)}</p>
                      <p className="text-[11px] text-muted-foreground">{(b?.balance ?? 0) < 0 ? 'advance' : (b?.balance ?? 0) > 0 ? 'balance due' : 'settled'}</p>
                    </div>
                  </Link>
                );
              })}
            </Card>
          )}
        </div>
      )}

      <LabourerDialog open={addOpen} onOpenChange={setAddOpen} defaultProjectId={projectId || null} />
      <LabourPaymentDialog open={payOpen} onOpenChange={setPayOpen} />
      <AttendanceDialog open={!!dayEdit} onOpenChange={(o) => !o && setDayEdit(null)} labourer={dayEdit} date={date} record={dayEdit ? dayMap.get(dayEdit.id) ?? null : null} defaultProjectId={projectId || null}
        onSaved={(a) => setOverrides((m) => new Map(m).set(dayKey(a.labourer_id, a.work_date), a))} />
      <ConfirmDialog open={confirmAll} onOpenChange={setConfirmAll} title={`Mark ${unmarked.length} labourer${unmarked.length === 1 ? '' : 's'} for 1 shift?`} confirmLabel="Mark 1 shift"
        description={`Everyone not yet marked on ${fmtDate(date)}${projectId ? ` at ${projectById.get(projectId)?.project_name ?? 'this site'}` : ''} will get 1 shift, and their wages added to expenses. Days already marked are not changed — change anyone who worked more or less afterwards.`}
        onConfirm={markAllPresent} />
    </div>
  );
}

export default function LabourPage() {
  return <Suspense fallback={<LoadingPanel />}><LabourInner /></Suspense>;
}
