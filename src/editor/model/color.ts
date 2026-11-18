const NAMED: Record<string, string> = {
  black: '#000000', white: '#ffffff', red: '#ff0000', green: '#008000', blue: '#0000ff', yellow: '#ffff00',
  orange: '#ffa500', purple: '#800080', gray: '#808080', grey: '#808080', silver: '#c0c0c0', maroon: '#800000',
  navy: '#000080', teal: '#008080', olive: '#808000', lime: '#00ff00', aqua: '#00ffff', cyan: '#00ffff',
  fuchsia: '#ff00ff', magenta: '#ff00ff', pink: '#ffc0cb', brown: '#a52a2a', gold: '#ffd700', indigo: '#4b0082',
  violet: '#ee82ee', darkgray: '#a9a9a9', darkgrey: '#a9a9a9', lightgray: '#d3d3d3', lightgrey: '#d3d3d3',
};

const hex2 = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');

let ctx: CanvasRenderingContext2D | null | undefined;

/** Normalises any CSS color to '#rrggbb' (or 'none'). Unknown values return `fallback`. */
export function normalizeColor(input: string | null | undefined, fallback = '#000000'): string {
  if (input == null) return fallback;
  const c = input.trim().toLowerCase();
  if (!c) return fallback;
  if (c === 'none' || c === 'transparent') return 'none';
  if (c === 'currentcolor') return '#000000';
  let m = /^#([0-9a-f]{3,4})$/.exec(c);
  if (m) return `#${m[1].slice(0, 3).split('').map((x) => x + x).join('')}`;
  m = /^#([0-9a-f]{6})(?:[0-9a-f]{2})?$/.exec(c);
  if (m) return `#${m[1]}`;
  m = /^rgba?\(\s*([\d.]+)(%?)[\s,]+([\d.]+)(%?)[\s,]+([\d.]+)(%?)/.exec(c);
  if (m) {
    const ch = (v: string, pct: string) => (pct ? (Number(v) * 255) / 100 : Number(v));
    return `#${hex2(ch(m[1], m[2]))}${hex2(ch(m[3], m[4]))}${hex2(ch(m[5], m[6]))}`;
  }
  if (NAMED[c]) return NAMED[c];
  if (typeof document !== 'undefined') {
    try {
      if (ctx === undefined) ctx = document.createElement('canvas').getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#010203';
        ctx.fillStyle = c;
        const out = String(ctx.fillStyle);
        if (out !== '#010203' || c === '#010203') return normalizeColor(out, fallback);
      }
    } catch { /* ignore */ }
  }
  return fallback;
}

export function isHex(c: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(c);
}
