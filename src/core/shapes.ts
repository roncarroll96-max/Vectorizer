import type { Point } from './types';
import { polygonArea } from './geometry';

interface Info {
  area: number;
  /** Signed area: positive = clockwise in screen coordinates. */
  signed: number;
  minX: number; minY: number; maxX: number; maxY: number;
}

function info(poly: Point[]): Info {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of poly) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  const signed = polygonArea(poly);
  return { area: Math.abs(signed), signed, minX, minY, maxX, maxY };
}

/** Even-odd ray cast. */
export function pointInPolygon(p: Point, poly: Point[]): boolean {
  const [x, y] = p;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Whether `inner` lies inside `outer`. Contours may touch at a vertex, so a few
 * spread-out vertices vote rather than trusting a single one.
 */
function contains(outer: Point[], oi: Info, inner: Point[], ii: Info): boolean {
  if (ii.area >= oi.area) return false;
  if (ii.minX < oi.minX || ii.minY < oi.minY || ii.maxX > oi.maxX || ii.maxY > oi.maxY) return false;
  const n = inner.length;
  const samples = n < 3 ? n : 3;
  let votes = 0;
  for (let k = 0; k < samples; k++) if (pointInPolygon(inner[Math.floor((k * n) / samples)], outer)) votes++;
  return votes * 2 > samples;
}

export interface GroupOptions {
  /** Open polylines never contain anything and always stand alone. */
  closed?: boolean[];
  /**
   * Known hole flags (e.g. from contour winding). When given, every non-hole is
   * a separate shape and each hole joins the smallest non-hole around it.
   * Without it, the fill rule decides which nested boundaries are holes.
   */
  holes?: boolean[];
  /**
   * 'evenodd' (default): odd nesting depth = hole. 'nonzero': a boundary is a
   * hole when the winding number just inside it is zero, so a same-direction
   * boundary inside another one is a filled shape, not a hole.
   */
  fillRule?: 'evenodd' | 'nonzero';
}

/**
 * Splits a compound path into separate shapes: each outer boundary together with
 * the holes directly inside it. An island inside a hole (the dot in a ring) is
 * its own shape. Returns groups of polygon indices; each group lists its outer
 * boundary first, and groups are ordered by the position of that boundary.
 */
export function groupShapes(polys: Point[][], opts: GroupOptions = {}): number[][] {
  const n = polys.length;
  const isClosed = (i: number) => (opts.closed ? opts.closed[i] : true) && polys[i].length >= 3;
  const infos = polys.map(info);
  // Largest first, so a polygon's possible containers all come before it.
  const order = polys.map((_, i) => i).filter(isClosed).sort((a, b) => infos[b].area - infos[a].area);
  const parent = new Int32Array(n).fill(-1);
  const depth = new Int32Array(n);
  const holes = opts.holes;

  for (let k = 0; k < order.length; k++) {
    const i = order[k];
    if (holes && !holes[i]) continue; // outer boundaries are always roots
    // Walk back from the closest-in-size candidate: the first hit is the tightest container.
    for (let m = k - 1; m >= 0; m--) {
      const j = order[m];
      if (holes && holes[j]) continue;
      if (contains(polys[j], infos[j], polys[i], infos[i])) {
        parent[i] = j;
        depth[i] = depth[j] + 1;
        break;
      }
    }
  }

  // A hole joins the shape of the boundary around it; containers come earlier in `order`.
  const rootOf = Int32Array.from({ length: n }, (_, i) => i);
  const wind = new Int32Array(n);
  for (const i of order) {
    const p = parent[i];
    wind[i] = (p >= 0 ? wind[p] : 0) + Math.sign(infos[i].signed);
    let isHole: boolean;
    if (holes) isHole = holes[i] && p >= 0;
    else if (opts.fillRule === 'nonzero') isHole = p >= 0 && wind[i] === 0;
    else isHole = depth[i] % 2 === 1;
    if (isHole) rootOf[i] = rootOf[p];
  }
  const groups = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const r = rootOf[i];
    if (!groups.has(r)) groups.set(r, [r]);
    if (r !== i) groups.get(r)!.push(i);
  }
  return [...groups.keys()].sort((a, b) => a - b).map((r) => groups.get(r)!);
}
