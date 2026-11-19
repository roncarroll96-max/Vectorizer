// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { groupShapes } from '../shapes';
import { traceImage } from '../pipeline';
import { buildSvg } from '../svg';
import { DEFAULT_SETTINGS } from '../presets';
import type { Point, Settings } from '../types';
import { fillCircle, fillRing, makeImage, parsePathData, rasterizeEvenOdd } from './helpers';

/** Axis-aligned square; `cw` = clockwise in screen coordinates. */
const sq = (x: number, y: number, s: number, cw = true): Point[] => {
  const p: Point[] = [[x, y], [x + s, y], [x + s, y + s], [x, y + s]];
  return cw ? p : p.reverse();
};

describe('groupShapes', () => {
  it('keeps each hole with its outer boundary and separates side-by-side shapes', () => {
    // Two "O"s: outer + hole each, interleaved.
    const polys = [sq(0, 0, 10), sq(20, 0, 10), sq(2, 2, 6, false), sq(22, 2, 6, false)];
    expect(groupShapes(polys)).toEqual([[0, 2], [1, 3]]);
    expect(groupShapes(polys, { holes: [false, false, true, true] })).toEqual([[0, 2], [1, 3]]);
  });

  it('makes an island inside a hole its own shape', () => {
    const polys = [sq(0, 0, 30), sq(5, 5, 20, false), sq(10, 10, 10), sq(12, 12, 6, false)];
    expect(groupShapes(polys)).toEqual([[0, 1], [2, 3]]);
  });

  it('uses winding for nonzero: a same-direction inner boundary is not a hole', () => {
    const polys = [sq(0, 0, 30), sq(5, 5, 20)];
    expect(groupShapes(polys, { fillRule: 'nonzero' })).toEqual([[0], [1]]);
    expect(groupShapes(polys, { fillRule: 'evenodd' })).toEqual([[0, 1]]);
    expect(groupShapes([sq(0, 0, 30), sq(5, 5, 20, false)], { fillRule: 'nonzero' })).toEqual([[0, 1]]);
  });

  it('leaves open polylines alone', () => {
    const polys = [sq(0, 0, 30), [[5, 5], [10, 10]] as Point[]];
    expect(groupShapes(polys, { closed: [true, false] })).toEqual([[0], [1]]);
  });
});

describe('separate shapes in the traced SVG', () => {
  const settings: Settings = { ...DEFAULT_SETTINGS, mode: 'bw', minSpeck: 4 };
  const img = makeImage(160, 70);
  fillRing(img, 25, 35, 8, 18, [0, 0, 0]);
  fillRing(img, 75, 35, 8, 18, [0, 0, 0]);
  fillRing(img, 130, 35, 10, 22, [0, 0, 0]);
  fillCircle(img, 130, 35, 5, [0, 0, 0]); // a dot inside the third ring's hole
  const result = traceImage(img, settings);
  const ink = result.layers[result.layers.length - 1];

  it('splits a layer into one shape per connected region, holes included', () => {
    // three rings (outer + hole each) and the dot, which is its own shape
    expect(ink.shapes.map((d) => parsePathData(d).length)).toEqual([2, 2, 2, 1]);
  });

  it('renders identically to the compound path', () => {
    const { width: w, height: h } = result;
    const whole = rasterizeEvenOdd(parsePathData(ink.d), w, h);
    const parts = new Uint8Array(w * h);
    for (const d of ink.shapes) rasterizeEvenOdd(parsePathData(d), w, h).forEach((v, i) => { if (v) parts[i] = 1; });
    expect(parts).toEqual(whole);
  });

  it('writes a group of paths per color only when asked', () => {
    const doc = (svg: string) => new DOMParser().parseFromString(svg, 'image/svg+xml');
    const compound = doc(buildSvg(result).svg);
    expect(compound.getElementsByTagName('g')).toHaveLength(0);
    const separate = doc(buildSvg(result, {}, { separateShapes: true }).svg);
    const g = [...separate.getElementsByTagName('g')];
    expect(g).toHaveLength(1);
    expect(g[0].getAttribute('fill')).toBe('#000');
    expect(g[0].getElementsByTagName('path')).toHaveLength(4);
  });
});
