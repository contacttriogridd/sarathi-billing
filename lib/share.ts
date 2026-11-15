import { uploadShareablePdf } from '@/lib/data';
import { whatsappNumber } from '@/lib/format';

export const pdfBlob = (bytes: Uint8Array) => new Blob([bytes as BlobPart], { type: 'application/pdf' });

const isIosHomeScreenApp = () => typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent)
  && ((navigator as Navigator & { standalone?: boolean }).standalone === true || window.matchMedia('(display-mode: standalone)').matches);

export const downloadBytes = (bytes: Uint8Array | Blob, filename: string, type = 'application/pdf') => {
  const blob = bytes instanceof Blob ? bytes : new Blob([bytes as BlobPart], { type });
  // Installed iPhone apps cannot "download"; offer the share sheet (Save to Files, WhatsApp, Print…)
  if (isIosHomeScreenApp()) {
    const file = new File([blob], filename, { type: blob.type || type });
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    if (nav.canShare?.({ files: [file] })) {
      navigator.share({ files: [file], title: filename }).catch((e: Error) => {
        if (e.name !== 'AbortError') window.open(URL.createObjectURL(blob), '_blank');
      });
      return;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
};

const isMobile = () => typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

/** Prints a PDF through a hidden iframe (desktop) or opens it in a new tab (mobile). */
export const printPdf = (bytes: Uint8Array) => {
  const url = URL.createObjectURL(pdfBlob(bytes));
  if (isMobile()) {
    window.open(url, '_blank');
    return;
  }
  const frame = document.createElement('iframe');
  frame.style.position = 'fixed';
  frame.style.right = '0';
  frame.style.bottom = '0';
  frame.style.width = '0';
  frame.style.height = '0';
  frame.style.border = '0';
  frame.src = url;
  frame.onload = () => {
    try {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
    } catch {
      window.open(url, '_blank');
    }
    setTimeout(() => { frame.remove(); URL.revokeObjectURL(url); }, 60000);
  };
  document.body.appendChild(frame);
};

export type ShareResult = 'shared-file' | 'shared-link' | 'opened-whatsapp' | 'cancelled';

/**
 * Shares a PDF to WhatsApp.
 * 1. Mobile with Web Share (files): opens the native share sheet with the actual PDF attached.
 * 2. Otherwise: uploads the PDF to private storage, creates a 30-day signed link and opens
 *    WhatsApp (app or web) with a pre-filled message to the customer's number.
 * 3. If storage is unavailable, downloads the PDF and opens WhatsApp with the message.
 */
export const shareToWhatsApp = async (opts: { bytes: Uint8Array; filename: string; message: string; phone?: string; storagePath: string }): Promise<ShareResult> => {
  const file = new File([opts.bytes as BlobPart], opts.filename, { type: 'application/pdf' });
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  if (isMobile() && nav.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: opts.filename, text: opts.message });
      return 'shared-file';
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'cancelled';
    }
  }
  const phone = opts.phone ? whatsappNumber(opts.phone) : '';
  let text = opts.message;
  let result: ShareResult = 'shared-link';
  try {
    const link = await uploadShareablePdf(opts.storagePath, opts.bytes);
    text = `${opts.message}\n\nDownload PDF: ${link}`;
  } catch {
    downloadBytes(opts.bytes, opts.filename);
    result = 'opened-whatsapp';
  }
  const url = `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
  window.open(url, '_blank', 'noopener');
  return result;
};

export const openWhatsAppText = (phone: string | undefined, message: string) => {
  window.open(`https://wa.me/${phone ? whatsappNumber(phone) : ''}?text=${encodeURIComponent(message)}`, '_blank', 'noopener');
};

export const openEmail = (to: string | undefined, subject: string, body: string) => {
  window.location.href = `mailto:${to ?? ''}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
};
