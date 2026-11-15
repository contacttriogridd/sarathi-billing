'use client';

import { Suspense } from 'react';
import { LoadingPanel } from '@/components/common';
import { NewDocumentPage } from '@/components/editor/editor-pages';

export default function Page() {
  return <Suspense fallback={<LoadingPanel />}><NewDocumentPage kind="invoice" /></Suspense>;
}
