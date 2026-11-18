import type { RGBAImage, Settings } from './types';
import { hexToRgb, rgbToHex, type RGB } from './color';

export interface PreprocessResult {
  image: RGBAImage;
  removedBackground: string | null;
}

/** Alpha below this is treated as fully transparent. */
export const ALPHA_CUTOFF = 128;

export function cloneImage(img: RGBAImage): RGBAImage {
  return { width: img.width, height: img.height, data: new Uint8ClampedArray(img.data) };
}

/** Runs the optional preprocessing steps and returns a new image (input is untouched). */
export function preprocess(src: RGBAImage, s: Settings): PreprocessResult {
  const img = cloneImage(src);
  const { data } = img;
  // Normalise alpha to binary so later stages can test a single bit.
  for (let i = 3; i < data.length; i += 4) data[i] = data[i] < ALPHA_CUTOFF ? 0 : 255;

  if (s.denoise) medianFilter3(img);
  if (s.blur > 0) gaussianBlur(img, s.blur);
  if (s.contrast !== 0) adjustContrast(img, s.contrast);

  let removedBackground: string | null = null;
  if (s.bgRemove) {
    const color = s.bgColor ? hexToRgb(s.bgColor) : detectBackground(img);
    if (color) {
      removeBackground(img, color, s.bgTolerance, s.bgContiguous);
      removedBackground = rgbToHex(color);
    }
  }
  return { image: img, removedBackground };
}

/** Contrast in −100…100 using the standard curve around mid-grey. */
export function adjustContrast(img: RGBAImage, contrast: number): void {
  const c = Math.max(-100, Math.min(100, contrast)) * 2.55;
  const f = (259 * (c + 255)) / (255 * (259 - c));
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i] = f * (d[i] - 128) + 128;
    d[i + 1] = f * (d[i + 1] - 128) + 128;
    d[i + 2] = f * (d[i + 2] - 128) + 128;
  }
}

/** 3×3 median per RGB channel (edges clamp). */
export function medianFilter3(img: RGBAImage): void {
  const { width: w, height: h } = img;
  const src = new Uint8ClampedArray(img.data);
  const out = img.data;
  const win = new Uint8Array(9);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) {
        let k = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy < 0 ? 0 : y + dy >= h ? h - 1 : y + dy;
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx < 0 ? 0 : x + dx >= w ? w - 1 : x + dx;
            win[k++] = src[(yy * w + xx) * 4 + c];
          }
        }
        // insertion sort of 9 values is fast enough and branch-predictable
        for (let i = 1; i < 9; i++) {
          const v = win[i];
          let j = i - 1;
          while (j >= 0 && win[j] > v) { win[j + 1] = win[j]; j--; }
          win[j + 1] = v;
        }
        out[o + c] = win[4];
      }
    }
  }
}

/** Approximates a Gaussian with three successive box blurs (separable, O(n) per pass). */
export function gaussianBlur(img: RGBAImage, radius: number): void {
  const r = Math.max(1, Math.round(radius));
  const { width: w, height: h, data } = img;
  const n = w * h;
  const chan = new Float32Array(n);
  const tmp = new Float32Array(n);
  for (let c = 0; c < 3; c++) {
    for (let i = 0; i < n; i++) chan[i] = data[i * 4 + c];
    for (let pass = 0; pass < 3; pass++) {
      boxBlurH(chan, tmp, w, h, r);
      boxBlurV(tmp, chan, w, h, r);
    }
    for (let i = 0; i < n; i++) data[i * 4 + c] = chan[i];
  }
}

function boxBlurH(src: Float32Array, dst: Float32Array, w: number, h: number, r: number): void {
  const inv = 1 / (2 * r + 1);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let acc = 0;
    for (let k = -r; k <= r; k++) acc += src[row + Math.min(w - 1, Math.max(0, k))];
    for (let x = 0; x < w; x++) {
      dst[row + x] = acc * inv;
      const add = Math.min(w - 1, x + r + 1);
      const sub = Math.max(0, x - r);
      acc += src[row + add] - src[row + sub];
    }
  }
}

function boxBlurV(src: Float32Array, dst: Float32Array, w: number, h: number, r: number): void {
  const inv = 1 / (2 * r + 1);
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let k = -r; k <= r; k++) acc += src[Math.min(h - 1, Math.max(0, k)) * w + x];
    for (let y = 0; y < h; y++) {
      dst[y * w + x] = acc * inv;
      const add = Math.min(h - 1, y + r + 1);
      const sub = Math.max(0, y - r);
      acc += src[add * w + x] - src[sub * w + x];
    }
  }
}

/**
 * Picks the dominant color along the image border (bucketed to 4 bits/channel,
 * then averaged inside the winning bucket). Returns null if the border is transparent.
 */
export function detectBackground(img: RGBAImage): RGB | null {
  const { width: w, height: h, data } = img;
  const counts = new Uint32Array(4096);
  const sums = new Float64Array(4096 * 3);
  const visit = (x: number, y: number) => {
    const o = (y * w + x) * 4;
    if (data[o + 3] === 0) return;
    const key = ((data[o] >> 4) << 8) | ((data[o + 1] >> 4) << 4) | (data[o + 2] >> 4);
    counts[key]++;
    sums[key * 3] += data[o];
    sums[key * 3 + 1] += data[o + 1];
    sums[key * 3 + 2] += data[o + 2];
  };
  for (let x = 0; x < w; x++) { visit(x, 0); if (h > 1) visit(x, h - 1); }
  for (let y = 1; y < h - 1; y++) { visit(0, y); if (w > 1) visit(w - 1, y); }
  let best = -1;
  let bestCount = 0;
  for (let k = 0; k < 4096; k++) if (counts[k] > bestCount) { bestCount = counts[k]; best = k; }
  if (best < 0) return null;
  return [sums[best * 3] / bestCount, sums[best * 3 + 1] / bestCount, sums[best * 3 + 2] / bestCount];
}

/** Makes pixels near `color` transparent; optionally only those connected to the border. */
export function removeBackground(img: RGBAImage, color: RGB, tolerance: number, contiguous: boolean): void {
  const { width: w, height: h, data } = img;
  const t2 = tolerance * tolerance;
  const [br, bg, bb] = color;
  const matches = (i: number) => {
    const o = i * 4;
    if (data[o + 3] === 0) return true;
    const dr = data[o] - br, dg = data[o + 1] - bg, db = data[o + 2] - bb;
    return dr * dr + dg * dg + db * db <= t2;
  };
  const n = w * h;
  if (!contiguous) {
    for (let i = 0; i < n; i++) if (matches(i)) data[i * 4 + 3] = 0;
    return;
  }
  const seen = new Uint8Array(n);
  const stack = new Int32Array(n);
  let sp = 0;
  const push = (i: number) => { if (!seen[i] && matches(i)) { seen[i] = 1; stack[sp++] = i; } };
  for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
  while (sp > 0) {
    const i = stack[--sp];
    data[i * 4 + 3] = 0;
    const x = i % w;
    if (x > 0) push(i - 1);
    if (x < w - 1) push(i + 1);
    if (i >= w) push(i - w);
    if (i < n - w) push(i + w);
  }
}
