import type { Box, Vec } from './types';

export interface SnapTargets { xs: number[]; ys: number[] }
export interface Guide { axis: 'x' | 'y'; pos: number }

/** Edges and centres of the given boxes (plus the canvas) that moving things can snap to. */
export function buildTargets(boxes: Box[], canvas: Box): SnapTargets {
  const xs: number[] = [], ys: number[] = [];
  for (const b of [...boxes, canvas]) {
    xs.push(b.x, b.x + b.w / 2, b.x + b.w);
    ys.push(b.y, b.y + b.h / 2, b.y + b.h);
  }
  return { xs, ys };
}

function nearest(values: number[], targets: number[], threshold: number): { delta: number; pos: number } | null {
  let best: { delta: number; pos: number } | null = null;
  for (const v of values) for (const t of targets) {
    const d = t - v;
    if (Math.abs(d) <= threshold && (!best || Math.abs(d) < Math.abs(best.delta))) best = { delta: d, pos: t };
  }
  return best;
}

/** Snaps a moving box: returns the correction to apply and the guides to draw. */
export function snapBox(box: Box, targets: SnapTargets, threshold: number, axes: { x: number[]; y: number[] } = {
  x: [box.x, box.x + box.w / 2, box.x + box.w], y: [box.y, box.y + box.h / 2, box.y + box.h],
}): { dx: number; dy: number; guides: Guide[] } {
  const sx = nearest(axes.x, targets.xs, threshold);
  const sy = nearest(axes.y, targets.ys, threshold);
  const guides: Guide[] = [];
  if (sx) guides.push({ axis: 'x', pos: sx.pos });
  if (sy) guides.push({ axis: 'y', pos: sy.pos });
  return { dx: sx?.delta ?? 0, dy: sy?.delta ?? 0, guides };
}

export function snapPoint(p: Vec, targets: SnapTargets, threshold: number): { p: Vec; guides: Guide[] } {
  const r = snapBox({ x: p[0], y: p[1], w: 0, h: 0 }, targets, threshold, { x: [p[0]], y: [p[1]] });
  return { p: [p[0] + r.dx, p[1] + r.dy], guides: r.guides };
}

export type AlignOp = 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom';

/** Offset that aligns `box` to `ref`. */
export function alignOffset(box: Box, ref: Box, op: AlignOp): Vec {
  switch (op) {
    case 'left': return [ref.x - box.x, 0];
    case 'hcenter': return [ref.x + ref.w / 2 - (box.x + box.w / 2), 0];
    case 'right': return [ref.x + ref.w - (box.x + box.w), 0];
    case 'top': return [0, ref.y - box.y];
    case 'vcenter': return [0, ref.y + ref.h / 2 - (box.y + box.h / 2)];
    default: return [0, ref.y + ref.h - (box.y + box.h)];
  }
}
