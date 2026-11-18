import { useEffect, useRef, useState } from 'react';
import type { RGBAImage, Settings, TraceResult } from '../core/types';
import type { TraceRequest, WorkerMessage } from '../worker/protocol';
import { traceImage } from '../core/pipeline';

export interface TracerState {
  result: TraceResult | null;
  busy: boolean;
  stage: string;
  progress: number;
  error: string | null;
}

function createWorker(): Worker | null {
  try {
    return new Worker(new URL('../worker/tracer.worker.ts', import.meta.url), { type: 'module' });
  } catch {
    return null;
  }
}

/**
 * Runs the tracing pipeline in a Web Worker. A new request while one is in
 * flight terminates the busy worker (instant cancellation) and starts fresh.
 * Falls back to the main thread if workers are unavailable.
 */
export function useTracer(image: RGBAImage | null, settings: Settings, outputWidth: number, outputHeight: number): TracerState {
  const [state, setState] = useState<TracerState>({ result: null, busy: false, stage: '', progress: 0, error: null });
  const workerRef = useRef<Worker | null>(null);
  const busyRef = useRef(false);
  const jobRef = useRef(0);

  useEffect(() => () => {
    workerRef.current?.terminate();
    workerRef.current = null;
    busyRef.current = false;
  }, []);

  useEffect(() => {
    if (!image) {
      setState({ result: null, busy: false, stage: '', progress: 0, error: null });
      return;
    }
    const id = ++jobRef.current;
    if (busyRef.current && workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
    }
    if (!workerRef.current) {
      const w = createWorker();
      if (w) {
        w.onmessage = (e: MessageEvent<WorkerMessage>) => {
          const msg = e.data;
          if (msg.id !== jobRef.current) return;
          if (msg.type === 'progress') {
            setState((s) => ({ ...s, stage: msg.stage, progress: msg.value }));
          } else if (msg.type === 'result') {
            busyRef.current = false;
            setState({ result: msg.result, busy: false, stage: 'Done', progress: 1, error: null });
          } else {
            busyRef.current = false;
            setState((s) => ({ ...s, busy: false, error: `Tracing failed: ${msg.message}` }));
          }
        };
        w.onerror = (ev) => {
          busyRef.current = false;
          setState((s) => ({ ...s, busy: false, error: `Tracing failed: ${ev.message || 'worker error'}` }));
        };
      }
      workerRef.current = w;
    }
    busyRef.current = true;
    setState((s) => ({ ...s, busy: true, stage: 'Starting', progress: 0, error: null }));

    const data = new Uint8ClampedArray(image.data); // copy: the buffer is transferred
    const req: TraceRequest = {
      type: 'trace', id, settings, outputWidth, outputHeight,
      image: { width: image.width, height: image.height, data },
    };
    if (workerRef.current) {
      workerRef.current.postMessage(req, [data.buffer]);
      return;
    }
    // Main-thread fallback (no Worker support).
    const t = setTimeout(() => {
      try {
        const result = traceImage(req.image, settings, { outputWidth, outputHeight });
        if (id !== jobRef.current) return;
        busyRef.current = false;
        setState({ result, busy: false, stage: 'Done', progress: 1, error: null });
      } catch (err) {
        busyRef.current = false;
        setState((s) => ({ ...s, busy: false, error: `Tracing failed: ${(err as Error).message}` }));
      }
    }, 0);
    return () => clearTimeout(t);
  }, [image, settings, outputWidth, outputHeight]);

  return state;
}
