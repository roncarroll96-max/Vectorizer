// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { importSvg } from '../model/svgImport';
import { exportSvg } from '../model/svgExport';
import { shapeBounds, unionBoxes } from '../model/geometry';
import {
  documentColors, duplicateShapes, getShape, groupShapes, moveShape, parentMatrix, reorder, ungroupShape, updateShapes,
} from '../model/doc';
import { bake, defaultStyle, emptyDoc, makeEllipse, makeRect, toPath, transformShape } from '../model/shapes';
import { rotateAbout, scaleAbout } from '../model/matrix';
import { alignOffset, buildTargets, snapBox } from '../model/snap';
import type { Box, Doc } from '../model/types';
import { traceImage } from '../../core/pipeline';
import { buildSvg } from '../../core/svg';
import { DEFAULT_SETTINGS } from '../../core/presets';

const close = (a: Box | null, b: Box | null, eps = 0.01) => {
  expect(a && b).toBeTruthy();
  expect(a!.x).toBeCloseTo(b!.x, -Math.log10(eps));
  expect(a!.y).toBeCloseTo(b!.y, -Math.log10(eps));
  expect(a!.w).toBeCloseTo(b!.w, -Math.log10(eps));
  expect(a!.h).toBeCloseTo(b!.h, -Math.log10(eps));
};

function sampleDoc(): Doc {
  const doc = emptyDoc(400, 300);
  doc.shapes = [
    makeRect(10, 10, 100, 50, defaultStyle({ fill: '#ff0000' })),
    makeEllipse(200, 100, 40, 20, defaultStyle({ fill: '#00ff00' })),
    makeRect(300, 200, 50, 50, defaultStyle({ fill: '#0000ff' })),
  ];
  return doc;
}

describe('shape transforms', () => {
  it('bakes axis-aligned scale into rect geometry and keeps rotation as a matrix', () => {
    const r = makeRect(0, 0, 10, 20, defaultStyle());
    const scaled = transformShape(r, scaleAbout(2, 3, 0, 0));
    expect(scaled.type === 'rect' && [scaled.w, scaled.h]).toEqual([20, 60]);
    const rotated = transformShape(r, rotateAbout(45, 5, 10));
    expect(rotated.transform[1]).not.toBe(0);
    close(shapeBounds(rotated), { x: 5 - 15 / Math.SQRT2, y: 10 - 15 / Math.SQRT2, w: 30 / Math.SQRT2, h: 30 / Math.SQRT2 });
  });

  it('converting to a path preserves bounds', () => {
    const e = transformShape(makeEllipse(50, 50, 30, 10, defaultStyle()), rotateAbout(30, 50, 50));
    close(shapeBounds(toPath(e)), shapeBounds(e), 0.1); // cubic ellipse ≈ exact ellipse
    const p = bake(transformShape(toPath(makeRect(0, 0, 10, 10, defaultStyle())), rotateAbout(90, 0, 0)));
    expect(p.transform).toEqual([1, 0, 0, 1, 0, 0]);
  });
});

describe('document operations', () => {
  it('reorders within the parent', () => {
    const doc = sampleDoc();
    const [a, b, c] = doc.shapes.map((s) => s.id);
    expect(reorder(doc, [a], 'front').shapes.map((s) => s.id)).toEqual([b, c, a]);
    expect(reorder(doc, [c], 'back').shapes.map((s) => s.id)).toEqual([c, a, b]);
    expect(reorder(doc, [a], 'forward').shapes.map((s) => s.id)).toEqual([b, a, c]);
    expect(reorder(doc, [c], 'backward').shapes.map((s) => s.id)).toEqual([a, c, b]);
  });

  it('group → transform → ungroup keeps everything visually in place', () => {
    const doc = sampleDoc();
    const ids = doc.shapes.slice(0, 2).map((s) => s.id);
    const { doc: grouped, groupId } = groupShapes(doc, ids);
    expect(grouped.shapes).toHaveLength(2);
    const g = getShape(grouped, groupId!)!;
    expect(g.type).toBe('group');
    const rotated = updateShapes(grouped, [groupId!], (s) => ({ ...s, transform: rotateAbout(30, 100, 100) }));
    const before = ids.map((id) => shapeBounds(getShape(rotated, id)!, parentMatrix(rotated, id)));
    const { doc: flat, childIds } = ungroupShape(rotated, groupId!);
    expect(childIds).toEqual(ids);
    ids.forEach((id, i) => close(shapeBounds(getShape(flat, id)!, parentMatrix(flat, id)), before[i]));
  });

  it('moving a shape into a rotated group keeps it in place', () => {
    let doc = sampleDoc();
    const { doc: d2, groupId } = groupShapes(doc, [doc.shapes[0].id]);
    doc = updateShapes(d2, [groupId!], (s) => ({ ...s, transform: rotateAbout(20, 0, 0) }));
    const moving = doc.shapes[2].id;
    const before = shapeBounds(getShape(doc, moving)!, parentMatrix(doc, moving));
    const out = moveShape(doc, moving, groupId!, 'inside');
    expect(parentMatrix(out, moving)).not.toEqual([1, 0, 0, 1, 0, 0]);
    close(shapeBounds(getShape(out, moving)!, parentMatrix(out, moving)), before);
  });

  it('duplicates with new ids and an offset', () => {
    const doc = sampleDoc();
    const { doc: out, newIds } = duplicateShapes(doc, [doc.shapes[0].id]);
    expect(out.shapes).toHaveLength(4);
    expect(newIds[0]).not.toBe(doc.shapes[0].id);
    const copy = getShape(out, newIds[0])!;
    expect(shapeBounds(copy)!.x).toBe(20);
    expect(out.shapes[1].id).toBe(newIds[0]); // directly above the original
  });

  it('lists document colors', () => {
    expect(documentColors(sampleDoc())).toEqual(['#ff0000', '#00ff00', '#0000ff']);
  });
});

describe('snapping and alignment', () => {
  it('snaps a moving box edge to nearby targets', () => {
    const targets = buildTargets([{ x: 100, y: 100, w: 50, h: 50 }], { x: 0, y: 0, w: 400, h: 300 });
    const r = snapBox({ x: 147, y: 20, w: 30, h: 30 }, targets, 5);
    expect(r.dx).toBe(3); // left edge 147 → 150
    expect(r.guides).toContainEqual({ axis: 'x', pos: 150 });
  });

  it('computes alignment offsets', () => {
    const ref = { x: 0, y: 0, w: 100, h: 100 };
    expect(alignOffset({ x: 30, y: 30, w: 20, h: 20 }, ref, 'right')).toEqual([50, 0]);
    expect(alignOffset({ x: 30, y: 30, w: 20, h: 20 }, ref, 'vcenter')).toEqual([0, 10]);
  });
});

describe('SVG import', () => {
  it('flattens inherited styles and keeps group transforms', () => {
    const { doc, warnings } = importSvg(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100">
      <g fill="red" stroke="#00f" stroke-width="3" transform="translate(10 20)">
        <rect width="20" height="10"/>
        <circle cx="50" cy="50" r="5" style="fill: rgb(0, 128, 0)"/>
        <polygon points="0,0 10,0 5,8"/>
      </g>
      <text x="5" y="90" font-size="12" font-weight="bold">Hi &amp; bye</text>
      <image href="x.png"/>
    </svg>`);
    expect(doc.width).toBe(200);
    const g = doc.shapes[0];
    expect(g.type).toBe('group');
    if (g.type !== 'group') return;
    expect(g.transform).toEqual([1, 0, 0, 1, 10, 20]);
    expect(g.children.map((c) => c.type)).toEqual(['rect', 'ellipse', 'path']);
    expect(g.children[0].style).toMatchObject({ fill: '#ff0000', stroke: '#0000ff', strokeWidth: 3 });
    expect(g.children[1].style.fill).toBe('#008000');
    const t = doc.shapes[1];
    expect(t.type === 'text' && [t.text, t.fontWeight, t.fontSize]).toEqual(['Hi & bye', 700, 12]);
    expect(warnings.some((w) => w.includes('<image>'))).toBe(true);
  });

  it('maps the viewBox to the document size', () => {
    const { doc } = importSvg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="10 10 50 50" width="100" height="100"><rect x="10" y="10" width="50" height="50" stroke="#000" stroke-width="2"/></svg>');
    const r = doc.shapes[0];
    expect(r.type === 'rect' && [r.x, r.y, r.w, r.h]).toEqual([0, 0, 100, 100]);
    expect(r.style.strokeWidth).toBe(4);
  });

  it('replaces gradients with their first stop color', () => {
    const { doc, warnings } = importSvg(`<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10">
      <defs><linearGradient id="g"><stop offset="0" stop-color="#123456"/><stop offset="1" stop-color="#fff"/></linearGradient></defs>
      <rect width="10" height="10" fill="url(#g)"/></svg>`);
    expect(doc.shapes[0].style.fill).toBe('#123456');
    expect(warnings.length).toBeGreaterThan(0);
  });

  it('rejects invalid files with a friendly error', () => {
    expect(() => importSvg('<svg><path></svg')).toThrow(/valid/);
    expect(() => importSvg('<html></html>')).toThrow(/<svg>/);
  });

  it('opens Vectorizer output at its original size', () => {
    const img = { width: 40, height: 30, data: new Uint8ClampedArray(40 * 30 * 4).fill(255) };
    for (let y = 5; y < 20; y++) for (let x = 5; x < 25; x++) { const o = (y * 40 + x) * 4; img.data[o] = 200; img.data[o + 1] = 0; img.data[o + 2] = 0; }
    const result = traceImage(img, { ...DEFAULT_SETTINGS, colors: 2 }, { outputWidth: 80, outputHeight: 60 });
    const { doc } = importSvg(buildSvg(result).svg);
    expect([doc.width, doc.height]).toEqual([80, 60]);
    expect(doc.shapes).toHaveLength(2);
    expect(doc.shapes.every((s) => s.type === 'path' && s.style.fillRule === 'evenodd')).toBe(true);
    close(shapeBounds(doc.shapes[1]), { x: 10, y: 10, w: 40, h: 30 }, 0.1);
  });
});

describe('SVG export', () => {
  it('produces valid SVG that imports back to the same geometry', () => {
    let doc = sampleDoc();
    doc.shapes[1] = transformShape(doc.shapes[1], rotateAbout(30, 200, 100));
    doc = groupShapes(doc, [doc.shapes[0].id, doc.shapes[1].id]).doc;
    const svg = exportSvg(doc);
    const parsed = new DOMParser().parseFromString(svg, 'image/svg+xml');
    expect(parsed.getElementsByTagName('parsererror')).toHaveLength(0);
    expect(svg).toContain('viewBox="0 0 400 300"');
    const back = importSvg(svg).doc;
    expect(back.shapes.map((s) => s.type)).toEqual(['rect', 'group', 'rect']); // background rect first
    close(unionBoxes(back.shapes.slice(1).map((s) => shapeBounds(s))), unionBoxes(doc.shapes.map((s) => shapeBounds(s))));
  });

  it('omits hidden shapes and escapes text', () => {
    const doc = sampleDoc();
    doc.shapes[0] = { ...doc.shapes[0], hidden: true };
    doc.shapes.push({ id: 't', name: 't', type: 'text', transform: [1, 0, 0, 1, 0, 0], style: defaultStyle({ fill: '#000000' }), x: 0, y: 20, text: 'a < b\nline 2', fontSize: 20, fontFamily: 'serif', fontWeight: 400, textAnchor: 'start' });
    const svg = exportSvg(doc);
    expect(svg).not.toContain('fill="#f00"');
    expect(svg).toContain('a &lt; b');
    expect(svg).toContain('<tspan');
  });
});
