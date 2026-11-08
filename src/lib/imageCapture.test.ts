import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { captureImageForUpload, findImageInClipboard } from './imageCapture';

function fakeClipboardData(items: Array<{ type: string; file?: File }>): DataTransfer {
  return {
    items: items.map((item) => ({
      type: item.type,
      getAsFile: () => item.file ?? null,
    })),
  } as unknown as DataTransfer;
}

describe('findImageInClipboard', () => {
  it('returns the pasted image file', () => {
    const file = new File(['x'], 'shot.png', { type: 'image/png' });
    expect(findImageInClipboard(fakeClipboardData([{ type: 'image/png', file }]))).toBe(file);
  });

  it('finds an image listed after plain text', () => {
    const file = new File(['x'], 'shot.png', { type: 'image/png' });
    const data = fakeClipboardData([{ type: 'text/plain' }, { type: 'image/png', file }]);
    expect(findImageInClipboard(data)).toBe(file);
  });

  it('returns undefined for a text-only paste', () => {
    expect(findImageInClipboard(fakeClipboardData([{ type: 'text/plain' }]))).toBeUndefined();
  });

  it('returns undefined with no clipboard data', () => {
    expect(findImageInClipboard(null)).toBeUndefined();
  });
});

describe('captureImageForUpload', () => {
  const close = vi.fn();
  const drawImage = vi.fn();
  const source = new Blob(['fake'], { type: 'image/png' });

  function stubBitmap(width: number, height: number) {
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width, height, close }));
  }

  beforeEach(() => {
    close.mockReset();
    drawImage.mockReset();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage,
    } as unknown as ImageBitmapRenderingContext);
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(
      'data:image/jpeg;base64,RU5DT0RFRA==',
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const drawnSize = () => drawImage.mock.calls[0].slice(3);

  it('returns JPEG base64 without the data URL prefix', async () => {
    stubBitmap(800, 600);

    await expect(captureImageForUpload(source)).resolves.toEqual({
      base64: 'RU5DT0RFRA==',
      mediaType: 'image/jpeg',
    });
  });

  it('shrinks a wide screenshot to the size limit, keeping its shape', async () => {
    stubBitmap(3200, 1600);

    await captureImageForUpload(source);

    expect(drawnSize()).toEqual([1600, 800]);
  });

  it('shrinks a tall screenshot by its height', async () => {
    stubBitmap(1000, 4000);

    await captureImageForUpload(source);

    expect(drawnSize()).toEqual([400, 1600]);
  });

  it('never enlarges a small image', async () => {
    stubBitmap(300, 200);

    await captureImageForUpload(source);

    expect(drawnSize()).toEqual([300, 200]);
  });

  it('releases the image memory afterwards', async () => {
    stubBitmap(800, 600);

    await captureImageForUpload(source);

    expect(close).toHaveBeenCalledTimes(1);
  });

  it('fails clearly, and still releases memory, without canvas support', async () => {
    stubBitmap(800, 600);
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(null);

    await expect(captureImageForUpload(source)).rejects.toThrow(/doesn't support/);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('rejects a file that is not a readable image', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('bad image')));

    await expect(captureImageForUpload(source)).rejects.toThrow('bad image');
  });
});
