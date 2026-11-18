import { memo, useEffect, useRef, useState } from 'react';
import { editorStore, useEditor } from '../store';
import type { Shape } from '../model/types';
import { chainTo, moveShape, parentIdOf } from '../model/doc';
import { IChevronR, IEllipse, IEye, IEyeOff, IFolder, ILine, ILock, IRect, IText, IUnlock, INode } from './Icons';

const TYPE_ICON = { rect: IRect, ellipse: IEllipse, line: ILine, path: INode, text: IText, group: IFolder };

type DropPos = 'before' | 'after' | 'inside';

interface RowProps {
  shape: Shape;
  depth: number;
  selected: Set<string>;
  expanded: Set<string>;
  toggleExpand: (id: string) => void;
  dragId: React.MutableRefObject<string | null>;
}

const Row = memo(function Row({ shape, depth, selected, expanded, toggleExpand, dragId }: RowProps) {
  const [renaming, setRenaming] = useState(false);
  const [drop, setDrop] = useState<DropPos | null>(null);
  const isSel = selected.has(shape.id);
  const isGroup = shape.type === 'group';
  const open = isGroup && expanded.has(shape.id);
  const Icon = TYPE_ICON[shape.type];

  const select = (e: React.MouseEvent | React.KeyboardEvent) => {
    const parent = parentIdOf(editorStore.getState().doc, shape.id);
    const { selection } = editorStore.getState();
    if (e.shiftKey || e.metaKey || e.ctrlKey) {
      const same = selection.filter((id) => parentIdOf(editorStore.getState().doc, id) === parent);
      editorStore.select(same.includes(shape.id) ? same.filter((x) => x !== shape.id) : [...same, shape.id], parent);
    } else {
      editorStore.select([shape.id], parent);
    }
  };

  const toggle = (key: 'hidden' | 'locked') => editorStore.updateShape(shape.id, (s) => ({ ...s, [key]: !s[key] }) as Shape);

  return (
    <li role="treeitem" aria-selected={isSel} aria-expanded={isGroup ? open : undefined} aria-level={depth + 1}>
      <div
        className={`ed-layer${isSel ? ' is-selected' : ''}${shape.hidden ? ' is-hidden' : ''}${drop ? ` drop-${drop}` : ''}`}
        style={{ paddingLeft: 6 + depth * 14 }}
        draggable={!renaming}
        onDragStart={(e) => { dragId.current = shape.id; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', shape.name); }}
        onDragEnd={() => { dragId.current = null; }}
        onDragOver={(e) => {
          if (!dragId.current || dragId.current === shape.id) return;
          e.preventDefault();
          const r = e.currentTarget.getBoundingClientRect();
          const f = (e.clientY - r.top) / r.height;
          // The list shows the front-most layer first, so "above" means later in document order.
          setDrop(isGroup && f > 0.3 && f < 0.7 ? 'inside' : f < 0.5 ? 'after' : 'before');
        }}
        onDragLeave={() => setDrop(null)}
        onDrop={(e) => {
          e.preventDefault();
          const id = dragId.current;
          setDrop(null);
          if (!id || !drop) return;
          const st = editorStore.getState();
          const next = moveShape(st.doc, id, shape.id, drop);
          editorStore.commit(next, { selection: [id], scope: parentIdOf(next, id) });
        }}
        onClick={select}
      >
        {isGroup
          ? <button type="button" className={`ed-caret${open ? ' is-open' : ''}`} aria-label={open ? 'Collapse group' : 'Expand group'} onClick={(e) => { e.stopPropagation(); toggleExpand(shape.id); }}><IChevronR width={12} height={12} /></button>
          : <span className="ed-caret-space" />}
        <Icon width={14} height={14} className="ed-layer-icon" />
        {renaming ? (
          <input
            className="ed-rename"
            defaultValue={shape.name}
            autoFocus
            aria-label="Layer name"
            onClick={(e) => e.stopPropagation()}
            onBlur={(e) => { editorStore.updateShape(shape.id, (s) => ({ ...s, name: e.target.value.trim() || s.name }) as Shape); setRenaming(false); }}
            onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setRenaming(false); }}
          />
        ) : (
          <button type="button" className="ed-layer-name" onDoubleClick={() => setRenaming(true)} onKeyDown={(e) => { if (e.key === 'F2') setRenaming(true); }} title="Double-click or F2 to rename">
            {shape.name}
          </button>
        )}
        <button type="button" className={`ed-layer-tog${shape.hidden ? ' is-on' : ''}`} aria-pressed={!!shape.hidden} aria-label={shape.hidden ? `Show ${shape.name}` : `Hide ${shape.name}`} onClick={(e) => { e.stopPropagation(); toggle('hidden'); }}>
          {shape.hidden ? <IEyeOff width={14} height={14} /> : <IEye width={14} height={14} />}
        </button>
        <button type="button" className={`ed-layer-tog${shape.locked ? ' is-on' : ''}`} aria-pressed={!!shape.locked} aria-label={shape.locked ? `Unlock ${shape.name}` : `Lock ${shape.name}`} onClick={(e) => { e.stopPropagation(); toggle('locked'); }}>
          {shape.locked ? <ILock width={14} height={14} /> : <IUnlock width={14} height={14} />}
        </button>
      </div>
      {open && shape.type === 'group' && (
        <ul role="group">
          {[...shape.children].reverse().map((c) => (
            <Row key={c.id} shape={c} depth={depth + 1} selected={selected} expanded={expanded} toggleExpand={toggleExpand} dragId={dragId} />
          ))}
        </ul>
      )}
    </li>
  );
});

export function Layers() {
  const shapes = useEditor((s) => s.doc.shapes);
  const selection = useEditor((s) => s.selection);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const dragId = useRef<string | null>(null);
  const selected = new Set(selection);

  // Reveal the selection inside collapsed groups.
  useEffect(() => {
    const { doc } = editorStore.getState();
    const toOpen = selection.flatMap((id) => (chainTo(doc.shapes, id) ?? []).slice(0, -1).map((s) => s.id));
    if (toOpen.some((id) => !expanded.has(id))) setExpanded((e) => new Set([...e, ...toOpen]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection]);

  const toggleExpand = (id: string) => setExpanded((e) => {
    const n = new Set(e);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  return (
    <section className="ed-section ed-layers" aria-labelledby="ed-layers-title">
      <div className="ed-section-head"><h3 id="ed-layers-title">Layers</h3><span className="ed-count">{shapes.length}</span></div>
      {shapes.length === 0
        ? <p className="ed-hint">Nothing here yet. Draw something, open an SVG, or send a trace from the Trace tab.</p>
        : (
          <ul role="tree" aria-label="Layers, front to back" aria-multiselectable="true" className="ed-tree">
            {[...shapes].reverse().map((s) => (
              <Row key={s.id} shape={s} depth={0} selected={selected} expanded={expanded} toggleExpand={toggleExpand} dragId={dragId} />
            ))}
          </ul>
        )}
      <p className="ed-hint">Drag to reorder or drop onto a group. Double-click a name to rename.</p>
    </section>
  );
}
