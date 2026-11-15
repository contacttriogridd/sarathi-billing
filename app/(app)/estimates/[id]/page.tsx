'use client';

import { QuotationView } from '@/components/document-view';

export default function Page({ params }: { params: { id: string } }) {
  return <QuotationView id={params.id} kind="estimate" />;
}
