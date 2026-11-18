import { useEffect, useRef } from 'react';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
const MOD = isMac ? '⌘' : 'Ctrl';

const GROUPS: [string, [string, string][]][] = [
  ['Tools', [['V', 'Select'], ['A', 'Edit nodes'], ['P', 'Pen'], ['R', 'Rectangle'], ['E', 'Ellipse'], ['L', 'Line'], ['Y', 'Polygon'], ['T', 'Text'], ['H / hold Space', 'Pan']]],
  ['Edit', [[`${MOD}+Z`, 'Undo'], [`${MOD}+Shift+Z`, 'Redo'], [`${MOD}+C / X / V`, 'Copy / cut / paste'], [`${MOD}+D`, 'Duplicate'], ['Delete', 'Delete'], [`${MOD}+A`, 'Select all'], ['Arrows', 'Nudge 1px (Shift: 10px)'], ['Esc', 'Deselect / leave group']]],
  ['Arrange', [[`${MOD}+G`, 'Group'], [`${MOD}+Shift+G`, 'Ungroup'], ['] / [', 'Forward / backward'], [`${MOD}+] / ${MOD}+[`, 'To front / back']]],
  ['View', [['Scroll', 'Pan'], [`${MOD}+scroll / pinch`, 'Zoom'], ['+ / −', 'Zoom in / out'], ['0', 'Fit to screen'], ['1', '100%']]],
  ['While dragging', [['Shift', 'Constrain (axis, square, 15°, 45°)'], ['Alt', 'Duplicate (move) · from center (resize/draw)'], [MOD, 'Disable snapping']]],
  ['Nodes', [['Double-click path', 'Add node'], ['Double-click node', 'Toggle smooth / corner'], ['Alt+drag handle', 'Break handles'], ['Pen: click / drag', 'Corner / curve node'], ['Pen: Enter, Esc', 'Finish path'], ['Pen: click first node', 'Close path']]],
];

export function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className="ed-dialog" onClose={onClose} aria-labelledby="ed-shortcuts-title" onClick={(e) => { if (e.target === ref.current) onClose(); }}>
      <div className="ed-dialog-head">
        <h2 id="ed-shortcuts-title">Keyboard shortcuts</h2>
        <button type="button" className="ed-btn" onClick={onClose} autoFocus>Close</button>
      </div>
      <div className="ed-shortcut-grid">
        {GROUPS.map(([title, rows]) => (
          <section key={title}>
            <h3>{title}</h3>
            <dl>
              {rows.map(([k, v]) => (<div key={k}><dt><kbd>{k}</kbd></dt><dd>{v}</dd></div>))}
            </dl>
          </section>
        ))}
      </div>
    </dialog>
  );
}
