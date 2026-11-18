/// <reference lib="webworker" />
import { traceImage } from '../core/pipeline';
import type { TraceRequest, WorkerMessage } from './protocol';

const ctx = self as unknown as DedicatedWorkerGlobalScope;
const post = (msg: WorkerMessage, transfer: Transferable[] = []) => ctx.postMessage(msg, transfer);

ctx.onmessage = (e: MessageEvent<TraceRequest>) => {
  const { id, image, settings, outputWidth, outputHeight } = e.data;
  let last = -1;
  try {
    const result = traceImage(image, settings, {
      outputWidth,
      outputHeight,
      onProgress: (stage, value) => {
        // throttle: only report meaningful steps
        if (value - last >= 0.02 || value === 1 || value === 0) {
          last = value;
          post({ type: 'progress', id, stage, value });
        }
      },
    });
    for (const layer of result.layers) delete layer.loops; // geometry stays in the worker
    post({ type: 'result', id, result }, result.layers.map((l) => l.nodes.buffer));
  } catch (err) {
    post({ type: 'error', id, message: err instanceof Error ? err.message : String(err) });
  }
};
