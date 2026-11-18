import type { RGBAImage, Settings, TraceResult } from '../core/types';

export interface TraceRequest {
  type: 'trace';
  id: number;
  image: RGBAImage;
  settings: Settings;
  outputWidth: number;
  outputHeight: number;
}

export type WorkerMessage =
  | { type: 'progress'; id: number; stage: string; value: number }
  | { type: 'result'; id: number; result: TraceResult }
  | { type: 'error'; id: number; message: string };
