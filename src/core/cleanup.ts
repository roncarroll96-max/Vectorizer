import type { LabelMap } from './segment';

/**
 * Removes speckles: every 4-connected region smaller than `minArea` pixels is
 * relabelled to the most common label bordering it. Transparent (-1) is
 * treated like any other label, so tiny holes fill and tiny islands vanish.
 * Operates in place and returns the number of regions merged.
 */
export function removeSmallRegions(labels: LabelMap, w: number, h: number, minArea: number): number {
  if (minArea <= 1) return 0;
  const n = w * h;
  const comp = new Int32Array(n).fill(-1);
  const stack = new Int32Array(n);
  const members = new Int32Array(n);
  let merged = 0;
  let compId = 0;
  const neighborCount = new Map<number, number>();
  for (let start = 0; start < n; start++) {
    if (comp[start] !== -1) continue;
    const label = labels[start];
    const id = compId++;
    let sp = 0, size = 0;
    stack[sp++] = start;
    comp[start] = id;
    neighborCount.clear();
    while (sp > 0) {
      const i = stack[--sp];
      members[size++] = i;
      const x = i % w;
      const nb = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i >= w ? i - w : -1, i < n - w ? i + w : -1];
      for (const j of nb) {
        if (j < 0) continue;
        if (labels[j] === label) {
          if (comp[j] === -1) { comp[j] = id; stack[sp++] = j; }
        } else if (size + sp < minArea) {
          // only worth tracking neighbours while the region might still be small
          neighborCount.set(labels[j], (neighborCount.get(labels[j]) ?? 0) + 1);
        }
      }
    }
    if (size >= minArea || neighborCount.size === 0) continue;
    let best = label, bestCount = -1;
    for (const [l, c] of neighborCount) if (c > bestCount) { bestCount = c; best = l; }
    for (let k = 0; k < size; k++) labels[members[k]] = best;
    merged++;
  }
  return merged;
}
