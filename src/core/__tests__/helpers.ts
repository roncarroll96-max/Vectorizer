import type { Point, RGBAImage } from '../types';

export function makeImage(w: number, h: number, rgb: [number, number, number] = [255, 255, 255]): RGBAImage {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = rgb[0]; data[i * 4 + 1] = rgb[1]; data[i * 4 + 2] = rgb[2]; data[i * 4 + 3] = 255;
  }
  return { width: w, height: h, data };
}

export function setPixel(img: RGBAImage, x: number, y: number, rgb: [number, number, number]) {
  if (x < 0 || y < 0 || x >= img.width || y >= img.height) return;
  const o = (y * img.width + x) * 4;
  img.data[o] = rgb[0]; img.data[o + 1] = rgb[1]; img.data[o + 2] = rgb[2]; img.data[o + 3] = 255;
}

export function fillCircle(img: RGBAImage, cx: number, cy: number, r: number, rgb: [number, number, number]) {
  for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
    if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r) setPixel(img, x, y, rgb);
  }
}

export function fillRing(img: RGBAImage, cx: number, cy: number, r0: number, r1: number, rgb: [number, number, number]) {
  for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
    const d = (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2;
    if (d <= r1 * r1 && d >= r0 * r0) setPixel(img, x, y, rgb);
  }
}

export function fillRect(img: RGBAImage, x0: number, y0: number, w: number, h: number, rgb: [number, number, number]) {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) setPixel(img, x, y, rgb);
}

// A tiny 5×7 bitmap font — enough to render "text" without a canvas.
const GLYPHS: Record<string, string[]> = {
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  V: ['10001', '10001', '10001', '10001', '01010', '01010', '00100'],
  G: ['01111', '10000', '10000', '10011', '10001', '10001', '01111'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
};

export function drawText(img: RGBAImage, text: string, x0: number, y0: number, scale: number, rgb: [number, number, number]) {
  let x = x0;
  for (const ch of text) {
    const g = GLYPHS[ch];
    if (g) g.forEach((row, gy) => [...row].forEach((bit, gx) => {
      if (bit === '1') fillRect(img, x + gx * scale, y0 + gy * scale, scale, scale, rgb);
    }));
    x += 6 * scale;
  }
}

const bez = (p0: Point, c1: Point, c2: Point, p3: Point, t: number): Point => {
  const mt = 1 - t;
  return [
    mt ** 3 * p0[0] + 3 * mt * mt * t * c1[0] + 3 * mt * t * t * c2[0] + t ** 3 * p3[0],
    mt ** 3 * p0[1] + 3 * mt * mt * t * c1[1] + 3 * mt * t * t * c2[1] + t ** 3 * p3[1],
  ];
};

/**
 * Minimal SVG path-data parser for the subset our writer emits
 * (M m L l H h V v C c S s Z z), flattening curves into polygons.
 */
export function parsePathData(d: string): Point[][] {
  const tokens = d.match(/[MmLlHhVvCcSsZz]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g) ?? [];
  const polys: Point[][] = [];
  let cur: Point = [0, 0], start: Point = [0, 0];
  let poly: Point[] = [];
  let cmd = '';
  let prevC2: Point | null = null;
  let i = 0;
  const num = () => {
    const v = Number(tokens[i++]);
    if (Number.isNaN(v)) throw new Error(`Bad number near token ${i}`);
    return v;
  };
  const isNum = () => i < tokens.length && !/^[A-Za-z]$/.test(tokens[i]);
  while (i < tokens.length) {
    if (/^[A-Za-z]$/.test(tokens[i])) cmd = tokens[i++];
    else if (!cmd) throw new Error('Path data must start with a command');
    const rel = cmd === cmd.toLowerCase();
    const o = rel ? cur : ([0, 0] as Point);
    switch (cmd.toUpperCase()) {
      case 'M': {
        if (poly.length) polys.push(poly);
        cur = [o[0] + num(), o[1] + num()];
        start = cur; poly = [cur]; prevC2 = null;
        cmd = rel ? 'l' : 'L';
        break;
      }
      case 'L': cur = [o[0] + num(), o[1] + num()]; poly.push(cur); prevC2 = null; break;
      case 'H': cur = [(rel ? cur[0] : 0) + num(), cur[1]]; poly.push(cur); prevC2 = null; break;
      case 'V': cur = [cur[0], (rel ? cur[1] : 0) + num()]; poly.push(cur); prevC2 = null; break;
      case 'C': case 'S': {
        let c1: Point;
        if (cmd.toUpperCase() === 'C') c1 = [o[0] + num(), o[1] + num()];
        else c1 = prevC2 ? [2 * cur[0] - prevC2[0], 2 * cur[1] - prevC2[1]] : cur;
        const c2: Point = [o[0] + num(), o[1] + num()];
        const p: Point = [o[0] + num(), o[1] + num()];
        for (let t = 1; t <= 12; t++) poly.push(bez(cur, c1, c2, p, t / 12));
        cur = p; prevC2 = c2;
        break;
      }
      case 'Z':
        if (poly.length) polys.push(poly);
        poly = []; cur = start; prevC2 = null;
        if (isNum()) throw new Error('Numbers after Z');
        cmd = '';
        break;
      default: throw new Error(`Unsupported command ${cmd}`);
    }
  }
  if (poly.length) polys.push(poly);
  return polys;
}

/** Even-odd point-in-polygons test at every pixel centre. */
export function rasterizeEvenOdd(polys: Point[][], w: number, h: number): Uint8Array {
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const py = y + 0.5;
    const xs: number[] = [];
    for (const poly of polys) {
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const [x1, y1] = poly[j], [x2, y2] = poly[i];
        if ((y1 > py) !== (y2 > py)) xs.push(x1 + ((py - y1) * (x2 - x1)) / (y2 - y1));
      }
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const a = Math.max(0, Math.ceil(xs[k] - 0.5)), b = Math.min(w - 1, Math.floor(xs[k + 1] - 0.5));
      for (let x = a; x <= b; x++) out[y * w + x] = 1;
    }
  }
  return out;
}
