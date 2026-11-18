/** A 2D point as a compact tuple [x, y]. */
export type Point = [number, number];

/** Framework-free RGBA image (structurally compatible with DOM ImageData). */
export interface RGBAImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export type Mode = 'bw' | 'color' | 'lineart';
export type Quantizer = 'kmeans' | 'mediancut';

export interface Settings {
  mode: Mode;
  /** Number of colors for color mode (2–64). */
  colors: number;
  quantizer: Quantizer;
  /** Use Otsu's method to pick the threshold automatically. */
  thresholdAuto: boolean;
  /** Manual threshold (0–255): pixels darker than this are foreground. */
  threshold: number;
  /** Swap foreground and background in B&W / line art. */
  invert: boolean;
  /** Gaussian-ish blur radius in pixels (0–5). */
  blur: number;
  /** 3×3 median filter to knock out salt-and-pepper noise. */
  denoise: boolean;
  /** Contrast adjustment (−100…100). */
  contrast: number;
  bgRemove: boolean;
  /** Background color to remove; null = auto-detect from the image border. */
  bgColor: string | null;
  /** RGB distance tolerance for background removal (0–255). */
  bgTolerance: number;
  /** Only remove background connected to the image edge. */
  bgContiguous: boolean;
  /** Ramer–Douglas–Peucker tolerance in pixels. */
  simplify: number;
  /** Bézier fitting error in pixels; 0 = straight polygons. */
  smoothness: number;
  /** Turns sharper than this (degrees) are kept as corners. */
  cornerAngle: number;
  /** Regions smaller than this many pixels are removed. */
  minSpeck: number;
  /** Decimal places for SVG coordinates (1–2). */
  precision: 1 | 2;
  /** Process at full resolution instead of downscaling large images. */
  fullResolution: boolean;
}

export type Segment =
  | { t: 'L'; p: Point }
  | { t: 'C'; c1: Point; c2: Point; p: Point };

/** One sub-path: a start point and a list of segments. */
export interface PathLoop {
  start: Point;
  segs: Segment[];
  closed: boolean;
}

export interface Layer {
  /** Original (detected) color as #rrggbb. */
  color: string;
  /** Compact SVG path data for all loops of this layer. */
  d: string;
  pathCount: number;
  nodeCount: number;
  /** Anchor coordinates [x0, y0, x1, y1, …] for the node overlay. */
  nodes: Float32Array;
  pixelCount: number;
  /** Structured geometry (stripped before leaving the worker). */
  loops?: PathLoop[];
}

export interface TraceResult {
  mode: Mode;
  /** Processing (viewBox) dimensions. */
  width: number;
  height: number;
  /** Intrinsic output dimensions (the original image size). */
  outputWidth: number;
  outputHeight: number;
  /** Layers ordered back to front. Line art has a single stroked layer. */
  layers: Layer[];
  /** Stroke width for line-art output, in viewBox units. */
  strokeWidth: number;
  /** Background color that was removed (if any), as #rrggbb. */
  removedBackground: string | null;
  /** Threshold actually used (B&W / line art). */
  thresholdUsed: number | null;
  elapsedMs: number;
}

export type ProgressFn = (stage: string, fraction: number) => void;
