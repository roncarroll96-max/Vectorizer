import type { Point } from './types';

// Directions: 0 = +x (right), 1 = +y (down), 2 = −x (left), 3 = −y (up)
const DX = [1, 0, -1, 0];
const DY = [0, 1, 0, -1];

/**
 * Traces every boundary of a binary mask along pixel *edges* ("crack following").
 * Each loop keeps the foreground on its right-hand side, so outer boundaries run
 * clockwise (screen coordinates) and holes run counter-clockwise. Only corner
 * vertices are emitted, with integer coordinates on the pixel grid.
 *
 * Diagonal (saddle) configurations are resolved by turning right, which keeps
 * foreground regions 4-connected — consistent for every layer, so evenodd fill
 * renders exactly the mask.
 */
export function traceContours(mask: Uint8Array, w: number, h: number): Point[][] {
  const W = w + 1;
  const visited = new Uint8Array(W * (h + 1));
  const at = (x: number, y: number) => (x >= 0 && y >= 0 && x < w && y < h ? mask[y * w + x] : 0);
  const loops: Point[][] = [];

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // A rightward edge starts at vertex (x, y) when the pixel below is set and the one above is not.
      if (!mask[y * w + x] || at(x, y - 1) || visited[y * W + x] & 1) continue;
      const pts: Point[] = [];
      let vx = x, vy = y, d = 0;
      do {
        visited[vy * W + vx] |= 1 << d;
        vx += DX[d];
        vy += DY[d];
        const tl = at(vx - 1, vy - 1), tr = at(vx, vy - 1), bl = at(vx - 1, vy), br = at(vx, vy);
        let al: number, ar: number; // ahead-left / ahead-right pixels
        switch (d) {
          case 0: al = tr; ar = br; break;
          case 1: al = br; ar = bl; break;
          case 2: al = bl; ar = tl; break;
          default: al = tl; ar = tr; break;
        }
        let nd: number;
        if (ar && !al) nd = d; // straight
        else if (al && ar) nd = (d + 3) & 3; // turn left
        else nd = (d + 1) & 3; // turn right (incl. saddle)
        if (nd !== d) pts.push([vx, vy]);
        d = nd;
      } while (!(vx === x && vy === y && d === 0));
      loops.push(pts);
    }
  }
  return loops;
}

/**
 * Converts a corner-vertex loop (axis-aligned runs) into the polygon through the
 * midpoints of its unit pixel edges. This turns 1-px staircases into true
 * diagonals before simplification; convex corners become tiny 0.5 px chamfers,
 * which the curve fitter later collapses back into sharp corners.
 */
export function edgeMidpoints(loop: Point[]): Point[] {
  const n = loop.length;
  const out: Point[] = [];
  for (let i = 0; i < n; i++) {
    const a = loop[i], b = loop[(i + 1) % n];
    const dx = Math.sign(b[0] - a[0]), dy = Math.sign(b[1] - a[1]);
    const len = Math.abs(b[0] - a[0]) + Math.abs(b[1] - a[1]);
    out.push([a[0] + dx * 0.5, a[1] + dy * 0.5]);
    if (len > 1) out.push([b[0] - dx * 0.5, b[1] - dy * 0.5]);
  }
  return out;
}
