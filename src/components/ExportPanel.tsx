import { useState } from 'react';
import type { SvgStats } from '../core/svg';
import { formatBytes, formatNumber } from '../lib/format';
import { pngSize } from '../lib/exporters';
import { IconCopy, IconDownload, IconImage } from './Icons';

interface Props {
  stats: SvgStats | null;
  outputWidth: number;
  outputHeight: number;
  disabled: boolean;
  onDownloadSvg: () => void;
  onCopySvg: () => Promise<void>;
  onExportPng: (scale: number) => Promise<void>;
  elapsedMs?: number;
}

const SCALES = [0.5, 1, 2, 4, 8];

export function ExportPanel({ stats, outputWidth, outputHeight, disabled, onDownloadSvg, onCopySvg, onExportPng, elapsedMs }: Props) {
  const [scale, setScale] = useState(2);
  const [status, setStatus] = useState('');
  const png = pngSize(outputWidth, outputHeight, scale);
  const flash = (msg: string) => { setStatus(msg); setTimeout(() => setStatus(''), 2200); };

  return (
    <div className="export">
      {stats && (
        <dl className="stats" aria-label="Output statistics">
          <div><dt>Paths</dt><dd>{formatNumber(stats.paths)}</dd></div>
          <div><dt>Nodes</dt><dd>{formatNumber(stats.nodes)}</dd></div>
          <div><dt>Size</dt><dd>{formatBytes(stats.bytes)}</dd></div>
          <div><dt>Layers</dt><dd>{stats.layers}</dd></div>
          {elapsedMs !== undefined && <div><dt>Time</dt><dd>{elapsedMs < 1000 ? `${Math.round(elapsedMs)} ms` : `${(elapsedMs / 1000).toFixed(1)} s`}</dd></div>}
        </dl>
      )}
      <div className="export-row">
        <button type="button" className="btn btn-primary" disabled={disabled} onClick={onDownloadSvg}>
          <IconDownload /> Download SVG
        </button>
        <button
          type="button"
          className="btn"
          disabled={disabled}
          onClick={() => onCopySvg().then(() => flash('SVG code copied')).catch(() => flash('Copy failed — your browser blocked clipboard access'))}
        >
          <IconCopy /> Copy code
        </button>
      </div>
      <div className="export-row png-row">
        <label className="inline-select">
          <span>PNG scale</span>
          <select value={scale} onChange={(e) => setScale(Number(e.target.value))}>
            {SCALES.map((s) => <option key={s} value={s}>{s}×</option>)}
          </select>
        </label>
        <button
          type="button"
          className="btn"
          disabled={disabled}
          onClick={() => onExportPng(scale).then(() => flash('PNG exported')).catch(() => flash('PNG export failed'))}
        >
          <IconImage /> Export PNG
        </button>
      </div>
      <p className="field-hint">PNG: {png.width} × {png.height}px{png.clamped ? ' (capped to browser canvas limits)' : ''}</p>
      <p className="toast" role="status" aria-live="polite">{status}</p>
    </div>
  );
}
