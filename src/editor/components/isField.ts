const NON_TEXT_INPUTS = new Set(['checkbox', 'radio', 'button', 'submit', 'reset', 'color', 'file', 'image']);

/** True when keyboard input should go to a form control instead of the editor shortcuts. */
export function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  if (t.isContentEditable || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT') return true;
  if (t.tagName === 'INPUT') return !NON_TEXT_INPUTS.has((t as HTMLInputElement).type);
  return false;
}
