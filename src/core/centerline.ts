import type { Point } from './types';

/**
 * Zhang–Suen thinning: reduces a binary mask to a 1-px wide 8-connected
 * skeleton (in place). Only a frontier of candidate pixels is examined each
 * sub-iteration — interior pixels can't be deleted until a neighbour is — so
 * the cost per pass is proportional to the perimeter, not the image area.
 */
export function zhangSuen(mask: Uint8Array, w: number, h: number): void {
  const n = w * h;
  const at = (x: number, y: number) => (x >= 0 && y >= 0 && x < w && y < h ? mask[y * w + x] : 0);
  const stamp = new Uint32Array(n);
  let gen = 1;
  let cand: number[] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!mask[y * w + x]) continue;
    if (!at(x - 1, y) || !at(x + 1, y) || !at(x, y - 1) || !at(x, y + 1) ||
        !at(x - 1, y - 1) || !at(x + 1, y - 1) || !at(x - 1, y + 1) || !at(x + 1, y + 1)) cand.push(y * w + x);
  }
  const removable = (i: number, step: number) => {
    const x = i % w, y = (i - x) / w;
    const p2 = at(x, y - 1), p3 = at(x + 1, y - 1), p4 = at(x + 1, y), p5 = at(x + 1, y + 1);
    const p6 = at(x, y + 1), p7 = at(x - 1, y + 1), p8 = at(x - 1, y), p9 = at(x - 1, y - 1);
    const b = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
    if (b < 2 || b > 6) return false;
    const a = (+(!p2 && p3)) + (+(!p3 && p4)) + (+(!p4 && p5)) + (+(!p5 && p6)) +
      (+(!p6 && p7)) + (+(!p7 && p8)) + (+(!p8 && p9)) + (+(!p9 && p2));
    if (a !== 1) return false;
    return step === 0 ? p2 * p4 * p6 === 0 && p4 * p6 * p8 === 0 : p2 * p4 * p8 === 0 && p2 * p6 * p8 === 0;
  };
  let idle = 0; // consecutive sub-iterations without deletions
  let step = 0;
  while (idle < 2 && cand.length) {
    const toClear: number[] = [];
    for (const i of cand) if (mask[i] && removable(i, step)) toClear.push(i);
    for (const i of toClear) mask[i] = 0;
    idle = toClear.length ? 0 : idle + 1;
    // next frontier: surviving candidates + foreground neighbours of deleted pixels
    gen++;
    const next: number[] = [];
    const add = (i: number) => { if (mask[i] && stamp[i] !== gen) { stamp[i] = gen; next.push(i); } };
    for (const i of cand) add(i);
    for (const i of toClear) {
      const x = i % w, y = (i - x) / w;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < w && yy < h) add(yy * w + xx);
      }
    }
    cand = next;
    step ^= 1;
  }
}

/**
 * Removes "elbow" pixels that make a staircase 4-connected instead of
 * 8-connected; otherwise every stair step would look like a junction.
 */
export function removeStaircase(mask: Uint8Array, w: number, h: number): void {
  const at = (x: number, y: number) => (x >= 0 && y >= 0 && x < w && y < h ? mask[y * w + x] : 0);
  // [dx1, dy1, dx2, dy2] pairs of orthogonal neighbours forming an elbow.
  const elbows = [[0, -1, 1, 0], [1, 0, 0, 1], [0, 1, -1, 0], [-1, 0, 0, -1]];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!mask[y * w + x]) continue;
      for (const [ax, ay, bx, by] of elbows) {
        if (!at(x + ax, y + ay) || !at(x + bx, y + by)) continue;
        // the opposite neighbours must be empty, so removing p keeps connectivity
        let others = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          if ((dx === ax && dy === ay) || (dx === bx && dy === by) || (dx === ax + bx && dy === ay + by)) continue;
          others += at(x + dx, y + dy);
        }
        if (others === 0) { mask[y * w + x] = 0; break; }
      }
    }
  }
}

/** Chamfer (3-4) distance transform: distance from each foreground pixel to background, in px. */
export function distanceTransform(mask: Uint8Array, w: number, h: number): Float32Array {
  const INF = 1e9;
  const d = new Float32Array(w * h);
  for (let i = 0; i < d.length; i++) d[i] = mask[i] ? INF : 0;
  const get = (x: number, y: number) => (x >= 0 && y >= 0 && x < w && y < h ? d[y * w + x] : 0);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (!d[i]) continue;
    d[i] = Math.min(d[i], get(x - 1, y) + 3, get(x, y - 1) + 3, get(x - 1, y - 1) + 4, get(x + 1, y - 1) + 4);
  }
  for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
    const i = y * w + x;
    if (!d[i]) continue;
    d[i] = Math.min(d[i], get(x + 1, y) + 3, get(x, y + 1) + 3, get(x + 1, y + 1) + 4, get(x - 1, y + 1) + 4);
  }
  for (let i = 0; i < d.length; i++) d[i] /= 3;
  return d;
}

export interface Polyline {
  points: Point[];
  closed: boolean;
  /** Number of ends that are free endpoints (degree 1): 0, 1 or 2. */
  freeEnds: number;
}

const NB = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];

/**
 * Walks a 1-px skeleton into polylines. Nodes are pixels whose degree is not 2
 * (endpoints and junctions); every chain between nodes becomes a polyline, and
 * leftover cycles become closed polylines. Coordinates are pixel centres.
 */
export function traceSkeleton(skel: Uint8Array, w: number, h: number): Polyline[] {
  const n = w * h;
  const deg = new Uint8Array(n);
  const at = (x: number, y: number) => (x >= 0 && y >= 0 && x < w && y < h ? skel[y * w + x] : 0);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!skel[y * w + x]) continue;
    let c = 0;
    for (const [dx, dy] of NB) c += at(x + dx, y + dy);
    deg[y * w + x] = c;
  }
  const isNode = (i: number) => skel[i] === 1 && deg[i] !== 2;
  const visited = new Uint8Array(n);
  const out: Polyline[] = [];
  const pt = (i: number): Point => [(i % w) + 0.5, Math.floor(i / w) + 0.5];
  const neighbours = (i: number) => {
    const x = i % w, y = Math.floor(i / w);
    const res: number[] = [];
    for (const [dx, dy] of NB) if (at(x + dx, y + dy)) res.push((y + dy) * w + x + dx);
    return res;
  };
  // Junction pixels often come in small clumps; merge 8-connected nodes into
  // clusters and attach every chain to the cluster centroid instead.
  const cluster = new Int32Array(n).fill(-1);
  const centroids: Point[] = [];
  const clusterDeg: number[] = [];
  for (let s = 0; s < n; s++) {
    if (!isNode(s) || cluster[s] >= 0) continue;
    const id = centroids.length;
    const stack = [s];
    cluster[s] = id;
    let sx = 0, sy = 0, c = 0, maxDeg = 0;
    while (stack.length) {
      const i = stack.pop()!;
      sx += (i % w) + 0.5; sy += Math.floor(i / w) + 0.5; c++;
      maxDeg = Math.max(maxDeg, deg[i]);
      for (const nb of neighbours(i)) if (isNode(nb) && cluster[nb] < 0) { cluster[nb] = id; stack.push(nb); }
    }
    centroids.push([sx / c, sy / c]);
    clusterDeg.push(c === 1 ? maxDeg : 3);
  }
  const nodePt = (i: number): Point => centroids[cluster[i]];
  const isFree = (i: number) => clusterDeg[cluster[i]] === 1;
  const seenPair = new Set<number>();

  for (let s = 0; s < n; s++) {
    if (!isNode(s)) continue;
    if (deg[s] === 0) { out.push({ points: [pt(s), pt(s)], closed: false, freeEnds: 2 }); continue; }
    for (const first of neighbours(s)) {
      if (isNode(first)) {
        const a = cluster[s], b = cluster[first];
        if (a === b) continue;
        const key = Math.min(a, b) * n + Math.max(a, b);
        if (seenPair.has(key)) continue;
        seenPair.add(key);
        out.push({ points: [nodePt(s), nodePt(first)], closed: false, freeEnds: (+isFree(s)) + (+isFree(first)) });
        continue;
      }
      if (visited[first]) continue;
      const chain = [s, first];
      visited[first] = 1;
      let prev = s, cur = first;
      for (;;) {
        let next = -1;
        for (const nb of neighbours(cur)) {
          if (nb === prev) continue;
          if (isNode(nb)) { next = nb; break; }
          if (!visited[nb]) next = nb;
        }
        if (next < 0) break;
        chain.push(next);
        if (isNode(next)) break;
        visited[next] = 1;
        prev = cur; cur = next;
      }
      const end = chain[chain.length - 1];
      const points = chain.map(pt);
      points[0] = nodePt(s);
      if (isNode(end)) points[points.length - 1] = nodePt(end);
      out.push({ points, closed: false, freeEnds: (+isFree(s)) + (+(isNode(end) && isFree(end))) });
    }
  }
  // Pure cycles (every pixel has degree 2).
  for (let s = 0; s < n; s++) {
    if (!skel[s] || visited[s] || isNode(s)) continue;
    const chain = [s];
    visited[s] = 1;
    let prev = -1, cur = s;
    for (;;) {
      const next = neighbours(cur).find((nb) => nb !== prev && !visited[nb]);
      if (next === undefined) break;
      visited[next] = 1;
      chain.push(next);
      prev = cur; cur = next;
    }
    if (chain.length >= 3) out.push({ points: chain.map(pt), closed: true, freeEnds: 0 });
  }
  return out;
}
