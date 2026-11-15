/**
 * Low-level layout engine on top of pdf-lib.
 *  - Embeds real TrueType fonts (Noto Sans / Poppins / Noto Serif) so the ₹ glyph
 *    and Indian text render correctly — output is a true vector PDF, never an image.
 *  - Top-down cursor layout with automatic page breaks.
 *  - Safe text: characters missing from the font are replaced instead of crashing.
 */
import { PDFDocument, PDFFont, PDFImage, PDFPage, RGB, degrees, rgb, setCharacterSpacing } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import QRCode from 'qrcode';
import type { PdfFont } from '@/lib/types';

export const A4 = { width: 595.28, height: 841.89 };

export type FontBytes = { regular: Uint8Array | ArrayBuffer; bold: Uint8Array | ArrayBuffer };
export type FontLoader = (font: PdfFont) => Promise<FontBytes>;

const FONT_FILES: Record<PdfFont, { regular: string; bold: string }> = {
  sans: { regular: 'NotoSans-Regular.ttf', bold: 'NotoSans-Bold.ttf' },
  modern: { regular: 'Poppins-Regular.ttf', bold: 'Poppins-SemiBold.ttf' },
  serif: { regular: 'NotoSerif-Regular.ttf', bold: 'NotoSerif-Bold.ttf' },
};

const fontCache = new Map<string, Promise<ArrayBuffer>>();
const fetchFont = (file: string) => {
  if (!fontCache.has(file)) {
    fontCache.set(file, fetch(`/fonts/${file}`).then((r) => {
      if (!r.ok) throw new Error(`Font ${file} could not be loaded`);
      return r.arrayBuffer();
    }).catch((error) => {
      fontCache.delete(file);
      throw error;
    }));
  }
  return fontCache.get(file)!;
};

let fontLoader: FontLoader = async (font) => {
  const files = FONT_FILES[font] ?? FONT_FILES.sans;
  const [regular, bold] = await Promise.all([fetchFont(files.regular), fetchFont(files.bold)]);
  return { regular, bold };
};

/** Allows tests / server code to supply font bytes from disk. */
export const setFontLoader = (loader: FontLoader) => { fontLoader = loader; };
export const fontFileNames = FONT_FILES;

// --- Colour helpers -------------------------------------------------------------

export const hex = (value: string | undefined, fallback = '#10294a'): RGB => {
  let h = (value || fallback).trim().replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-f]{6}$/i.test(h)) h = fallback.replace('#', '');
  return rgb(parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255);
};

/** Mix a colour towards white (t = 0 → colour, 1 → white). */
export const tint = (c: RGB, t: number): RGB => rgb(c.red + (1 - c.red) * t, c.green + (1 - c.green) * t, c.blue + (1 - c.blue) * t);
export const shade = (c: RGB, t: number): RGB => rgb(c.red * (1 - t), c.green * (1 - t), c.blue * (1 - t));
export const luminance = (c: RGB) => 0.2126 * c.red + 0.7152 * c.green + 0.0722 * c.blue;
export const WHITE = rgb(1, 1, 1);
export const INK = rgb(0.086, 0.118, 0.173);
export const MUTED = rgb(0.4, 0.447, 0.51);
export const LINE = rgb(0.85, 0.875, 0.905);

// --- Canvas -------------------------------------------------------------------

export type TextOptions = {
  size?: number;
  bold?: boolean;
  color?: RGB;
  align?: 'left' | 'right' | 'center';
  spacing?: number;
  opacity?: number;
};

export class Canvas {
  pdf: PDFDocument;
  pages: PDFPage[] = [];
  page!: PDFPage;
  regular: PDFFont;
  bold: PDFFont;
  charset: Set<number>;
  margin = { left: 36, right: 36, top: 36, bottom: 56 };
  /** cursor: distance from the bottom of the page (pdf-lib coordinates) */
  y = A4.height - 36;
  onPageAdded?: (canvas: Canvas) => void;

  private constructor(pdf: PDFDocument, regular: PDFFont, bold: PDFFont) {
    this.pdf = pdf;
    this.regular = regular;
    this.bold = bold;
    this.charset = new Set([...regular.getCharacterSet(), 10, 13]);
  }

  static async create(font: PdfFont, meta: { title: string; author: string; subject?: string }) {
    const pdf = await PDFDocument.create();
    pdf.registerFontkit(fontkit);
    const bytes = await fontLoader(font);
    const [regular, bold] = await Promise.all([
      pdf.embedFont(bytes.regular, { subset: false }),
      pdf.embedFont(bytes.bold, { subset: false }),
    ]);
    pdf.setTitle(meta.title);
    pdf.setAuthor(meta.author);
    pdf.setCreator('Sarathi Associates Billing');
    pdf.setProducer('Sarathi Associates Billing');
    if (meta.subject) pdf.setSubject(meta.subject);
    pdf.setCreationDate(new Date());
    const canvas = new Canvas(pdf, regular, bold);
    return canvas;
  }

  get left() { return this.margin.left; }
  get right() { return A4.width - this.margin.right; }
  get width() { return A4.width - this.margin.left - this.margin.right; }
  get bottomLimit() { return this.margin.bottom; }

  addPage() {
    this.page = this.pdf.addPage([A4.width, A4.height]);
    this.pages.push(this.page);
    this.y = A4.height - this.margin.top;
    this.onPageAdded?.(this);
    return this.page;
  }

  /** Space left on the current page. */
  get remaining() { return this.y - this.bottomLimit; }

  /** Starts a new page if `height` does not fit. Returns true when a page was added. */
  ensure(height: number) {
    if (this.y - height < this.bottomLimit) {
      this.addPage();
      return true;
    }
    return false;
  }

  clean(value: unknown) {
    const text = String(value ?? '').replace(/\t/g, '    ').replace(/\r/g, '');
    let out = '';
    for (const ch of text) {
      const cp = ch.codePointAt(0) ?? 63;
      out += this.charset.has(cp) ? ch : (cp === 0x2019 || cp === 0x2018 ? "'" : cp === 0x201c || cp === 0x201d ? '"' : '?');
    }
    return out;
  }

  font(bold?: boolean) { return bold ? this.bold : this.regular; }

  textWidth(text: string, size: number, bold?: boolean, spacing = 0) {
    const t = this.clean(text);
    return this.font(bold).widthOfTextAtSize(t, size) + Math.max(0, t.length - 1) * spacing;
  }

  /** Draws a single line. `top` is the top of the text box; x is the anchor for the alignment. */
  text(value: unknown, x: number, top: number, opts: TextOptions = {}) {
    const size = opts.size ?? 8.5;
    const text = this.clean(value);
    if (!text) return 0;
    const font = this.font(opts.bold);
    const spacing = opts.spacing ?? 0;
    const width = font.widthOfTextAtSize(text, size) + Math.max(0, text.length - 1) * spacing;
    let drawX = x;
    if (opts.align === 'right') drawX = x - width;
    if (opts.align === 'center') drawX = x - width / 2;
    if (spacing) this.page.pushOperators(setCharacterSpacing(spacing));
    this.page.drawText(text, { x: drawX, y: top - size * 0.8, size, font, color: opts.color ?? INK, opacity: opts.opacity });
    if (spacing) this.page.pushOperators(setCharacterSpacing(0));
    return width;
  }

  /** Word-wraps text (respecting explicit new lines) to the given width. */
  wrap(value: unknown, size: number, width: number, bold?: boolean): string[] {
    const font = this.font(bold);
    const result: string[] = [];
    const paragraphs = this.clean(value).split('\n');
    for (const paragraph of paragraphs) {
      if (!paragraph.trim()) {
        result.push('');
        continue;
      }
      const words = paragraph.split(/ +/);
      let line = '';
      for (const rawWord of words) {
        let word = rawWord;
        // break very long words (URLs, long numbers) character by character
        while (font.widthOfTextAtSize(word, size) > width) {
          let cut = word.length - 1;
          while (cut > 1 && font.widthOfTextAtSize(word.slice(0, cut), size) > width) cut -= 1;
          if (line) { result.push(line); line = ''; }
          result.push(word.slice(0, cut));
          word = word.slice(cut);
        }
        const candidate = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(candidate, size) > width && line) {
          result.push(line);
          line = word;
        } else {
          line = candidate;
        }
      }
      result.push(line);
    }
    while (result.length > 1 && result[result.length - 1] === '') result.pop();
    return result.length ? result : [''];
  }

  /** Draws wrapped text and returns the height used. */
  paragraph(value: unknown, x: number, top: number, width: number, opts: TextOptions & { lineHeight?: number } = {}) {
    const size = opts.size ?? 8.5;
    const lh = opts.lineHeight ?? size * 1.35;
    const lines = this.wrap(value, size, width, opts.bold);
    lines.forEach((line, i) => this.text(line, opts.align === 'right' ? x + width : opts.align === 'center' ? x + width / 2 : x, top - i * lh, opts));
    return lines.length * lh;
  }

  rect(x: number, top: number, width: number, height: number, opts: { fill?: RGB; stroke?: RGB; strokeWidth?: number; opacity?: number; radius?: number } = {}) {
    if (opts.radius && opts.radius > 0) {
      const r = Math.min(opts.radius, width / 2, height / 2);
      // SVG path coordinates are relative to (x, top) with y pointing down.
      const path = `M ${r} 0 L ${width - r} 0 Q ${width} 0 ${width} ${r} L ${width} ${height - r} Q ${width} ${height} ${width - r} ${height} L ${r} ${height} Q 0 ${height} 0 ${height - r} L 0 ${r} Q 0 0 ${r} 0 Z`;
      this.page.drawSvgPath(path, {
        x, y: top, color: opts.fill, borderColor: opts.stroke, borderWidth: opts.stroke ? (opts.strokeWidth ?? 0.75) : 0,
        opacity: opts.opacity, borderOpacity: opts.opacity,
      });
      return;
    }
    this.page.drawRectangle({
      x, y: top - height, width, height, color: opts.fill, borderColor: opts.stroke,
      borderWidth: opts.stroke ? (opts.strokeWidth ?? 0.75) : 0, opacity: opts.opacity, borderOpacity: opts.opacity,
    });
  }

  line(x1: number, y1: number, x2: number, y2: number, color: RGB = LINE, thickness = 0.6, dash?: number[]) {
    this.page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, color, thickness, dashArray: dash });
  }

  async image(dataUrl: string | undefined | null): Promise<PDFImage | null> {
    if (!dataUrl || !dataUrl.startsWith('data:image/')) return null;
    try {
      const [meta, b64] = dataUrl.split(',');
      const binary = atob(b64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
      if (meta.includes('image/png')) return await this.pdf.embedPng(bytes);
      if (meta.includes('image/jpeg') || meta.includes('image/jpg')) return await this.pdf.embedJpg(bytes);
      return null;
    } catch {
      return null;
    }
  }

  /** Draws an image fitted (contain) inside a box. Returns drawn size. */
  drawImageFit(img: PDFImage, x: number, top: number, boxW: number, boxH: number, align: 'left' | 'center' | 'right' = 'center') {
    const scale = Math.min(boxW / img.width, boxH / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    const dx = align === 'left' ? 0 : align === 'right' ? boxW - w : (boxW - w) / 2;
    this.page.drawImage(img, { x: x + dx, y: top - (boxH + h) / 2, width: w, height: h });
    return { w, h };
  }

  qr(text: string, x: number, top: number, size: number, color: RGB = INK) {
    const qr = QRCode.create(text, { errorCorrectionLevel: 'M' });
    const count = qr.modules.size;
    const cell = size / (count + 2);
    this.rect(x, top, size, size, { fill: WHITE });
    for (let r = 0; r < count; r += 1) {
      for (let c = 0; c < count; c += 1) {
        if (qr.modules.get(r, c)) {
          this.page.drawRectangle({ x: x + (c + 1) * cell, y: top - (r + 2) * cell, width: cell + 0.05, height: cell + 0.05, color });
        }
      }
    }
  }

  watermark(text: string, color: RGB, opacity = 0.08) {
    for (const page of this.pages) {
      const size = 96;
      const width = this.bold.widthOfTextAtSize(text, size);
      const angle = 38;
      const rad = (angle * Math.PI) / 180;
      page.drawText(text, {
        x: A4.width / 2 - (width / 2) * Math.cos(rad) + (size * 0.35) * Math.sin(rad),
        y: A4.height / 2 - (width / 2) * Math.sin(rad) - (size * 0.35) * Math.cos(rad),
        size, font: this.bold, color, opacity, rotate: degrees(angle),
      });
    }
  }

  async save() {
    return this.pdf.save({ useObjectStreams: true });
  }
}
