'use client';

import Link from 'next/link';
import { Ban, CirclePlus, FilePen, RefreshCcw, Trash2, Wallet } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fmtDateTime, inr, relativeTime } from '@/lib/format';
import type { AuditLog } from '@/lib/types';

const FIELD_LABELS: Record<string, string> = {
  grand_total: 'total', net_payable: 'net payable', invoice_date: 'date', due_date: 'due date', customer_id: 'customer', project_id: 'project',
  invoice_type: 'type', discount_value: 'discount', advance_paid: 'advance', previous_payments: 'previous payments', tax_mode: 'tax mode',
  tax_type: 'tax type', invoice_number: 'number', quotation_number: 'number', valid_until: 'validity', last_reminder_at: 'reminder',
};

const ENTITY: Record<string, { label: string; href?: (id: string) => string }> = {
  invoices: { label: 'Invoice', href: (id) => `/invoices/${id}` },
  quotations: { label: 'Quotation', href: (id) => `/quotations/${id}` },
  payments: { label: 'Payment' },
  customers: { label: 'Customer', href: (id) => `/customers/${id}` },
  projects: { label: 'Project', href: (id) => `/projects/${id}` },
  expenses: { label: 'Expense' },
  labourers: { label: 'Labourer', href: (id) => `/labour/${id}` },
  labour_payments: { label: 'Labour payment' },
  company_settings: { label: 'Company settings' },
  profiles: { label: 'Team member' },
};

export const describeAudit = (log: AuditLog) => {
  const entity = ENTITY[log.entity_type]?.label ?? log.entity_type;
  const changes = log.details?.changes ?? {};
  if (log.entity_type === 'payments') {
    const amt = inr(Number(log.details?.amount ?? 0));
    return log.action === 'created' ? `Payment of ${amt} recorded (${log.entity_label})` : log.action === 'deleted' ? `Payment of ${amt} deleted (${log.entity_label})` : `Payment ${log.entity_label} updated`;
  }
  if (log.entity_type === 'labour_payments') {
    const amt = inr(Number(log.details?.amount ?? 0));
    const what = log.entity_label === 'Advance' ? 'Labour advance' : 'Labour wages payment';
    return log.action === 'created' ? `${what} of ${amt} recorded` : log.action === 'deleted' ? `${what} of ${amt} deleted` : `${what} edited`;
  }
  if (log.action === 'created') return `${entity} ${log.entity_label} created`;
  if (log.action === 'deleted') return `${entity} ${log.entity_label} deleted`;
  if (log.action === 'cancelled') return `${entity} ${log.entity_label} cancelled${changes.cancel_reason?.to ? ` — “${String(changes.cancel_reason.to)}”` : ''}`;
  if (log.action === 'status_changed') return `${entity} ${log.entity_label}: ${String(changes.status?.from ?? '')} → ${String(changes.status?.to ?? '')}`;
  if (changes.last_reminder_at && Object.keys(changes).length <= 2) return `Payment reminder sent for ${log.entity_label}`;
  if (changes.active || changes.role) return `${log.entity_label}: ${changes.active ? (changes.active.to ? 'access approved' : 'access revoked') : ''}${changes.role ? ` role ${String(changes.role.from)} → ${String(changes.role.to)}` : ''}`;
  const fields = Object.keys(changes).filter((k) => k !== 'updated_at').map((k) => FIELD_LABELS[k] ?? k.replace(/_/g, ' ')).slice(0, 4);
  return `${entity} ${log.entity_label} edited${fields.length ? ` (${fields.join(', ')})` : ''}`;
};

const iconFor = (log: AuditLog) => {
  if (log.entity_type === 'payments' || log.entity_type === 'labour_payments') return { Icon: Wallet, cls: 'bg-emerald-50 text-emerald-600' };
  if (log.action === 'created') return { Icon: CirclePlus, cls: 'bg-sky-50 text-sky-600' };
  if (log.action === 'cancelled') return { Icon: Ban, cls: 'bg-red-50 text-red-600' };
  if (log.action === 'deleted') return { Icon: Trash2, cls: 'bg-red-50 text-red-600' };
  if (log.action === 'status_changed') return { Icon: RefreshCcw, cls: 'bg-amber-50 text-amber-600' };
  return { Icon: FilePen, cls: 'bg-slate-100 text-slate-600' };
};

export function ActivityTimeline({ logs, empty = 'No activity yet.', linkEntities }: { logs: AuditLog[]; empty?: string; linkEntities?: boolean }) {
  if (!logs.length) return <p className="py-6 text-center text-sm text-muted-foreground">{empty}</p>;
  return (
    <ol className="relative space-y-4 before:absolute before:bottom-2 before:left-[15px] before:top-2 before:w-px before:bg-border">
      {logs.map((log) => {
        const { Icon, cls } = iconFor(log);
        const href = linkEntities && log.entity_id && log.action !== 'deleted' ? ENTITY[log.entity_type]?.href?.(log.entity_id) : undefined;
        const text = describeAudit(log);
        return (
          <li key={log.id} className="relative flex gap-3">
            <span className={cn('relative z-10 grid h-8 w-8 shrink-0 place-items-center rounded-full ring-4 ring-white', cls)}><Icon size={14} /></span>
            <div className="min-w-0 pt-1">
              {href ? <Link href={href} className="text-sm text-brand-ink hover:underline">{text}</Link> : <p className="text-sm text-brand-ink">{text}</p>}
              <p className="text-xs text-muted-foreground" title={fmtDateTime(log.created_at)}>{relativeTime(log.created_at)}{log.actor_email ? ` · ${log.actor_email}` : ''}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
