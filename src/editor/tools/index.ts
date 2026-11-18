import type { ToolId } from '../store';
import type { Tool } from './types';
import { selectTool } from './select';
import { nodeTool } from './node';
import { penTool } from './pen';
import { makeDrawTool } from './draw';
import { textTool } from './text';

const handTool: Tool = { down: () => null };

export const TOOLS: Record<ToolId, Tool> = {
  select: selectTool,
  node: nodeTool,
  pen: penTool,
  rect: makeDrawTool('rect'),
  ellipse: makeDrawTool('ellipse'),
  line: makeDrawTool('line'),
  polygon: makeDrawTool('polygon'),
  text: textTool,
  hand: handTool,
};

export const TOOL_INFO: { id: ToolId; label: string; key: string }[] = [
  { id: 'select', label: 'Select', key: 'V' },
  { id: 'node', label: 'Edit nodes', key: 'A' },
  { id: 'pen', label: 'Pen', key: 'P' },
  { id: 'rect', label: 'Rectangle', key: 'R' },
  { id: 'ellipse', label: 'Ellipse', key: 'E' },
  { id: 'line', label: 'Line', key: 'L' },
  { id: 'polygon', label: 'Polygon', key: 'Y' },
  { id: 'text', label: 'Text', key: 'T' },
  { id: 'hand', label: 'Hand (pan)', key: 'H' },
];
