// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { buildSvg, loopsToPathData } from '../svg';
import { traceImage } from '../pipeline';
import { DEFAULT_SETTINGS } from '../presets';
import type { PathLoop, Settings } from '../types';
import { fillCircle, fillRect, makeImage, parsePathData } from './helpers';

const PATH_DATA_RE = /^M-?[\d.]+(?:[ -]?-?[\d.]+)*(?:[mlhvcsz](?:-?[\d.]+(?:[ -]?-?[\d.]+)*)?)*$/;

function parseSvg(svg: string): Document {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const err = doc.getElementsByTagName('parsererror');
  if (err.length) throw new Error(`Invalid XML: ${err[0].textContent}`);
  return doc;
}

describe('path data writer', () => {
  const square: PathLoop = {
    start: [10, 10],
    closed: true,
    segs: [{ t: 'L', p: [20, 10] }, { t: 'L', p: [20, 20] }, { t: 'L', p: [10, 20] }, { t: 'L', p: [10, 10] }],
  };

  it('uses h/v shortcuts and closes with z', () => {
    expect(loopsToPathData([square], 1)).toBe('M10 10h10v10h-10z');
  });

  it('rounds to the requested precision without accumulating drift', () => {
    const loop: PathLoop = { start: [0.123456, 0], closed: false, segs: [] };
    for (let i = 1; i <= 100; i++) loop.segs.push({ t: 'L', p: [0.123456 + i * 1.0333333, i * 0.0166666] });
    const d = loopsToPathData([loop], 2);
    expect(d).not.toMatch(/\.\d{3}/); // never more than 2 decimals
    const polys = parsePathData(d);
    const last = polys[0][polys[0].length - 1];
    expect(last[0]).toBeCloseTo(0.123456 + 100 * 1.0333333, 2);
    expect(last[1]).toBeCloseTo(1.66666, 2);
  });

  it('writes compact numbers (leading zero dropped, negatives unseparated)', () => {
    const loop: PathLoop = { start: [0.5, 0.5], closed: true, segs: [{ t: 'L', p: [0, 1] }, { t: 'L', p: [1, 1] }] };
    expect(loopsToPathData([loop], 1)).toBe('M.5.5l-.5.5h1z');
  });

  it('uses s for smooth continuations and relative m for later subpaths', () => {
    const loops: PathLoop[] = [
      { start: [0, 0], closed: false, segs: [
        { t: 'C', c1: [0, 10], c2: [10, 10], p: [10, 0] },
        { t: 'C', c1: [10, -10], c2: [20, -10], p: [20, 0] },
      ] },
      { start: [30, 0], closed: true, segs: [{ t: 'L', p: [40, 0] }, { t: 'L', p: [35, 5] }] },
    ];
    expect(loopsToPathData(loops, 1)).toBe('M0 0c0 10 10 10 10 0s10-10 10 0m10 0h10l-5 5z');
  });
});

describe('SVG document', () => {
  const img = makeImage(80, 60, [255, 255, 255]);
  fillRect(img, 5, 5, 30, 20, [220, 30, 30]);
  fillCircle(img, 55, 35, 15, [20, 60, 200]);
  const settings: Settings = { ...DEFAULT_SETTINGS, colors: 3, minSpeck: 4 };
  const result = traceImage(img, settings, { outputWidth: 160, outputHeight: 120 });

  it('parses as well-formed SVG with a correct viewBox and intrinsic size', () => {
    const { svg } = buildSvg(result);
    const doc = parseSvg(svg);
    const root = doc.documentElement;
    expect(root.nodeName).toBe('svg');
    expect(root.getAttribute('xmlns')).toBe('http://www.w3.org/2000/svg');
    expect(root.getAttribute('viewBox')).toBe('0 0 80 60');
    expect(root.getAttribute('width')).toBe('160');
    expect(root.getAttribute('height')).toBe('120');
    expect(root.getAttribute('fill-rule')).toBe('evenodd');
  });

  it('emits one path per color with hex fills and valid compact path data', () => {
    const { svg, stats } = buildSvg(result);
    const paths = [...parseSvg(svg).getElementsByTagName('path')];
    expect(paths).toHaveLength(3);
    const fills = paths.map((p) => p.getAttribute('fill')!);
    expect(new Set(fills).size).toBe(3);
    for (const p of paths) {
      expect(p.getAttribute('fill')).toMatch(/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/);
      const d = p.getAttribute('d')!;
      expect(d).toMatch(PATH_DATA_RE);
      expect(d).not.toMatch(/\.\d{2}/); // precision 1
      expect(() => parsePathData(d)).not.toThrow();
    }
    expect(stats.layers).toBe(3);
    expect(stats.bytes).toBe(new TextEncoder().encode(svg).length);
  });

  it('applies recolor / hide overrides and merges identical stacked layers', () => {
    const [bg, ...rest] = result.layers;
    const hidden = buildSvg(result, { [rest[0].color]: { hidden: true } });
    expect(parseSvg(hidden.svg).getElementsByTagName('path')).toHaveLength(2);
    const recolored = buildSvg(result, { [rest[0].color]: { color: '#00ff00' } });
    expect(recolored.svg).toContain('fill="#0f0"');
    // Recolouring the next layer to the background color makes it redundant.
    const merged = buildSvg(result, { [rest[0].color]: { color: bg.color } });
    expect(parseSvg(merged.svg).getElementsByTagName('path')).toHaveLength(2);
  });

  it('writes stroked paths for line art', () => {
    const sketch = makeImage(60, 40);
    fillRect(sketch, 5, 18, 50, 3, [0, 0, 0]);
    const res = traceImage(sketch, { ...DEFAULT_SETTINGS, mode: 'lineart', blur: 0 });
    const { svg } = buildSvg(res);
    const root = parseSvg(svg).documentElement;
    expect(root.getAttribute('fill')).toBe('none');
    expect(Number(root.getAttribute('stroke-width'))).toBeGreaterThan(1.5);
    const path = root.getElementsByTagName('path')[0];
    expect(path.getAttribute('stroke')).toBe('#000');
    expect(path.getAttribute('d')).not.toContain('z');
  });
});
