'use client';

import { useEffect, useRef, useState } from 'react';
import { Download, Loader2, MessageCircle, Printer, ZoomIn, ZoomOut } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { downloadBytes, printPdf, shareToWhatsApp } from '@/lib/share';
import { friendlyError } from '@/lib/data';

type PdfJs = typeof import('pdfjs-dist');
let pdfjsPromise: Promise<PdfJs> | null = null;
const loadPdfJs = () => {
  if (!pdfjsPromise) {
    pdfjsPromise = import('pdfjs-dist').then((mod) => {
      mod.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';
      return mod;
    });
  }
  return pdfjsPromise;
};

/** Renders every page of a PDF to crisp canvases (works on mobile where inline PDF viewers don't). */
export function PdfViewer({ bytes, className, zoom = 1 }: { bytes: Uint8Array | null; className?: string; zoom?: number }) {
  const container = useRef<HTMLDivElement>(null);
  const [error, setError] = useState('');
  const [rendering, setRendering] = useState(false);

  useEffect(() => {
    if (!bytes || !container.current) return;
    let cancelled = false;
    const host = container.current;
    setRendering(true);
    setError('');
    (async () => {
      try {
        const pdfjs = await loadPdfJs();
        const doc = await pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false }).promise;
        if (cancelled) return;
        const width = Math.max(280, host.clientWidth - 2) * zoom;
        const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
        const canvases: HTMLCanvasElement[] = [];
        for (let i = 1; i <= doc.numPages; i += 1) {
          const page = await doc.getPage(i);
          const base = page.getViewport({ scale: 1 });
          const viewport = page.getViewport({ scale: (width / base.width) * dpr });
          const canvas = document.createElement('canvas');
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          canvas.style.width = `${Math.floor(viewport.width / dpr)}px`;
          canvas.style.height = `${Math.floor(viewport.height / dpr)}px`;
          canvas.className = 'mx-auto block rounded-md bg-white shadow-[0_2px_12px_rgba(16,41,74,0.12)]';
          await page.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise;
          if (cancelled) return;
          canvases.push(canvas);
        }
        host.replaceChildren(...canvases);
        void doc.destroy();
      } catch (e) {
        if (!cancelled) setError(friendlyError(e));
      } finally {
        if (!cancelled) setRendering(false);
      }
    })();
    return () => { cancelled = true; };
  }, [bytes, zoom]);

  return (
    <div className={cn('relative', className)}>
      {(rendering || !bytes) && !error && (
        <div className="absolute inset-0 z-10 flex items-start justify-center pt-24"><span className="flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm text-muted-foreground shadow"><Loader2 className="h-4 w-4 animate-spin" /> Rendering PDF…</span></div>
      )}
      {error && <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700">Preview unavailable: {error}. You can still download the PDF.</p>}
      <div ref={container} className="flex min-h-[300px] flex-col gap-4" />
    </div>
  );
}

export type PdfJob = { bytes: Uint8Array; filename: string; share?: { phone?: string; message: string; path: string } };

export function PdfPreviewDialog({ open, onOpenChange, title, job }: { open: boolean; onOpenChange: (o: boolean) => void; title: string; job: PdfJob | null }) {
  const [zoom, setZoom] = useState(1);
  const [sharing, setSharing] = useState(false);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[96vh] max-w-4xl flex-col gap-0 overflow-hidden rounded-2xl p-0 sm:h-[92vh]">
        <DialogHeader className="flex-row items-center justify-between gap-2 space-y-0 border-b px-4 py-3 pr-12">
          <DialogTitle className="truncate text-base">{title}</DialogTitle>
          <div className="flex items-center gap-1">
            <button onClick={() => setZoom((z) => Math.max(0.6, z - 0.2))} className="hidden h-9 w-9 place-items-center rounded-lg hover:bg-slate-100 sm:grid" aria-label="Zoom out"><ZoomOut size={16} /></button>
            <button onClick={() => setZoom((z) => Math.min(2, z + 0.2))} className="hidden h-9 w-9 place-items-center rounded-lg hover:bg-slate-100 sm:grid" aria-label="Zoom in"><ZoomIn size={16} /></button>
          </div>
        </DialogHeader>
        <div className="flex-1 overflow-auto bg-slate-100 p-3 sm:p-6">
          <PdfViewer bytes={job?.bytes ?? null} zoom={zoom} className="mx-auto max-w-[820px]" />
        </div>
        {job && (
          <div className="grid grid-cols-3 gap-2 border-t bg-white p-3 safe-bottom">
            <button onClick={() => downloadBytes(job.bytes, job.filename)} className="flex h-11 items-center justify-center gap-2 rounded-xl bg-brand-navy text-sm font-semibold text-white hover:bg-brand-navy-2"><Download size={16} /> Download</button>
            <button onClick={() => printPdf(job.bytes)} className="flex h-11 items-center justify-center gap-2 rounded-xl border text-sm font-semibold text-brand-ink hover:bg-slate-50"><Printer size={16} /> Print</button>
            <button
              disabled={sharing || !job.share}
              onClick={async () => {
                if (!job.share) return;
                setSharing(true);
                try {
                  const r = await shareToWhatsApp({ bytes: job.bytes, filename: job.filename, ...job.share, storagePath: job.share.path });
                  if (r === 'opened-whatsapp') toast.info('PDF downloaded — attach it in the WhatsApp chat that just opened.');
                } catch (e) { toast.error(friendlyError(e)); } finally { setSharing(false); }
              }}
              className="flex h-11 items-center justify-center gap-2 rounded-xl bg-[#25D366] text-sm font-semibold text-white hover:bg-[#1fb957] disabled:opacity-60"
            >
              {sharing ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle size={16} />} WhatsApp
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
