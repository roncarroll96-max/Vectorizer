import type { RGBAImage, Quantizer } from './types';
import { mulberry32, type RGB } from './color';
import type { LabelMap } from './segment';

export interface QuantizeResult {
  palette: RGB[];
  labels: LabelMap;
}

const MAX_SAMPLES = 60000;

/**
 * Gathers a deterministic pixel sample for clustering. Pixels on edges
 * (anti-aliasing, blur fringes) are skipped when enough "flat" pixels exist,
 * so clusters model real regions instead of thin blended halos.
 */
function samplePixels(img: RGBAImage): Float32Array {
  const { data, width: w, height: h } = img;
  const n = w * h;
  const flat = new Uint8Array(n);
  let opaque = 0, flatCount = 0;
  const diff = (a: number, b: number) =>
    Math.abs(data[a] - data[b]) + Math.abs(data[a + 1] - data[b + 1]) + Math.abs(data[a + 2] - data[b + 2]);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x, o = i * 4;
      if (data[o + 3] === 0) continue;
      opaque++;
      // Gradient over a 2-px span, so gentle (blurred) ramps still count as edges.
      let g = 0;
      if (x + 2 < w) g = Math.max(g, diff(o, o + 8));
      if (x > 1) g = Math.max(g, diff(o, o - 8));
      if (y + 2 < h) g = Math.max(g, diff(o, o + w * 8));
      if (y > 1) g = Math.max(g, diff(o, o - w * 8));
      if (g < 36) { flat[i] = 1; flatCount++; }
    }
  }
  const useFlat = flatCount >= opaque * 0.15;
  const pool = useFlat ? flatCount : opaque;
  const step = Math.max(1, Math.floor(pool / MAX_SAMPLES));
  const out = new Float32Array(Math.ceil(pool / step) * 3);
  let k = 0, seen = 0;
  for (let i = 0; i < n; i++) {
    if (data[i * 4 + 3] === 0 || (useFlat && !flat[i])) continue;
    if (seen++ % step !== 0) continue;
    out[k++] = data[i * 4];
    out[k++] = data[i * 4 + 1];
    out[k++] = data[i * 4 + 2];
  }
  return out.subarray(0, k);
}

const d2 = (s: Float32Array, i: number, c: RGB) => {
  const dr = s[i] - c[0], dg = s[i + 1] - c[1], db = s[i + 2] - c[2];
  return dr * dr + dg * dg + db * db;
};

/** Median cut: repeatedly split the box with the widest channel range at its median. */
export function medianCut(samples: Float32Array, k: number): RGB[] {
  const count = samples.length / 3;
  if (count === 0) return [];
  let boxes: Int32Array[] = [Int32Array.from({ length: count }, (_, i) => i)];
  const range = (box: Int32Array) => {
    const lo = [255, 255, 255], hi = [0, 0, 0];
    for (const i of box) for (let c = 0; c < 3; c++) {
      const v = samples[i * 3 + c];
      if (v < lo[c]) lo[c] = v;
      if (v > hi[c]) hi[c] = v;
    }
    const r = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]];
    const ch = r[0] >= r[1] && r[0] >= r[2] ? 0 : r[1] >= r[2] ? 1 : 2;
    return { ch, span: r[ch] };
  };
  while (boxes.length < k) {
    let bi = -1, bestScore = 0, bestCh = 0;
    boxes.forEach((b, i) => {
      if (b.length < 2) return;
      const { ch, span } = range(b);
      const score = span * Math.sqrt(b.length);
      if (score > bestScore) { bestScore = score; bi = i; bestCh = ch; }
    });
    if (bi < 0) break;
    const box = Array.from(boxes[bi]).sort((a, b) => samples[a * 3 + bestCh] - samples[b * 3 + bestCh]);
    const mid = box.length >> 1;
    boxes = [...boxes.slice(0, bi), Int32Array.from(box.slice(0, mid)), Int32Array.from(box.slice(mid)), ...boxes.slice(bi + 1)];
  }
  return boxes.map((b) => {
    const s: RGB = [0, 0, 0];
    for (const i of b) { s[0] += samples[i * 3]; s[1] += samples[i * 3 + 1]; s[2] += samples[i * 3 + 2]; }
    return [s[0] / b.length, s[1] / b.length, s[2] / b.length] as RGB;
  });
}

/** k-means with k-means++ seeding on a pixel sample (deterministic). */
export function kMeans(samples: Float32Array, k: number, seed = 1, iterations = 16): RGB[] {
  const count = samples.length / 3;
  if (count === 0) return [];
  const rand = mulberry32(seed);
  const centers: RGB[] = [];
  const first = Math.floor(rand() * count) * 3;
  centers.push([samples[first], samples[first + 1], samples[first + 2]]);
  const dist = new Float64Array(count).fill(Infinity);
  while (centers.length < k) {
    const c = centers[centers.length - 1];
    let total = 0;
    for (let i = 0; i < count; i++) {
      const dd = d2(samples, i * 3, c);
      if (dd < dist[i]) dist[i] = dd;
      total += dist[i];
    }
    if (total === 0) break; // fewer unique colors than k
    let r = rand() * total;
    let pick = count - 1;
    for (let i = 0; i < count; i++) { r -= dist[i]; if (r <= 0) { pick = i; break; } }
    centers.push([samples[pick * 3], samples[pick * 3 + 1], samples[pick * 3 + 2]]);
  }
  return lloyd(samples, centers, iterations);
}

function lloyd(samples: Float32Array, init: RGB[], iterations: number): RGB[] {
  const count = samples.length / 3;
  let centers = init.map((c) => [...c] as RGB);
  const assign = new Int32Array(count);
  for (let it = 0; it < iterations; it++) {
    const sums = new Float64Array(centers.length * 3);
    const cnt = new Float64Array(centers.length);
    for (let i = 0; i < count; i++) {
      let best = 0, bd = Infinity;
      for (let c = 0; c < centers.length; c++) {
        const dd = d2(samples, i * 3, centers[c]);
        if (dd < bd) { bd = dd; best = c; }
      }
      assign[i] = best;
      cnt[best]++;
      sums[best * 3] += samples[i * 3];
      sums[best * 3 + 1] += samples[i * 3 + 1];
      sums[best * 3 + 2] += samples[i * 3 + 2];
    }
    let moved = 0;
    centers = centers.map((c, j) => {
      if (cnt[j] === 0) return c;
      const n: RGB = [sums[j * 3] / cnt[j], sums[j * 3 + 1] / cnt[j], sums[j * 3 + 2] / cnt[j]];
      moved = Math.max(moved, Math.abs(n[0] - c[0]) + Math.abs(n[1] - c[1]) + Math.abs(n[2] - c[2]));
      return n;
    });
    if (moved < 0.5) break;
  }
  return centers;
}

/**
 * Quantizes to at most `k` colors. Every opaque pixel is mapped to its nearest
 * center (through an 18-bit color cache), empty clusters are dropped and the
 * palette is recomputed as the true mean of each cluster.
 */
export function quantize(img: RGBAImage, k: number, method: Quantizer, seed = 1): QuantizeResult {
  const kk = Math.max(2, Math.min(64, Math.round(k)));
  const samples = samplePixels(img);
  const rawCenters = method === 'mediancut' ? lloyd(samples, medianCut(samples, kk), 2) : kMeans(samples, kk, seed);
  // Merge near-duplicate centers (they would only create invisible extra layers).
  const merged: RGB[] = [];
  for (const c of rawCenters) {
    if (!merged.some((m) => (m[0] - c[0]) ** 2 + (m[1] - c[1]) ** 2 + (m[2] - c[2]) ** 2 < 100)) merged.push(c);
  }
  const centers = merged;
  const { data } = img;
  const n = img.width * img.height;
  const labels = new Int16Array(n);
  const cache = new Int16Array(1 << 18).fill(-1);
  const sums = new Float64Array(centers.length * 3);
  const cnt = new Float64Array(centers.length);
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    if (data[o + 3] === 0) { labels[i] = -1; continue; }
    const r = data[o], g = data[o + 1], b = data[o + 2];
    const key = ((r >> 2) << 12) | ((g >> 2) << 6) | (b >> 2);
    let best = cache[key];
    if (best < 0) {
      let bd = Infinity;
      for (let c = 0; c < centers.length; c++) {
        const cc = centers[c];
        const dr = r - cc[0], dg = g - cc[1], db = b - cc[2];
        const dd = dr * dr + dg * dg + db * db;
        if (dd < bd) { bd = dd; best = c; }
      }
      cache[key] = best;
    }
    labels[i] = best;
    cnt[best]++;
    sums[best * 3] += r; sums[best * 3 + 1] += g; sums[best * 3 + 2] += b;
  }
  const remap = new Int16Array(centers.length).fill(-1);
  const palette: RGB[] = [];
  for (let c = 0; c < centers.length; c++) {
    if (cnt[c] === 0) continue;
    remap[c] = palette.length;
    palette.push([sums[c * 3] / cnt[c], sums[c * 3 + 1] / cnt[c], sums[c * 3 + 2] / cnt[c]]);
  }
  for (let i = 0; i < n; i++) if (labels[i] >= 0) labels[i] = remap[labels[i]];
  return { palette, labels };
}
