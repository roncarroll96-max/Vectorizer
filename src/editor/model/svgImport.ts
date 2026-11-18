import type { Doc, GroupShape, Mat, Shape, Style, SubPath } from './types';
import { IDENTITY, meanScale, mul, parseTransform, scaleAbout, translate } from './matrix';
import { normalizeColor } from './color';
import { parsePathData } from './path';
import { bake, newId, TYPE_LABEL } from './shapes';

export interface ImportResult {
  doc: Doc;
  /** Human-readable notes about things that were simplified or skipped. */
  warnings: string[];
}

interface Inherited {
  fill: string;
  stroke: string;
  strokeWidth: number;
  fillRule: 'nonzero' | 'evenodd';
  fillOpacity: number;
  strokeOpacity: number;
  linecap?: Style['strokeLinecap'];
  linejoin?: Style['strokeLinejoin'];
  fontSize: number;
  fontFamily: string;
  fontWeight: number;
  textAnchor: 'start' | 'middle' | 'end';
}

const ROOT: Inherited = {
  fill: '#000000', stroke: 'none', strokeWidth: 1, fillRule: 'nonzero', fillOpacity: 1, strokeOpacity: 1,
  fontSize: 16, fontFamily: 'sans-serif', fontWeight: 400, textAnchor: 'start',
};

const num = (v: string | null | undefined, d = 0): number => {
  if (v == null) return d;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : d;
};

function readStyleMap(el: Element): Map<string, string> {
  const map = new Map<string, string>();
  for (const a of ['fill', 'stroke', 'stroke-width', 'fill-rule', 'opacity', 'fill-opacity', 'stroke-opacity',
    'stroke-linecap', 'stroke-linejoin', 'font-size', 'font-family', 'font-weight', 'text-anchor', 'display', 'visibility']) {
    const v = el.getAttribute(a);
    if (v != null) map.set(a, v.trim());
  }
  const style = el.getAttribute('style');
  if (style) {
    for (const decl of style.split(';')) {
      const i = decl.indexOf(':');
      if (i > 0) map.set(decl.slice(0, i).trim().toLowerCase(), decl.slice(i + 1).replace(/!important/, '').trim());
    }
  }
  return map;
}

/**
 * Imports an SVG string into an editable document. Inherited presentation
 * styles are flattened onto each shape; groups keep their transforms.
 * Arcs, quadratics, circles, polygons etc. become paths or native shapes.
 */
export function importSvg(source: string): ImportResult {
  if (typeof DOMParser === 'undefined') throw new Error('SVG import needs a browser');
  const xml = new DOMParser().parseFromString(source, 'image/svg+xml');
  if (xml.getElementsByTagName('parsererror').length) throw new Error("That file isn't valid SVG/XML.");
  const root = xml.documentElement;
  if (!root || root.localName !== 'svg') throw new Error("That file doesn't contain an <svg> element.");
  const warnings = new Set<string>();

  const vb = (root.getAttribute('viewBox') ?? '').split(/[\s,]+/).filter(Boolean).map(Number);
  const hasVb = vb.length === 4 && vb.every(Number.isFinite) && vb[2] > 0 && vb[3] > 0;
  const attrW = root.getAttribute('width'), attrH = root.getAttribute('height');
  const isAbs = (v: string | null) => v != null && !/%$/.test(v.trim()) && num(v) > 0;
  const width = isAbs(attrW) ? num(attrW) : hasVb ? vb[2] : 300;
  const height = isAbs(attrH) ? num(attrH) : hasVb ? vb[3] : 150;
  let rootM: Mat = [...IDENTITY];
  if (hasVb) rootM = mul(scaleAbout(width / vb[2], height / vb[3]), translate(-vb[0], -vb[1]));

  const resolvePaint = (v: string | undefined, inherited: string): string => {
    if (v == null || v === 'inherit') return inherited;
    const url = /url\(\s*['"]?#([^'")]+)['"]?\s*\)/.exec(v);
    if (url) {
      const ref = xml.getElementById(url[1]);
      const stop = ref?.querySelector('stop');
      if (stop) {
        warnings.add('Gradients were replaced by their first color.');
        const sm = readStyleMap(stop);
        return normalizeColor(stop.getAttribute('stop-color') ?? sm.get('stop-color') ?? '#000');
      }
      warnings.add('Patterns or unknown paint servers were replaced by grey.');
      return '#888888';
    }
    return normalizeColor(v, inherited);
  };

  const inherit = (el: Element, parent: Inherited) => {
    const m = readStyleMap(el);
    const g = (k: string) => m.get(k);
    const ctx: Inherited = { ...parent };
    ctx.fill = resolvePaint(g('fill'), parent.fill);
    ctx.stroke = resolvePaint(g('stroke'), parent.stroke);
    if (g('stroke-width')) ctx.strokeWidth = num(g('stroke-width'), parent.strokeWidth);
    if (g('fill-rule')) ctx.fillRule = g('fill-rule') === 'evenodd' ? 'evenodd' : 'nonzero';
    if (g('fill-opacity')) ctx.fillOpacity = num(g('fill-opacity'), 1);
    if (g('stroke-opacity')) ctx.strokeOpacity = num(g('stroke-opacity'), 1);
    const lc = g('stroke-linecap'); if (lc === 'butt' || lc === 'round' || lc === 'square') ctx.linecap = lc;
    const lj = g('stroke-linejoin'); if (lj === 'miter' || lj === 'round' || lj === 'bevel') ctx.linejoin = lj;
    if (g('font-size')) ctx.fontSize = num(g('font-size'), parent.fontSize);
    if (g('font-family')) ctx.fontFamily = g('font-family')!;
    const fw = g('font-weight');
    if (fw) ctx.fontWeight = fw === 'bold' ? 700 : fw === 'normal' ? 400 : num(fw, parent.fontWeight);
    const ta = g('text-anchor'); if (ta === 'start' || ta === 'middle' || ta === 'end') ctx.textAnchor = ta;
    const hidden = g('display') === 'none' || g('visibility') === 'hidden';
    const opacity = g('opacity') ? Math.max(0, Math.min(1, num(g('opacity'), 1))) : 1;
    return { ctx, hidden, opacity };
  };

  const styleOf = (c: Inherited, opacity: number): Style => ({
    fill: c.fill,
    stroke: c.stroke,
    strokeWidth: c.strokeWidth,
    // SVG has separate fill/stroke opacity; approximate with one element opacity.
    opacity: opacity * (c.fill !== 'none' ? c.fillOpacity : c.strokeOpacity),
    fillRule: c.fillRule,
    ...(c.linecap ? { strokeLinecap: c.linecap } : {}),
    ...(c.linejoin ? { strokeLinejoin: c.linejoin } : {}),
  });

  const counters: Record<string, number> = {};
  const nameFor = (el: Element, type: Shape['type']) => {
    const label = el.getAttribute('inkscape:label') ?? el.getAttribute('id');
    if (label) return label;
    counters[type] = (counters[type] ?? 0) + 1;
    return `${TYPE_LABEL[type]} ${counters[type]}`;
  };

  const SKIP = new Set(['defs', 'style', 'title', 'desc', 'metadata', 'linearGradient', 'radialGradient', 'pattern',
    'clipPath', 'mask', 'filter', 'symbol', 'marker', 'script', 'sodipodi:namedview', 'namedview']);

  const convert = (el: Element, parent: Inherited): Shape | null => {
    const tag = el.localName;
    if (SKIP.has(tag)) return null;
    const { ctx, hidden, opacity } = inherit(el, parent);
    let transform = parseTransform(el.getAttribute('transform'));
    const common = (type: Shape['type']) => ({
      id: newId(), name: nameFor(el, type), transform, style: styleOf(ctx, opacity), ...(hidden ? { hidden: true } : {}),
    });
    const a = (n: string, d = 0) => num(el.getAttribute(n), d);
    switch (tag) {
      case 'g': case 'a': case 'svg': case 'switch': {
        if (tag === 'svg') transform = mul(transform, translate(a('x'), a('y')));
        if (el.getAttribute('clip-path') || el.getAttribute('mask')) warnings.add('Clipping paths and masks were ignored.');
        const children = Array.from(el.children).map((c) => convert(c, ctx)).filter((s): s is Shape => !!s);
        const g: GroupShape = { ...common('group'), transform, type: 'group', children };
        g.style = { ...g.style, opacity };
        return children.length ? g : null;
      }
      case 'path': {
        const d = el.getAttribute('d');
        if (!d) return null;
        let subpaths: SubPath[];
        try { subpaths = parsePathData(d); } catch { warnings.add('Some malformed paths were skipped.'); return null; }
        return subpaths.length ? { ...common('path'), type: 'path', subpaths } : null;
      }
      case 'rect': {
        const w = a('width'), h = a('height');
        if (w <= 0 || h <= 0) return null;
        const rx = el.hasAttribute('rx') ? a('rx') : a('ry');
        return { ...common('rect'), type: 'rect', x: a('x'), y: a('y'), w, h, rx };
      }
      case 'circle': {
        const r = a('r');
        return r > 0 ? { ...common('ellipse'), type: 'ellipse', cx: a('cx'), cy: a('cy'), rx: r, ry: r } : null;
      }
      case 'ellipse': {
        const rx = a('rx'), ry = a('ry');
        return rx > 0 && ry > 0 ? { ...common('ellipse'), type: 'ellipse', cx: a('cx'), cy: a('cy'), rx, ry } : null;
      }
      case 'line':
        return { ...common('line'), type: 'line', x1: a('x1'), y1: a('y1'), x2: a('x2'), y2: a('y2') };
      case 'polyline': case 'polygon': {
        const pts = (el.getAttribute('points') ?? '').match(/[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi)?.map(Number) ?? [];
        if (pts.length < 4) return null;
        const nodes = [];
        for (let i = 0; i + 1 < pts.length; i += 2) nodes.push({ p: [pts[i], pts[i + 1]] as [number, number], kind: 'corner' as const });
        return { ...common('path'), type: 'path', subpaths: [{ nodes, closed: tag === 'polygon' }] };
      }
      case 'text': {
        const tspans = Array.from(el.querySelectorAll('tspan'));
        const text = tspans.length ? tspans.map((t) => t.textContent ?? '').join('\n') : (el.textContent ?? '');
        const first = tspans[0];
        const x = el.hasAttribute('x') ? a('x') : num(first?.getAttribute('x'));
        const y = el.hasAttribute('y') ? a('y') : num(first?.getAttribute('y'));
        if (!text.trim()) return null;
        return {
          ...common('text'), type: 'text', x, y, text: text.replace(/[ \t]+/g, ' ').trim(),
          fontSize: ctx.fontSize, fontFamily: ctx.fontFamily, fontWeight: ctx.fontWeight, textAnchor: ctx.textAnchor,
        };
      }
      case 'use': case 'image': case 'foreignObject':
        warnings.add(`<${tag}> elements aren't supported and were skipped.`);
        return null;
      default:
        return null;
    }
  };

  const { ctx } = inherit(root, ROOT);
  let shapes = Array.from(root.children).map((c) => convert(c, ctx)).filter((s): s is Shape => !!s);
  // Apply the viewBox mapping to top-level shapes, folding it into geometry where possible.
  shapes = shapes.map((s) => {
    const t = mul(rootM, s.transform);
    const baked = bake({ ...s, transform: t } as Shape);
    // When the scale was folded into the geometry, scale the stroke with it.
    const k = meanScale(t);
    if (baked.transform !== t && Math.abs(k - 1) > 1e-9) {
      return { ...baked, style: { ...baked.style, strokeWidth: baked.style.strokeWidth * k } } as Shape;
    }
    return baked;
  });
  return { doc: { width, height, background: null, shapes }, warnings: [...warnings] };
}
