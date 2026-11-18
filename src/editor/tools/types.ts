import type { Vec } from '../model/types';
import type { EditorStore } from '../store';

export interface PointerInfo {
  /** Document coordinates. */
  doc: Vec;
  /** Canvas-relative screen coordinates. */
  screen: Vec;
  shift: boolean;
  alt: boolean;
  mod: boolean;
  target: Element;
}

export interface Drag {
  move(p: PointerInfo): void;
  up(p: PointerInfo): void;
}

export interface ToolContext {
  store: EditorStore;
}

export interface Tool {
  down(p: PointerInfo, ctx: ToolContext): Drag | null;
  hover?(p: PointerInfo, ctx: ToolContext): void;
  dblclick?(p: PointerInfo, ctx: ToolContext): void;
  /** Return true if the key was handled. */
  key?(e: KeyboardEvent, ctx: ToolContext): boolean;
  /** Called when switching away from the tool. */
  deactivate?(ctx: ToolContext): void;
}
