import type { RGBAImage } from './types';
import { luma } from './color';

/** Labels are Int16: -1 = transparent, otherwise a palette index. */
export type LabelMap = Int16Array;

export function toGray(img: RGBAImage): Uint8Array {
  const { data } = img;
  const n = img.width * img.height;
  const g = new Uint8Array(n);
  for (let i = 0; i < n; i++) g[i] = luma(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
  return g;
}

/**
 * Otsu's method over opaque pixels. Returns a threshold t such that
 * "foreground" (dark) is gray < t — the same convention as the manual slider.
 */
export function otsuThreshold(gray: Uint8Array, img?: RGBAImage): number {
  const hist = new Float64Array(256);
  let total = 0;
  for (let i = 0; i < gray.length; i++) {
    if (img && img.data[i * 4 + 3] === 0) continue;
    hist[gray[i]]++;
    total++;
  }
  if (total === 0) return 128;
  let sumAll = 0;
  for (let i = 0; i < 256; i++) sumAll += i * hist[i];
  let wB = 0, sumB = 0, best = -1, bestT = 127;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sumAll - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) { best = between; bestT = t; }
  }
  return bestT + 1;
}

/** Foreground mask: 1 where the pixel is opaque and darker than the threshold (xor invert). */
export function thresholdMask(img: RGBAImage, threshold: number, invert: boolean): Uint8Array {
  const gray = toGray(img);
  const n = gray.length;
  const mask = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (img.data[i * 4 + 3] === 0) continue;
    const dark = gray[i] < threshold;
    mask[i] = dark !== invert ? 1 : 0;
  }
  return mask;
}

/** B&W segmentation: label 0 = background (white), 1 = foreground (black), -1 = transparent. */
export function segmentBW(img: RGBAImage, threshold: number, invert: boolean): LabelMap {
  const mask = thresholdMask(img, threshold, invert);
  const labels = new Int16Array(mask.length);
  for (let i = 0; i < mask.length; i++) labels[i] = img.data[i * 4 + 3] === 0 ? -1 : mask[i];
  return labels;
}
