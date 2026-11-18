import { memo, type CSSProperties } from 'react';
import type { Shape, SubPath } from '../model/types';
import { matrixToAttr } from '../model/matrix';
import { serializePath } from '../model/path';
import { TEXT_LINE_HEIGHT } from '../model/geometry';

const dCache = new WeakMap<SubPath[], string>();
export function pathD(subs: SubPath[]): string {
  let d = dCache.get(subs);
  if (d === undefined) { d = serializePath(subs, 2); dCache.set(subs, d); }
  return d;
}

interface Props { shape: Shape; editingId: string | null }

/** Renders one document shape as live SVG. data-id lets the tools hit-test via the DOM. */
export const ShapeView = memo(function ShapeView({ shape, editingId }: Props) {
  if (shape.hidden) return null;
  const st = shape.style;
  const transform = matrixToAttr(shape.transform) || undefined;
  const style: CSSProperties | undefined = shape.locked ? { pointerEvents: 'none' } : undefined;
  const common = { 'data-id': shape.id, transform, opacity: st.opacity < 1 ? st.opacity : undefined, style };
  const hasStroke = st.stroke !== 'none';
  const paint = {
    fill: st.fill,
    fillRule: st.fillRule,
    stroke: hasStroke ? st.stroke : undefined,
    strokeWidth: hasStroke ? st.strokeWidth : undefined,
    strokeLinecap: st.strokeLinecap,
    strokeLinejoin: st.strokeLinejoin,
  };
  switch (shape.type) {
    case 'group':
      return <g {...common}>{shape.children.map((c) => <ShapeView key={c.id} shape={c} editingId={editingId} />)}</g>;
    case 'rect':
      return <rect x={shape.x} y={shape.y} width={shape.w} height={shape.h} rx={shape.rx || undefined} {...paint} {...common} />;
    case 'ellipse':
      return <ellipse cx={shape.cx} cy={shape.cy} rx={shape.rx} ry={shape.ry} {...paint} {...common} />;
    case 'line':
      return (
        <>
          <line x1={shape.x1} y1={shape.y1} x2={shape.x2} y2={shape.y2} {...paint} {...common} />
          <line x1={shape.x1} y1={shape.y1} x2={shape.x2} y2={shape.y2} className="ed-hit" data-id={shape.id} transform={transform} style={style} />
        </>
      );
    case 'path': {
      const d = pathD(shape.subpaths);
      return (
        <>
          <path d={d} {...paint} {...common} />
          {st.fill === 'none' && <path d={d} className="ed-hit" data-id={shape.id} transform={transform} style={style} />}
        </>
      );
    }
    case 'text': {
      const lines = shape.text.split('\n');
      return (
        <text
          x={shape.x}
          y={shape.y}
          fontSize={shape.fontSize}
          fontFamily={shape.fontFamily}
          fontWeight={shape.fontWeight}
          textAnchor={shape.textAnchor}
          {...paint}
          {...common}
          visibility={editingId === shape.id ? 'hidden' : undefined}
          style={{ ...style, whiteSpace: 'pre' }}
        >
          {lines.length === 1 ? lines[0] : lines.map((l, i) => <tspan key={i} x={shape.x} dy={i ? `${TEXT_LINE_HEIGHT}em` : undefined}>{l || ' '}</tspan>)}
        </text>
      );
    }
  }
});
