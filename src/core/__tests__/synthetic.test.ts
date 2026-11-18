import { describe, expect, it } from 'vitest';
import { traceImage } from '../pipeline';
import { buildSvg } from '../svg';
import { DEFAULT_SETTINGS } from '../presets';
import { traceContours } from '../contour';
import type { RGBAImage, Settings, TraceResult } from '../types';
import { drawText, fillCircle, fillRect, fillRing, makeImage, parsePathData, rasterizeEvenOdd } from './helpers';

type RGB = [number, number, number];
const RED: RGB = [214, 40, 40], BLUE: RGB = [30, 80, 200], GREEN: RGB = [40, 160, 70], BLACK: RGB = [0, 0, 0];

/** Circles, squares, a ring (hole) and bitmap "text" on white. */
function syntheticImage(): RGBAImage {
  const img = makeImage(200, 140);
  fillCircle(img, 40, 40, 28, RED);
  fillRect(img, 90, 15, 50, 50, BLUE);
  fillRing(img, 165, 40, 10, 25, GREEN);
  drawText(img, 'SVGOA', 12, 90, 6, BLACK);
  return img;
}

/** Renders a result's final path data back to a label map, painting layers back to front. */
function renderLayers(result: TraceResult): Int16Array {
  const { width: w, height: h } = result;
  const out = new Int16Array(w * h).fill(-1);
  result.layers.forEach((layer, k) => {
    const m = rasterizeEvenOdd(parsePathData(layer.d), w, h);
    for (let i = 0; i < m.length; i++) if (m[i]) out[i] = k;
  });
  return out;
}

const hexToRgb = (hex: string): RGB => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as RGB;
const colorDist = (a: RGB, b: RGB) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

function accuracy(img: RGBAImage, result: TraceResult): { acc: number; uncovered: number } {
  const rendered = renderLayers(result);
  let good = 0, uncovered = 0;
  for (let i = 0; i < rendered.length; i++) {
    if (rendered[i] < 0) { uncovered++; continue; }
    const c = hexToRgb(result.layers[rendered[i]].color);
    const src: RGB = [img.data[i * 4], img.data[i * 4 + 1], img.data[i * 4 + 2]];
    if (colorDist(c, src) < 60) good++;
  }
  return { acc: good / rendered.length, uncovered };
}

describe('contour tracing', () => {
  it('finds outer boundaries and holes with opposite orientation', () => {
    const w = 7, h = 7;
    const mask = new Uint8Array(w * h);
    for (let y = 1; y < 6; y++) for (let x = 1; x < 6; x++) mask[y * w + x] = 1;
    mask[3 * w + 3] = 0; // one-pixel hole
    const loops = traceContours(mask, w, h);
    expect(loops).toHaveLength(2);
    const area = (p: number[][]) => p.reduce((a, q, i) => {
      const r = p[(i + 1) % p.length];
      return a + q[0] * r[1] - r[0] * q[1];
    }, 0) / 2;
    const areas = loops.map(area).sort((a, b) => a - b);
    expect(areas).toEqual([-1, 25]);
  });

  it('separates diagonally touching pixels consistently', () => {
    const mask = new Uint8Array([1, 0, 0, 1]);
    expect(traceContours(mask, 2, 2)).toHaveLength(2);
  });
});

describe('synthetic image: circles, squares and text', () => {
  const img = syntheticImage();

  it('color mode reproduces the image with no seams', () => {
    const settings: Settings = { ...DEFAULT_SETTINGS, mode: 'color', colors: 5, minSpeck: 4, smoothness: 1, simplify: 0.8 };
    const result = traceImage(img, settings);
    expect(result.layers).toHaveLength(5);
    // Background (largest area) is at the back and is white.
    expect(colorDist(hexToRgb(result.layers[0].color), [255, 255, 255])).toBeLessThan(10);
    const { acc, uncovered } = accuracy(img, result);
    expect(uncovered).toBe(0); // stacked layers ⇒ no pixel is left uncovered
    expect(acc).toBeGreaterThan(0.97);
  });

  it('keeps holes: the ring and the letters O/A/G have counters', () => {
    const result = traceImage(img, { ...DEFAULT_SETTINGS, mode: 'color', colors: 5, minSpeck: 4 });
    const green = result.layers.find((l) => colorDist(hexToRgb(l.color), GREEN) < 40)!;
    expect(green).toBeDefined();
    // ring = outer + inner boundary; the green layer is the topmost for that area
    const rendered = rasterizeEvenOdd(parsePathData(green.d), result.width, result.height);
    expect(rendered[40 * 200 + 165]).toBe(0); // centre of the ring is a hole
    expect(rendered[40 * 200 + 165 + 17]).toBe(1); // ring body is filled
  });

  it('B&W mode with Otsu separates ink from paper', () => {
    const result = traceImage(img, { ...DEFAULT_SETTINGS, mode: 'bw', minSpeck: 4 });
    expect(result.thresholdUsed).toBeGreaterThan(100);
    expect(result.layers.map((l) => l.color)).toEqual(['#ffffff', '#000000']);
    const ink = rasterizeEvenOdd(parsePathData(result.layers[1].d), result.width, result.height);
    let agree = 0;
    for (let i = 0; i < ink.length; i++) {
      const g = 0.299 * img.data[i * 4] + 0.587 * img.data[i * 4 + 1] + 0.114 * img.data[i * 4 + 2];
      if ((g < result.thresholdUsed!) === (ink[i] === 1)) agree++;
    }
    expect(agree / ink.length).toBeGreaterThan(0.97);
  });

  it('removes specks below the minimum area', () => {
    const noisy = syntheticImage();
    for (let k = 0; k < 40; k++) fillRect(noisy, 3 + ((k * 37) % 190), 134 + (k % 3) * 2, 1, 1, BLACK);
    const clean = traceImage(noisy, { ...DEFAULT_SETTINGS, mode: 'bw', minSpeck: 6 });
    const dirty = traceImage(noisy, { ...DEFAULT_SETTINGS, mode: 'bw', minSpeck: 0 });
    expect(clean.layers[1].pathCount).toBeLessThan(dirty.layers[1].pathCount);
    expect(dirty.layers[1].pathCount - clean.layers[1].pathCount).toBeGreaterThanOrEqual(25);
  });

  it('circles become curves while squares keep sharp corners', () => {
    const shapes = makeImage(120, 60);
    fillCircle(shapes, 30, 30, 22, BLACK);
    fillRect(shapes, 70, 10, 40, 40, BLACK);
    const result = traceImage(shapes, { ...DEFAULT_SETTINGS, mode: 'bw', smoothness: 1, cornerAngle: 60 });
    const d = result.layers[1].d;
    const subpaths = d.split(/[Mm]/).filter(Boolean);
    expect(subpaths).toHaveLength(2);
    const square = subpaths.find((p) => /^[^c]*$/.test(p));
    const circle = subpaths.find((p) => p.includes('c'));
    expect(square).toBeDefined();
    expect(circle).toBeDefined();
    expect(result.layers[1].nodeCount).toBeLessThan(20);
  });

  it('simplify tolerance reduces node count monotonically', () => {
    const counts = [0.3, 1, 3].map((simplify) =>
      traceImage(img, { ...DEFAULT_SETTINGS, mode: 'bw', simplify, smoothness: 0 }).layers[1].nodeCount);
    expect(counts[0]).toBeGreaterThan(counts[1]);
    expect(counts[1]).toBeGreaterThan(counts[2]);
  });

  it('line art traces centerlines of strokes', () => {
    const sketch = makeImage(120, 80);
    fillRect(sketch, 10, 20, 100, 4, BLACK); // horizontal stroke
    fillRect(sketch, 58, 20, 4, 50, BLACK); // vertical stroke forming a T
    const result = traceImage(sketch, { ...DEFAULT_SETTINGS, mode: 'lineart', minSpeck: 4 });
    expect(result.layers).toHaveLength(1);
    expect(result.strokeWidth).toBeGreaterThan(2.5);
    expect(result.strokeWidth).toBeLessThan(6);
    const polys = parsePathData(result.layers[0].d);
    expect(polys.length).toBeGreaterThanOrEqual(2);
    expect(polys.length).toBeLessThanOrEqual(4);
    // all centerline points lie inside the ink
    for (const poly of polys) for (const [x, y] of poly) {
      const inH = y >= 19 && y <= 25 && x >= 9 && x <= 111;
      const inV = x >= 57 && x <= 63 && y >= 19 && y <= 71;
      expect(inH || inV).toBe(true);
    }
  });

  it('background removal leaves the background transparent', () => {
    const result = traceImage(img, { ...DEFAULT_SETTINGS, mode: 'color', colors: 4, bgRemove: true, minSpeck: 4 });
    expect(result.removedBackground).toBe('#ffffff');
    const rendered = renderLayers(result);
    expect(rendered[0]).toBe(-1); // top-left corner is background
    expect(rendered[40 * 200 + 40]).toBeGreaterThanOrEqual(0); // red circle centre
    // Contiguous removal keeps enclosed white (letter counters, the ring's hole)…
    expect(buildSvg(result).svg).toContain('fill="#fff"');
    // …while global removal drops every white pixel.
    const global = traceImage(img, { ...DEFAULT_SETTINGS, mode: 'color', colors: 4, bgRemove: true, bgContiguous: false, minSpeck: 4 });
    expect(buildSvg(global).svg).not.toContain('fill="#fff"');
  });
});
