'use client';

import { InvoiceView } from '@/components/document-view';

export default function Page({ params }: { params: { id: string } }) {
  return <InvoiceView id={params.id} />;
}
