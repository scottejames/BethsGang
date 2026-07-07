export interface CapturedImage {
  base64: string;
  mediaType: string;
}

// Screenshots (especially from retina/high-DPI screens) can be several MB straight out of
// the clipboard — resizing client-side keeps the request well under AppSync's payload
// limit and speeds up the round trip, without hurting Claude's ability to read the text.
const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.9;

export async function captureImageForUpload(source: Blob): Promise<CapturedImage> {
  const bitmap = await createImageBitmap(source);
  try {
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error("Your browser doesn't support the image processing needed for this.");
    }
    ctx.drawImage(bitmap, 0, 0, width, height);

    const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
    const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
    return { base64, mediaType: 'image/jpeg' };
  } finally {
    bitmap.close();
  }
}

// Looks for a pasted image in a clipboard event (e.g. a screenshot copied to the
// clipboard) — returns undefined if the paste was plain text or anything else.
export function findImageInClipboard(clipboardData: DataTransfer | null): File | undefined {
  if (!clipboardData) return undefined;
  for (const item of clipboardData.items) {
    if (item.type.startsWith('image/')) {
      const file = item.getAsFile();
      if (file) return file;
    }
  }
  return undefined;
}
