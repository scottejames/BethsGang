import { describe, expect, it } from 'vitest';
import { findImageInClipboard } from './imageCapture';

function fakeClipboardData(items: Array<{ type: string; file?: File }>): DataTransfer {
  return {
    items: items.map((item) => ({
      type: item.type,
      getAsFile: () => item.file ?? null,
    })),
  } as unknown as DataTransfer;
}

describe('findImageInClipboard', () => {
  it('returns undefined when clipboardData is null', () => {
    expect(findImageInClipboard(null)).toBeUndefined();
  });

  it('returns undefined when the clipboard only has text', () => {
    const clipboardData = fakeClipboardData([{ type: 'text/plain' }]);
    expect(findImageInClipboard(clipboardData)).toBeUndefined();
  });

  it('returns the image file when the clipboard has an image item', () => {
    const file = new File(['fake'], 'screenshot.png', { type: 'image/png' });
    const clipboardData = fakeClipboardData([{ type: 'text/plain' }, { type: 'image/png', file }]);

    expect(findImageInClipboard(clipboardData)).toBe(file);
  });
});
