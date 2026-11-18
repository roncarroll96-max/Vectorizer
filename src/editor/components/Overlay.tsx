import type { Box, Mat, PathNode, SubPath, Vec } from '../model/types';
import { useEditor, editorStore } from '../store';
import { getShape, parentMatrix } from '../model/doc';
import { shapeBounds } from '../model/geometry';
import { apply, mul } from '../model/matrix';
import { mapSubpaths, nodeKey, serializePath } from '../model/path';
import { handlePositions } from '../tools/select';

const HANDLE = 8;

function BoxOutline({ box, toScreen, className }: { box: Box; toScreen: (p: Vec) => Vec; className: string }) {
  const [x0, y0] = toScreen([box.x, box.y]);
  const [x1, y1] = toScreen([box.x + box.w, box.y + box.h]);
  return <rect className={className} x={x0} y={y0} width={Math.max(0, x1 - x0)} height={Math.max(0, y1 - y0)} />;
}

function NodeOverlay({ subs, m, selected }: { subs: SubPath[]; m: Mat; selected: Set<string> }) {
  const screen = mapSubpaths(subs, m);
  const handles: JSX.Element[] = [];
  const anchors: JSX.Element[] = [];
  screen.forEach((s, si) => {
    const n = s.nodes.length;
    s.nodes.forEach((node, ni) => {
      const key = nodeKey(si, ni);
      const prevSel = selected.has(nodeKey(si, (ni - 1 + n) % n));
      const nextSel = selected.has(nodeKey(si, (ni + 1) % n));
      const isSel = selected.has(key);
      const showIn = node.in && (isSel || prevSel);
      const showOut = node.out && (isSel || nextSel);
      for (const which of ['in', 'out'] as const) {
        const h = node[which];
        if (!h || !(which === 'in' ? showIn : showOut)) continue;
        handles.push(<line key={`l${key}${which}`} className="ed-handle-line" x1={node.p[0]} y1={node.p[1]} x2={h[0]} y2={h[1]} />);
        handles.push(<circle key={`h${key}${which}`} className="ed-ctrl" cx={h[0]} cy={h[1]} r={4} data-node={key} data-ctrl={which} />);
      }
      const cls = `ed-anchor${isSel ? ' is-selected' : ''}`;
      anchors.push(node.kind === 'corner'
        ? <rect key={`a${key}`} className={cls} x={node.p[0] - 4} y={node.p[1] - 4} width={8} height={8} data-node={key} />
        : <circle key={`a${key}`} className={cls} cx={node.p[0]} cy={node.p[1]} r={4.5} data-node={key} />);
    });
  });
  return (
    <g>
      <path className="ed-path-outline" d={serializePath(screen, 1)} />
      {handles}
      {anchors}
    </g>
  );
}

function PenOverlay({ nodes, pointer, toScreen }: { nodes: PathNode[]; pointer: Vec | null; toScreen: (p: Vec) => Vec }) {
  const m: Mat = (() => { const a = toScreen([0, 0]), b = toScreen([1, 0]); const s = b[0] - a[0]; return [s, 0, 0, s, a[0], a[1]]; })();
  const screen = mapSubpaths([{ nodes, closed: false }], m)[0];
  const last = screen.nodes[screen.nodes.length - 1];
  const ptr = pointer ? apply(m, pointer) : null;
  const first = screen.nodes[0];
  const nearFirst = ptr && nodes.length >= 2 && Math.hypot(ptr[0] - first.p[0], ptr[1] - first.p[1]) <= 8;
  return (
    <g>
      {screen.nodes.length > 1 && <path className="ed-pen-path" d={serializePath([screen], 1)} />}
      {ptr && last && (
        <path className="ed-pen-rubber" d={last.out ? `M${last.p[0]} ${last.p[1]}C${last.out[0]} ${last.out[1]} ${ptr[0]} ${ptr[1]} ${ptr[0]} ${ptr[1]}` : `M${last.p[0]} ${last.p[1]}L${ptr[0]} ${ptr[1]}`} />
      )}
      {last?.out && last.in && (
        <>
          <line className="ed-handle-line" x1={last.in[0]} y1={last.in[1]} x2={last.out[0]} y2={last.out[1]} />
          <circle className="ed-ctrl" cx={last.out[0]} cy={last.out[1]} r={3.5} />
          <circle className="ed-ctrl" cx={last.in[0]} cy={last.in[1]} r={3.5} />
        </>
      )}
      {screen.nodes.map((n, i) => (
        <rect key={i} className={`ed-anchor${i === 0 && nearFirst ? ' is-target' : ''}`} x={n.p[0] - 4} y={n.p[1] - 4} width={8} height={8} />
      ))}
    </g>
  );
}

/** Screen-space UI drawn above the document: selection, handles, nodes, guides, marquee. */
export function Overlay({ width, height }: { width: number; height: number }) {
  const doc = useEditor((s) => s.doc);
  const view = useEditor((s) => s.view);
  const selection = useEditor((s) => s.selection);
  const tool = useEditor((s) => s.tool);
  const ui = useEditor((s) => s.ui);
  const scope = useEditor((s) => s.scope);
  const nodeSelection = useEditor((s) => s.nodeSelection);
  const V: Mat = [view.scale, 0, 0, view.scale, view.x, view.y];
  const toScreen = (p: Vec): Vec => apply(V, p);

  const selBoxes = selection.map((id) => {
    const s = getShape(doc, id);
    return s ? shapeBounds(s, parentMatrix(doc, id)) : null;
  });
  const union = editorStore.selectionBounds();
  const scopeShape = scope ? getShape(doc, scope) : null;
  const scopeBox = scopeShape ? shapeBounds(scopeShape, parentMatrix(doc, scope!)) : null;
  const hover = ui.hoverId && !selection.includes(ui.hoverId) && tool === 'select' ? getShape(doc, ui.hoverId) : null;
  const hoverBox = hover ? shapeBounds(hover, parentMatrix(doc, hover.id)) : null;
  const active = tool === 'node' ? editorStore.activePath() : null;
  const showHandles = tool === 'select' && union && !ui.editingText;

  return (
    <g className="ed-overlay">
      {scopeBox && <BoxOutline box={scopeBox} toScreen={toScreen} className="ed-scope" />}
      {hoverBox && <BoxOutline box={hoverBox} toScreen={toScreen} className="ed-hover" />}
      {tool !== 'node' && selection.length > 1 && selBoxes.map((b, i) => b && <BoxOutline key={i} box={b} toScreen={toScreen} className="ed-sel-item" />)}
      {tool === 'node' && selection.length === 1 && !active && selBoxes[0] && <BoxOutline box={selBoxes[0]} toScreen={toScreen} className="ed-sel-item" />}
      {showHandles && union && (
        <g>
          <BoxOutline box={union} toScreen={toScreen} className="ed-sel" />
          {handlePositions(union, toScreen).map((h) => (h.id === 'rot'
            ? (
              <g key={h.id}>
                <line className="ed-rot-line" x1={h.p[0]} y1={h.p[1] + 5} x2={h.p[0]} y2={h.p[1] + 26} />
                <circle className="ed-rot" cx={h.p[0]} cy={h.p[1]} r={5.5} data-handle="rot"><title>Rotate (Shift: 15° steps)</title></circle>
              </g>
            )
            : <rect key={h.id} className={`ed-handle ed-handle-${h.id}`} x={h.p[0] - HANDLE / 2} y={h.p[1] - HANDLE / 2} width={HANDLE} height={HANDLE} data-handle={h.id} />))}
        </g>
      )}
      {active && <NodeOverlay subs={active.subpaths} m={mul(V, parentMatrix(doc, active.id))} selected={new Set(nodeSelection)} />}
      {ui.pen && <PenOverlay nodes={ui.pen} pointer={ui.pointer} toScreen={toScreen} />}
      {ui.marquee && <BoxOutline box={ui.marquee} toScreen={toScreen} className="ed-marquee" />}
      {ui.guides.map((g, i) => {
        const p = toScreen([g.pos, g.pos]);
        return g.axis === 'x'
          ? <line key={i} className="ed-guide" x1={p[0]} y1={0} x2={p[0]} y2={height} />
          : <line key={i} className="ed-guide" x1={0} y1={p[1]} x2={width} y2={p[1]} />;
      })}
    </g>
  );
}
