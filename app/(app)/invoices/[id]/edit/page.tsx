'use client';

import { EditDocumentPage } from '@/components/editor/editor-pages';

export default function Page({ params }: { params: { id: string } }) {
  return <EditDocumentPage kind="invoice" id={params.id} />;
}
