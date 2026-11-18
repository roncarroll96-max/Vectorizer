import type { Point } from './types';
import { pointSegmentDistance } from './geometry';

/**
 * Ramer–Douglas–Peucker on an open polyline (iterative, so deep inputs cannot
 * overflow the stack). Endpoints are always kept.
 */
export function rdp(points: Point[], tolerance: number): Point[] {
  const n = points.length;
  if (n <= 2 || tolerance <= 0) return points.slice();
  const keep = new Uint8Array(n);
  keep[0] = keep[n - 1] = 1;
  const stack: number[] = [0, n - 1];
  while (stack.length) {
    const last = stack.pop()!;
    const first = stack.pop()!;
    let maxD = -1, idx = -1;
    for (let i = first + 1; i < last; i++) {
      const d = pointSegmentDistance(points[i], points[first], points[last]);
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (idx >= 0 && maxD > tolerance) {
      keep[idx] = 1;
      stack.push(first, idx, idx, last);
    }
  }
  const out: Point[] = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(points[i]);
  return out;
}

/**
 * RDP for a closed polygon (first point not repeated at the end). The ring is
 * split at point 0 and the point farthest from it, and each half simplified.
 */
export function rdpClosed(points: Point[], tolerance: number): Point[] {
  const n = points.length;
  if (n <= 3 || tolerance <= 0) return points.slice();
  let far = 1, fd = -1;
  for (let i = 1; i < n; i++) {
    const d = (points[i][0] - points[0][0]) ** 2 + (points[i][1] - points[0][1]) ** 2;
    if (d > fd) { fd = d; far = i; }
  }
  const a = rdp(points.slice(0, far + 1), tolerance);
  const b = rdp([...points.slice(far), points[0]], tolerance);
  const out = [...a, ...b.slice(1, -1)];
  return out.length >= 3 ? out : points.slice();
}
