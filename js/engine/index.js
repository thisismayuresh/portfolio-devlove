/**
 * The engine: one object that owns the document, its history, and the
 * geometry cache the preview frame reports back.
 *
 * This is the whole public surface. `core/app.js` is its only caller, and the
 * UI never reaches past it into `engine/document.js` or `engine/history.js`.
 *
 * Two rules make the rest of the codebase simple:
 *
 * 1. **The engine is the only copy of the document.** No panel mirrors it, so
 *    there is no class of bug where the UI and the model disagree.
 * 2. **Reads hand back copies.** `getElement` and friends return cloned data,
 *    so a panel that scribbles on what it read cannot corrupt the model. The
 *    one exception is `snapshot()`, which is documented below.
 *
 * Every method that can fail throws an `Error` with a message written for the
 * status bar rather than for a stack trace. `core/app.js` catches them.
 *
 * @module engine
 */

import {
  addNode,
  alignNodes,
  buildTree,
  clearDocument,
  createDocument,
  deleteNode,
  distributeNodes,
  duplicateNode,
  extractSubtrees,
  groupNodes,
  insertSubtrees,
  moveNode,
  nodeAt,
  normalizeDocument,
  reorderNode,
  reparentNode,
  requireNode,
  resizeNode,
  setPageProp,
  ungroupNode,
} from './document.js';
import { declarationsFor } from './compiler.js';
import { dropTarget, hitTest, snapGuides, toLocalPoint } from './geometry.js';
import { History } from './history.js';
import { resolveKind } from './kinds.js';
import { setNodeProp } from './node.js';

export class Engine {
  constructor() {
    /** The live document. Never handed out except through `snapshot()`. */
    this.doc = createDocument();
    this.history = new History();

    /**
     * Selected ids, in the order they were picked. The **last** one is the
     * primary — the one the inspector reads and the one resize handles belong
     * to. Everything else in the list follows what happens to it.
     *
     * An array rather than a `Set` because that order is meaningful.
     *
     * @type {string[]}
     */
    this._selection = [];

    /**
     * Measured boxes reported by the preview frame, as `[x, y, w, h]`.
     * @type {Record<string, [number, number, number, number]>}
     */
    this._rects = Object.create(null);
  }

  // =========================================================== structure ===

  /**
   * Creates a node of `kind` inside `parentId`, at parent-local coordinates.
   *
   * When `parentId` names something that cannot hold children, the node lands
   * beside it instead — see `resolveContainer`.
   *
   * @param {string} kind
   * @param {string | null} [parentId] defaults to the root
   * @param {number} [x]
   * @param {number} [y]
   * @returns {string} the new node's id
   */
  addElement(kind, parentId = null, x = 0, y = 0) {
    const resolved = resolveKind(kind);
    if (resolved === null) {
      throw new Error(`unknown element kind \`${kind}\``);
    }
    return this._guard(() => {
      const id = addNode(this.doc, resolved, parentId, x, y);
      this._selection = [id];
      return id;
    });
  }

  /**
   * Creates a node and applies a batch of properties as one undo step.
   * Used by the starter template and by anything scripting the editor.
   *
   * @param {string} kind
   * @param {string | null} parentId
   * @param {number} x
   * @param {number} y
   * @param {Record<string, string | number | boolean>} [props]
   * @returns {string}
   */
  addElementWith(kind, parentId, x, y, props = {}) {
    const resolved = resolveKind(kind);
    if (resolved === null) {
      throw new Error(`unknown element kind \`${kind}\``);
    }
    return this._guard(() => {
      const id = addNode(this.doc, resolved, parentId, x, y);
      const node = this.doc.nodes[id];
      for (const [key, value] of Object.entries(props)) {
        try {
          setNodeProp(node, key, value === null ? '' : String(value));
        } catch (error) {
          throw new Error(`\`${key}\`: ${error.message}`);
        }
      }
      this._selection = [id];
      return id;
    });
  }

  /** @param {string} id */
  deleteElement(id) {
    this._guard(() => {
      deleteNode(this.doc, id);
      this._validateSelection();
    });
  }

  /**
   * Deletes several elements as **one** undo step.
   *
   * Not a loop over `deleteElement` in the caller: each of those takes its own
   * checkpoint, so deleting four elements would take four presses of Ctrl+Z to
   * put back. Batching belongs here, next to `_guard`, because here is the only
   * place that knows where an undo boundary goes.
   *
   * Ids that have already gone — a child whose container was earlier in the
   * list — are skipped rather than throwing.
   *
   * @param {string[]} ids
   * @returns {number} how many were actually removed
   */
  deleteElements(ids) {
    return this._guard(() => {
      let removed = 0;
      for (const id of ids) {
        if (id === this.doc.root || !nodeAt(this.doc, id)) {
          continue;
        }
        deleteNode(this.doc, id);
        removed += 1;
      }
      this._validateSelection();
      return removed;
    });
  }

  /**
   * @param {string} id
   * @returns {string} the new subtree's root id
   */
  duplicateElement(id) {
    return this._guard(() => {
      const clone = duplicateNode(this.doc, id);
      this._selection = [clone];
      return clone;
    });
  }

  /**
   * Duplicates several elements as one undo step, and selects the copies.
   *
   * @param {string[]} ids
   * @returns {string[]} the new subtree root ids
   */
  duplicateElements(ids) {
    return this._guard(() => {
      const clones = ids
        .filter((id) => id !== this.doc.root && nodeAt(this.doc, id))
        .map((id) => duplicateNode(this.doc, id));
      if (clones.length > 0) {
        this._selection = clones;
      }
      return clones;
    });
  }

  /**
   * @param {string} id
   * @param {string} parentId
   * @param {number} [index] `-1` appends
   */
  reparentElement(id, parentId, index = -1) {
    this._guard(() => reparentNode(this.doc, id, parentId, index));
  }

  /**
   * @param {string} id
   * @param {number} delta `-1` sends backwards, `1` brings forwards
   */
  reorderElement(id, delta) {
    this._guard(() => reorderNode(this.doc, id, delta));
  }

  // ============================================================ mutation ===

  /**
   * Drag fast path: no history, no recompile. The canvas takes one
   * `checkpoint()` when the gesture starts instead.
   *
   * @param {string} id
   * @param {number} x
   * @param {number} y
   */
  moveElement(id, x, y) {
    moveNode(this.doc, id, x, y);
  }

  /**
   * Resize fast path: no history.
   *
   * @param {string} id
   * @param {number} width
   * @param {number} height
   */
  resizeElement(id, width, height) {
    resizeNode(this.doc, id, width, height);
  }

  /**
   * Applies one property and records an undo step.
   *
   * @param {string} id
   * @param {string} key dotted path — `width`, `style.padding`, `custom.filter`
   * @param {string} value
   */
  updateElement(id, key, value) {
    this._guard(() => setNodeProp(requireNode(this.doc, id), key, value));
  }

  /**
   * Applies one property *without* recording history — for slider and colour
   * drags, where the caller has already taken a checkpoint.
   *
   * @param {string} id
   * @param {string} key
   * @param {string} value
   */
  updateElementLive(id, key, value) {
    setNodeProp(requireNode(this.doc, id), key, value);
  }

  /**
   * @param {string} key
   * @param {string} value
   */
  updatePage(key, value) {
    this._guard(() => setPageProp(this.doc, key, value));
  }

  // ============================================================= history ===

  /** Opens a history entry before a multi-step gesture (a drag, a slider). */
  checkpoint() {
    this.history.push(this.doc);
  }

  /** @returns {boolean} whether anything was undone */
  undo() {
    const previous = this.history.undo(this.doc);
    if (!previous) {
      return false;
    }
    this.doc = previous;
    this._validateSelection();
    return true;
  }

  /** @returns {boolean} whether anything was redone */
  redo() {
    const next = this.history.redo(this.doc);
    if (!next) {
      return false;
    }
    this.doc = next;
    this._validateSelection();
    return true;
  }

  /** Empties the undo/redo stacks. Call after loading a document. */
  clearHistory() {
    this.history.clear();
  }

  /** @returns {boolean} */
  canUndo() {
    return this.history.canUndo;
  }

  /** @returns {boolean} */
  canRedo() {
    return this.history.canRedo;
  }

  // ========================================================== clipboard ===

  /**
   * Lifts the given subtrees out as a portable payload.
   *
   * Reads only — copying nothing is a legitimate outcome and must not disturb
   * the document or the undo stack.
   *
   * @param {string[]} ids
   * @returns {{roots: string[], nodes: Record<string, any>}}
   */
  copyElements(ids) {
    return extractSubtrees(this.doc, ids);
  }

  /**
   * Pastes a payload into a container, with fresh ids, as one undo step.
   *
   * @param {{roots: string[], nodes: Record<string, any>}} payload
   * @param {string | null} [parentId] defaults to the root
   * @returns {string[]} the ids of the pasted roots
   */
  pasteElements(payload, parentId = null) {
    return this._guard(() => {
      const roots = insertSubtrees(this.doc, payload, parentId || this.doc.root);
      if (roots.length > 0) {
        this._selection = roots;
      }
      return roots;
    });
  }

  // ========================================================== arrangement ===

  /**
   * Wraps several siblings in a new container.
   *
   * @param {string[]} ids
   * @returns {string} the container's id
   */
  groupElements(ids) {
    return this._guard(() => {
      const groupId = groupNodes(this.doc, ids);
      this._selection = [groupId];
      return groupId;
    });
  }

  /**
   * Dissolves containers, leaving their children in place.
   *
   * @param {string[]} ids
   * @returns {string[]} everything that was lifted out
   */
  ungroupElements(ids) {
    return this._guard(() => {
      const freed = ids
        .filter((id) => nodeAt(this.doc, id))
        .flatMap((id) => ungroupNode(this.doc, id));
      this._selection = freed;
      return freed;
    });
  }

  /**
   * Lines several elements up along one edge, as one undo step.
   *
   * @param {string[]} ids
   * @param {'left'|'centre'|'right'|'top'|'middle'|'bottom'} edge
   */
  alignElements(ids, edge) {
    this._guard(() => alignNodes(this.doc, ids, edge));
  }

  /**
   * Spreads several elements so the gaps between them are equal.
   *
   * @param {string[]} ids
   * @param {'horizontal'|'vertical'} axis
   */
  distributeElements(ids, axis) {
    this._guard(() => distributeNodes(this.doc, ids, axis));
  }

  // =========================================================== selection ===

  /**
   * Replaces the selection.
   *
   * @param {string | string[] | null} [ids] one id, several, or nothing
   */
  select(ids = null) {
    const list = ids === null || ids === undefined ? [] : [ids].flat();
    // Deduplicated, and only ids that still exist — a stale id from a panel
    // that has not re-rendered yet must not resurrect a deleted node.
    this._selection = [...new Set(list)].filter((id) => nodeAt(this.doc, id));
  }

  /**
   * Adds an id to the selection, or removes it if it is already there.
   *
   * This is what Ctrl-click does. Re-picking an already-selected element
   * promotes it to primary rather than doing nothing, so the inspector
   * follows the thing you just clicked.
   *
   * @param {string} id
   */
  toggleSelected(id) {
    if (!nodeAt(this.doc, id)) {
      return;
    }
    const at = this._selection.indexOf(id);
    if (at >= 0) {
      this._selection.splice(at, 1);
    } else {
      this._selection.push(id);
    }
  }

  /**
   * The primary selection — the most recently picked element.
   *
   * Callers that only handle one element at a time read this and keep
   * working unchanged; the ones that mean "everything selected" ask for
   * {@link Engine#selectedIds}.
   *
   * @returns {string | null}
   */
  selection() {
    return this._selection.length > 0 ? this._selection[this._selection.length - 1] : null;
  }

  /** @returns {string[]} every selected id, in the order they were picked */
  selectedIds() {
    return [...this._selection];
  }

  /** @returns {number} */
  selectionSize() {
    return this._selection.length;
  }

  /**
   * @param {string} id
   * @returns {boolean}
   */
  isSelected(id) {
    return this._selection.includes(id);
  }

  // ============================================================ geometry ===

  /**
   * Ingests the measured boxes reported by the preview frame.
   *
   * The payload crosses a `postMessage` boundary from a sandboxed frame, so
   * every entry is checked rather than trusted.
   *
   * @param {Record<string, unknown>} rects `{id: [x, y, w, h]}`
   */
  syncRects(rects) {
    /** @type {Record<string, [number, number, number, number]>} */
    const clean = Object.create(null);
    for (const [id, value] of Object.entries(rects || {})) {
      if (Array.isArray(value) && value.length >= 4 && value.every(Number.isFinite)) {
        clean[id] = [value[0], value[1], value[2], value[3]];
      }
    }
    this._rects = clean;
  }

  /**
   * @param {number} x
   * @param {number} y
   * @returns {string | null} the deepest node under the point
   */
  hitTest(x, y) {
    return hitTest(this.doc, this._rects, x, y);
  }

  /**
   * @param {number} x
   * @param {number} y
   * @param {string | null} [exclude] skip this node's own subtree
   * @returns {string} always a valid container id
   */
  dropTarget(x, y, exclude = null) {
    return dropTarget(this.doc, this._rects, x, y, exclude);
  }

  /**
   * @param {string} parentId
   * @param {number} x
   * @param {number} y
   * @returns {[number, number]}
   */
  toLocalPoint(parentId, x, y) {
    return toLocalPoint(this.doc, this._rects, parentId, x, y);
  }

  /**
   * @param {string} id
   * @returns {[number, number, number, number] | null} the measured box
   */
  rectOf(id) {
    return this._rects[id] || null;
  }

  /**
   * @param {string} id
   * @returns {{v: number[], h: number[]}}
   */
  snapGuides(id) {
    return snapGuides(this.doc, id);
  }

  // =============================================================== reads ===

  /**
   * @param {string} id
   * @returns {any} a copy of the node, safe for a panel to hold on to
   */
  getElement(id) {
    return structuredClone(requireNode(this.doc, id));
  }

  /** @returns {any} a copy of the page settings */
  getPage() {
    return { ...this.doc.page };
  }

  /** @returns {any} the nested outline the Layers panel renders */
  getTree() {
    return buildTree(this.doc);
  }

  /** @returns {number} node count, including the root */
  nodeCount() {
    return Object.keys(this.doc.nodes).length;
  }

  /**
   * The live document, for handing to the compile worker.
   *
   * **Read-only.** It is not a copy — `postMessage` clones it at the worker
   * boundary, and cloning it here as well would double the cost of every
   * recompile. Nothing in the UI should call this.
   *
   * @returns {any}
   */
  snapshot() {
    return this.doc;
  }

  /**
   * The inline declarations for one node, for the live-patch drag path.
   *
   * Deliberately synchronous: it runs inside a pointer-move handler, and a
   * round trip to the worker would put a frame of lag behind the cursor.
   *
   * @param {string} id
   * @returns {string}
   */
  nodeCss(id) {
    return declarationsFor(this.doc, requireNode(this.doc, id));
  }

  // ========================================================= persistence ===

  /** @returns {string} the project as JSON */
  exportProject() {
    return JSON.stringify(this.doc);
  }

  /**
   * Replaces the whole document with the contents of a project file.
   *
   * @param {string} json
   */
  importProject(json) {
    // Parse and repair before touching anything, so a bad file leaves the
    // current document exactly as it was.
    let incoming;
    try {
      incoming = JSON.parse(json);
    } catch (error) {
      throw new Error(`project file is not valid JSON: ${error.message}`);
    }
    const normalized = normalizeDocument(incoming);

    this.checkpoint();
    this.doc = normalized;
    this._rects = Object.create(null);
    this._validateSelection();
  }

  /** Clears the page back to an empty document, in one undo step. */
  resetProject() {
    this.checkpoint();
    clearDocument(this.doc);
    this._selection = [];
  }

  // ============================================================= private ===

  /**
   * Runs a mutation between an undo checkpoint and its rollback.
   *
   * If the mutation throws, the checkpoint is dropped, so a rejected action
   * leaves no empty step for the user to undo past. This is the one place that
   * pattern lives — every guarded method above is one line because of it.
   *
   * @template T
   * @param {() => T} mutate
   * @returns {T}
   */
  _guard(mutate) {
    this.checkpoint();
    try {
      return mutate();
    } catch (error) {
      this.history.discard();
      throw error;
    }
  }

  /** Drops any selected id whose node no longer exists. */
  _validateSelection() {
    this._selection = this._selection.filter((id) => nodeAt(this.doc, id));
  }
}

export { PLACEABLE_KINDS, ELEMENT_KINDS, LAYOUT_MODES } from './kinds.js';
export { STYLE_KEYS } from './style.js';
export { NODE_KEYS } from './node.js';
export { PAGE_SETTINGS, DOCUMENT_VERSION } from './document.js';
