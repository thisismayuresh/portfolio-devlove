/**
 * The document: page settings plus a flat arena of nodes linked by id.
 *
 * Every function here takes the document as its first argument and mutates it
 * in place. None of them touch history — the `Engine` in `engine/index.js`
 * decides where the undo boundaries go, which keeps "what changed" and "can it
 * be undone" from being tangled together in the same function.
 *
 * Nodes live in `doc.nodes` as `{ [id]: node }` rather than as an owned tree,
 * so reparenting and deleting are edits to `children` arrays instead of
 * subtree moves.
 *
 * @module engine/document
 */

import { acceptsChildren, resolveKind, resolveLayout } from './kinds.js';
import { createNode } from './node.js';
import { STYLE_FIELDS } from './style.js';
import { clamp, MIN_SIZE, parseNumber } from './values.js';

/**
 * Project file format version.
 *
 * v1 was written by the Rust engine and used snake_case field names;
 * `normalizeDocument` migrates it on open, so old `.devlove.json` files and old
 * autosaves keep working.
 */
export const DOCUMENT_VERSION = 2;

/** The id of the node every document is rooted at. */
export const ROOT_ID = 'root';

/**
 * Document-wide settings that live outside the node tree.
 *
 * Same table shape as `STYLE_FIELDS`: adding a page setting is one entry here
 * plus one field in `registry/inspector-schema.js`.
 *
 *   onEmpty  what an empty string means — `'clear'` stores it, `'ignore'`
 *            leaves the previous value alone, `'fallback'` restores the default
 *
 * @type {ReadonlyArray<{key: string, input: 'text' | 'number', value: string | number, min?: number, max?: number, onEmpty?: 'clear' | 'ignore' | 'fallback'}>}
 */
export const PAGE_SETTINGS = Object.freeze([
  { key: 'title', input: 'text', value: 'Untitled page', onEmpty: 'fallback' },
  // Emitted as <meta name="description"> and as the og: pair. Empty means the
  // export carries no description at all, which is better than an empty one.
  { key: 'description', input: 'text', value: '', onEmpty: 'clear' },
  { key: 'lang', input: 'text', value: 'en', onEmpty: 'fallback' },
  { key: 'width', input: 'number', value: 1280, min: 240, max: 6000 },
  { key: 'minHeight', input: 'number', value: 860, min: 240, max: 40_000 },
  { key: 'background', input: 'text', value: '#ffffff', onEmpty: 'clear' },
  {
    key: 'fontFamily',
    input: 'text',
    value: "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    onEmpty: 'ignore',
  },
]);

const PAGE_BY_NAME = new Map(PAGE_SETTINGS.map((field) => [field.key, field]));

/** @returns {Record<string, any>} a fresh page-settings object */
export function createPageSettings() {
  return Object.fromEntries(PAGE_SETTINGS.map((field) => [field.key, field.value]));
}

/**
 * Creates an empty document holding nothing but its root.
 *
 * @returns {Record<string, any>}
 */
export function createDocument() {
  const page = createPageSettings();
  const root = createNode(ROOT_ID, 'root', 0, 0);
  root.width = page.width;
  root.height = page.minHeight;

  return {
    version: DOCUMENT_VERSION,
    root: ROOT_ID,
    counter: 0,
    page,
    nodes: { [ROOT_ID]: root },
  };
}

// ================================================================= reads ===

/**
 * @param {any} doc
 * @param {string} id
 * @returns {any | undefined}
 */
export function nodeAt(doc, id) {
  return doc.nodes[id];
}

/**
 * @param {any} doc
 * @param {string} id
 * @returns {any} the node
 * @throws {Error} when no node has that id
 */
export function requireNode(doc, id) {
  const node = doc.nodes[id];
  if (!node) {
    throw new Error(`no node with id \`${id}\``);
  }
  return node;
}

/**
 * The layout mode a node is positioned *by* — its parent's, not its own.
 *
 * @param {any} doc
 * @param {any} node
 * @returns {string}
 */
export function parentLayout(doc, node) {
  const parent = node.parent ? doc.nodes[node.parent] : undefined;
  return parent ? parent.layout : 'absolute';
}

/**
 * Depth-first list of `id` and every descendant.
 *
 * @param {any} doc
 * @param {string} id
 * @returns {string[]}
 */
export function collectSubtree(doc, id) {
  const out = [];
  // A hand-edited project file can describe a cycle. Guard against it here
  // rather than in every caller.
  const seen = new Set();
  const stack = [id];
  while (stack.length > 0) {
    const current = /** @type {string} */ (stack.pop());
    if (seen.has(current)) {
      continue;
    }
    seen.add(current);
    const node = doc.nodes[current];
    if (node) {
      for (let index = node.children.length - 1; index >= 0; index -= 1) {
        stack.push(node.children[index]);
      }
    }
    out.push(current);
  }
  return out;
}

/**
 * Builds the nested outline the Layers panel renders.
 *
 * @param {any} doc
 * @param {string} [id] defaults to the root
 * @returns {any | null}
 */
export function buildTree(doc, id = doc.root) {
  const node = doc.nodes[id];
  if (!node) {
    return null;
  }
  return {
    id: node.id,
    name: node.name,
    kind: node.kind,
    layout: node.layout,
    hidden: node.hidden,
    locked: node.locked,
    container: acceptsChildren(node.kind),
    children: node.children.map((child) => buildTree(doc, child)).filter(Boolean),
  };
}

// ============================================================= mutations ===

/**
 * @param {any} doc
 * @returns {string} an id no node currently holds
 */
function nextId(doc) {
  for (;;) {
    doc.counter += 1;
    const candidate = `n${doc.counter}`;
    if (!doc.nodes[candidate]) {
      return candidate;
    }
  }
}

/**
 * Falls back to the root when the requested parent is missing, and to the
 * requested node's own parent when it cannot hold children — so dropping a
 * button onto a paragraph lands it beside the paragraph rather than failing.
 *
 * @param {any} doc
 * @param {string | null | undefined} requested
 * @returns {string}
 */
export function resolveContainer(doc, requested) {
  if (!requested) {
    return doc.root;
  }
  const node = doc.nodes[requested];
  if (!node) {
    return doc.root;
  }
  if (acceptsChildren(node.kind)) {
    return node.id;
  }
  return node.parent || doc.root;
}

/**
 * Inserts a new node of `kind` under `parentId`.
 *
 * @param {any} doc
 * @param {string} kind canonical kind, already resolved
 * @param {string | null} parentId
 * @param {number} x
 * @param {number} y
 * @returns {string} the new node's id
 * @throws {Error} when asked to create a second root
 */
export function addNode(doc, kind, parentId, x, y) {
  if (kind === 'root') {
    throw new Error('the root node cannot be created twice');
  }
  const container = resolveContainer(doc, parentId);
  const id = nextId(doc);
  const node = createNode(id, kind, x, y);
  node.parent = container;

  doc.nodes[id] = node;
  doc.nodes[container].children.push(id);
  return id;
}

/**
 * Removes a node and everything under it.
 *
 * @param {any} doc
 * @param {string} id
 * @throws {Error} when asked to delete the root, or an unknown id
 */
export function deleteNode(doc, id) {
  if (id === doc.root) {
    throw new Error('the root node cannot be deleted');
  }
  requireNode(doc, id);
  removeSubtree(doc, id);
}

/**
 * Detaches `id` from its parent and drops it with every descendant.
 *
 * @param {any} doc
 * @param {string} id
 */
export function removeSubtree(doc, id) {
  const node = doc.nodes[id];
  if (!node) {
    return;
  }
  const parent = node.parent ? doc.nodes[node.parent] : undefined;
  if (parent) {
    parent.children = parent.children.filter((child) => child !== id);
  }
  for (const doomed of collectSubtree(doc, id)) {
    delete doc.nodes[doomed];
  }
}

/** Empties the page, leaving the root and its settings. @param {any} doc */
export function clearDocument(doc) {
  for (const child of [...doc.nodes[doc.root].children]) {
    removeSubtree(doc, child);
  }
}

/**
 * Lifts a set of subtrees out into a portable payload.
 *
 * Keeps the original ids: they are only used to rebuild the parent/child links
 * inside the payload, and `insertSubtrees` reassigns them all on the way back
 * in. That means a payload can be pasted into the document it came from
 * without colliding with itself.
 *
 * @param {any} doc
 * @param {string[]} ids
 * @returns {{roots: string[], nodes: Record<string, any>}}
 */
export function extractSubtrees(doc, ids) {
  /** @type {Record<string, any>} */
  const nodes = {};
  const roots = [];
  for (const id of ids) {
    if (id === doc.root || !doc.nodes[id]) {
      continue;
    }
    roots.push(id);
    for (const member of collectSubtree(doc, id)) {
      if (doc.nodes[member]) {
        nodes[member] = structuredClone(doc.nodes[member]);
      }
    }
  }
  return { roots, nodes };
}

/**
 * Inserts a payload from `extractSubtrees` under `parentId`, with fresh ids.
 *
 * Every node is rebuilt through `normalizeNode`, so a payload that has been
 * round-tripped through a clipboard, hand-edited, or produced by an older
 * version still lands as a valid subtree rather than as `undefined` fields.
 *
 * @param {any} doc
 * @param {{roots: string[], nodes: Record<string, any>}} payload
 * @param {string} parentId
 * @returns {string[]} the ids of the inserted roots
 */
export function insertSubtrees(doc, payload, parentId) {
  const container = resolveContainer(doc, parentId);
  const parent = requireNode(doc, container);

  // Assign every id first, so a child can be linked before it is visited.
  /** @type {Map<string, string>} */
  const fresh = new Map();
  for (const oldId of Object.keys(payload.nodes || {})) {
    fresh.set(oldId, nextId(doc));
  }

  for (const [oldId, raw] of Object.entries(payload.nodes || {})) {
    const id = /** @type {string} */ (fresh.get(oldId));
    const node = normalizeNode(id, raw);
    node.children = (raw.children || []).map((child) => fresh.get(child)).filter(Boolean);
    doc.nodes[id] = node;
  }

  // Parent links, from the child lists that survived the remapping.
  for (const id of fresh.values()) {
    for (const child of doc.nodes[id].children) {
      doc.nodes[child].parent = id;
    }
  }

  const roots = (payload.roots || []).map((root) => fresh.get(root)).filter(Boolean);
  for (const root of roots) {
    doc.nodes[root].parent = container;
    parent.children.push(root);
  }
  return roots;
}

/**
 * Wraps several siblings in a new container.
 *
 * They must share a parent. Grouping elements from different containers has no
 * single answer for where the group goes or what happens to the layout around
 * it, and guessing would move things the user did not ask to move.
 *
 * @param {any} doc
 * @param {string[]} ids
 * @returns {string} the new container's id
 * @throws {Error} when the ids do not share one parent
 */
export function groupNodes(doc, ids) {
  const members = ids.filter((id) => id !== doc.root && doc.nodes[id]);
  if (members.length < 2) {
    throw new Error('select two or more elements to group');
  }

  const parentId = doc.nodes[members[0]].parent || doc.root;
  if (!members.every((id) => (doc.nodes[id].parent || doc.root) === parentId)) {
    throw new Error('grouping needs elements from the same container');
  }

  const parent = requireNode(doc, parentId);
  const flowed = parent.layout !== 'absolute';

  // The box that just contains them, in the parent's own coordinates. In a
  // flow container those coordinates mean nothing, so the group takes the
  // default size and the members keep their order instead.
  const boxes = members.map((id) => doc.nodes[id]);
  const left = flowed ? 0 : Math.min(...boxes.map((n) => n.x));
  const top = flowed ? 0 : Math.min(...boxes.map((n) => n.y));
  const right = flowed ? 0 : Math.max(...boxes.map((n) => n.x + n.width));
  const bottom = flowed ? 0 : Math.max(...boxes.map((n) => n.y + n.height));

  // Where the first member sat, so the group lands in its place in the order.
  const index = parent.children.indexOf(members[0]);

  const groupId = addNode(doc, 'container', parentId, left, top);
  const group = doc.nodes[groupId];
  group.name = 'Group';
  // A group is a wrapper, not a card: no fill, no border, no padding.
  group.style = { custom: {} };
  if (!flowed) {
    group.width = Math.max(right - left, MIN_SIZE);
    group.height = Math.max(bottom - top, MIN_SIZE);
  }

  // `addNode` appended it; put it back where the first member was.
  parent.children.pop();
  parent.children.splice(index < 0 ? parent.children.length : index, 0, groupId);

  for (const id of members) {
    reparentNode(doc, id, groupId);
    if (!flowed) {
      // Their positions were relative to the old parent; rebase them.
      doc.nodes[id].x -= left;
      doc.nodes[id].y -= top;
    }
  }
  return groupId;
}

/**
 * Dissolves a container, leaving its children where they were on the page.
 *
 * @param {any} doc
 * @param {string} id
 * @returns {string[]} the ids that were lifted out
 * @throws {Error} when the node is the root or has no parent
 */
export function ungroupNode(doc, id) {
  const group = requireNode(doc, id);
  if (id === doc.root || !group.parent) {
    throw new Error('the page itself cannot be ungrouped');
  }
  const parentId = group.parent;
  const parent = requireNode(doc, parentId);
  const flowed = parent.layout !== 'absolute';
  const at = parent.children.indexOf(id);
  const freed = [...group.children];

  // Spliced in at the group's own position, so the paint order is unchanged.
  for (const [offset, child] of freed.entries()) {
    reparentNode(doc, child, parentId, (at < 0 ? parent.children.length : at) + offset);
    if (!flowed) {
      doc.nodes[child].x += group.x;
      doc.nodes[child].y += group.y;
    }
  }
  removeSubtree(doc, id);
  return freed;
}

/**
 * Lines up several siblings along one edge, or centres them on one axis.
 *
 * @param {any} doc
 * @param {string[]} ids
 * @param {'left'|'centre'|'right'|'top'|'middle'|'bottom'} edge
 */
export function alignNodes(doc, ids, edge) {
  const nodes = ids.map((id) => doc.nodes[id]).filter((node) => node && !node.locked);
  if (nodes.length < 2) {
    return;
  }
  const left = Math.min(...nodes.map((n) => n.x));
  const right = Math.max(...nodes.map((n) => n.x + n.width));
  const top = Math.min(...nodes.map((n) => n.y));
  const bottom = Math.max(...nodes.map((n) => n.y + n.height));

  for (const node of nodes) {
    switch (edge) {
      case 'left':
        node.x = left;
        break;
      case 'centre':
        node.x = left + (right - left - node.width) / 2;
        break;
      case 'right':
        node.x = right - node.width;
        break;
      case 'top':
        node.y = top;
        break;
      case 'middle':
        node.y = top + (bottom - top - node.height) / 2;
        break;
      case 'bottom':
        node.y = bottom - node.height;
        break;
      default:
        break;
    }
  }
}

/**
 * Spreads several siblings so the gaps between them are equal.
 *
 * The outermost two do not move — they define the span being divided up, which
 * is what "distribute" means everywhere else it appears in a design tool.
 *
 * @param {any} doc
 * @param {string[]} ids
 * @param {'horizontal'|'vertical'} axis
 */
export function distributeNodes(doc, ids, axis) {
  const horizontal = axis === 'horizontal';
  const nodes = ids
    .map((id) => doc.nodes[id])
    .filter(Boolean)
    .sort((a, b) => (horizontal ? a.x - b.x : a.y - b.y));
  if (nodes.length < 3) {
    return;
  }

  const first = nodes[0];
  const last = nodes[nodes.length - 1];
  const span = horizontal ? last.x + last.width - first.x : last.y + last.height - first.y;
  const filled = nodes.reduce((total, n) => total + (horizontal ? n.width : n.height), 0);
  const gap = (span - filled) / (nodes.length - 1);

  let cursor = horizontal ? first.x : first.y;
  for (const node of nodes) {
    if (node.locked) {
      cursor += (horizontal ? node.width : node.height) + gap;
      continue;
    }
    if (horizontal) {
      node.x = cursor;
      cursor += node.width + gap;
    } else {
      node.y = cursor;
      cursor += node.height + gap;
    }
  }
}

/**
 * Deep-copies a subtree and inserts the copy just after the original, offset
 * so it is visible on top of it.
 *
 * @param {any} doc
 * @param {string} id
 * @returns {string} the new subtree's root id
 * @throws {Error} when asked to duplicate the root, or an unknown id
 */
export function duplicateNode(doc, id) {
  if (id === doc.root) {
    throw new Error('the root node cannot be duplicated');
  }
  const source = requireNode(doc, id);
  const parentId = source.parent || doc.root;

  const cloneId = cloneSubtree(doc, id, parentId);
  const clone = doc.nodes[cloneId];
  clone.x += 24;
  clone.y += 24;

  const siblings = doc.nodes[parentId].children;
  const after = siblings.indexOf(id);
  siblings.splice(after < 0 ? siblings.length : after + 1, 0, cloneId);
  return cloneId;
}

/**
 * Copies `id` and its descendants into fresh ids. The copy is inserted into
 * the arena but is *not* linked into its parent's child list — the caller
 * decides the insertion index.
 *
 * @param {any} doc
 * @param {string} id
 * @param {string | null} parentId
 * @returns {string}
 */
function cloneSubtree(doc, id, parentId) {
  const source = requireNode(doc, id);
  const newId = nextId(doc);

  const copy = structuredClone(source);
  copy.id = newId;
  copy.parent = parentId;
  copy.children = [];
  doc.nodes[newId] = copy;

  // Insert the copy before recursing so `nextId` cannot hand out its id again.
  copy.children = source.children.map((child) => cloneSubtree(doc, child, newId));
  return newId;
}

/**
 * Moves `id` under `newParent` at `index`, appending when the index is out of
 * range or omitted.
 *
 * @param {any} doc
 * @param {string} id
 * @param {string} newParent
 * @param {number | null} [index] `null` or `-1` appends
 * @throws {Error} when the move would break the tree
 */
export function reparentNode(doc, id, newParent, index = null) {
  if (id === doc.root) {
    throw new Error('the root node cannot be reparented');
  }
  requireNode(doc, id);
  const target = requireNode(doc, newParent);

  if (!acceptsChildren(target.kind)) {
    throw new Error(`\`${newParent}\` cannot hold children`);
  }
  if (collectSubtree(doc, id).includes(newParent)) {
    throw new Error('cannot move a node inside its own subtree');
  }

  const node = doc.nodes[id];
  const oldParent = node.parent ? doc.nodes[node.parent] : undefined;
  if (oldParent) {
    oldParent.children = oldParent.children.filter((child) => child !== id);
  }

  const position =
    index === null || index === undefined || index < 0
      ? target.children.length
      : Math.min(index, target.children.length);
  target.children.splice(position, 0, id);
  node.parent = newParent;
}

/**
 * Raises or lowers a node within its parent's child list.
 *
 * @param {any} doc
 * @param {string} id
 * @param {number} delta `-1` sends backwards, `1` brings forwards
 * @throws {Error} when the node has no parent or is not linked into it
 */
export function reorderNode(doc, id, delta) {
  const node = requireNode(doc, id);
  if (!node.parent) {
    throw new Error(`\`${id}\` has no parent`);
  }
  const siblings = requireNode(doc, node.parent).children;
  const current = siblings.indexOf(id);
  if (current < 0) {
    throw new Error(`\`${id}\` is not a child of \`${node.parent}\``);
  }
  const target = clamp(current + delta, 0, siblings.length - 1);
  if (target === current) {
    return;
  }
  siblings.splice(current, 1);
  siblings.splice(target, 0, id);
}

/**
 * Drag fast path. Records no history and ignores locked nodes.
 *
 * @param {any} doc
 * @param {string} id
 * @param {number} x
 * @param {number} y
 */
export function moveNode(doc, id, x, y) {
  const node = requireNode(doc, id);
  if (node.locked) {
    return;
  }
  if (Number.isFinite(x)) {
    node.x = x;
  }
  if (Number.isFinite(y)) {
    node.y = y;
  }
}

/**
 * Resize fast path. Records no history and ignores locked nodes.
 *
 * Setting a height explicitly turns off `autoHeight` — dragging the bottom
 * handle of a hugging text box has to mean "I want this height now".
 *
 * @param {any} doc
 * @param {string} id
 * @param {number} width
 * @param {number} height
 */
export function resizeNode(doc, id, width, height) {
  const node = requireNode(doc, id);
  if (node.locked) {
    return;
  }
  if (Number.isFinite(width)) {
    node.width = Math.max(width, MIN_SIZE);
  }
  if (Number.isFinite(height)) {
    node.height = Math.max(height, MIN_SIZE);
    node.autoHeight = false;
  }
}

/**
 * Applies one page setting.
 *
 * @param {any} doc
 * @param {string} key
 * @param {string} value
 * @throws {Error} on an unknown key, or a number field given a non-number
 */
export function setPageProp(doc, key, value) {
  const field = PAGE_BY_NAME.get(key) || PAGE_BY_NAME.get(camelCase(key));
  if (!field) {
    throw new Error(`unknown page property \`${key}\``);
  }
  const trimmed = String(value).trim();

  if (field.input === 'number') {
    const parsed = parseNumber(trimmed);
    if (parsed === null) {
      throw new Error(`\`${field.key}\` expects a number, received \`${trimmed}\``);
    }
    doc.page[field.key] = clamp(parsed, field.min ?? -Infinity, field.max ?? Infinity);
    return;
  }

  if (trimmed === '') {
    if (field.onEmpty === 'ignore') {
      return;
    }
    doc.page[field.key] = field.onEmpty === 'fallback' ? field.value : '';
    return;
  }
  doc.page[field.key] = trimmed;
}

// =========================================================== persistence ===

/**
 * Repairs and migrates a document read from a file or from `localStorage`.
 *
 * A project file is user-editable text and may be hand-written, truncated, or
 * produced by an older version. Rather than refusing it, this rebuilds a
 * document that is guaranteed to be internally consistent:
 *
 *   * unknown or missing fields fall back to the kind's defaults;
 *   * child links pointing at nodes that no longer exist are dropped;
 *   * nodes that ended up unreachable are re-attached to the root, so nothing
 *     silently disappears;
 *   * `counter` is advanced past the highest id in use, so the next node
 *     cannot collide with an existing one.
 *
 * @param {any} incoming parsed JSON, of any vintage
 * @returns {any} a valid document
 * @throws {Error} only when there is no root node to build around
 */
export function normalizeDocument(incoming) {
  if (!incoming || typeof incoming !== 'object' || !incoming.nodes) {
    throw new Error('project file has no nodes');
  }
  const rootId = typeof incoming.root === 'string' ? incoming.root : ROOT_ID;
  if (!incoming.nodes[rootId]) {
    throw new Error('project file has no root node');
  }

  const page = { ...createPageSettings(), ...migrateKeys(incoming.page || {}, PAGE_KEYS) };
  /** @type {Record<string, any>} */
  const nodes = {};
  for (const [id, raw] of Object.entries(incoming.nodes)) {
    nodes[id] = normalizeNode(id, /** @type {any} */ (raw));
  }

  // Drop links to nodes that no longer exist, and never let anything claim
  // the root as a child.
  for (const node of Object.values(nodes)) {
    node.children = node.children.filter((child) => nodes[child] && child !== rootId);
    if (node.parent && !nodes[node.parent]) {
      node.parent = null;
    }
  }

  // Re-attach anything the root cannot reach.
  const reachable = new Set([rootId]);
  const stack = [rootId];
  while (stack.length > 0) {
    const current = /** @type {string} */ (stack.pop());
    for (const child of nodes[current].children) {
      if (!reachable.has(child)) {
        reachable.add(child);
        stack.push(child);
      }
    }
  }
  for (const id of Object.keys(nodes)) {
    if (reachable.has(id)) {
      continue;
    }
    nodes[id].parent = rootId;
    nodes[rootId].children.push(id);
    // Claim the whole orphaned subtree, or its descendants would be
    // re-attached to the root as well and end up listed twice.
    for (const descendant of collectSubtree({ nodes }, id)) {
      reachable.add(descendant);
    }
  }
  // The reachable walk trusts `children`; make `parent` agree with it.
  for (const node of Object.values(nodes)) {
    for (const child of node.children) {
      nodes[child].parent = node.id;
    }
  }
  nodes[rootId].parent = null;

  const highest = Object.keys(nodes).reduce((best, id) => {
    const match = /^n(\d+)$/.exec(id);
    return match ? Math.max(best, Number(match[1])) : best;
  }, 0);

  return {
    version: DOCUMENT_VERSION,
    root: rootId,
    counter: Math.max(Number(incoming.counter) || 0, highest),
    page,
    nodes,
  };
}

/**
 * Rebuilds one node on top of its kind's defaults, so a field the file omits
 * or spells wrongly simply falls back instead of producing `undefined`.
 *
 * @param {string} id
 * @param {any} raw
 * @returns {any}
 */
export function normalizeNode(id, raw) {
  const source = migrateKeys(raw || {}, NODE_KEYS_CAMEL);
  const kind = resolveKind(source.kind) || 'container';
  const base = createNode(id, kind, Number(source.x) || 0, Number(source.y) || 0);
  const style = migrateKeys(source.style || {}, STYLE_KEYS_CAMEL);

  return {
    ...base,
    name: typeof source.name === 'string' && source.name ? source.name : base.name,
    width: Number.isFinite(source.width) ? Math.max(source.width, MIN_SIZE) : base.width,
    height: Number.isFinite(source.height) ? Math.max(source.height, MIN_SIZE) : base.height,
    autoHeight: source.autoHeight === undefined ? base.autoHeight : Boolean(source.autoHeight),
    content: typeof source.content === 'string' ? source.content : base.content,
    href: source.href ?? base.href,
    src: source.src ?? base.src,
    placeholder: source.placeholder ?? base.placeholder,
    anchor: typeof source.anchor === 'string' ? source.anchor : null,
    layout: resolveLayout(source.layout) || base.layout,
    locked: Boolean(source.locked),
    hidden: Boolean(source.hidden),
    style: { ...base.style, ...style, custom: { ...(style.custom || {}) } },
    data: { ...base.data, ...normalizeData(source.data) },
    children: Array.isArray(source.children) ? source.children.filter(isId) : [],
    parent: typeof source.parent === 'string' ? source.parent : null,
  };
}

/**
 * Coerces a `data` bag read from a file to `{string: string}`.
 *
 * A kind's `body` hook reads these with `String(...)` anyway, but coercing on
 * the way in means the in-memory document has one shape rather than whatever
 * the file happened to contain.
 *
 * @param {unknown} source
 * @returns {Record<string, string>}
 */
function normalizeData(source) {
  if (!source || typeof source !== 'object') {
    return {};
  }
  /** @type {Record<string, string>} */
  const out = {};
  for (const [key, value] of Object.entries(source)) {
    if (value !== null && value !== undefined && typeof value !== 'object') {
      out[key] = String(value);
    }
  }
  return out;
}

/** @param {unknown} value @returns {boolean} */
function isId(value) {
  return typeof value === 'string' && value.length > 0;
}

/** @param {string} key @returns {string} */
function camelCase(key) {
  return key.replace(/_([a-z])/g, (_match, letter) => letter.toUpperCase());
}

/**
 * Renames the snake_case keys v1 documents used, leaving everything else
 * untouched. Only keys the engine actually knows about are renamed, so a
 * property the user invented keeps its name.
 *
 * @param {Record<string, any>} source
 * @param {Set<string>} known camelCase keys this object may hold
 * @returns {Record<string, any>}
 */
function migrateKeys(source, known) {
  /** @type {Record<string, any>} */
  const out = {};
  for (const [key, value] of Object.entries(source)) {
    const camel = camelCase(key);
    out[known.has(camel) ? camel : key] = value;
  }
  return out;
}

const PAGE_KEYS = new Set(PAGE_SETTINGS.map((field) => field.key));
const STYLE_KEYS_CAMEL = new Set([...STYLE_FIELDS.map((field) => field.key), 'custom']);
const NODE_KEYS_CAMEL = new Set([
  'id',
  'kind',
  'name',
  'x',
  'y',
  'width',
  'height',
  'autoHeight',
  'content',
  'href',
  'src',
  'placeholder',
  'anchor',
  'layout',
  'locked',
  'hidden',
  'style',
  'data',
  'children',
  'parent',
]);
