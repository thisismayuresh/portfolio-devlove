/**
 * One element of the page tree.
 *
 * Nodes are plain JSON-shaped objects — no classes, no getters, no prototypes.
 * That is deliberate: a node can be `structuredClone`d for the undo stack,
 * `postMessage`d to the compile worker, and `JSON.stringify`d into a project
 * file without any conversion step in between.
 *
 * @module engine/node
 */

import { definitionOf, isFlowLayout, resolveLayout } from './kinds.js';
import { createStyle, setCustomProp, setStyleProp } from './style.js';
import { MIN_SIZE, parseBoolean, parseNumber } from './values.js';

/**
 * @typedef {object} WebNode
 * @property {string} id
 * @property {string} kind        a key of `ELEMENT_KINDS`
 * @property {string} name        the label shown in the Layers tree
 * @property {number} x
 * @property {number} y
 * @property {number} width
 * @property {number} height
 * @property {boolean} autoHeight when true the compiler emits `height:auto`
 * @property {string} content
 * @property {string | null} href
 * @property {string | null} src
 * @property {string | null} placeholder
 * @property {string | null} anchor  the element's HTML `id`, when it has one
 * @property {string} layout      how this node arranges its own children
 * @property {boolean} locked
 * @property {boolean} hidden
 * @property {Record<string, any>} style
 * @property {Record<string, string>} data  per-kind content, see below
 * @property {string[]} children  ids, in paint order
 * @property {string | null} parent
 */

/**
 * ## The `data` bag
 *
 * Some elements carry more content than one string. A table has columns and
 * rows; a list has items. Rather than growing a typed field on every node for
 * something only one kind uses, those live in `node.data` as plain strings and
 * are read back by that kind's `body(node)` in `engine/kinds.js`.
 *
 * The alternative — modelling table rows and cells as real child nodes — was
 * considered and rejected. It would mean the Layers tree filling up with
 * dozens of unselectable cells, drag-and-drop rules for what may be dropped
 * into a `<tr>`, and a compiler that has to reject invalid nesting. Editing a
 * table as text in one field is both less code and, for the size of table
 * anyone builds in a page builder, easier to use.
 *
 * Set one with `data.<key>`, exactly like `style.<key>`.
 */

/**
 * Creates a node with the defaults its kind declares in `engine/kinds.js`.
 *
 * @param {string} id
 * @param {string} kind
 * @param {number} x
 * @param {number} y
 * @returns {WebNode}
 */
export function createNode(id, kind, x, y) {
  const definition = definitionOf(kind);
  const attributes = definition.attributes || {};
  const [width, height] = definition.size;

  return {
    id,
    kind,
    name: definition.label,
    x,
    y,
    width,
    height,
    autoHeight: definition.hugHeight === true,
    content: definition.content || '',
    href: attributes.href ?? null,
    src: attributes.src ?? null,
    placeholder: attributes.placeholder ?? null,
    anchor: null,
    layout: definition.layout || 'absolute',
    locked: false,
    hidden: false,
    style: createStyle(definition.style, definition.custom),
    data: { ...(definition.data || {}) },
    children: [],
    parent: null,
  };
}

/**
 * Setters for the properties that live directly on a node, keyed by the name
 * the inspector and the app use. Everything below the `style.` and `custom.`
 * prefixes is handled by `engine/style.js` instead.
 *
 * Each setter receives the raw string the UI produced and is responsible for
 * validating it — throwing rather than storing something nonsensical.
 *
 * @type {Readonly<Record<string, (node: WebNode, value: string) => void>>}
 */
const SETTERS = Object.freeze({
  x: (node, value) => {
    node.x = requireNumber('x', value);
  },
  y: (node, value) => {
    node.y = requireNumber('y', value);
  },
  width: (node, value) => {
    node.width = Math.max(requireNumber('width', value), MIN_SIZE);
  },
  height: (node, value) => {
    node.height = Math.max(requireNumber('height', value), MIN_SIZE);
  },
  // Not trimmed: leading and trailing spaces are part of the copy.
  content: (node, value) => {
    node.content = String(value);
  },
  name: (node, value) => {
    const trimmed = String(value).trim();
    node.name = trimmed === '' ? definitionOf(node.kind).label : trimmed;
  },
  href: (node, value) => {
    node.href = emptyToNull(value);
  },
  // An anchor becomes the element's HTML `id`, so a nav link or a Scroll
  // action can address it. Restricted to what is safe in a URL fragment and a
  // CSS selector, rather than trusting whatever was typed.
  anchor: (node, value) => {
    const slug = String(value)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    node.anchor = slug === '' ? null : slug;
  },
  src: (node, value) => {
    node.src = emptyToNull(value);
  },
  placeholder: (node, value) => {
    node.placeholder = emptyToNull(value);
  },
  layout: (node, value) => {
    const layout = resolveLayout(value);
    if (layout === null) {
      throw new Error(`unknown layout mode \`${String(value).trim()}\``);
    }
    node.layout = layout;
  },
  autoHeight: (node, value) => {
    node.autoHeight = parseBoolean(value);
  },
  locked: (node, value) => {
    node.locked = parseBoolean(value);
  },
  hidden: (node, value) => {
    node.hidden = parseBoolean(value);
  },
});

/** snake_case spellings kept working for older project files. */
const SETTER_ALIASES = Object.freeze({ auto_height: 'autoHeight' });

/** Every bare property key `setNodeProp` accepts, for docs and tests. */
export const NODE_KEYS = Object.freeze(Object.keys(SETTERS));

/**
 * Applies one property by dotted key.
 *
 * Supported forms:
 *   `width`, `content`, `layout`, …   a `SETTERS` entry
 *   `style.padding`                   a typed style field
 *   `data.rows`                       per-kind content, see the note above
 *   `custom.object-fit`               a raw CSS declaration
 *
 * @param {WebNode} node
 * @param {string} key
 * @param {string} value
 * @throws {Error} on an unknown key or a value the setter rejects
 */
export function setNodeProp(node, key, value) {
  if (key.startsWith('style.')) {
    setStyleProp(node.style, key.slice('style.'.length), value);
    return;
  }
  if (key.startsWith('custom.')) {
    setCustomProp(node.style, key.slice('custom.'.length), value);
    return;
  }
  if (key.startsWith('data.')) {
    setDataProp(node, key.slice('data.'.length), value);
    return;
  }

  const setter = SETTERS[key] || SETTERS[SETTER_ALIASES[key]];
  if (!setter) {
    throw new Error(`unknown property \`${key}\``);
  }
  setter(node, value);
}

/**
 * Sets one entry in the node's `data` bag. An empty value removes it, so the
 * kind's `body(node)` falls back to whatever it treats as absent.
 *
 * The key is restricted to identifier characters because it is a content slot
 * declared by a kind, not free-form user input — a typo should be rejected
 * here rather than silently stored and never read.
 *
 * @param {WebNode} node
 * @param {string} key
 * @param {string} value
 * @throws {Error} when the key is not a plain identifier
 */
function setDataProp(node, key, value) {
  if (!/^[a-zA-Z][a-zA-Z0-9]*$/.test(key)) {
    throw new Error(`\`data.${key}\` is not a valid content key`);
  }
  if (!node.data) {
    node.data = {};
  }
  if (String(value) === '') {
    delete node.data[key];
  } else {
    node.data[key] = String(value);
  }
}

/**
 * Whether this node's own children are laid out by flexbox rather than by
 * their `x`/`y`.
 *
 * @param {WebNode} node
 * @returns {boolean}
 */
export function flowsChildren(node) {
  return isFlowLayout(node.layout);
}

/**
 * @param {string} key
 * @param {string} value
 * @returns {number}
 */
function requireNumber(key, value) {
  const parsed = parseNumber(value);
  if (parsed === null) {
    throw new Error(`\`${key}\` expects a number, received \`${String(value).trim()}\``);
  }
  return parsed;
}

/**
 * @param {string} value
 * @returns {string | null}
 */
function emptyToNull(value) {
  const trimmed = String(value).trim();
  return trimmed === '' ? null : trimmed;
}
