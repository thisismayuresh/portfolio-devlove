/**
 * Global keyboard map.
 *
 * Bindings are data, so a contributor adds a shortcut by appending one entry
 * to {@link BINDINGS} rather than by editing a switch statement.
 *
 * @module core/shortcuts
 */

import { app } from './app.js';

/**
 * @typedef {object} Binding
 * @property {string} keys        `"ctrl+shift+z"` — modifiers in the order ctrl, alt, shift
 * @property {string} description shown in help surfaces
 * @property {(event: KeyboardEvent) => void} run
 */

/** Nudge distance in page pixels, and its Shift-boosted variant. */
const NUDGE = 1;
const NUDGE_LARGE = 10;

/** @type {ReadonlyArray<Binding>} */
export const BINDINGS = Object.freeze([
  { keys: 'ctrl+z', description: 'Undo', run: () => app.undo() },
  { keys: 'ctrl+shift+z', description: 'Redo', run: () => app.redo() },
  { keys: 'ctrl+y', description: 'Redo', run: () => app.redo() },
  {
    keys: 'ctrl+d',
    description: 'Duplicate selection',
    run: () => app.state.selection && app.duplicateElement(app.state.selection),
  },
  {
    keys: 'delete',
    description: 'Delete selection',
    run: () => app.state.selection && app.removeElement(app.state.selection),
  },
  {
    keys: 'backspace',
    description: 'Delete selection',
    run: () => app.state.selection && app.removeElement(app.state.selection),
  },
  { keys: 'escape', description: 'Clear selection', run: () => app.select(null) },
  { keys: 'ctrl+p', description: 'Toggle preview', run: () => app.toggleMode() },
  { keys: 'ctrl+0', description: 'Reset zoom', run: () => app.setZoom(1) },
  { keys: 'ctrl+=', description: 'Zoom in', run: () => app.zoomBy(1.2) },
  { keys: 'ctrl++', description: 'Zoom in', run: () => app.zoomBy(1.2) },
  { keys: 'ctrl+-', description: 'Zoom out', run: () => app.zoomBy(1 / 1.2) },
  {
    keys: 'arrowup',
    description: 'Nudge up',
    run: (event) => app.nudgeSelection(0, -(event.shiftKey ? NUDGE_LARGE : NUDGE)),
  },
  {
    keys: 'arrowdown',
    description: 'Nudge down',
    run: (event) => app.nudgeSelection(0, event.shiftKey ? NUDGE_LARGE : NUDGE),
  },
  {
    keys: 'arrowleft',
    description: 'Nudge left',
    run: (event) => app.nudgeSelection(-(event.shiftKey ? NUDGE_LARGE : NUDGE), 0),
  },
  {
    keys: 'arrowright',
    description: 'Nudge right',
    run: (event) => app.nudgeSelection(event.shiftKey ? NUDGE_LARGE : NUDGE, 0),
  },
  {
    keys: 'ctrl+]',
    description: 'Bring forward',
    run: () => app.state.selection && app.reorder(app.state.selection, 1),
  },
  {
    keys: 'ctrl+[',
    description: 'Send backward',
    run: () => app.state.selection && app.reorder(app.state.selection, -1),
  },
]);

/** Arrow nudges must repeat, so they are exempt from the shift-key signature. */
const SHIFT_AGNOSTIC = new Set(['arrowup', 'arrowdown', 'arrowleft', 'arrowright']);

/**
 * Builds the lookup signature for an event, e.g. `"ctrl+shift+z"`.
 *
 * @param {KeyboardEvent} event
 * @returns {string}
 */
function signatureOf(event) {
  const key = event.key.toLowerCase();
  const parts = [];
  if (event.ctrlKey || event.metaKey) {
    parts.push('ctrl');
  }
  if (event.altKey) {
    parts.push('alt');
  }
  if (event.shiftKey && !SHIFT_AGNOSTIC.has(key)) {
    parts.push('shift');
  }
  parts.push(key);
  return parts.join('+');
}

/**
 * True when the keystroke belongs to whatever the user is typing into.
 *
 * Shadow DOM hides the real target from `document`, so the active element is
 * followed through every shadow root.
 *
 * @returns {boolean}
 */
function isTypingContext() {
  let node = document.activeElement;
  while (node) {
    const tag = node.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
      return true;
    }
    if (/** @type {HTMLElement} */ (node).isContentEditable) {
      return true;
    }
    const shadow = /** @type {any} */ (node).shadowRoot;
    node = shadow && shadow.activeElement ? shadow.activeElement : null;
  }
  return false;
}

/**
 * Installs the global key handler.
 *
 * @returns {() => void} uninstall function
 */
export function installShortcuts() {
  /** @type {Map<string, Binding>} */
  const table = new Map();
  for (const binding of BINDINGS) {
    table.set(binding.keys, binding);
  }

  /** @param {KeyboardEvent} event */
  const onKeyDown = (event) => {
    if (isTypingContext()) {
      return;
    }
    const binding = table.get(signatureOf(event));
    if (!binding) {
      return;
    }
    event.preventDefault();
    binding.run(event);
  };

  window.addEventListener('keydown', onKeyDown);
  return () => window.removeEventListener('keydown', onKeyDown);
}
