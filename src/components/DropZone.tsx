import { useRef, useState } from 'react';
import { ACCEPT_ATTR } from '../lib/loadImage';
import { IconUpload } from './Icons';

interface Props {
  onFile: (file: File) => void;
  onSample: () => void;
}

export function DropZone({ onFile, onSample }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div className="dropzone-wrap">
      <div
        className={`dropzone${over ? ' is-over' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f) onFile(f);
        }}
      >
        <div className="dropzone-icon"><IconUpload width={30} height={30} /></div>
        <h1>Turn any image into a clean SVG</h1>
        <p className="muted">Drop a PNG, JPG, BMP or WebP here, paste with <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>V</kbd>, or</p>
        <div className="dropzone-actions">
          <button type="button" className="btn btn-primary btn-lg" onClick={() => inputRef.current?.click()}>
            <IconUpload /> Choose an image
          </button>
          <button type="button" className="btn btn-ghost btn-lg" onClick={onSample}>Try a sample</button>
        </div>
        <p className="privacy">🔒 Everything runs in your browser. Your image is never uploaded.</p>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT_ATTR}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
            e.target.value = '';
          }}
        />
      </div>
    </div>
  );
}
