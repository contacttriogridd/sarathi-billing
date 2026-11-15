'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { useData } from '@/components/providers';
import { LoadingPanel } from '@/components/common';
import { DocumentEditor, draftFromInvoice, draftFromQuotation, newDraft, type DocKind, type Draft } from '@/components/editor/document-editor';
import { friendlyError, getInvoice, getQuotation } from '@/lib/data';
import type { Invoice, Quotation } from '@/lib/types';

/** New invoice / quotation / estimate — supports ?duplicate=, ?from= (quotation → invoice), ?customer=, ?project=, ?type= */
export function NewDocumentPage({ kind }: { kind: DocKind }) {
  const params = useSearchParams();
  const { settings, loading, projectById } = useData();
  const [draft, setDraft] = useState<Draft | null>(null);
  const duplicate = params.get('duplicate');
  const from = params.get('from');
  const customer = params.get('customer');
  const project = params.get('project');
  const type = params.get('type');

  useEffect(() => {
    if (loading) return;
    let active = true;
    (async () => {
      try {
        let d = newDraft(kind, settings);
        if (duplicate && kind === 'invoice') {
          const inv = await getInvoice(duplicate);
          if (inv) d = draftFromInvoice(inv, settings, true);
          if (type === 'tax') d.invoice_type = 'Standard Tax Invoice';
        } else if (duplicate) {
          const q = await getQuotation(duplicate);
          if (q) d = draftFromQuotation(q, settings, kind, true);
        } else if (from) {
          const q = await getQuotation(from);
          if (q) d = draftFromQuotation(q, settings, 'invoice');
        }
        if (customer) d.customer_id = customer;
        if (project) { d.project_id = project; d.customer_id = d.customer_id ?? projectById.get(project)?.customer_id ?? null; }
        if (active) setDraft(d);
      } catch (e) {
        toast.error(friendlyError(e));
        if (active) setDraft(newDraft(kind, settings));
      }
    })();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, kind, duplicate, from, customer, project, type]);

  if (!draft) return <LoadingPanel label="Preparing editor…" />;
  const restoreKey = duplicate || from || customer || project ? undefined : 'blank';
  return <DocumentEditor key={`${kind}-${duplicate}-${from}`} kind={kind} initial={draft} restoreKey={restoreKey} />;
}

export function EditDocumentPage({ kind, id }: { kind: DocKind; id: string }) {
  const { settings, loading } = useData();
  const [state, setState] = useState<{ draft: Draft; existing: Invoice | Quotation } | null | 'missing'>(null);

  useEffect(() => {
    if (loading) return;
    let active = true;
    (async () => {
      try {
        if (kind === 'invoice') {
          const inv = await getInvoice(id);
          if (!active) return;
          setState(inv ? { draft: draftFromInvoice(inv, settings), existing: inv } : 'missing');
        } else {
          const q = await getQuotation(id);
          if (!active) return;
          setState(q ? { draft: draftFromQuotation(q, settings, kind), existing: q } : 'missing');
        }
      } catch (e) {
        toast.error(friendlyError(e));
        if (active) setState('missing');
      }
    })();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, id, kind]);

  if (state === null) return <LoadingPanel />;
  if (state === 'missing') return <p className="py-20 text-center text-sm text-muted-foreground">This document could not be found.</p>;
  return <DocumentEditor key={id} kind={kind} initial={state.draft} existing={state.existing} />;
}
