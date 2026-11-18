import { describe, expect, it } from 'vitest';
import { bezierPoint, fitCurve, smoothPolygon, type Cubic } from '../bezier';
import type { Point, Segment } from '../types';

function distToCurves(p: Point, curves: Cubic[]): number {
  let best = Infinity;
  for (const c of curves) for (let t = 0; t <= 1; t += 0.002) {
    const q = bezierPoint(c, t);
    best = Math.min(best, Math.hypot(p[0] - q[0], p[1] - q[1]));
  }
  return best;
}

function segsToCurves(start: Point, segs: Segment[]): Cubic[] {
  const out: Cubic[] = [];
  let cur = start;
  for (const s of segs) {
    if (s.t === 'L') out.push([cur, cur, s.p, s.p]);
    else out.push([cur, s.c1, s.c2, s.p]);
    cur = s.p;
  }
  return out;
}

describe('Bézier curve fitting (Schneider)', () => {
  it('reproduces a known cubic from samples with a single segment', () => {
    const truth: Cubic = [[0, 0], [30, 60], [70, 60], [100, 0]];
    const pts: Point[] = [];
    for (let i = 0; i <= 50; i++) pts.push(bezierPoint(truth, i / 50));
    // With the true end tangents the fit recovers a single cubic…
    const fit = fitCurve(pts, 0.5, [30, 60], [-30, 60]);
    expect(fit).toHaveLength(1);
    expect(Math.abs(fit[0][1][0] - 30)).toBeLessThan(2);
    expect(Math.abs(fit[0][1][1] - 60)).toBeLessThan(2);
    // …and with estimated tangents it still needs at most two.
    expect(fitCurve(pts, 0.5).length).toBeLessThanOrEqual(2);
    for (const p of pts) expect(distToCurves(p, fit)).toBeLessThan(0.5);
    expect(fit[0][0]).toEqual([0, 0]);
    expect(fit[0][3]).toEqual([100, 0]);
  });

  it('fits a semicircle within tolerance using few segments', () => {
    const pts: Point[] = [];
    for (let i = 0; i <= 90; i++) {
      const a = (Math.PI * i) / 90;
      pts.push([50 + 40 * Math.cos(a), 50 + 40 * Math.sin(a)]);
    }
    for (const tol of [0.25, 1, 2]) {
      const fit = fitCurve(pts, tol);
      expect(fit.length).toBeLessThanOrEqual(4);
      for (const p of pts) expect(distToCurves(p, fit)).toBeLessThan(tol + 0.05);
    }
  });

  it('produces G1-continuous joints when it has to split', () => {
    const pts: Point[] = [];
    for (let i = 0; i <= 200; i++) pts.push([i, 20 * Math.sin(i / 15)]);
    const fit = fitCurve(pts, 0.3);
    expect(fit.length).toBeGreaterThan(1);
    for (let k = 1; k < fit.length; k++) {
      const a = fit[k - 1], b = fit[k];
      expect(a[3]).toEqual(b[0]);
      const t1 = [a[3][0] - a[2][0], a[3][1] - a[2][1]];
      const t2 = [b[1][0] - b[0][0], b[1][1] - b[0][1]];
      const cross = (t1[0] * t2[1] - t1[1] * t2[0]) / (Math.hypot(t1[0], t1[1]) * Math.hypot(t2[0], t2[1]));
      expect(Math.abs(cross)).toBeLessThan(1e-6);
    }
  });

  it('keeps sharp corners of a square as straight lines', () => {
    const square: Point[] = [[0, 0], [10, 0], [10, 10], [0, 10]];
    const { start, segs } = smoothPolygon(square, true, { smoothness: 1, cornerAngle: 60 });
    expect(start).toEqual([0, 0]);
    expect(segs).toHaveLength(4);
    expect(segs.every((s) => s.t === 'L')).toBe(true);
    expect(segs.map((s) => s.p)).toEqual([[10, 0], [10, 10], [0, 10], [0, 0]]);
  });

  it('rounds a square off when the corner threshold is above 90°', () => {
    const square: Point[] = [[0, 0], [10, 0], [10, 10], [0, 10]];
    const { segs } = smoothPolygon(square, true, { smoothness: 2, cornerAngle: 120 });
    expect(segs.some((s) => s.t === 'C')).toBe(true);
  });

  it('turns a polygonal circle into a smooth closed curve', () => {
    const poly: Point[] = [];
    for (let i = 0; i < 24; i++) {
      const a = (2 * Math.PI * i) / 24;
      poly.push([50 + 30 * Math.cos(a), 50 + 30 * Math.sin(a)]);
    }
    const { start, segs } = smoothPolygon(poly, true, { smoothness: 1, cornerAngle: 60 });
    expect(segs.every((s) => s.t === 'C')).toBe(true);
    expect(segs.length).toBeLessThanOrEqual(8);
    const curves = segsToCurves(start, segs);
    expect(segs[segs.length - 1].p).toEqual(start); // closed
    for (let i = 0; i < 360; i += 5) {
      const a = (i * Math.PI) / 180;
      expect(distToCurves([50 + 30 * Math.cos(a), 50 + 30 * Math.sin(a)], curves)).toBeLessThan(1.5);
    }
  });

  it('smoothness 0 returns the polygon unchanged', () => {
    const poly: Point[] = [[0, 0], [5, 1], [10, 0], [5, 8]];
    const { start, segs } = smoothPolygon(poly, true, { smoothness: 0, cornerAngle: 60 });
    expect(start).toEqual([0, 0]);
    expect(segs.map((s) => s.p)).toEqual([[5, 1], [10, 0], [5, 8], [0, 0]]);
  });

  it('fits open polylines and keeps their endpoints', () => {
    const pts: Point[] = [];
    for (let i = 0; i <= 40; i++) pts.push([i * 2, Math.sqrt(i) * 6]);
    const { start, segs } = smoothPolygon(pts, false, { smoothness: 1, cornerAngle: 60 });
    expect(start).toEqual(pts[0]);
    expect(segs[segs.length - 1].p).toEqual(pts[pts.length - 1]);
  });
});

describe('chamfer collapsing', () => {
  it('restores exact square corners from an edge-midpoint trace', async () => {
    const { edgeMidpoints } = await import('../contour');
    const { collapseChamfers } = await import('../bezier');
    const square: Point[] = [[0, 0], [10, 0], [10, 10], [0, 10]];
    const mids = edgeMidpoints(square); // 8 points with 0.5px chamfers
    expect(mids).toHaveLength(8);
    const fixed = collapseChamfers(mids, true, 60);
    expect(fixed).toHaveLength(4);
    const keys = new Set(fixed.map((p) => p.map((v) => Math.round(v * 1000) / 1000).join(',')));
    expect(keys).toEqual(new Set(['0,0', '10,0', '10,10', '0,10']));
  });

  it('leaves gentle bends alone', async () => {
    const { collapseChamfers } = await import('../bezier');
    const poly: Point[] = [[0, 0], [10, 0], [11, 0.5], [21, 3], [21, 20], [0, 20]];
    const out = collapseChamfers(poly, true, 60);
    expect(out).toContainEqual([10, 0]);
    expect(out).toContainEqual([11, 0.5]);
  });
});
