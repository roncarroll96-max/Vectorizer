export const SUPPORTED_TYPES = ['image/png', 'image/jpeg', 'image/bmp', 'image/x-ms-bmp', 'image/webp'];
export const SUPPORTED_EXTENSIONS = ['png', 'jpg', 'jpeg', 'jfif', 'bmp', 'dib', 'webp'];
export const ACCEPT_ATTR = '.png,.jpg,.jpeg,.bmp,.webp,image/png,image/jpeg,image/bmp,image/webp';
/** Images larger than this (longest side) are downscaled for processing by default. */
export const MAX_PROCESS_DIM = 2000;
/** Hard ceiling even in "full resolution" mode, to stay within browser canvas limits. */
export const MAX_FULL_DIM = 8192;
const MAX_FILE_BYTES = 150 * 1024 * 1024;

export class ImageLoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImageLoadError';
  }
}

export interface LoadedImage {
  name: string;
  type: string;
  bytes: number;
  width: number;
  height: number;
  /** Decoded pixels, ready to draw onto a canvas. */
  source: ImageBitmap | HTMLImageElement;
  /** Object URL for displaying the original. */
  url: string;
}

function extensionOf(name: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(name);
  return m ? m[1].toLowerCase() : '';
}

export function isSupported(file: { type: string; name?: string }): boolean {
  if (file.type && SUPPORTED_TYPES.includes(file.type)) return true;
  if (!file.type || file.type === 'application/octet-stream') return SUPPORTED_EXTENSIONS.includes(extensionOf(file.name ?? ''));
  return false;
}

async function decodeWithImageElement(url: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.decoding = 'async';
  img.src = url;
  await img.decode();
  return img;
}

/** Validates and decodes a user-supplied file. Throws ImageLoadError with a friendly message. */
export async function loadImageFile(file: File | Blob, fallbackName = 'pasted-image.png'): Promise<LoadedImage> {
  const name = file instanceof File && file.name ? file.name : fallbackName;
  if (!isSupported({ type: file.type, name })) {
    const what = file.type ? file.type.replace(/^image\//, '').toUpperCase() : `“.${extensionOf(name) || '?'}”`;
    throw new ImageLoadError(`${what} files aren't supported. Please choose a PNG, JPG, BMP or WebP image.`);
  }
  if (file.size === 0) throw new ImageLoadError('That file is empty (0 bytes). Please choose another image.');
  if (file.size > MAX_FILE_BYTES) {
    throw new ImageLoadError('That file is over 150 MB — too large to process in the browser. Try a smaller image.');
  }
  const url = URL.createObjectURL(file);
  let source: ImageBitmap | HTMLImageElement;
  try {
    source = typeof createImageBitmap === 'function' ? await createImageBitmap(file) : await decodeWithImageElement(url);
  } catch {
    try {
      source = await decodeWithImageElement(url);
    } catch {
      URL.revokeObjectURL(url);
      throw new ImageLoadError(`We couldn't read “${name}”. The file may be corrupt or not really an image.`);
    }
  }
  const width = 'naturalWidth' in source ? source.naturalWidth : source.width;
  const height = 'naturalHeight' in source ? source.naturalHeight : source.height;
  if (!width || !height) {
    URL.revokeObjectURL(url);
    throw new ImageLoadError(`“${name}” has no pixels to trace.`);
  }
  return { name, type: file.type || `image/${extensionOf(name)}`, bytes: file.size, width, height, source, url };
}

export function processingSize(img: { width: number; height: number }, fullResolution: boolean) {
  const limit = fullResolution ? MAX_FULL_DIM : MAX_PROCESS_DIM;
  const longest = Math.max(img.width, img.height);
  const scale = longest > limit ? limit / longest : 1;
  return {
    width: Math.max(1, Math.round(img.width * scale)),
    height: Math.max(1, Math.round(img.height * scale)),
    scale,
  };
}

/** Rasterises the decoded image at processing size (high-quality downscale). */
export function getProcessingImageData(img: LoadedImage, fullResolution: boolean): ImageData {
  const { width, height } = processingSize(img, fullResolution);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new ImageLoadError('Your browser could not create a drawing canvas.');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img.source, 0, 0, width, height);
  return ctx.getImageData(0, 0, width, height);
}

export function disposeImage(img: LoadedImage | null) {
  if (!img) return;
  URL.revokeObjectURL(img.url);
  if ('close' in img.source) img.source.close();
}
