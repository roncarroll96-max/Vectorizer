import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Settings } from './core/types';
import { DEFAULT_SETTINGS, PRESETS, applyPreset } from './core/presets';
import { buildSvg, type LayerOverride } from './core/svg';
import { rgbToHex } from './core/color';
import {
  ACCEPT_ATTR, ImageLoadError, disposeImage, getProcessingImageData, loadImageFile, processingSize, MAX_PROCESS_DIM,
  type LoadedImage,
} from './lib/loadImage';
import { baseName, copyText, downloadBlob, downloadSvg, pngSize, svgToPng } from './lib/exporters';
import { formatBytes } from './lib/format';
import { createSampleImage } from './lib/sample';
import { useDebounced } from './hooks/useDebounced';
import { useTheme } from './hooks/useTheme';
import { useTracer } from './hooks/useTracer';
import { DropZone } from './components/DropZone';
import { Preview, type ViewMode } from './components/Preview';
import { Controls } from './components/Controls';
import { Palette } from './components/Palette';
import { ExportPanel } from './components/ExportPanel';
import { Section, Segmented } from './components/Field';
import { VersionBadge } from './components/VersionBadge';
import {
  IconChevron, IconColumns, IconMonitor, IconMoon, IconNodes, IconSlider, IconSliders, IconSun, IconUpload, IconX,
} from './components/Icons';

const EditorApp = lazy(() => import('./editor/components/EditorApp'));

type Tab = 'trace' | 'edit';

export default function App() {
  const [tab, setTab] = useState<Tab>('trace');
  const tabRef = useRef<Tab>('trace');
  tabRef.current = tab;
  const theme = useTheme();
  const [source, setSource] = useState<LoadedImage | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Record<string, LayerOverride>>({});
  // Output-only option: toggling it rebuilds the SVG without re-tracing.
  const [separateShapes, setSeparateShapes] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('split');
  const [showOutlines, setShowOutlines] = useState(false);
  const [picking, setPicking] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  // Rasterise the source at processing size (only when the image or resolution choice changes).
  const procImage = useMemo<ImageData | null>(() => {
    if (!source) return null;
    try {
      return getProcessingImageData(source, settings.fullResolution);
    } catch (e) {
      setError((e as Error).message);
      return null;
    }
  }, [source, settings.fullResolution]);

  const debouncedSettings = useDebounced(settings, 220);
  const tracer = useTracer(procImage, debouncedSettings, source?.width ?? 0, source?.height ?? 0);
  const result = tracer.result;

  // Drop overrides for colors that no longer exist after a re-trace.
  useEffect(() => {
    if (!result) return;
    setOverrides((o) => {
      const keep = Object.fromEntries(Object.entries(o).filter(([k]) => result.layers.some((l) => l.color === k)));
      return Object.keys(keep).length === Object.keys(o).length ? o : keep;
    });
  }, [result]);

  const built = useMemo(
    () => (result ? buildSvg(result, overrides, { separateShapes }) : null),
    [result, overrides, separateShapes],
  );

  const handleFile = useCallback(async (file: File | Blob, name?: string) => {
    setError(null);
    setLoading(true);
    try {
      const img = await loadImageFile(file, name);
      setSource((prev) => { disposeImage(prev); return img; });
      setOverrides({});
      setPicking(false);
    } catch (e) {
      setError(e instanceof ImageLoadError ? e.message : 'Something went wrong while opening that file. Please try another image.');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSample = useCallback(async () => {
    try {
      await handleFile(await createSampleImage(), 'sample.png');
      setSettings((s) => ({ ...applyPreset(s, PRESETS[0]), colors: 6 }));
      setActivePreset('logo');
    } catch {
      setError('Could not create the sample image in this browser.');
    }
  }, [handleFile]);

  // Paste from clipboard anywhere on the page.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (tabRef.current !== 'trace') return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      const items = Array.from(e.clipboardData?.items ?? []);
      const item = items.find((i) => i.kind === 'file' && i.type.startsWith('image/'));
      if (item) {
        const f = item.getAsFile();
        if (f) { e.preventDefault(); handleFile(f, 'pasted-image.png'); }
      } else if (items.some((i) => i.kind === 'file')) {
        setError("The clipboard doesn't contain a supported image. Copy a PNG, JPG, BMP or WebP image and try again.");
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [handleFile]);

  // Drop a new file anywhere once an image is loaded.
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');
    const enter = (e: DragEvent) => { if (tabRef.current === 'trace' && hasFiles(e)) { depth++; setDragging(true); } };
    const leave = (e: DragEvent) => { if (hasFiles(e) && --depth <= 0) { depth = 0; setDragging(false); } };
    const over = (e: DragEvent) => { if (tabRef.current === 'trace' && hasFiles(e)) e.preventDefault(); };
    const drop = (e: DragEvent) => {
      if (tabRef.current !== 'trace' || !hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDragging(false);
      const f = e.dataTransfer?.files?.[0];
      if (f) handleFile(f);
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragleave', leave);
    window.addEventListener('dragover', over);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('dragover', over);
      window.removeEventListener('drop', drop);
    };
  }, [handleFile]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (tabRef.current === 'trace' && e.key === 'Escape') { setPicking(false); setSheetOpen(false); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((s) => ({ ...s, ...patch }));
    setActivePreset(null);
  }, []);

  const onPreset = (id: string) => {
    const p = PRESETS.find((x) => x.id === id);
    if (!p) return;
    setSettings((s) => applyPreset(s, p));
    setActivePreset(id);
  };

  const onReset = () => {
    setSettings((s) => ({ ...DEFAULT_SETTINGS, fullResolution: s.fullResolution }));
    setActivePreset(null);
    setOverrides({});
  };

  const onPick = (x: number, y: number) => {
    if (!procImage) return;
    const o = (y * procImage.width + x) * 4;
    const d = procImage.data;
    if (d[o + 3] < 128) return;
    updateSettings({ bgRemove: true, bgColor: rgbToHex([d[o], d[o + 1], d[o + 2]]) });
    setPicking(false);
  };

  const fileBase = source ? baseName(source.name) : 'vector';

  const openInEditor = async () => {
    if (!built) return;
    const { editorStore } = await import('./editor/store');
    if (editorStore.getState().dirty && !window.confirm('Replace the drawing in the editor? Its unsaved changes will be lost.')) return;
    try {
      editorStore.loadSvg(built.svg, fileBase);
      setTab('edit');
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const traceFromEditor = useCallback((file: File) => {
    setTab('trace');
    handleFile(file);
  }, [handleFile]);
  const proc = source ? processingSize(source, settings.fullResolution) : null;
  const canDownscale = !!source && Math.max(source.width, source.height) > MAX_PROCESS_DIM;

  const statusText = loading ? 'Opening image…' : tracer.busy ? `${tracer.stage}…` : result ? 'Ready' : '';

  return (
    <div className="app">
      <a href="#controls" className="skip-link">Skip to controls</a>
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden="true">
            <svg viewBox="0 0 32 32" width="28" height="28"><rect width="32" height="32" rx="8" fill="var(--accent)" /><path d="M7 23 16 7l9 16" fill="none" stroke="#fff" strokeWidth="3" strokeLinejoin="round" /><circle cx="16" cy="7" r="2.5" fill="#fff" /></svg>
          </span>
          <span className="brand-name">Vectorize</span>
          <VersionBadge />
        </div>
        <Segmented
          label="Workspace"
          hideLabel
          className="workspace-tabs"
          value={tab}
          onChange={setTab}
          options={[{ value: 'trace', label: 'Trace' }, { value: 'edit', label: 'Edit' }]}
        />
        {tab === 'trace' && source && (
          <p className="file-info" title={source.name}>
            <span className="file-name">{source.name}</span>
            <span className="muted">{source.width} × {source.height}px · {formatBytes(source.bytes)}</span>
            {proc && proc.scale < 1 && <span className="tag" title="Processing size">processing at {proc.width} × {proc.height}</span>}
          </p>
        )}
        <div className="topbar-actions">
          {tab === 'trace' && source && (
            <>
              <Segmented
                label="Comparison view"
                hideLabel
                value={viewMode}
                onChange={setViewMode}
                options={[
                  { value: 'split', label: 'Side by side', icon: <IconColumns width={16} height={16} /> },
                  { value: 'slider', label: 'Slider', icon: <IconSlider width={16} height={16} /> },
                ]}
              />
              <button type="button" className={`btn btn-sm${showOutlines ? ' is-active' : ''}`} aria-pressed={showOutlines} onClick={() => setShowOutlines((v) => !v)}>
                <IconNodes width={16} height={16} /> <span className="hide-sm">Outlines</span>
              </button>
              <button type="button" className="btn btn-sm" onClick={() => fileInput.current?.click()}>
                <IconUpload width={16} height={16} /> <span className="hide-sm">Open</span>
              </button>
            </>
          )}
          <button
            type="button"
            className="icon-btn"
            onClick={theme.cycle}
            aria-label={`Theme: ${theme.pref}. Click to change.`}
            title={`Theme: ${theme.pref}`}
          >
            {theme.pref === 'light' ? <IconSun /> : theme.pref === 'dark' ? <IconMoon /> : <IconMonitor />}
          </button>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept={ACCEPT_ATTR}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
        />
      </header>

      {tab === 'edit' && (
        <Suspense fallback={<div className="loading-veil" role="status">Loading editor…</div>}>
          <EditorApp onImage={traceFromEditor} />
        </Suspense>
      )}

      {tab === 'trace' && (error || tracer.error) && (
        <div className="error-banner" role="alert">
          <span>{error ?? tracer.error}</span>
          <button type="button" className="icon-btn" aria-label="Dismiss message" onClick={() => setError(null)}><IconX /></button>
        </div>
      )}

      <main className={`workspace${source ? ' has-image' : ''}`} hidden={tab !== 'trace'}>
        <section className="stage" aria-label="Preview">
          {source && procImage ? (
            <Preview
              originalUrl={source.url}
              svg={built?.svg ?? ''}
              result={result}
              width={procImage.width}
              height={procImage.height}
              viewMode={viewMode}
              showOutlines={showOutlines}
              picking={picking}
              onPick={onPick}
              busy={tracer.busy}
              stage={tracer.stage}
              progress={tracer.progress}
            />
          ) : (
            <DropZone onFile={handleFile} onSample={loadSample} />
          )}
          {loading && <div className="loading-veil" role="status">Opening image…</div>}
        </section>

        <aside id="controls" className={`sidebar${sheetOpen ? ' is-open' : ''}`} aria-label="Settings">
          <button
            type="button"
            className="sheet-handle"
            aria-expanded={sheetOpen}
            aria-controls="sheet-body"
            onClick={() => setSheetOpen((v) => !v)}
          >
            <IconSliders width={16} height={16} />
            <span>Settings &amp; export</span>
            <span className="sheet-status muted">{statusText}</span>
            <IconChevron className="chev" />
          </button>
          <div className="sidebar-body" id="sheet-body">
            <Controls
              settings={settings}
              onChange={updateSettings}
              onPreset={onPreset}
              activePreset={activePreset}
              onReset={onReset}
              picking={picking}
              onTogglePick={() => { setPicking((v) => !v); setSheetOpen(false); }}
              detectedBackground={result?.removedBackground ?? null}
              thresholdUsed={result?.thresholdUsed ?? null}
              canDownscale={canDownscale}
              processingLabel={proc ? `Currently ${proc.width} × ${proc.height}` : ''}
              separateShapes={separateShapes}
              onSeparateShapes={setSeparateShapes}
            />
            <Section title="Palette">
              <Palette
                mode={result?.mode ?? settings.mode}
                layers={result?.layers ?? []}
                overrides={overrides}
                onChange={(color, o) => setOverrides((prev) => {
                  const next = { ...prev };
                  if (o && (o.color || o.hidden)) next[color] = o; else delete next[color];
                  return next;
                })}
                onReset={() => setOverrides({})}
              />
            </Section>
            <Section title="Export">
              <ExportPanel
                stats={built?.stats ?? null}
                outputWidth={source?.width ?? 0}
                outputHeight={source?.height ?? 0}
                disabled={!built}
                elapsedMs={result?.elapsedMs}
                onDownloadSvg={() => built && downloadSvg(built.svg, `${fileBase}.svg`)}
                onCopySvg={() => (built ? copyText(built.svg) : Promise.reject(new Error('Nothing to copy')))}
                onEdit={openInEditor}
                onExportPng={async (scale) => {
                  if (!built || !source) return;
                  const { width, height } = pngSize(source.width, source.height, scale);
                  downloadBlob(await svgToPng(built.svg, width, height), `${fileBase}@${scale}x.png`);
                }}
              />
            </Section>
          </div>
        </aside>
      </main>

      {tab === 'trace' && dragging && source && (
        <div className="drop-overlay" aria-hidden="true"><div>Drop to open a new image</div></div>
      )}
      <p className="sr-only" role="status" aria-live="polite">{statusText}</p>
    </div>
  );
}
