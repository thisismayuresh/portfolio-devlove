/**
 * Global keyboard map.
 *
 * Bindings are data, so a contributor adds a shortcut by appending one entry
 * to {@link BINDINGS} rather than by editing a switch statement.
 *
 * @module core/shortcuts
 */

import { app } from './app.js';
import { SHORTCUT_TO_KIND } from '../registry/elements.js';

/**
 * @typedef {object} Binding
 * @property {string} keys        `"ctrl+shift+z"` — modifiers in the order ctrl, alt, shift
 * @property {string} description shown in help surfaces
 * @property {string} [group]     section it appears under in the help overlay
 * @property {(event: KeyboardEvent) => void} run
 */

/** Nudge distance in page pixels, and its Shift-boosted variant. */
const NUDGE = 1;
const NUDGE_LARGE = 10;

/** @type {ReadonlyArray<Binding>} */
export const BINDINGS = Object.freeze([
  { keys: 'ctrl+z', description: 'Undo', group: 'Edit', run: () => app.undo() },
  { keys: 'ctrl+shift+z', description: 'Redo', group: 'Edit', run: () => app.redo() },
  { keys: 'ctrl+y', description: 'Redo', group: 'Edit', run: () => app.redo() },
  {
    keys: 'ctrl+d',
    description: 'Duplicate selection',
    group: 'Edit',
    run: () => app.duplicateSelection(),
  },
  {
    keys: 'delete',
    description: 'Delete selection',
    group: 'Edit',
    run: () => app.removeSelection(),
  },
  {
    keys: 'backspace',
    description: 'Delete selection',
    group: 'Edit',
    run: () => app.removeSelection(),
  },
  { keys: 'escape', description: 'Clear selection', group: 'Select', run: () => app.select(null) },
  {
    keys: 'ctrl+a',
    description: 'Select all siblings',
    group: 'Select',
    run: () => app.selectSiblings(),
  },
  { keys: 'ctrl+c', description: 'Copy', group: 'Edit', run: () => app.copySelection() },
  { keys: 'ctrl+x', description: 'Cut', group: 'Edit', run: () => app.cutSelection() },
  { keys: 'ctrl+v', description: 'Paste', group: 'Edit', run: () => app.pasteClipboard() },
  {
    keys: 'ctrl+g',
    description: 'Group selection',
    group: 'Arrange',
    run: () => app.groupSelection(),
  },
  {
    keys: 'ctrl+shift+g',
    description: 'Ungroup',
    group: 'Arrange',
    run: () => app.ungroupSelection(),
  },
  { keys: 'ctrl+p', description: 'Toggle preview', group: 'View', run: () => app.toggleMode() },
  {
    keys: 'ctrl+f',
    description: 'Find in the document',
    group: 'View',
    run: () => app.emit('find:open'),
  },
  {
    keys: 'ctrl+k',
    description: 'Show all commands',
    group: 'View',
    run: () => app.emit('commands:open'),
  },
  {
    keys: 'ctrl+b',
    description: 'Toggle the left sidebar',
    group: 'View',
    run: () => app.toggleSidebar('left'),
  },
  {
    keys: 'ctrl+alt+b',
    description: 'Toggle the right sidebar',
    group: 'View',
    run: () => app.toggleSidebar('right'),
  },
  // Dock panels are reached by digit, the way the rail's tooltips have always
  // promised. They route through `dock:request` so the rail stays the only
  // thing that knows which panel is showing.
  {
    keys: '1',
    description: 'Show the Elements panel',
    group: 'View',
    run: () => app.emit('dock:request', 'elements'),
  },
  {
    keys: '2',
    description: 'Show the Layers panel',
    group: 'View',
    run: () => app.emit('dock:request', 'layers'),
  },
  {
    keys: '3',
    description: 'Show the Templates panel',
    group: 'View',
    run: () => app.emit('dock:request', 'templates'),
  },
  {
    keys: '4',
    description: 'Show the Problems panel',
    group: 'View',
    run: () => app.emit('dock:request', 'problems'),
  },
  {
    keys: '5',
    description: 'Show the Find panel',
    group: 'View',
    run: () => app.emit('dock:request', 'find'),
  },
  {
    keys: '6',
    description: 'Show the Assets panel',
    group: 'View',
    run: () => app.emit('dock:request', 'assets'),
  },
  {
    keys: '7',
    description: 'Show the Theme panel',
    group: 'View',
    run: () => app.emit('dock:request', 'theme'),
  },
  { keys: '?', description: 'Keyboard shortcuts', group: 'View', run: () => app.emit('help:open') },
  { keys: 'ctrl+0', description: 'Reset zoom', group: 'View', run: () => app.setZoom(1) },
  { keys: 'ctrl+=', description: 'Zoom in', group: 'View', run: () => app.zoomBy(1.2) },
  { keys: 'ctrl++', description: 'Zoom in', group: 'View', run: () => app.zoomBy(1.2) },
  { keys: 'ctrl+-', description: 'Zoom out', group: 'View', run: () => app.zoomBy(1 / 1.2) },
  {
    keys: 'arrowup',
    description: 'Nudge up',
    group: 'Arrange',
    run: (event) => app.nudgeSelection(0, -(event.shiftKey ? NUDGE_LARGE : NUDGE)),
  },
  {
    keys: 'arrowdown',
    description: 'Nudge down',
    group: 'Arrange',
    run: (event) => app.nudgeSelection(0, event.shiftKey ? NUDGE_LARGE : NUDGE),
  },
  {
    keys: 'arrowleft',
    description: 'Nudge left',
    group: 'Arrange',
    run: (event) => app.nudgeSelection(-(event.shiftKey ? NUDGE_LARGE : NUDGE), 0),
  },
  {
    keys: 'arrowright',
    description: 'Nudge right',
    group: 'Arrange',
    run: (event) => app.nudgeSelection(event.shiftKey ? NUDGE_LARGE : NUDGE, 0),
  },
  {
    keys: 'ctrl+]',
    description: 'Bring forward',
    group: 'Arrange',
    run: () => app.reorderSelection(1),
  },
  {
    keys: 'ctrl+[',
    description: 'Send backward',
    group: 'Arrange',
    run: () => app.reorderSelection(-1),
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
 * Drops a new element near the top of the page, the same place the palette's
 * double-click path uses.
 *
 * Exported because the command palette offers the same action without a key
 * attached, and one implementation keeps the two drop points in agreement.
 *
 * @param {string} kind
 */
export function dropElementInView(kind) {
  const width = Number(app.getPage().width) || 1280;
  app.addElement(kind, 'root', Math.round(width / 2 - 160), 64);
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

  // Unmodified letters drop a palette element. Generated from the registry so
  // the tile hints and the keyboard can never disagree.
  for (const [letter, kind] of Object.entries(SHORTCUT_TO_KIND)) {
    if (table.has(letter)) {
      console.error(`[shortcuts] "${letter}" is already bound; ${kind} will not get it`);
      continue;
    }
    table.set(letter, {
      keys: letter,
      description: `Add ${kind}`,
      run: () => dropElementInView(kind),
    });
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

/**
 * How a binding's `keys` string is spelled for a reader.
 *
 * Shared by the help overlay and the command palette: one table, so the
 * keycaps the two surfaces show can never disagree.
 *
 * @type {Readonly<Record<string, string>>}
 */
const KEY_LABELS = Object.freeze({
  ctrl: navigator.platform.startsWith('Mac') ? '⌘' : 'Ctrl',
  shift: 'Shift',
  alt: 'Alt',
  escape: 'Esc',
  arrowup: '↑',
  arrowdown: '↓',
  arrowleft: '←',
  arrowright: '→',
  delete: 'Del',
  backspace: '⌫',
});

/**
 * @param {string} keys
 * @returns {string[]} the individual keycaps
 */
export function capsFor(keys) {
  return String(keys || '')
    .split('+')
    .map((part) => KEY_LABELS[part] || part.toUpperCase());
}
