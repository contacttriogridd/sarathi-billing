'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, ChevronDown, HardHat, Pencil, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useData } from '@/components/providers';
import { fmtDate, inr } from '@/lib/format';
import type { Expense } from '@/lib/types';

type LabourGroup = { kind: 'labour'; key: string; date: string; projectId: string | null; items: Expense[]; total: number };
type ListItem = { kind: 'expense'; expense: Expense } | LabourGroup;

/** Keeps manual expenses as they are and folds attendance wages into one row per day and project. Order is preserved. */
export const groupExpenses = (list: Expense[]): ListItem[] => {
  const out: ListItem[] = [];
  const groups = new Map<string, LabourGroup>();
  list.forEach((e) => {
    if (!e.attendance_id) { out.push({ kind: 'expense', expense: e }); return; }
    const key = `${e.expense_date}|${e.project_id ?? ''}`;
    let g = groups.get(key);
    if (!g) {
      g = { kind: 'labour', key, date: e.expense_date, projectId: e.project_id, items: [], total: 0 };
      groups.set(key, g);
      out.push(g);
    }
    g.items.push(e);
    g.total += e.amount;
  });
  return out;
};

export function ExpenseList({ expenses, showProject = true, onEdit, onDelete }: { expenses: Expense[]; showProject?: boolean; onEdit?: (e: Expense) => void; onDelete?: (e: Expense) => void }) {
  const { projectById, attendanceById, labourerById } = useData();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const items = useMemo(() => groupExpenses(expenses), [expenses]);
  const toggle = (key: string) => setExpanded((prev) => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next; });

  return (
    <div className="divide-y">
      {items.map((it) => {
        if (it.kind === 'expense') {
          const e = it.expense;
          return (
            <div key={e.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{e.description || e.category}</p>
                <p className="truncate text-xs text-muted-foreground">{fmtDate(e.expense_date)} · {e.category}{e.vendor ? ` · ${e.vendor}` : ''}{showProject && e.project_id ? ` · ${projectById.get(e.project_id)?.project_name ?? ''}` : ''}</p>
              </div>
              <p className="num text-right font-semibold">{inr(e.amount)}</p>
              {onEdit && <button onClick={() => onEdit(e)} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-500 hover:bg-slate-100" aria-label="Edit"><Pencil size={15} /></button>}
              {onDelete && <button onClick={() => onDelete(e)} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label="Delete"><Trash2 size={15} /></button>}
            </div>
          );
        }
        const open = expanded.has(it.key);
        const records = it.items.map((e) => attendanceById.get(e.attendance_id ?? '')).filter(Boolean);
        const half = records.filter((a) => a!.status === 'Half day').length;
        const project = it.projectId ? projectById.get(it.projectId)?.project_name : null;
        return (
          <div key={it.key}>
            <button onClick={() => toggle(it.key)} aria-expanded={open} className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-slate-50/70 sm:px-5">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-orange/10 text-brand-orange-dark"><HardHat size={16} /></span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">Labour attendance · {it.items.length} labourer{it.items.length === 1 ? '' : 's'}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {fmtDate(it.date)} · Labour{showProject ? ` · ${project ?? 'General'}` : ''} · {it.items.length - half} full day{it.items.length - half === 1 ? '' : 's'}{half ? `, ${half} half day${half === 1 ? '' : 's'}` : ''}
                </p>
              </div>
              <p className="num text-right font-semibold">{inr(it.total)}</p>
              <ChevronDown size={16} className={cn('shrink-0 text-slate-400 transition', open && 'rotate-180')} />
            </button>
            {open && (
              <div className="border-t border-dashed bg-slate-50/60 py-1.5">
                {it.items.map((e) => {
                  const a = attendanceById.get(e.attendance_id ?? '');
                  const lab = a ? labourerById.get(a.labourer_id) : undefined;
                  return (
                    <Link key={e.id} href={lab ? `/labour/${lab.id}` : '/labour'} className="flex items-center gap-3 py-2 pl-[68px] pr-12 text-sm hover:bg-slate-100/70 sm:pl-[72px]">
                      <span className="min-w-0 flex-1 truncate">{e.vendor || 'Labourer'} <span className="text-xs text-muted-foreground">· {e.description}</span></span>
                      <span className="num shrink-0">{inr(e.amount)}</span>
                    </Link>
                  );
                })}
                <Link href={`/labour?date=${it.date}${it.projectId ? `&project=${it.projectId}` : ''}`} className="ml-[68px] mt-1 inline-flex items-center gap-1 pb-1 text-xs font-semibold text-brand-navy-3 hover:underline sm:ml-[72px]">
                  Open attendance sheet <ArrowRight size={12} />
                </Link>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
