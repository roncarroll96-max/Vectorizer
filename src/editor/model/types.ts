export type Vec = [number, number];
/** Affine matrix [a, b, c, d, e, f] as in SVG's matrix(a b c d e f). */
export type Mat = [number, number, number, number, number, number];

export type NodeKind = 'corner' | 'smooth' | 'symmetric';

/** A path anchor with optional absolute Bézier handles. */
export interface PathNode {
  p: Vec;
  /** Control point of the segment arriving at this node. */
  in?: Vec;
  /** Control point of the segment leaving this node. */
  out?: Vec;
  kind: NodeKind;
}

export interface SubPath {
  nodes: PathNode[];
  closed: boolean;
}

export interface Style {
  /** '#rrggbb' or 'none'. */
  fill: string;
  stroke: string;
  strokeWidth: number;
  opacity: number;
  fillRule: 'nonzero' | 'evenodd';
  strokeLinecap?: 'butt' | 'round' | 'square';
  strokeLinejoin?: 'miter' | 'round' | 'bevel';
}

interface Base {
  id: string;
  name: string;
  transform: Mat;
  style: Style;
  hidden?: boolean;
  locked?: boolean;
}

export interface RectShape extends Base { type: 'rect'; x: number; y: number; w: number; h: number; rx: number }
export interface EllipseShape extends Base { type: 'ellipse'; cx: number; cy: number; rx: number; ry: number }
export interface LineShape extends Base { type: 'line'; x1: number; y1: number; x2: number; y2: number }
export interface PathShape extends Base { type: 'path'; subpaths: SubPath[] }
export interface TextShape extends Base {
  type: 'text';
  x: number;
  y: number;
  text: string;
  fontSize: number;
  fontFamily: string;
  fontWeight: number;
  textAnchor: 'start' | 'middle' | 'end';
}
export interface GroupShape extends Base { type: 'group'; children: Shape[] }

export type Shape = RectShape | EllipseShape | LineShape | PathShape | TextShape | GroupShape;
export type ShapeType = Shape['type'];

export interface Doc {
  width: number;
  height: number;
  /** Canvas background ('#rrggbb') or null for transparent. */
  background: string | null;
  /** Back to front. */
  shapes: Shape[];
}

export interface Box { x: number; y: number; w: number; h: number }
