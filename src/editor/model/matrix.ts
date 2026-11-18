import type { Mat, Vec } from './types';

export const IDENTITY: Mat = [1, 0, 0, 1, 0, 0];
const EPS = 1e-9;

/** m · n — applies n first, then m. */
export function mul(m: Mat, n: Mat): Mat {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

export function apply(m: Mat, p: Vec): Vec {
  return [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]];
}

export function invert(m: Mat): Mat {
  const det = m[0] * m[3] - m[1] * m[2];
  if (Math.abs(det) < 1e-12) return [...IDENTITY];
  return [
    m[3] / det, -m[1] / det, -m[2] / det, m[0] / det,
    (m[2] * m[5] - m[3] * m[4]) / det,
    (m[1] * m[4] - m[0] * m[5]) / det,
  ];
}

export const translate = (tx: number, ty: number): Mat => [1, 0, 0, 1, tx, ty];

export function scaleAbout(sx: number, sy: number, cx = 0, cy = 0): Mat {
  return [sx, 0, 0, sy, cx - sx * cx, cy - sy * cy];
}

export function rotateAbout(deg: number, cx = 0, cy = 0): Mat {
  const r = (deg * Math.PI) / 180;
  const cos = Math.cos(r), sin = Math.sin(r);
  return [cos, sin, -sin, cos, cx - cos * cx + sin * cy, cy - sin * cx - cos * cy];
}

export function isIdentity(m: Mat): boolean {
  return Math.abs(m[0] - 1) < EPS && Math.abs(m[1]) < EPS && Math.abs(m[2]) < EPS &&
    Math.abs(m[3] - 1) < EPS && Math.abs(m[4]) < EPS && Math.abs(m[5]) < EPS;
}

/** No rotation or skew. */
export function isAxisAligned(m: Mat): boolean {
  return Math.abs(m[1]) < 1e-9 && Math.abs(m[2]) < 1e-9;
}

export function rotationOf(m: Mat): number {
  return (Math.atan2(m[1], m[0]) * 180) / Math.PI;
}

/** Average linear scale factor (used to scale stroke widths and text sizes). */
export function meanScale(m: Mat): number {
  return Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));
}

const f = (n: number) => String(Math.round(n * 1e4) / 1e4);

export function matrixToAttr(m: Mat): string {
  if (isIdentity(m)) return '';
  if (Math.abs(m[0] - 1) < EPS && Math.abs(m[1]) < EPS && Math.abs(m[2]) < EPS && Math.abs(m[3] - 1) < EPS) {
    return `translate(${f(m[4])} ${f(m[5])})`;
  }
  return `matrix(${m.map(f).join(' ')})`;
}

/** Parses an SVG transform list ("translate(10) rotate(45 5 5) …"). */
export function parseTransform(src: string | null | undefined): Mat {
  let m: Mat = [...IDENTITY];
  if (!src) return m;
  const re = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(src))) {
    const a = (match[2].match(/[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) ?? []).map(Number);
    let t: Mat;
    switch (match[1]) {
      case 'matrix': t = a.length >= 6 ? [a[0], a[1], a[2], a[3], a[4], a[5]] : [...IDENTITY]; break;
      case 'translate': t = translate(a[0] ?? 0, a[1] ?? 0); break;
      case 'scale': t = scaleAbout(a[0] ?? 1, a[1] ?? a[0] ?? 1); break;
      case 'rotate': t = rotateAbout(a[0] ?? 0, a[1] ?? 0, a[2] ?? 0); break;
      case 'skewX': t = [1, 0, Math.tan(((a[0] ?? 0) * Math.PI) / 180), 1, 0, 0]; break;
      default: t = [1, Math.tan(((a[0] ?? 0) * Math.PI) / 180), 0, 1, 0, 0]; break;
    }
    m = mul(m, t);
  }
  return m;
}
