import type { PathLoop, TraceResult } from './types';
import { shortHex } from './color';

/** Formats a fixed-point integer `v / 10^p` compactly ("0.5" → ".5", "-0.5" → "-.5"). */
function fmtFixed(v: number, f: number): string {
  if (v === 0) return '0';
  let s = String(v / f);
  if (s.startsWith('0.')) s = s.slice(1);
  else if (s.startsWith('-0.')) s = '-' + s.slice(2);
  return s;
}

/**
 * Serialises loops into compact path data using relative commands (m, l, h, v,
 * c, s, z). Coordinates are snapped to a fixed-point grid *before* deltas are
 * taken, so rounding never accumulates drift along a path.
 */
export function loopsToPathData(loops: PathLoop[], precision = 1): string {
  const f = 10 ** precision;
  const q = (n: number) => Math.round(n * f);
  let out = '';
  let lastCmd = '';
  let needsSep = false;
  let lastHadDot = false;
  // Current point in fixed-point units.
  let cx = 0, cy = 0;
  let started = false;

  const num = (v: number) => {
    const s = fmtFixed(v, f);
    // "1.5.5" is valid path data (1.5, .5): a leading '-' or a '.' after a decimal is self-delimiting.
    if (needsSep && s[0] !== '-' && !(s[0] === '.' && lastHadDot)) out += ' ';
    out += s;
    needsSep = true;
    lastHadDot = s.includes('.');
  };
  const cmd = (c: string) => {
    if (c !== lastCmd || c === 'm') { out += c; lastCmd = c; needsSep = false; }
  };

  for (const loop of loops) {
    if (loop.segs.length === 0) continue;
    const sx = q(loop.start[0]), sy = q(loop.start[1]);
    if (!started) { out += 'M'; lastCmd = 'M'; needsSep = false; num(sx); num(sy); started = true; }
    else { cmd('m'); num(sx - cx); num(sy - cy); }
    // After a moveto, implicit repeats mean "lineto": reset so the next command letter is always written.
    lastCmd = '';
    cx = sx; cy = sy;
    let prevC2: [number, number] | null = null;
    const segs = loop.segs;
    // With z we can drop a final straight segment that just returns to the start.
    let end = segs.length;
    if (loop.closed) {
      const last = segs[end - 1];
      if (last.t === 'L' && q(last.p[0]) === sx && q(last.p[1]) === sy) end--;
    }
    for (let i = 0; i < end; i++) {
      const s = segs[i];
      const px = q(s.p[0]), py = q(s.p[1]);
      if (s.t === 'L') {
        const dx = px - cx, dy = py - cy;
        if (dx === 0 && dy === 0) continue;
        if (dy === 0) { cmd('h'); num(dx); }
        else if (dx === 0) { cmd('v'); num(dy); }
        else { cmd('l'); num(dx); num(dy); }
        prevC2 = null;
      } else {
        const c1x = q(s.c1[0]), c1y = q(s.c1[1]), c2x = q(s.c2[0]), c2y = q(s.c2[1]);
        if (prevC2 && c1x === 2 * cx - prevC2[0] && c1y === 2 * cy - prevC2[1]) {
          cmd('s'); num(c2x - cx); num(c2y - cy); num(px - cx); num(py - cy);
        } else {
          cmd('c'); num(c1x - cx); num(c1y - cy); num(c2x - cx); num(c2y - cy); num(px - cx); num(py - cy);
        }
        prevC2 = [c2x, c2y];
      }
      cx = px; cy = py;
    }
    if (loop.closed) {
      out += 'z';
      lastCmd = 'z';
      needsSep = false;
      cx = sx; cy = sy; // after z the current point returns to the subpath start
    }
  }
  return out;
}

/** Anchor points of all loops, flattened, for the node overlay. */
export function loopNodes(loops: PathLoop[]): Float32Array {
  let count = 0;
  for (const l of loops) count += l.segs.length + (l.closed ? 0 : 1);
  const out = new Float32Array(count * 2);
  let k = 0;
  for (const l of loops) {
    if (!l.closed) { out[k++] = l.start[0]; out[k++] = l.start[1]; }
    for (const s of l.segs) { out[k++] = s.p[0]; out[k++] = s.p[1]; }
  }
  return out;
}

export interface LayerOverride {
  color?: string;
  hidden?: boolean;
}

export interface SvgStats {
  layers: number;
  paths: number;
  nodes: number;
  bytes: number;
}

/**
 * Builds the final SVG document. `overrides` is keyed by the layer's original
 * color. Because color layers are stacked (each layer also covers every layer
 * above it), an upper layer that ends up with the same fill as the layer just
 * beneath it is redundant and is dropped — the "merge paths of the same color"
 * step without breaking evenodd semantics.
 */
export interface BuildOptions {
  /**
   * Write each separate shape (an outer boundary with its holes, or one stroke)
   * as its own <path>, grouped per color, instead of one compound path per color.
   */
  separateShapes?: boolean;
}

export function buildSvg(
  result: TraceResult,
  overrides: Record<string, LayerOverride> = {},
  opts: BuildOptions = {},
): { svg: string; stats: SvgStats } {
  const { width, height, outputWidth, outputHeight } = result;
  // `paint` is a presentation attribute such as fill="#000"; with several shapes it moves onto a <g>.
  const emit = (paint: string, layer: TraceResult['layers'][number]) => {
    const shapes = opts.separateShapes ? layer.shapes.filter(Boolean) : [];
    if (shapes.length > 1) parts.push(`<g ${paint}>${shapes.map((d) => `<path d="${d}"/>`).join('')}</g>`);
    else parts.push(`<path ${paint} d="${layer.d}"/>`);
  };
  const head = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${outputWidth}" height="${outputHeight}"`;
  const parts: string[] = [];
  let paths = 0, nodes = 0, layers = 0;
  if (result.mode === 'lineart') {
    for (const layer of result.layers) {
      const o = overrides[layer.color] ?? {};
      if (o.hidden || !layer.d) continue;
      emit(`stroke="${shortHex(o.color ?? layer.color)}"`, layer);
      paths += layer.pathCount; nodes += layer.nodeCount; layers++;
    }
    const sw = Math.round(result.strokeWidth * 100) / 100;
    const svg = `${head} fill="none" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${parts.join('')}</svg>`;
    return { svg, stats: { layers, paths, nodes, bytes: byteLength(svg) } };
  }
  let prevFill = '';
  for (const layer of result.layers) {
    const o = overrides[layer.color] ?? {};
    if (o.hidden || !layer.d) continue;
    const fill = shortHex(o.color ?? layer.color);
    if (fill === prevFill) continue;
    prevFill = fill;
    emit(`fill="${fill}"`, layer);
    paths += layer.pathCount; nodes += layer.nodeCount; layers++;
  }
  const svg = `${head} fill-rule="evenodd">${parts.join('')}</svg>`;
  return { svg, stats: { layers, paths, nodes, bytes: byteLength(svg) } };
}

export function byteLength(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    n += c < 0x80 ? 1 : c < 0x800 ? 2 : c >= 0xd800 && c < 0xdc00 ? (i++, 4) : 3;
  }
  return n;
}
