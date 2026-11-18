import { describe, expect, it } from 'vitest';
import { rdp, rdpClosed } from '../simplify';
import { pointSegmentDistance } from '../geometry';
import type { Point } from '../types';

describe('Ramer–Douglas–Peucker', () => {
  it('keeps endpoints and drops collinear points', () => {
    const pts: Point[] = [[0, 0], [1, 0], [2, 0], [3, 0], [10, 0]];
    expect(rdp(pts, 0.1)).toEqual([[0, 0], [10, 0]]);
  });

  it('keeps a vertex that deviates more than the tolerance', () => {
    const pts: Point[] = [[0, 0], [5, 3], [10, 0]];
    expect(rdp(pts, 1)).toEqual(pts);
    expect(rdp(pts, 5)).toEqual([[0, 0], [10, 0]]);
  });

  it('never deviates from the original by more than the tolerance', () => {
    const pts: Point[] = [];
    for (let i = 0; i <= 200; i++) pts.push([i, Math.sin(i / 10) * 20 + ((i * 7919) % 5) / 10]);
    for (const tol of [0.25, 1, 3]) {
      const s = rdp(pts, tol);
      expect(s.length).toBeLessThan(pts.length);
      // every original point must be within tol of the simplified polyline
      for (const p of pts) {
        let best = Infinity;
        for (let i = 1; i < s.length; i++) best = Math.min(best, pointSegmentDistance(p, s[i - 1], s[i]));
        expect(best).toBeLessThanOrEqual(tol + 1e-9);
      }
    }
  });

  it('turns a pixel staircase into a straight diagonal', () => {
    const stairs: Point[] = [];
    for (let i = 0; i < 20; i++) stairs.push([i, i], [i + 1, i]);
    stairs.push([20, 20]);
    const s = rdp(stairs, 1);
    expect(s).toEqual([[0, 0], [20, 20]]);
  });

  it('returns a copy for tolerance 0 and tiny inputs', () => {
    const pts: Point[] = [[0, 0], [1, 1], [2, 0]];
    const out = rdp(pts, 0);
    expect(out).toEqual(pts);
    expect(out).not.toBe(pts);
    expect(rdp([[1, 1]], 1)).toEqual([[1, 1]]);
  });

  it('simplifies closed rings but keeps square corners', () => {
    const ring: Point[] = [];
    for (let x = 0; x < 10; x++) ring.push([x, 0]);
    for (let y = 0; y < 10; y++) ring.push([10, y]);
    for (let x = 10; x > 0; x--) ring.push([x, 10]);
    for (let y = 10; y > 0; y--) ring.push([0, y]);
    const s = rdpClosed(ring, 0.5);
    expect(s).toHaveLength(4);
    expect(new Set(s.map((p) => p.join(',')))).toEqual(new Set(['0,0', '10,0', '10,10', '0,10']));
  });

  it('handles very long inputs without recursion overflow', () => {
    const pts: Point[] = [];
    for (let i = 0; i < 200000; i++) pts.push([i, (i % 2) * 0.1]);
    expect(rdp(pts, 0.5)).toHaveLength(2);
  });
});
