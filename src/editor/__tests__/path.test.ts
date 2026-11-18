import { describe, expect, it } from 'vitest';
import {
  arcToCubics, deleteNodes, ellipseSubpath, moveHandle, nearestOnPath, parsePathData, regularPolygon, serializePath,
  setNodeKind, splitSegment, subpathBounds, cubicAt, segmentsOf,
} from '../model/path';
import { apply, invert, mul, parseTransform, rotateAbout, scaleAbout, translate, matrixToAttr } from '../model/matrix';
import type { SubPath, Vec } from '../model/types';

/** Dense polyline approximation, for comparing shapes. */
function sample(subs: SubPath[]): Vec[] {
  const pts: Vec[] = [];
  for (const s of subs) for (const seg of segmentsOf(s)) {
    for (let i = 0; i <= 16; i++) {
      const t = i / 16;
      pts.push(seg.cubic ? cubicAt(seg.cubic, t) : [seg.a.p[0] + (seg.b.p[0] - seg.a.p[0]) * t, seg.a.p[1] + (seg.b.p[1] - seg.a.p[1]) * t]);
    }
  }
  return pts;
}

function maxDeviation(a: SubPath[], b: SubPath[]): number {
  let worst = 0;
  for (const p of sample(a)) {
    const hit = nearestOnPath(b, p)!;
    worst = Math.max(worst, hit.dist);
  }
  return worst;
}

describe('matrix', () => {
  it('composes, applies and inverts', () => {
    const m = mul(translate(10, 5), mul(rotateAbout(30), scaleAbout(2, 3)));
    const p: Vec = [3, -4];
    const q = apply(invert(m), apply(m, p));
    expect(q[0]).toBeCloseTo(3, 9);
    expect(q[1]).toBeCloseTo(-4, 9);
  });

  it('parses transform lists like SVG', () => {
    const m = parseTransform('translate(10,20) rotate(90) scale(2)');
    const p = apply(m, [1, 0]);
    expect(p[0]).toBeCloseTo(10, 9);
    expect(p[1]).toBeCloseTo(22, 9);
    expect(matrixToAttr(parseTransform('translate(3 4)'))).toBe('translate(3 4)');
    expect(matrixToAttr(parseTransform(''))).toBe('');
  });
});

describe('path parsing', () => {
  it('handles absolute, relative and shorthand commands', () => {
    const subs = parsePathData('M10 10 h10 v10 H10 z m30 0 l10 0 l0 10 L40 20 Z');
    expect(subs).toHaveLength(2);
    expect(subs[0].closed).toBe(true);
    expect(subs[0].nodes.map((n) => n.p)).toEqual([[10, 10], [20, 10], [20, 20], [10, 20]]);
    // after z the current point returns to the subpath start, so m is relative to (10,10)
    expect(subs[1].nodes[0].p).toEqual([40, 10]);
  });

  it('reads the compact output of the Vectorizer writer', () => {
    const subs = parsePathData('M.5.5l-.5.5h1zM0 0c0 10 10 10 10 0s10-10 10 0');
    expect(subs[0].nodes.map((n) => n.p)).toEqual([[0.5, 0.5], [0, 1], [1, 1]]);
    const s = subs[1];
    expect(s.nodes[1].p).toEqual([10, 0]);
    expect(s.nodes[1].in).toEqual([10, 10]);
    expect(s.nodes[1].out).toEqual([10, -10]); // reflected by "s"
    expect(s.nodes[1].kind).toBe('symmetric');
  });

  it('converts quadratic curves exactly', () => {
    const [s] = parsePathData('M0 0 Q 50 100 100 0 T 200 0');
    expect(s.nodes).toHaveLength(3);
    const mid = cubicAt([s.nodes[0].p, s.nodes[0].out!, s.nodes[1].in!, s.nodes[1].p], 0.5);
    expect(mid[0]).toBeCloseTo(50, 6);
    expect(mid[1]).toBeCloseTo(50, 6); // quadratic midpoint = (p0 + 2q + p1) / 4
  });

  it('converts arcs (including compact flags) to cubics on the circle', () => {
    const [s] = parsePathData('M0 50a50 50 0 1150 50');
    for (const p of sample([s])) expect(Math.hypot(p[0] - 50, p[1] - 50)).toBeCloseTo(50, 0);
    const full = arcToCubics([100, 50], 50, 50, 0, false, true, [0, 50])!;
    expect(full).toHaveLength(2);
    expect(full[1][2]).toEqual([0, 50]);
  });

  it('merges a closing node that duplicates the start', () => {
    const [s] = parsePathData('M0 0C10 0 20 10 20 20C20 30 0 30 0 0Z');
    expect(s.nodes).toHaveLength(2);
    expect(s.nodes[0].in).toEqual([0, 30]);
  });

  it('rejects garbage with an error', () => {
    expect(() => parsePathData('10 10 L')).toThrow();
  });
});

describe('path serialising', () => {
  it('round-trips through parse → serialize → parse', () => {
    const src = 'M10 10C20 0 40 0 50 10S80 20 90 10L90 50H10Z M30 30 L60 30 L45 45 Z';
    const a = parsePathData(src);
    const b = parsePathData(serializePath(a, 2));
    expect(b).toHaveLength(a.length);
    expect(maxDeviation(a, b)).toBeLessThan(0.01);
  });

  it('writes an ellipse as a closed smooth path', () => {
    const d = serializePath([ellipseSubpath(50, 50, 40, 20)]);
    expect(d.startsWith('M90 50')).toBe(true);
    expect(d.endsWith('z')).toBe(true);
    expect(d).toMatch(/c|s/);
  });
});

describe('path geometry and editing', () => {
  it('computes tight bounds for curves', () => {
    const b = subpathBounds([ellipseSubpath(50, 50, 40, 20)])!;
    expect(b.x).toBeCloseTo(10, 6);
    expect(b.w).toBeCloseTo(80, 6);
    expect(b.y).toBeCloseTo(30, 6);
    expect(b.h).toBeCloseTo(40, 6);
  });

  it('splitting a segment adds a node without changing the shape', () => {
    const a = parsePathData('M0 0C0 50 100 50 100 0');
    const b = splitSegment(a, 0, 0, 0.3);
    expect(b[0].nodes).toHaveLength(3);
    expect(maxDeviation(a, b)).toBeLessThan(1e-3);
    expect(maxDeviation(b, a)).toBeLessThan(1e-3);
    const line = splitSegment(parsePathData('M0 0L10 0'), 0, 0, 0.5);
    expect(line[0].nodes[1].p).toEqual([5, 0]);
  });

  it('finds the nearest point on a path', () => {
    const hit = nearestOnPath(parsePathData('M0 0L100 0L100 100'), [50, 7])!;
    expect(hit.seg).toBe(0);
    expect(hit.t).toBeCloseTo(0.5, 6);
    expect(hit.dist).toBeCloseTo(7, 6);
  });

  it('deletes nodes and drops degenerate subpaths', () => {
    const subs = parsePathData('M0 0L10 0L10 10ZM50 50L60 50');
    const out = deleteNodes(subs, new Set(['0:1', '1:0']));
    expect(out).toHaveLength(1);
    expect(out[0].nodes.map((n) => n.p)).toEqual([[0, 0], [10, 10]]);
  });

  it('smooth nodes get collinear handles; moving one handle rotates the other', () => {
    const subs = parsePathData('M0 0L50 50L100 0');
    const sm = setNodeKind(subs, 0, 1, 'smooth');
    const n = sm[0].nodes[1];
    expect(n.in && n.out).toBeTruthy();
    expect(n.in![1]).toBeCloseTo(50, 9);
    expect(n.out![1]).toBeCloseTo(50, 9);
    const moved = moveHandle({ ...n, kind: 'symmetric' }, 'out', [50, 80]);
    expect(moved.in).toEqual([50, 20]);
    const corner = moveHandle({ ...n, kind: 'corner' }, 'out', [50, 80]);
    expect(corner.in).toEqual(n.in);
  });

  it('builds regular polygons', () => {
    const tri = regularPolygon(0, 0, 10, 3);
    expect(tri.nodes).toHaveLength(3);
    expect(tri.nodes[0].p[0]).toBeCloseTo(0, 9);
    expect(tri.nodes[0].p[1]).toBeCloseTo(-10, 9);
  });
});
