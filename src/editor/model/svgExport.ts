import type { Doc, Shape, Style } from './types';
import { matrixToAttr } from './matrix';
import { serializePath } from './path';
import { shortHex } from '../../core/color';
import { TEXT_LINE_HEIGHT } from './geometry';

const fmt = (n: number) => String(Math.round(n * 100) / 100);
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Presentation attributes for a style, omitting SVG defaults. */
export function styleAttrs(st: Style, isGroup = false): [string, string][] {
  const out: [string, string][] = [];
  if (!isGroup) {
    if (st.fill !== '#000000') out.push(['fill', st.fill === 'none' ? 'none' : shortHex(st.fill)]);
    if (st.stroke !== 'none') {
      out.push(['stroke', shortHex(st.stroke)]);
      if (st.strokeWidth !== 1) out.push(['stroke-width', fmt(st.strokeWidth)]);
      if (st.strokeLinecap && st.strokeLinecap !== 'butt') out.push(['stroke-linecap', st.strokeLinecap]);
      if (st.strokeLinejoin && st.strokeLinejoin !== 'miter') out.push(['stroke-linejoin', st.strokeLinejoin]);
    }
    if (st.fillRule === 'evenodd') out.push(['fill-rule', 'evenodd']);
  }
  if (st.opacity < 1) out.push(['opacity', fmt(st.opacity)]);
  return out;
}

const attrs = (pairs: [string, string | number][]) => pairs.map(([k, v]) => ` ${k}="${typeof v === 'number' ? fmt(v) : esc(v)}"`).join('');

export function shapeToSvg(s: Shape, precision: 1 | 2 = 2): string {
  if (s.hidden) return '';
  const t = matrixToAttr(s.transform);
  const common: [string, string | number][] = [...(t ? [['transform', t] as [string, string]] : []), ...styleAttrs(s.style, s.type === 'group')];
  switch (s.type) {
    case 'group': {
      const inner = s.children.map((c) => shapeToSvg(c, precision)).join('');
      return inner ? `<g${attrs(common)}>${inner}</g>` : '';
    }
    case 'rect':
      return `<rect${attrs([...(s.x ? [['x', s.x]] : []), ...(s.y ? [['y', s.y]] : []), ['width', s.w], ['height', s.h], ...(s.rx ? [['rx', s.rx]] : []), ...common] as [string, number][])}/>`;
    case 'ellipse':
      return s.rx === s.ry
        ? `<circle${attrs([['cx', s.cx], ['cy', s.cy], ['r', s.rx], ...common])}/>`
        : `<ellipse${attrs([['cx', s.cx], ['cy', s.cy], ['rx', s.rx], ['ry', s.ry], ...common])}/>`;
    case 'line':
      return `<line${attrs([['x1', s.x1], ['y1', s.y1], ['x2', s.x2], ['y2', s.y2], ...common])}/>`;
    case 'path': {
      const d = serializePath(s.subpaths, precision);
      return d ? `<path${attrs([['d', d], ...common])}/>` : '';
    }
    case 'text': {
      const lines = s.text.split('\n');
      const text: [string, string | number][] = [['x', s.x], ['y', s.y], ['font-size', s.fontSize], ['font-family', s.fontFamily]];
      if (s.fontWeight !== 400) text.push(['font-weight', String(s.fontWeight)]);
      if (s.textAnchor !== 'start') text.push(['text-anchor', s.textAnchor]);
      const body = lines.length === 1
        ? esc(lines[0])
        : lines.map((l, i) => `<tspan x="${fmt(s.x)}"${i ? ` dy="${TEXT_LINE_HEIGHT}em"` : ''}>${esc(l) || ' '}</tspan>`).join('');
      return `<text${attrs([...text, ...common])}>${body}</text>`;
    }
  }
}

/** Serialises the whole document as a standalone SVG file. */
export function exportSvg(doc: Doc, precision: 1 | 2 = 2): string {
  const bg = doc.background ? `<rect width="100%" height="100%" fill="${shortHex(doc.background)}"/>` : '';
  const body = doc.shapes.map((s) => shapeToSvg(s, precision)).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${fmt(doc.width)} ${fmt(doc.height)}" width="${fmt(doc.width)}" height="${fmt(doc.height)}">${bg}${body}</svg>`;
}

/** Serialises a selection (used for copy to the system clipboard). */
export function shapesToSvg(shapes: Shape[], width: number, height: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${fmt(width)} ${fmt(height)}">${shapes.map((s) => shapeToSvg(s)).join('')}</svg>`;
}
