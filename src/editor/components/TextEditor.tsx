import { useEffect, useRef, useState } from 'react';
import { editorStore, useEditor } from '../store';
import { getShape, parentMatrix, removeShapes, updateShapes } from '../model/doc';
import { apply, meanScale, mul } from '../model/matrix';
import { makeText } from '../model/shapes';
import type { Mat, Shape } from '../model/types';

/** In-place textarea for creating and editing text shapes. */
export function TextEditor() {
  const edit = useEditor((s) => s.ui.editingText);
  const view = useEditor((s) => s.view);
  const doc = useEditor((s) => s.doc);
  const defaults = useEditor((s) => s.defaults);
  const ref = useRef<HTMLTextAreaElement>(null);
  const existing = edit?.id ? getShape(doc, edit.id) : null;
  const text = existing?.type === 'text' ? existing : null;
  const [value, setValue] = useState('');
  const committed = useRef(false);

  useEffect(() => {
    if (!edit) return;
    committed.current = false;
    setValue(text?.text ?? '');
    requestAnimationFrame(() => { ref.current?.focus(); ref.current?.select(); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edit?.id, edit?.pos[0], edit?.pos[1]]);

  if (!edit) return null;

  const m: Mat = text ? mul(parentMatrix(doc, text.id), text.transform) : [1, 0, 0, 1, 0, 0];
  const anchorDoc = text ? apply(m, [text.x, text.y]) : edit.pos;
  const k = meanScale(m);
  const fontSize = (text?.fontSize ?? 32) * k * view.scale;
  const left = anchorDoc[0] * view.scale + view.x;
  const top = anchorDoc[1] * view.scale + view.y - fontSize * 0.95;
  const shift = text?.textAnchor === 'middle' ? '-50%' : text?.textAnchor === 'end' ? '-100%' : '0';
  const lines = value.split('\n');
  const cols = Math.max(2, ...lines.map((l) => l.length + 1));

  const commit = () => {
    if (committed.current) return;
    committed.current = true;
    const st = editorStore.getState();
    const v = value.replace(/\s+$/, '');
    if (text) {
      if (!v) editorStore.commit(removeShapes(st.doc, [text.id]), { selection: [] });
      else if (v !== text.text) editorStore.commit(updateShapes(st.doc, [text.id], (s) => ({ ...s, text: v }) as Shape));
    } else if (v) {
      const t = makeText(edit.pos[0], edit.pos[1], v, {
        fill: defaults.fill === 'none' ? '#1d2433' : defaults.fill, stroke: 'none', strokeWidth: 1, opacity: 1, fillRule: 'nonzero',
      });
      editorStore.addShapes([t]);
    }
    editorStore.setUi({ editingText: null });
  };

  return (
    <textarea
      ref={ref}
      className="ed-text-editor"
      aria-label="Text content. Enter to finish, Shift+Enter for a new line."
      value={value}
      rows={lines.length}
      cols={cols}
      spellCheck={false}
      style={{
        left, top, fontSize, lineHeight: 1.2, transform: `translateX(${shift})`,
        fontFamily: text?.fontFamily ?? 'system-ui, sans-serif', fontWeight: text?.fontWeight ?? 400,
        color: text ? (text.style.fill === 'none' ? '#000' : text.style.fill) : defaults.fill === 'none' ? '#1d2433' : defaults.fill,
        textAlign: text?.textAnchor === 'middle' ? 'center' : text?.textAnchor === 'end' ? 'right' : 'left',
      }}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        e.stopPropagation();
        if ((e.key === 'Enter' && !e.shiftKey) || e.key === 'Escape') { e.preventDefault(); commit(); }
      }}
      onPointerDown={(e) => e.stopPropagation()}
    />
  );
}
