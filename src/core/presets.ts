import type { Settings } from './types';

export const DEFAULT_SETTINGS: Settings = {
  mode: 'color',
  colors: 8,
  quantizer: 'kmeans',
  thresholdAuto: true,
  threshold: 128,
  invert: false,
  blur: 0,
  denoise: false,
  contrast: 0,
  bgRemove: false,
  bgColor: null,
  bgTolerance: 40,
  bgContiguous: true,
  simplify: 1,
  smoothness: 1.2,
  cornerAngle: 60,
  minSpeck: 8,
  precision: 1,
  fullResolution: false,
};

export interface Preset {
  id: string;
  label: string;
  description: string;
  settings: Partial<Settings>;
}

export const PRESETS: Preset[] = [
  {
    id: 'logo',
    label: 'Logo',
    description: 'Few flat colors, crisp corners',
    settings: {
      mode: 'color', colors: 4, quantizer: 'kmeans', blur: 0, denoise: false, contrast: 10,
      simplify: 0.8, smoothness: 1, cornerAngle: 50, minSpeck: 10,
    },
  },
  {
    id: 'illustration',
    label: 'Illustration',
    description: 'More colors, smooth curves',
    settings: {
      mode: 'color', colors: 12, quantizer: 'kmeans', blur: 1, denoise: false, contrast: 0,
      simplify: 1.1, smoothness: 1.5, cornerAngle: 70, minSpeck: 12,
    },
  },
  {
    id: 'photo',
    label: 'Photo (posterized)',
    description: 'Many colors, heavy smoothing',
    settings: {
      mode: 'color', colors: 24, quantizer: 'kmeans', blur: 2, denoise: true, contrast: 0,
      simplify: 1.5, smoothness: 2, cornerAngle: 90, minSpeck: 24,
    },
  },
  {
    id: 'sketch',
    label: 'Sketch',
    description: 'Centerline strokes for drawings',
    settings: {
      mode: 'lineart', thresholdAuto: true, invert: false, blur: 1, denoise: true, contrast: 20,
      simplify: 1, smoothness: 1.5, cornerAngle: 70, minSpeck: 16,
    },
  },
];

export function applyPreset(base: Settings, preset: Preset): Settings {
  return { ...base, ...preset.settings };
}
