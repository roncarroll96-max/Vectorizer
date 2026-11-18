import type { Layer, PathLoop, Point, ProgressFn, RGBAImage, Settings, TraceResult } from './types';
import { preprocess } from './preprocess';
import { otsuThreshold, segmentBW, thresholdMask, toGray, type LabelMap } from './segment';
import { quantize } from './quantize';
import { removeSmallRegions } from './cleanup';
import { edgeMidpoints, traceContours } from './contour';
import { rdp, rdpClosed } from './simplify';
import { smoothPolygon } from './bezier';
import { loopNodes, loopsToPathData } from './svg';
import { polygonArea, polylineLength } from './geometry';
import { distanceTransform, removeStaircase, traceSkeleton, zhangSuen } from './centerline';
import { rgbToHex, luma, type RGB } from './color';

export interface TraceOptions {
  /** Intrinsic size written to the SVG width/height (defaults to the processing size). */
  outputWidth?: number;
  outputHeight?: number;
  onProgress?: ProgressFn;
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/**
 * Full pipeline: preprocess → segment → clean → trace → simplify → smooth → serialise.
 * Pure (no DOM), so it runs identically in a Web Worker, on the main thread or in tests.
 */
export function traceImage(src: RGBAImage, s: Settings, opts: TraceOptions = {}): TraceResult {
  const t0 = now();
  const progress = opts.onProgress ?? (() => {});
  const { width: w, height: h } = src;
  progress('Preprocessing', 0);
  const { image, removedBackground } = preprocess(src, s);

  const base = {
    mode: s.mode,
    width: w,
    height: h,
    outputWidth: opts.outputWidth ?? w,
    outputHeight: opts.outputHeight ?? h,
    removedBackground,
  };

  if (s.mode === 'lineart') {
    const res = traceLineArt(image, s, progress);
    progress('Done', 1);
    return { ...base, ...res, elapsedMs: now() - t0 };
  }

  progress('Segmenting', 0.12);
  let labels: LabelMap;
  let palette: RGB[];
  let thresholdUsed: number | null = null;
  if (s.mode === 'bw') {
    thresholdUsed = s.thresholdAuto ? otsuThreshold(toGray(image), image) : s.threshold;
    labels = segmentBW(image, thresholdUsed, s.invert);
    palette = [[255, 255, 255], [0, 0, 0]];
  } else {
    const q = quantize(image, s.colors, s.quantizer);
    labels = q.labels;
    palette = q.palette;
  }

  progress('Removing specks', 0.3);
  removeSmallRegions(labels, w, h, s.minSpeck);

  // Order layers back to front. B&W keeps white at the back so hiding it
  // leaves black shapes on transparency; color mode puts the largest area at
  // the back (usually the background).
  const counts = new Float64Array(palette.length);
  for (let i = 0; i < labels.length; i++) if (labels[i] >= 0) counts[labels[i]]++;
  let order = palette.map((_, i) => i).filter((i) => counts[i] > 0);
  if (s.mode === 'color') order.sort((a, b) => counts[b] - counts[a] || luma(...palette[b]) - luma(...palette[a]));
  const rank = new Int16Array(palette.length).fill(-1);
  order.forEach((label, r) => { rank[label] = r; });

  // Seam-free stacking: layer k covers every pixel whose label ranks >= k, so
  // each layer underlaps everything drawn above it and anti-aliasing or
  // simplification can never expose a gap between neighbouring regions.
  const mask = new Uint8Array(w * h);
  const layers: Layer[] = [];
  for (let k = 0; k < order.length; k++) {
    progress(`Tracing layer ${k + 1}/${order.length}`, 0.35 + (0.6 * k) / order.length);
    for (let i = 0; i < mask.length; i++) {
      const l = labels[i];
      mask[i] = l >= 0 && rank[l] >= k ? 1 : 0;
    }
    const loops = vectorizeMask(mask, w, h, s);
    layers.push(makeLayer(rgbToHex(palette[order[k]]), loops, counts[order[k]], s.precision));
  }
  progress('Done', 1);
  return { ...base, layers, strokeWidth: 0, thresholdUsed, elapsedMs: now() - t0 };
}

function makeLayer(color: string, loops: PathLoop[], pixelCount: number, precision: 1 | 2): Layer {
  const nodes = loopNodes(loops);
  return {
    color,
    d: loopsToPathData(loops, precision),
    pathCount: loops.length,
    nodeCount: nodes.length / 2,
    nodes,
    pixelCount,
    loops,
  };
}

/** Traces, filters, simplifies and smooths every boundary of one mask. */
export function vectorizeMask(mask: Uint8Array, w: number, h: number, s: Settings): PathLoop[] {
  const contours = traceContours(mask, w, h);
  const loops: PathLoop[] = [];
  for (const c of contours) {
    if (Math.abs(polygonArea(c)) < Math.max(1, s.minSpeck)) continue;
    const simplified = rdpClosed(edgeMidpoints(c), s.simplify);
    if (simplified.length < 3) continue;
    const { start, segs } = smoothPolygon(simplified, true, { smoothness: s.smoothness, cornerAngle: s.cornerAngle });
    loops.push({ start, segs, closed: true });
  }
  return loops;
}

function traceLineArt(image: RGBAImage, s: Settings, progress: ProgressFn) {
  const { width: w, height: h } = image;
  progress('Thresholding', 0.1);
  const thresholdUsed = s.thresholdAuto ? otsuThreshold(toGray(image), image) : s.threshold;
  const mask = thresholdMask(image, thresholdUsed, s.invert);

  progress('Removing specks', 0.2);
  const labels = new Int16Array(mask.length);
  for (let i = 0; i < mask.length; i++) labels[i] = mask[i];
  removeSmallRegions(labels, w, h, s.minSpeck);
  let inkPixels = 0;
  for (let i = 0; i < mask.length; i++) { mask[i] = labels[i] === 1 ? 1 : 0; inkPixels += mask[i]; }

  progress('Measuring stroke width', 0.3);
  const dt = distanceTransform(mask, w, h);

  progress('Thinning', 0.4);
  zhangSuen(mask, w, h);
  removeStaircase(mask, w, h);

  // Median of the distance-to-paper along the skeleton ≈ half the typical stroke width.
  const radii: number[] = [];
  for (let i = 0; i < mask.length; i++) if (mask[i]) radii.push(dt[i]);
  radii.sort((a, b) => a - b);
  const median = radii.length ? radii[radii.length >> 1] : 1;
  const strokeWidth = Math.max(1, 2 * median - 1);

  progress('Following centerlines', 0.7);
  const polylines = traceSkeleton(mask, w, h);
  const spur = Math.max(2, strokeWidth * 1.2);
  const minIsolated = Math.max(2, Math.sqrt(s.minSpeck));
  const loops: PathLoop[] = [];
  for (const pl of polylines) {
    const length = polylineLength(pl.points, pl.closed);
    if (pl.freeEnds === 1 && length < spur) continue; // thinning spur
    if (pl.freeEnds === 2 && length < minIsolated) continue; // speck
    let pts: Point[] = pl.closed ? rdpClosed(pl.points, s.simplify) : rdp(pl.points, s.simplify);
    if (pts.length < 2) continue;
    if (!pl.closed && pts.length === 2 && pts[0][0] === pts[1][0] && pts[0][1] === pts[1][1]) {
      pts = [pts[0], [pts[0][0] + 0.01, pts[0][1]]]; // a dot: zero-length lines vanish in some renderers
    }
    const { start, segs } = smoothPolygon(pts, pl.closed, { smoothness: s.smoothness, cornerAngle: s.cornerAngle });
    loops.push({ start, segs, closed: pl.closed });
  }
  progress('Writing SVG', 0.95);
  const layer = makeLayer('#000000', loops, inkPixels, s.precision);
  return { layers: [layer], strokeWidth, thresholdUsed };
}
