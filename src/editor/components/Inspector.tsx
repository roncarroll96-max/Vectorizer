import { editorStore, useEditor } from '../store';
import type { Shape, Style } from '../model/types';
import { documentColors, getShape, parentMatrix } from '../model/doc';
import { rotationOf } from '../model/matrix';
import { TYPE_LABEL } from '../model/shapes';
import { ColorField, IconButton, NumField, PanelSection } from './Fields';
import {
  IAlignB, IAlignCH, IAlignCV, IAlignL, IAlignR, IAlignT, IBack, IDown, IDuplicate, IFlipH, IFlipV, IFront, IGroup,
  ICombine, IRotL, IRotR, ISplit, IToPath, ITrash, IUngroup, IUp,
} from './Icons';
import { rotateAbout } from '../model/matrix';

const FONTS = [
  { v: 'system-ui, sans-serif', l: 'System' },
  { v: 'Helvetica, Arial, sans-serif', l: 'Helvetica / Arial' },
  { v: 'Georgia, serif', l: 'Georgia' },
  { v: "'Times New Roman', serif", l: 'Times' },
  { v: 'ui-monospace, Menlo, monospace', l: 'Monospace' },
  { v: "'Comic Sans MS', cursive", l: 'Comic' },
];

const BASE_SWATCHES = ['#000000', '#ffffff', '#1d2433', '#6b7280', '#e5484d', '#f76b15', '#ffc53d', '#46a758', '#12a594', '#0090ff', '#4f7cff', '#8e4ec6', '#d6409f'];

/** First leaf style in the selection (groups are represented by their first child). */
function representativeStyle(shapes: Shape[]): Style | null {
  for (const s of shapes) {
    if (s.type !== 'group') return s.style;
    const r = representativeStyle(s.children);
    if (r) return { ...r, opacity: s.style.opacity };
  }
  return null;
}

function Swatches() {
  const doc = useEditor((s) => s.doc);
  const used = documentColors(doc).slice(0, 24);
  const apply = (c: string, stroke: boolean) => editorStore.setStyle(stroke ? { stroke: c } : { fill: c });
  const sw = (c: string, key: string) => (
    <button
      key={key}
      type="button"
      className="ed-swatch"
      style={{ background: c }}
      aria-label={`Use ${c} (Shift+click for stroke)`}
      title={`${c} — click: fill · Shift+click: stroke`}
      onClick={(e) => apply(c, e.shiftKey)}
    />
  );
  return (
    <PanelSection title="Colors">
      {used.length > 0 && (<><p className="ed-sub">In this document</p><div className="ed-swatches">{used.map((c) => sw(c, `u${c}`))}</div></>)}
      <p className="ed-sub">Basics</p>
      <div className="ed-swatches">{BASE_SWATCHES.map((c) => sw(c, `b${c}`))}</div>
      <p className="ed-hint">Click to set the fill, Shift+click for the stroke.</p>
    </PanelSection>
  );
}

function DocumentPanel() {
  const doc = useEditor((s) => s.doc);
  const defaults = useEditor((s) => s.defaults);
  const tool = useEditor((s) => s.tool);
  const sides = useEditor((s) => s.polygonSides);
  return (
    <>
      <PanelSection title="Document">
        <div className="ed-grid2">
          <NumField label="Width" short="W" value={doc.width} min={1} onChange={(width) => editorStore.setDocument({ width })} />
          <NumField label="Height" short="H" value={doc.height} min={1} onChange={(height) => editorStore.setDocument({ height })} />
        </div>
        <ColorField
          label="Background"
          value={doc.background ?? 'none'}
          onChange={(c, live) => editorStore.setDocument({ background: c === 'none' ? null : c }, live ? 'bg' : undefined)}
        />
      </PanelSection>
      {tool === 'polygon' && (
        <PanelSection title="Polygon">
          <NumField label="Sides" value={sides} min={3} max={64} onChange={(v) => editorStore.set({ polygonSides: Math.round(v) })} />
        </PanelSection>
      )}
      <PanelSection title="New shapes">
        <ColorField label="Fill" value={defaults.fill} onChange={(fill) => editorStore.setStyle({ fill })} />
        <ColorField label="Stroke" value={defaults.stroke} onChange={(stroke) => editorStore.setStyle({ stroke })} />
        <NumField label="Stroke width" value={defaults.strokeWidth} min={0} step={0.5} onChange={(strokeWidth) => editorStore.setStyle({ strokeWidth })} />
        <p className="ed-hint">Open lines and pen paths always get a stroke so they stay visible.</p>
      </PanelSection>
    </>
  );
}

function NodePanel() {
  const nodeSelection = useEditor((s) => s.nodeSelection);
  useEditor((s) => s.doc);
  const path = editorStore.activePath();
  if (!path) return null;
  const nodes = nodeSelection.map((k) => { const [si, ni] = k.split(':').map(Number); return path.subpaths[si]?.nodes[ni]; }).filter(Boolean);
  const kinds = new Set(nodes.map((n) => n.kind));
  const kind = kinds.size === 1 ? [...kinds][0] : null;
  const single = nodes.length === 1 ? nodes[0] : null;
  const pm = parentMatrix(editorStore.getState().doc, path.id);
  const isPlain = pm.every((v, i) => v === [1, 0, 0, 1, 0, 0][i]);
  return (
    <PanelSection title={nodes.length ? `${nodes.length} node${nodes.length > 1 ? 's' : ''}` : 'Nodes'}>
      {!nodes.length && <p className="ed-hint">Click a node to select it, drag to move. Double-click the path to add a node, double-click a node to toggle smooth/corner. Alt-drag a handle to break it.</p>}
      {nodes.length > 0 && (
        <>
          <div className="ed-seg" role="radiogroup" aria-label="Node type">
            {(['corner', 'smooth', 'symmetric'] as const).map((k) => (
              <button key={k} type="button" role="radio" aria-checked={kind === k} className={kind === k ? 'is-active' : undefined} onClick={() => editorStore.setSelectedNodeKind(k)}>
                {k[0].toUpperCase() + k.slice(1)}
              </button>
            ))}
          </div>
          {single && isPlain && (
            <div className="ed-grid2">
              <NumField label="Node X" short="X" value={single.p[0]} onChange={(x) => editorStore.nudgeNodes(x - single.p[0], 0)} />
              <NumField label="Node Y" short="Y" value={single.p[1]} onChange={(y) => editorStore.nudgeNodes(0, y - single.p[1])} />
            </div>
          )}
          <button type="button" className="ed-btn ed-btn-wide" onClick={() => editorStore.deleteSelectedNodes()}><ITrash width={15} height={15} /> Delete node{nodes.length > 1 ? 's' : ''}</button>
        </>
      )}
    </PanelSection>
  );
}

function TypePanel({ shape }: { shape: Shape }) {
  const up = (fn: (s: Shape) => Shape, key?: string) => editorStore.updateShape(shape.id, fn, key);
  if (shape.type === 'rect') {
    return (
      <PanelSection title="Rectangle">
        <NumField label="Corner radius" value={shape.rx} min={0} onChange={(rx) => up((s) => ({ ...s, rx }) as Shape)} />
      </PanelSection>
    );
  }
  if (shape.type === 'text') {
    return (
      <PanelSection title="Text">
        <label className="ed-field">
          <span>Content</span>
          <textarea rows={Math.min(6, shape.text.split('\n').length + 1)} value={shape.text} onChange={(e) => up((s) => ({ ...s, text: e.target.value }) as Shape, 'text')} />
        </label>
        <div className="ed-grid2">
          <NumField label="Font size" short="Size" value={shape.fontSize} min={1} onChange={(fontSize) => up((s) => ({ ...s, fontSize }) as Shape)} />
          <label className="ed-field ed-inline">
            <span className="sr-only">Font weight</span>
            <select value={shape.fontWeight} onChange={(e) => up((s) => ({ ...s, fontWeight: Number(e.target.value) }) as Shape)} aria-label="Font weight">
              {[300, 400, 500, 600, 700, 800].map((w) => <option key={w} value={w}>{({ 300: 'Light', 400: 'Regular', 500: 'Medium', 600: 'Semibold', 700: 'Bold', 800: 'Heavy' } as Record<number, string>)[w]}</option>)}
            </select>
          </label>
        </div>
        <label className="ed-field">
          <span>Font</span>
          <select value={FONTS.some((f) => f.v === shape.fontFamily) ? shape.fontFamily : ''} onChange={(e) => up((s) => ({ ...s, fontFamily: e.target.value }) as Shape)}>
            {!FONTS.some((f) => f.v === shape.fontFamily) && <option value="">{shape.fontFamily}</option>}
            {FONTS.map((f) => <option key={f.v} value={f.v}>{f.l}</option>)}
          </select>
        </label>
        <div className="ed-seg" role="radiogroup" aria-label="Text alignment">
          {(['start', 'middle', 'end'] as const).map((a) => (
            <button key={a} type="button" role="radio" aria-checked={shape.textAnchor === a} className={shape.textAnchor === a ? 'is-active' : undefined} onClick={() => up((s) => ({ ...s, textAnchor: a }) as Shape)}>
              {a === 'start' ? 'Left' : a === 'middle' ? 'Center' : 'Right'}
            </button>
          ))}
        </div>
      </PanelSection>
    );
  }
  return null;
}

function SelectionPanel() {
  const selection = useEditor((s) => s.selection);
  const doc = useEditor((s) => s.doc);
  const shapes = selection.map((id) => getShape(doc, id)).filter((s): s is Shape => !!s);
  if (!shapes.length) return null;
  const single = shapes.length === 1 ? shapes[0] : null;
  const box = editorStore.selectionBounds();
  const st = representativeStyle(shapes);
  const hasGroup = shapes.some((s) => s.type === 'group');
  const canPath = shapes.some((s) => s.type === 'rect' || s.type === 'ellipse' || s.type === 'line');
  const isPath = shapes.some((s) => s.type === 'path');
  const canSplit = shapes.some((s) => s.type === 'path' && s.subpaths.length > 1);
  const canCombine = shapes.filter((s) => s.type !== 'group' && s.type !== 'text').length > 1;
  const rotation = single && single.type !== 'path' && single.type !== 'line' ? rotationOf(single.transform) : null;
  const setStyle = (patch: Partial<Style>, live?: boolean) => editorStore.setStyle(patch, live ? Object.keys(patch)[0] : undefined);

  return (
    <>
      <PanelSection title={single ? TYPE_LABEL[single.type] : `${shapes.length} objects`}>
        {single && (
          <label className="ed-field">
            <span className="sr-only">Name</span>
            <input aria-label="Layer name" value={single.name} onChange={(e) => editorStore.updateShape(single.id, (s) => ({ ...s, name: e.target.value }) as Shape, 'name')} />
          </label>
        )}
        {box && (
          <div className="ed-grid2">
            <NumField label="X position" short="X" value={box.x} onChange={(x) => editorStore.setSelectionBox({ x })} />
            <NumField label="Y position" short="Y" value={box.y} onChange={(y) => editorStore.setSelectionBox({ y })} />
            <NumField label="Width" short="W" value={box.w} min={0.01} onChange={(w) => editorStore.setSelectionBox({ w })} />
            <NumField label="Height" short="H" value={box.h} min={0.01} onChange={(h) => editorStore.setSelectionBox({ h })} />
          </div>
        )}
        <div className="ed-row">
          {rotation !== null && (
            <NumField
              label="Rotation"
              short="↻"
              suffix="°"
              value={rotation}
              onChange={(deg) => {
                const b = editorStore.selectionBounds()!;
                editorStore.transformSelection(rotateAbout(deg - rotation, b.x + b.w / 2, b.y + b.h / 2));
              }}
            />
          )}
          <div className="ed-btn-row">
            <IconButton label="Rotate 90° left" onClick={() => editorStore.rotateSelection(-90)}><IRotL /></IconButton>
            <IconButton label="Rotate 90° right" onClick={() => editorStore.rotateSelection(90)}><IRotR /></IconButton>
            <IconButton label="Flip horizontally" onClick={() => editorStore.flip('h')}><IFlipH /></IconButton>
            <IconButton label="Flip vertically" onClick={() => editorStore.flip('v')}><IFlipV /></IconButton>
          </div>
        </div>
      </PanelSection>

      {st && (
        <PanelSection title="Appearance">
          <ColorField label="Fill" value={st.fill} onChange={(fill, live) => setStyle({ fill }, live)} />
          <ColorField label="Stroke" value={st.stroke} onChange={(stroke, live) => setStyle({ stroke }, live)} />
          <div className="ed-grid2">
            <NumField label="Stroke width" short="Width" value={st.strokeWidth} min={0} step={0.5} disabled={st.stroke === 'none'} onChange={(strokeWidth) => setStyle({ strokeWidth })} />
            <NumField label="Opacity" short="Opacity" suffix="%" value={Math.round(st.opacity * 100)} min={0} max={100} onChange={(v) => setStyle({ opacity: v / 100 })} />
          </div>
          {st.stroke !== 'none' && (
            <div className="ed-grid2">
              <label className="ed-field ed-inline">
                <span>Caps</span>
                <select value={st.strokeLinecap ?? 'butt'} onChange={(e) => setStyle({ strokeLinecap: e.target.value as Style['strokeLinecap'] })}>
                  <option value="butt">Butt</option><option value="round">Round</option><option value="square">Square</option>
                </select>
              </label>
              <label className="ed-field ed-inline">
                <span>Joins</span>
                <select value={st.strokeLinejoin ?? 'miter'} onChange={(e) => setStyle({ strokeLinejoin: e.target.value as Style['strokeLinejoin'] })}>
                  <option value="miter">Miter</option><option value="round">Round</option><option value="bevel">Bevel</option>
                </select>
              </label>
            </div>
          )}
          {isPath && (
            <label className="ed-check">
              <input type="checkbox" checked={st.fillRule === 'evenodd'} onChange={(e) => setStyle({ fillRule: e.target.checked ? 'evenodd' : 'nonzero' })} />
              Even-odd fill (overlaps make holes)
            </label>
          )}
        </PanelSection>
      )}

      {single && <TypePanel shape={single} />}

      <PanelSection title="Arrange">
        <div className="ed-btn-row">
          <IconButton label="Bring to front (Ctrl+])" onClick={() => editorStore.reorder('front')}><IFront /></IconButton>
          <IconButton label="Bring forward (])" onClick={() => editorStore.reorder('forward')}><IUp /></IconButton>
          <IconButton label="Send backward ([)" onClick={() => editorStore.reorder('backward')}><IDown /></IconButton>
          <IconButton label="Send to back (Ctrl+[)" onClick={() => editorStore.reorder('back')}><IBack /></IconButton>
          <span className="ed-sep" />
          <IconButton label="Group (Ctrl+G)" onClick={() => editorStore.group()}><IGroup /></IconButton>
          <IconButton label="Ungroup (Ctrl+Shift+G)" disabled={!hasGroup} onClick={() => editorStore.ungroup()}><IUngroup /></IconButton>
        </div>
        <div className="ed-btn-row">
          <IconButton label={shapes.length > 1 ? 'Align left edges' : 'Align to canvas left'} onClick={() => editorStore.align('left')}><IAlignL /></IconButton>
          <IconButton label="Align horizontal centers" onClick={() => editorStore.align('hcenter')}><IAlignCH /></IconButton>
          <IconButton label="Align right edges" onClick={() => editorStore.align('right')}><IAlignR /></IconButton>
          <IconButton label="Align top edges" onClick={() => editorStore.align('top')}><IAlignT /></IconButton>
          <IconButton label="Align vertical centers" onClick={() => editorStore.align('vcenter')}><IAlignCV /></IconButton>
          <IconButton label="Align bottom edges" onClick={() => editorStore.align('bottom')}><IAlignB /></IconButton>
        </div>
        <p className="ed-hint">{shapes.length > 1 ? 'Aligns to the selection.' : 'Aligns to the canvas.'}</p>
        <div className="ed-btn-row">
          <IconButton label="Duplicate (Ctrl+D)" onClick={() => editorStore.duplicate()}><IDuplicate /></IconButton>
          <IconButton label="Convert to path" disabled={!canPath} onClick={() => editorStore.convertToPath()}><IToPath /></IconButton>
          <IconButton label="Split path into separate shapes (Ctrl+Shift+K)" disabled={!canSplit} onClick={() => editorStore.splitPaths()}><ISplit /></IconButton>
          <IconButton label="Combine into one path (Ctrl+K)" disabled={!canCombine} onClick={() => editorStore.combinePaths()}><ICombine /></IconButton>
          <IconButton label="Delete (Del)" className="is-danger" onClick={() => editorStore.deleteSelection()}><ITrash /></IconButton>
        </div>
      </PanelSection>
    </>
  );
}

export function Inspector() {
  const hasSelection = useEditor((s) => s.selection.length > 0);
  const tool = useEditor((s) => s.tool);
  return (
    <div className="ed-inspector">
      {tool === 'node' && <NodePanel />}
      {hasSelection ? <SelectionPanel /> : <DocumentPanel />}
      <Swatches />
    </div>
  );
}
