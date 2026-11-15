/**
 * Reads an uploaded image, scales it down and returns a PNG data URL suitable for
 * embedding in PDFs. Optionally turns near-white pixels transparent (signatures / stamps).
 */
export async function prepareImage(file: File, opts: { maxWidth: number; maxHeight: number; removeWhite?: boolean }): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Please choose an image file (PNG or JPG).');
  if (file.size > 8 * 1024 * 1024) throw new Error('Image is too large — please use a file under 8 MB.');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('This image could not be read.'));
      el.src = url;
    });
    const scale = Math.min(1, opts.maxWidth / img.naturalWidth, opts.maxHeight / img.naturalHeight);
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Your browser could not process the image.');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, w, h);
    if (opts.removeWhite) {
      const data = ctx.getImageData(0, 0, w, h);
      const px = data.data;
      for (let i = 0; i < px.length; i += 4) {
        const min = Math.min(px[i], px[i + 1], px[i + 2]);
        if (min > 238) px[i + 3] = 0;
        else if (min > 200) px[i + 3] = Math.round(px[i + 3] * ((238 - min) / 38));
      }
      ctx.putImageData(data, 0, 0);
    }
    return canvas.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(url);
  }
}
