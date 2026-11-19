import { useEffect, useRef, useState } from 'react';
import { editorStore, useEditor, type ToolId } from '../store';
import { TOOLS, TOOL_INFO } from '../tools';
import { Canvas, zoomAt } from './Canvas';
import { Inspector } from './Inspector';
import { Layers } from './Layers';
import { ShortcutsDialog } from './ShortcutsDialog';
import { IconButton } from './Fields';
import {
  ICopy, IDownload, IFile, IFit, IImage, IKeyboard, IMagnet, IOpen, IRedo, IUndo, IX, IZoomIn, IZoomOut, IChevronUp, TOOL_ICONS,
} from './Icons';
import { copyText, downloadBlob, downloadSvg, pngSize, svgToPng } from '../../lib/exporters';
import { isTypingTarget } from './isField';
import '../editor.css';

const isField = isTypingTarget;

function setTool(id: ToolId) {
  const st = editorStore.getState();
  if (st.tool === id) return;
  TOOLS[st.tool].deactivate?.({ store: editorStore });
  editorStore.setTool(id);
}

function zoomBy(f: number) {
  const el = document.querySelector('.ed-canvas');
  const r = el?.getBoundingClientRect();
  const v = editorStore.getState().view;
  editorStore.setView(zoomAt(v, (r?.width ?? 800) / 2, (r?.height ?? 600) / 2, f));
}

async function openSvgFile(file: File) {
  if (editorStore.getState().dirty && !window.confirm('Replace the current drawing? Unsaved changes will be lost.')) return;
  try {
    editorStore.loadSvg(await file.text(), file.name);
  } catch (e) {
    editorStore.flash((e as Error).message || "Couldn't open that SVG.");
  }
}

function Toolbar() {
  const tool = useEditor((s) => s.tool);
  return (
    <nav className="ed-tools" role="toolbar" aria-label="Tools" aria-orientation="vertical">
      {TOOL_INFO.map((t) => {
        const Icon = TOOL_ICONS[t.id];
        return (
          <button
            key={t.id}
            type="button"
            className={`ed-tool${tool === t.id ? ' is-active' : ''}`}
            aria-pressed={tool === t.id}
            aria-label={`${t.label} (${t.key})`}
            title={`${t.label} (${t.key})`}
            onClick={() => setTool(t.id)}
          >
            <Icon width={20} height={20} />
          </button>
        );
      })}
    </nav>
  );
}

function TopBar({ onShortcuts }: { onShortcuts: () => void }) {
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const scale = useEditor((s) => s.view.scale);
  const snapping = useEditor((s) => s.snapping);
  const fileName = useEditor((s) => s.fileName);
  const dirty = useEditor((s) => s.dirty);
  const doc = useEditor((s) => s.doc);
  const [pngScale, setPngScale] = useState(2);
  const fileRef = useRef<HTMLInputElement>(null);

  const save = () => { downloadSvg(editorStore.exportSvg(), `${fileName || 'drawing'}.svg`); editorStore.markSaved(); };
  const png = async () => {
    const { width, height } = pngSize(doc.width, doc.height, pngScale);
    try {
      downloadBlob(await svgToPng(editorStore.exportSvg(), width, height), `${fileName || 'drawing'}@${pngScale}x.png`);
    } catch { editorStore.flash('PNG export failed in this browser.'); }
  };

  return (
    <div className="ed-topbar" role="toolbar" aria-label="Editor actions">
      <div className="ed-group">
        <IconButton label="New drawing" onClick={() => { if (!dirty || window.confirm('Start a new drawing? Unsaved changes will be lost.')) editorStore.newDoc(); }}><IFile /></IconButton>
        <IconButton label="Open SVG…" onClick={() => fileRef.current?.click()}><IOpen /></IconButton>
        <input ref={fileRef} type="file" accept=".svg,image/svg+xml" className="sr-only" tabIndex={-1} aria-hidden="true"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) openSvgFile(f); e.target.value = ''; }} />
        <span className="ed-filename" title={fileName}>{fileName || 'Untitled'}{dirty && <span className="ed-dirty" aria-label="unsaved changes"> •</span>}</span>
      </div>
      <div className="ed-group">
        <IconButton label="Undo (Ctrl+Z)" disabled={!canUndo} onClick={() => editorStore.undo()}><IUndo /></IconButton>
        <IconButton label="Redo (Ctrl+Shift+Z)" disabled={!canRedo} onClick={() => editorStore.redo()}><IRedo /></IconButton>
      </div>
      <div className="ed-group">
        <IconButton label="Zoom out (−)" onClick={() => zoomBy(0.8)}><IZoomOut /></IconButton>
        <button type="button" className="ed-zoom" title="Zoom to 100% (1)" aria-label={`Zoom ${Math.round(scale * 100)}%, click for 100%`} onClick={() => zoomBy(1 / scale)}>{Math.round(scale * 100)}%</button>
        <IconButton label="Zoom in (+)" onClick={() => zoomBy(1.25)}><IZoomIn /></IconButton>
        <IconButton label="Fit to screen (0)" onClick={() => editorStore.requestFit()}><IFit /></IconButton>
        <IconButton label={snapping ? 'Snapping on' : 'Snapping off'} pressed={snapping} onClick={() => editorStore.set({ snapping: !snapping })}><IMagnet /></IconButton>
      </div>
      <div className="ed-group ed-export">
        <button type="button" className="ed-btn ed-btn-primary" onClick={save}><IDownload width={16} height={16} /> <span className="ed-hide-sm">Save SVG</span></button>
        <IconButton label="Copy SVG code" onClick={() => copyText(editorStore.exportSvg()).then(() => editorStore.flash('SVG code copied')).catch(() => editorStore.flash('Clipboard blocked by the browser'))}><ICopy /></IconButton>
        <select className="ed-png-scale" aria-label="PNG scale" value={pngScale} onChange={(e) => setPngScale(Number(e.target.value))}>
          {[1, 2, 4, 8].map((s) => <option key={s} value={s}>{s}×</option>)}
        </select>
        <IconButton label="Export PNG" onClick={png}><IImage /></IconButton>
        <IconButton label="Keyboard shortcuts (?)" onClick={onShortcuts}><IKeyboard /></IconButton>
      </div>
    </div>
  );
}

interface Props {
  /** Called when a raster image is dropped or pasted, so the app can send it to the tracer. */
  onImage?: (file: File) => void;
}

export default function EditorApp({ onImage }: Props) {
  const [shortcuts, setShortcuts] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const warnings = useEditor((s) => s.warnings);
  const toast = useEditor((s) => s.toast);
  const lastCopied = useRef<string | null>(null);

  // Keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isField(e.target) || editorStore.getState().ui.editingText) return;
      if (document.querySelector('dialog[open]')) return;
      const st = editorStore.getState();
      if (TOOLS[st.tool].key?.(e, { store: editorStore })) { e.preventDefault(); return; }
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      let handled = true;
      if (mod) {
        if (k === 'z' && !e.shiftKey) editorStore.undo();
        else if ((k === 'z' && e.shiftKey) || k === 'y') editorStore.redo();
        else if (k === 'd') editorStore.duplicate();
        else if (k === 'g' && e.shiftKey) editorStore.ungroup();
        else if (k === 'g') editorStore.group();
        else if (k === 'k' && e.shiftKey) editorStore.splitPaths();
        else if (k === 'k') editorStore.combinePaths();
        else if (k === 'a') editorStore.selectAll();
        else if (e.key === ']') editorStore.reorder('front');
        else if (e.key === '[') editorStore.reorder('back');
        else if (k === 's') { e.preventDefault(); downloadSvg(editorStore.exportSvg(), `${st.fileName || 'drawing'}.svg`); editorStore.markSaved(); }
        else if (k === '0') editorStore.requestFit();
        else if (k === '1') zoomBy(1 / st.view.scale);
        else if (e.key === '=' || e.key === '+') zoomBy(1.25);
        else if (e.key === '-') zoomBy(0.8);
        else handled = false; // let copy/cut/paste reach their events
      } else if (e.key === 'Delete' || e.key === 'Backspace') editorStore.deleteSelection();
      else if (e.key.startsWith('Arrow')) {
        const d = e.shiftKey ? 10 : 1;
        editorStore.nudge(e.key === 'ArrowLeft' ? -d : e.key === 'ArrowRight' ? d : 0, e.key === 'ArrowUp' ? -d : e.key === 'ArrowDown' ? d : 0);
      } else if (e.key === 'Escape') {
        if (st.selection.length) editorStore.select([], st.scope);
        else if (st.scope) editorStore.select([], null);
        else setTool('select');
      } else if (e.key === ']') editorStore.reorder('forward');
      else if (e.key === '[') editorStore.reorder('backward');
      else if (e.key === '+' || e.key === '=') zoomBy(1.25);
      else if (e.key === '-' || e.key === '_') zoomBy(0.8);
      else if (e.key === '0') editorStore.requestFit();
      else if (e.key === '1') zoomBy(1 / st.view.scale);
      else if (e.key === '?') setShortcuts(true);
      else if (!e.altKey) {
        const t = TOOL_INFO.find((x) => x.key.toLowerCase() === k);
        if (t) setTool(t.id); else handled = false;
      } else handled = false;
      if (handled) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Clipboard: copy/cut write SVG markup (so other apps can paste it); paste accepts SVG text or images.
  useEffect(() => {
    const onCopy = (e: ClipboardEvent, cut: boolean) => {
      if (isField(e.target) || !editorStore.getState().selection.length) return;
      const svg = cut ? editorStore.cut() : editorStore.copy();
      if (svg && e.clipboardData) { e.clipboardData.setData('text/plain', svg); e.preventDefault(); lastCopied.current = svg; }
    };
    const copy = (e: ClipboardEvent) => onCopy(e, false);
    const cut = (e: ClipboardEvent) => onCopy(e, true);
    const paste = (e: ClipboardEvent) => {
      if (isField(e.target)) return;
      const file = Array.from(e.clipboardData?.files ?? []).find((f) => f.type.startsWith('image/'));
      const text = e.clipboardData?.getData('text/plain') ?? '';
      e.preventDefault();
      if (file && file.type !== 'image/svg+xml') { onImage?.(file); return; }
      if (text && text === lastCopied.current && editorStore.hasClipboard()) { editorStore.paste(); return; }
      if (/<svg[\s>]/i.test(text)) {
        try { editorStore.pasteSvg(text); } catch (err) { editorStore.flash((err as Error).message); }
      } else if (editorStore.hasClipboard()) editorStore.paste();
    };
    window.addEventListener('copy', copy);
    window.addEventListener('cut', cut);
    window.addEventListener('paste', paste);
    return () => { window.removeEventListener('copy', copy); window.removeEventListener('cut', cut); window.removeEventListener('paste', paste); };
  }, [onImage]);

  // Drop an SVG to open it (raster images go to the tracer).
  useEffect(() => {
    const over = (e: DragEvent) => { if (e.dataTransfer?.types.includes('Files')) e.preventDefault(); };
    const drop = (e: DragEvent) => {
      const f = e.dataTransfer?.files?.[0];
      if (!f) return;
      e.preventDefault();
      if (f.type === 'image/svg+xml' || /\.svg$/i.test(f.name)) openSvgFile(f);
      else if (f.type.startsWith('image/')) onImage?.(f);
      else editorStore.flash('Drop an SVG to edit it, or an image to trace it.');
    };
    window.addEventListener('dragover', over);
    window.addEventListener('drop', drop);
    return () => { window.removeEventListener('dragover', over); window.removeEventListener('drop', drop); };
  }, [onImage]);

  // Warn before leaving with unsaved edits.
  useEffect(() => {
    const before = (e: BeforeUnloadEvent) => { if (editorStore.getState().dirty) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', before);
    return () => window.removeEventListener('beforeunload', before);
  }, []);

  return (
    <div className="editor">
      <TopBar onShortcuts={() => setShortcuts(true)} />
      {warnings.length > 0 && (
        <div className="ed-warn" role="status">
          <span>Imported with simplifications: {warnings.join(' ')}</span>
          <button type="button" className="ed-icon-btn" aria-label="Dismiss" onClick={() => editorStore.set({ warnings: [] })}><IX /></button>
        </div>
      )}
      <div className="ed-main">
        <Toolbar />
        <div className="ed-stage">
          <Canvas />
          {toast && <div className="ed-toast" role="status">{toast}</div>}
        </div>
        <aside className={`ed-panel${sheetOpen ? ' is-open' : ''}`} aria-label="Properties and layers">
          <button type="button" className="ed-sheet-handle" aria-expanded={sheetOpen} onClick={() => setSheetOpen((v) => !v)}>
            <span>Properties &amp; layers</span>
            <IChevronUp className="chev" width={16} height={16} />
          </button>
          <div className="ed-panel-body">
            <Inspector />
            <Layers />
          </div>
        </aside>
      </div>
      <ShortcutsDialog open={shortcuts} onClose={() => setShortcuts(false)} />
    </div>
  );
}
