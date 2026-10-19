/**
 * Application controller.
 *
 * This is the only module that talks to the engine. Panels read state from
 * `app.state`, call command methods, and re-render when the topics they
 * subscribed to fire. Keeping that boundary in one place is what makes the UI
 * replaceable and the engine testable on its own.
 *
 * Topics
 * ------
 *   ready      engine live, first document compiled
 *   document   tree structure changed — panels should re-read everything
 *   node       one node's properties changed
 *   selection  the selection changed — `state.selection` is the primary id,
 *              `state.selected` is every selected id
 *   hover      hovered id changed
 *   geometry   the preview frame reported new measurements
 *   mode       design/preview switch
 *   sidebar    a left/right sidebar was shown or hidden
 *   zoom       canvas zoom changed
 *   page       page settings changed
 *   status     a message for the status bar
 *
 * @module core/app
 */

import { Emitter } from './emitter.js';
import { compileService } from './compile-service.js';
import { Engine } from '../engine/index.js';
import { FRAME_CHANNEL } from '../engine/preview-runtime.js';
import { DEFAULT_TEMPLATE_ID, applyTo, buildTemplate, templateById } from '../templates/index.js';
import { blockById } from '../registry/blocks.js';

/** localStorage key for the autosaved document. */
const AUTOSAVE_KEY = 'devlove.autosave.v1';

/** Debounce window for autosaving, in milliseconds. */
const AUTOSAVE_DELAY = 700;

/**
 * Property keys whose effect cannot be expressed as a single inline style
 * patch, so they force a full document recompile.
 * @type {ReadonlySet<string>}
 */
const STRUCTURAL_KEYS = new Set(['layout', 'hidden', 'autoHeight', 'src', 'href', 'placeholder']);

/**
 * Anything under `data.` is structural too: those keys feed a kind's `body`
 * hook and change the element's markup — a table gains a row, a list becomes
 * numbered — which no amount of CSS can express.
 *
 * @param {string} key
 * @returns {boolean} whether changing this key needs a full recompile
 */
function isStructural(key) {
  return STRUCTURAL_KEYS.has(key) || key.startsWith('data.');
}

export class DevloveApp extends Emitter {
  constructor() {
    super();

    /** @type {Engine | null} */
    this.engine = null;

    /** @type {HTMLIFrameElement | null} */
    this.frame = null;

    /**
     * Whether boot seeded the default template rather than restoring a save.
     * The welcome card reads it so its copy matches what is on the canvas.
     */
    this.firstRun = false;

    this.state = {
      ready: false,
      mode: /** @type {'design' | 'preview'} */ ('design'),
      /**
       * The two sidebars. `true` while visible — both start open, every
       * session; the choice is deliberately not persisted.
       */
      leftSidebar: true,
      rightSidebar: true,
      zoom: 1,
      /** The primary selection: the element the inspector reads. */
      selection: /** @type {string | null} */ (null),
      /** Every selected id, in pick order. The last one is `selection`. */
      selected: /** @type {string[]} */ ([]),
      hover: /** @type {string | null} */ (null),
      /** measured boxes reported by the frame: id -> [x, y, w, h] */
      rects: /** @type {Record<string, number[]>} */ (Object.create(null)),
      contentHeight: 0,
      frameReady: false,
    };

    /**
     * The in-app clipboard: a payload from `Engine.copyElements`, or `null`.
     * @type {{roots: string[], nodes: Record<string, any>} | null}
     */
    this._clipboard = null;

    this._recompileHandle = 0;
    this._autosaveHandle = 0;
    this._pendingPatches = new Set();
    this._patchHandle = 0;
    /** Bumped per recompile so a slow compile cannot overwrite a newer one. */
    this._compileToken = 0;

    this._onFrameMessage = this._onFrameMessage.bind(this);
  }

  // =========================================================== lifecycle ===

  /**
   * Creates the engine and restores or seeds a document.
   *
   * @returns {Promise<void>}
   */
  async boot() {
    this.engine = new Engine();

    window.addEventListener('message', this._onFrameMessage);

    if (!this._restoreAutosave()) {
      this.firstRun = true;
      this.applyTemplate(buildTemplate(DEFAULT_TEMPLATE_ID));
    }
    // Seeding a document goes through the same mutations a user would make,
    // which would otherwise leave a stack of undo steps before step one.
    this._safe('clear history', () => this.engine.clearHistory(), null);

    this.state.ready = true;
    this.emit('ready');
    this.invalidate();
  }

  /**
   * Connects the preview iframe owned by the canvas panel.
   *
   * @param {HTMLIFrameElement} frame
   */
  registerPreviewFrame(frame) {
    this.frame = frame;
    this.state.frameReady = false;
    this.invalidate();
  }

  // =============================================================== reads ===

  /** @returns {any | null} the selected node, or null */
  selectedNode() {
    if (!this.state.selection) {
      return null;
    }
    return this.getNode(this.state.selection);
  }

  /**
   * @param {string} id
   * @returns {any | null}
   */
  getNode(id) {
    return this._safe('read node', () => this.engine.getElement(id), null);
  }

  /** @returns {any} page settings */
  getPage() {
    return this._safe('read page', () => this.engine.getPage(), {});
  }

  /** @returns {any} nested layer tree */
  getTree() {
    return this._safe('read tree', () => this.engine.getTree(), null);
  }

  /**
   * @param {string} id
   * @returns {number[] | null} `[x, y, w, h]` in page pixels
   */
  rectOf(id) {
    const rect = this.state.rects[id];
    return Array.isArray(rect) ? rect : null;
  }

  // ============================================================ commands ===

  /**
   * @param {string} kind
   * @param {string | null} parentId
   * @param {number} x
   * @param {number} y
   * @returns {string | null} the new node id
   */
  addElement(kind, parentId, x, y) {
    const id = this._safe(
      `add ${kind}`,
      () => this.engine.addElement(kind, parentId ?? null, x, y),
      null
    );
    if (id) {
      this._syncSelectionFromEngine();
      this.invalidate();
      this.setStatus(`Added ${kind}`);
    }
    return id;
  }

  /**
   * Drops a composite block from `registry/blocks.js` onto the page.
   *
   * @param {string} blockId
   * @param {string | null} parentId
   * @param {number} x
   * @param {number} y
   * @returns {string | null} the block's root id
   */
  addBlock(blockId, parentId, x, y) {
    const block = blockById(blockId);
    if (!block) {
      this.setStatus(`No block called ${blockId}`, 'warn');
      return null;
    }
    const id = this._safe(
      `add ${block.label}`,
      () => this.engine.addBlock(block.build(), parentId ?? null, x, y),
      null
    );
    if (id) {
      this._syncSelectionFromEngine();
      this.invalidate();
      this.setStatus(`Added ${block.label}`);
    }
    return id;
  }

  /** @param {string} id */
  removeElement(id) {
    if (!id || id === 'root') {
      return;
    }
    if (this._safe('delete element', () => this.engine.deleteElement(id), false) !== false) {
      this._syncSelectionFromEngine();
      this.invalidate();
      this.setStatus('Deleted element');
    }
  }

  /**
   * Deletes everything selected, as one undo step.
   *
   * Children are skipped when an ancestor is also going: deleting a container
   * takes its subtree with it, and asking the engine to delete a node that no
   * longer exists is an error the user did not make.
   */
  removeSelection() {
    const ids = this._topLevelSelection();
    if (ids.length === 0) {
      return;
    }
    const removed = this._safe('delete elements', () => this.engine.deleteElements(ids), 0);
    this._syncSelectionFromEngine();
    this.invalidate();
    if (removed) {
      this.setStatus(removed === 1 ? 'Deleted element' : `Deleted ${removed} elements`);
    }
  }

  // =========================================================== clipboard ===

  /**
   * Copies the selection.
   *
   * The clipboard lives in this module, not in the system one. Writing a
   * document fragment to the OS clipboard means either stringifying it as text
   * — which turns "paste" into a race with whatever else the user has copied —
   * or asking for a permission most people decline. In-app copy/paste works
   * every time, and the cost is that it does not cross tabs. Save the project
   * for that.
   *
   * @returns {number} how many top-level elements went on the clipboard
   */
  copySelection() {
    const ids = this._topLevelSelection();
    if (ids.length === 0) {
      return 0;
    }
    this._clipboard = this._safe('copy', () => this.engine.copyElements(ids), null);
    const count = this._clipboard ? this._clipboard.roots.length : 0;
    if (count > 0) {
      this.setStatus(count === 1 ? 'Copied' : `Copied ${count} elements`, 'muted');
    }
    return count;
  }

  /** Copies the selection and deletes it, as one undo step. */
  cutSelection() {
    if (this.copySelection() > 0) {
      this.removeSelection();
      this.setStatus('Cut');
    }
  }

  /**
   * Whether the in-app clipboard holds anything.
   *
   * Surfaces exist that offer Paste conditionally (the context menu greys the
   * item out); `pasteClipboard` itself stays a no-op-with-status rather than
   * an error either way.
   *
   * @returns {boolean}
   */
  hasClipboard() {
    return Boolean(this._clipboard && this._clipboard.roots.length > 0);
  }

  /**
   * Pastes the clipboard into the selected container, or beside the selection.
   *
   * Pasting into whatever is selected is what makes paste useful — copy a card
   * and paste it into three different sections without dragging anything.
   */
  pasteClipboard() {
    if (!this._clipboard || this._clipboard.roots.length === 0) {
      this.setStatus('Nothing to paste', 'muted');
      return;
    }
    // `resolveContainer` in the engine turns "the selected paragraph" into
    // "the container the paragraph is in", so this is always somewhere a node
    // can actually live.
    const target = this.state.selection || 'root';
    const pasted = this._safe(
      'paste',
      () => this.engine.pasteElements(this._clipboard, target),
      []
    );
    if (pasted.length === 0) {
      return;
    }
    // Offset so a paste into the same place is visibly a second copy rather
    // than something that looks like nothing happened.
    for (const id of pasted) {
      const node = this.getNode(id);
      if (node) {
        this.setProperty(id, 'x', String(node.x + 24), { live: true });
        this.setProperty(id, 'y', String(node.y + 24), { live: true });
      }
    }
    this._syncSelectionFromEngine();
    this.invalidate();
    this.setStatus(pasted.length === 1 ? 'Pasted' : `Pasted ${pasted.length} elements`);
  }

  // ========================================================= arrangement ===

  /** Wraps the selection in a container. */
  groupSelection() {
    const ids = this._topLevelSelection();
    if (ids.length < 2) {
      this.setStatus('Select two or more elements to group', 'muted');
      return;
    }
    const groupId = this._safe('group', () => this.engine.groupElements(ids), null);
    if (groupId) {
      this._syncSelectionFromEngine();
      this.invalidate();
      this.setStatus(`Grouped ${ids.length} elements`);
    }
  }

  /** Dissolves the selected containers, leaving their children in place. */
  ungroupSelection() {
    const ids = this.state.selected.filter((id) => {
      const node = this.getNode(id);
      return node && node.children.length > 0;
    });
    if (ids.length === 0) {
      this.setStatus('Select a container to ungroup', 'muted');
      return;
    }
    const freed = this._safe('ungroup', () => this.engine.ungroupElements(ids), []);
    this._syncSelectionFromEngine();
    this.invalidate();
    this.setStatus(freed.length > 0 ? 'Ungrouped' : 'Nothing to ungroup');
  }

  /**
   * Lines the selection up along one edge.
   *
   * @param {'left'|'centre'|'right'|'top'|'middle'|'bottom'} edge
   */
  alignSelection(edge) {
    const ids = this._alignableSelection();
    if (ids.length < 2) {
      this.setStatus('Select two or more elements in the same container', 'muted');
      return;
    }
    this._safe('align', () => this.engine.alignElements(ids, edge), null);
    this.invalidate();
    this.setStatus(`Aligned ${edge}`);
  }

  /**
   * Spreads the selection so the gaps between them are equal.
   *
   * @param {'horizontal'|'vertical'} axis
   */
  distributeSelection(axis) {
    const ids = this._alignableSelection();
    if (ids.length < 3) {
      this.setStatus('Distributing needs three or more elements', 'muted');
      return;
    }
    this._safe('distribute', () => this.engine.distributeElements(ids, axis), null);
    this.invalidate();
    this.setStatus(`Distributed ${axis === 'horizontal' ? 'across' : 'down'}`);
  }

  /**
   * The selection, filtered to what aligning can actually act on.
   *
   * Alignment moves `x`/`y`, so it needs siblings of one *absolutely*
   * positioned parent. In a row or a column the parent decides where things
   * go, and nudging their coordinates would change nothing at all.
   *
   * @returns {string[]}
   */
  _alignableSelection() {
    const ids = this.state.selected.filter((id) => id !== 'root');
    if (ids.length < 2) {
      return [];
    }
    const first = this.getNode(ids[0]);
    if (!first) {
      return [];
    }
    const parentId = first.parent || 'root';
    const parent = this.getNode(parentId);
    if (!parent || parent.layout !== 'absolute') {
      return [];
    }
    return ids.filter((id) => {
      const node = this.getNode(id);
      return node && (node.parent || 'root') === parentId;
    });
  }

  /** Whether the align controls can do anything with the current selection. */
  canAlign() {
    return this._alignableSelection().length >= 2;
  }

  /** Duplicates everything selected, as one undo step. */
  duplicateSelection() {
    const ids = this._topLevelSelection();
    if (ids.length === 0) {
      return;
    }
    const clones = this._safe('duplicate elements', () => this.engine.duplicateElements(ids), []);
    this._syncSelectionFromEngine();
    this.invalidate();
    this.setStatus(
      clones.length === 1 ? 'Duplicated element' : `Duplicated ${clones.length} elements`
    );
  }

  /**
   * The selected ids with any whose ancestor is also selected removed.
   *
   * Delete and duplicate both need this: acting on a container *and* on its
   * child means deleting the child twice, or duplicating it into a copy that
   * already contains it.
   *
   * @returns {string[]}
   */
  _topLevelSelection() {
    const selected = new Set(this.state.selected);
    return this.state.selected.filter((id) => {
      if (id === 'root') {
        return false;
      }
      for (let node = this.getNode(id); node && node.parent; node = this.getNode(node.parent)) {
        if (selected.has(node.parent)) {
          return false;
        }
      }
      return true;
    });
  }

  /** @param {string} id */
  duplicateElement(id) {
    if (!id || id === 'root') {
      return;
    }
    const clone = this._safe('duplicate element', () => this.engine.duplicateElement(id), null);
    if (clone) {
      this._syncSelectionFromEngine();
      this.invalidate();
      this.setStatus('Duplicated element');
    }
  }

  /**
   * @param {string} id
   * @param {string} parentId
   * @param {number} [index] `-1` appends
   * @returns {boolean} whether the move was accepted
   */
  reparent(id, parentId, index = -1) {
    const ok = this._safe(
      'move element',
      () => {
        this.engine.reparentElement(id, parentId, index);
        return true;
      },
      false
    );
    if (ok) {
      this.invalidate();
    }
    return ok;
  }

  /**
   * @param {string} id
   * @param {number} delta `-1` backwards, `1` forwards
   */
  reorder(id, delta) {
    const ok = this._safe(
      'reorder element',
      () => {
        this.engine.reorderElement(id, delta);
        return true;
      },
      false
    );
    if (ok) {
      this.invalidate();
    }
  }

  /**
   * Replaces the selection.
   *
   * @param {string | string[] | null} id
   */
  select(id) {
    this._safe('select', () => this.engine.select(id || null), null);
    this._syncSelectionFromEngine();
  }

  /**
   * Adds an element to the selection, or removes it if it is already in it.
   * This is what Ctrl-click does, on the canvas and in the Layers tree.
   *
   * @param {string} id
   */
  toggleSelection(id) {
    if (!id) {
      return;
    }
    this._safe('select', () => this.engine.toggleSelected(id), null);
    this._syncSelectionFromEngine();
  }

  /**
   * @param {string} id
   * @returns {boolean}
   */
  isSelected(id) {
    return this.state.selected.includes(id);
  }

  /**
   * Selects every sibling of the current selection — Ctrl+A.
   *
   * "Everything on the page" is almost never what you want in a builder; "all
   * the cards in this row" is. With nothing selected it falls back to the
   * page's own top-level children, which is the closest useful reading of
   * select-all here.
   */
  selectSiblings() {
    const node = this.selectedNode();
    const parent = node ? this.getNode(node.parent || 'root') : this.getNode('root');
    if (!parent) {
      return;
    }
    this.select(parent.children);
    this.setStatus(`${parent.children.length} selected`, 'muted');
  }

  /** @param {string | null} id */
  setHover(id) {
    const next = id || null;
    if (this.state.hover === next) {
      return;
    }
    this.state.hover = next;
    this.emit('hover', next);
  }

  /**
   * Applies one property to one node.
   *
   * @param {string} id
   * @param {string} key dotted property path
   * @param {string} value
   * @param {{live?: boolean}} [options] `live` skips the undo stack
   * @returns {boolean} whether the engine accepted the value
   */
  setProperty(id, key, value, options = {}) {
    const ok = this._safe(
      `set ${key}`,
      () => {
        if (options.live) {
          this.engine.updateElementLive(id, key, value);
        } else {
          this.engine.updateElement(id, key, value);
        }
        return true;
      },
      false
    );
    if (!ok) {
      return false;
    }

    if (isStructural(key)) {
      this.invalidate();
    } else if (key === 'content') {
      this._postToFrame({ type: 'text', id, text: value });
      this._queuePatch(id);
      this._markDirty();
    } else {
      this._queuePatch(id);
      this._markDirty();
    }
    this.emit('node', id);
    return true;
  }

  /**
   * Applies one property to **every selected element**.
   *
   * This is what the inspector calls. With one element selected it is exactly
   * `setProperty`; with several, changing the padding changes all of their
   * padding, which is the only reason to have selected several.
   *
   * @param {string} key dotted property path
   * @param {string} value
   * @param {{live?: boolean}} [options]
   * @returns {boolean} whether every element accepted the value
   */
  setSelectedProperty(key, value, options = {}) {
    const ids = this.state.selected;
    if (ids.length === 0) {
      return false;
    }
    // One checkpoint for the batch, then live writes, so a change to five
    // elements is one press of Ctrl+Z rather than five.
    if (!options.live && ids.length > 1) {
      this.beginGesture();
    }
    const batched = ids.length > 1 ? { ...options, live: true } : options;

    let ok = true;
    for (const id of ids) {
      ok = this.setProperty(id, key, value, batched) && ok;
    }
    return ok;
  }

  /**
   * @param {string} key
   * @param {string} value
   * @returns {boolean}
   */
  setPageProperty(key, value) {
    const ok = this._safe(
      `set page ${key}`,
      () => {
        this.engine.updatePage(key, value);
        return true;
      },
      false
    );
    if (ok) {
      this.emit('page');
      // Page geometry drives the frame size, so always recompile.
      this.invalidate();
    }
    return ok;
  }

  /** Opens an undo entry before a multi-step gesture (drag, slider). */
  beginGesture() {
    this._safe('checkpoint', () => this.engine.checkpoint(), null);
  }

  /**
   * Drag fast path — no history, no recompile, one inline patch.
   *
   * @param {string} id
   * @param {number} x
   * @param {number} y
   */
  moveElement(id, x, y) {
    if (
      this._safe(
        'move element',
        () => {
          this.engine.moveElement(id, x, y);
          return true;
        },
        false
      )
    ) {
      this._queuePatch(id);
      this._markDirty();
    }
  }

  /**
   * Resize fast path — no history, no recompile.
   *
   * @param {string} id
   * @param {number} width
   * @param {number} height
   */
  resizeElement(id, width, height) {
    if (
      this._safe(
        'resize element',
        () => {
          this.engine.resizeElement(id, width, height);
          return true;
        },
        false
      )
    ) {
      this._queuePatch(id);
      this._markDirty();
    }
  }

  undo() {
    if (this._safe('undo', () => this.engine.undo(), false)) {
      this._syncSelectionFromEngine();
      this.invalidate();
      this.setStatus('Undo');
    } else {
      this.setStatus('Nothing to undo', 'muted');
    }
  }

  redo() {
    if (this._safe('redo', () => this.engine.redo(), false)) {
      this._syncSelectionFromEngine();
      this.invalidate();
      this.setStatus('Redo');
    } else {
      this.setStatus('Nothing to redo', 'muted');
    }
  }

  /** @param {'design' | 'preview'} mode */
  setMode(mode) {
    if (this.state.mode === mode) {
      return;
    }
    this.state.mode = mode;
    this.emit('mode', mode);
    this.invalidate();
  }

  toggleMode() {
    this.setMode(this.state.mode === 'design' ? 'preview' : 'design');
  }

  /**
   * Shows or hides one sidebar. `main.js` mirrors the state onto the shell's
   * `data-left-sidebar` / `data-right-sidebar` attributes, which is where the
   * grid widths come from.
   *
   * @param {'left' | 'right'} side
   * @param {boolean} open
   */
  setSidebar(side, open) {
    const key = side === 'left' ? 'leftSidebar' : 'rightSidebar';
    if (this.state[key] === open) {
      return;
    }
    this.state[key] = open;
    this.emit('sidebar', side);
  }

  /**
   * Flips one sidebar's visibility.
   *
   * @param {'left' | 'right'} side
   */
  toggleSidebar(side) {
    const key = side === 'left' ? 'leftSidebar' : 'rightSidebar';
    this.setSidebar(side, !this.state[key]);
  }

  /** @param {number} zoom */
  setZoom(zoom) {
    const next = Math.min(4, Math.max(0.1, Number(zoom) || 1));
    if (Math.abs(next - this.state.zoom) < 0.0005) {
      return;
    }
    this.state.zoom = next;
    this.emit('zoom', next);
  }

  /** @param {number} factor multiplied into the current zoom */
  zoomBy(factor) {
    this.setZoom(this.state.zoom * factor);
  }

  /**
   * Nudges the selection. Arrow keys call this.
   *
   * @param {number} dx
   * @param {number} dy
   */
  nudgeSelection(dx, dy) {
    const ids = this.state.selected.filter((id) => id !== 'root');
    if (ids.length === 0) {
      return;
    }
    this.beginGesture();
    for (const id of ids) {
      const node = this.getNode(id);
      if (node) {
        this.moveElement(id, node.x + dx, node.y + dy);
      }
    }
  }

  /**
   * Sends everything selected forwards or backwards among its siblings.
   *
   * @param {number} delta `-1` backwards, `1` forwards
   */
  reorderSelection(delta) {
    const ids = this.state.selected.filter((id) => id !== 'root');
    if (ids.length === 0) {
      return;
    }
    // Moving forwards, the last sibling has to go first or it displaces the
    // ones behind it; moving backwards, the other way round.
    const order = delta > 0 ? [...ids].reverse() : ids;
    for (const id of order) {
      this.reorder(id, delta);
    }
  }

  // ========================================================= persistence ===

  /**
   * Serialises the project. Runs in the compile worker.
   *
   * @returns {Promise<string>} the project as JSON
   */
  async serializeProject() {
    try {
      return await compileService.serialize(this.engine.snapshot());
    } catch (error) {
      this.setStatus(`export project: ${error.message}`, 'danger');
      return '{}';
    }
  }

  /**
   * @param {string} json
   * @returns {boolean}
   */
  loadProject(json) {
    const ok = this._safe(
      'open project',
      () => {
        this.engine.importProject(json);
        return true;
      },
      false
    );
    if (ok) {
      this.select(null);
      this.invalidate();
      this.emit('page');
      this.setStatus('Project loaded');
    }
    return ok;
  }

  resetProject() {
    this._safe('reset project', () => this.engine.resetProject(), null);
    this.select(null);
    this.invalidate();
    this.setStatus('Canvas cleared');
  }

  /**
   * Replaces the document with one of the templates in `js/templates/`.
   *
   * @param {string} id
   * @returns {boolean} whether the id named a template
   */
  applyTemplateById(id) {
    const template = templateById(id);
    if (!template) {
      this.setStatus(`No template called \`${id}\``, 'danger');
      return false;
    }
    this.applyTemplate(template.build());
    this.emit('page');
    this.setStatus(`Applied the ${template.name} template`);
    return true;
  }

  /**
   * Rebuilds the document from a declarative template.
   *
   * The whole replacement is one undo step: `resetProject` takes the
   * checkpoint and every `addElementWith` after it lands inside the same
   * guarded run, so Ctrl+Z puts the previous document back intact.
   *
   * @param {{page?: Record<string, string|number>, nodes: Array<any>}} template
   */
  applyTemplate(template) {
    this._safe(
      'apply template',
      () => {
        applyTo(this.engine, template);
        return true;
      },
      false
    );
    this.select(null);
    this.invalidate();
  }

  /**
   * Compiles a template into a standalone page, without touching the document
   * being edited.
   *
   * Used by the Templates panel for its thumbnails. It builds a throwaway
   * engine rather than a special preview path, so what the thumbnail shows is
   * exactly what applying the template would produce — a preview that can
   * drift from the real thing is worse than no preview.
   *
   * @param {string} id
   * @returns {Promise<string>} the compiled HTML, or `''` if the id is unknown
   */
  async previewTemplate(id) {
    const template = templateById(id);
    if (!template) {
      return '';
    }
    try {
      const scratch = new Engine();
      applyTo(scratch, template.build());
      return await compileService.compile(scratch.snapshot(), { editor: false });
    } catch (error) {
      console.warn(`[devlove] could not preview the ${id} template`, error);
      return '';
    }
  }

  /**
   * Compiles the shippable document. Runs in the compile worker.
   *
   * @returns {Promise<string>} the HTML, or `''` if the compile failed
   */
  async exportHtml() {
    try {
      return await compileService.compile(this.engine.snapshot(), { editor: false });
    } catch (error) {
      this.setStatus(`export html: ${error.message}`, 'danger');
      return '';
    }
  }

  // =========================================================== rendering ===

  /** Schedules a full recompile of the preview document. */
  invalidate() {
    if (this._recompileHandle) {
      return;
    }
    this._recompileHandle = requestAnimationFrame(() => {
      this._recompileHandle = 0;
      this._recompile();
    });
  }

  /**
   * Compiles the document in the worker and hands the result to the frame.
   *
   * Compiles can overlap — a second change can land while the first is still
   * in the worker — so each one carries a token and only the newest result is
   * allowed to reach the frame.
   *
   * @returns {Promise<void>}
   */
  async _recompile() {
    if (!this.engine || !this.frame) {
      return;
    }
    const token = (this._compileToken += 1);
    const editor = this.state.mode !== 'preview';

    let payload;
    try {
      payload = await compileService.compile(this.engine.snapshot(), { editor });
    } catch (error) {
      console.error('[devlove] compile document failed:', error);
      this.setStatus(`compile document: ${error.message}`, 'danger');
      return;
    }
    if (token !== this._compileToken || !this.frame) {
      return;
    }

    this.state.frameReady = false;
    this.frame.srcdoc = payload;
    this.emit('document');
    this._markDirty();
  }

  /**
   * Coalesces per-node inline patches into one frame.
   * @param {string} id
   */
  _queuePatch(id) {
    this._pendingPatches.add(id);
    if (this._patchHandle) {
      return;
    }
    this._patchHandle = requestAnimationFrame(() => {
      this._patchHandle = 0;
      const ids = [...this._pendingPatches];
      this._pendingPatches.clear();
      for (const nodeId of ids) {
        const css = this._safe('compile node css', () => this.engine.nodeCss(nodeId), null);
        if (css !== null) {
          this._postToFrame({ type: 'patch', id: nodeId, css });
        }
      }
    });
  }

  /** @param {Record<string, unknown>} message */
  _postToFrame(message) {
    const target = this.frame && this.frame.contentWindow;
    if (!target) {
      return;
    }
    try {
      target.postMessage({ ...message, target: FRAME_CHANNEL }, '*');
    } catch (error) {
      console.error('[devlove] postMessage to preview frame failed', error);
    }
  }

  /** @param {MessageEvent} event */
  _onFrameMessage(event) {
    const data = event.data;
    if (!data || data.source !== FRAME_CHANNEL) {
      return;
    }
    // The frame runs sandboxed with an opaque origin, so identity is checked
    // by comparing window references rather than by origin string.
    if (!this.frame || event.source !== this.frame.contentWindow) {
      return;
    }

    if (data.type === 'ready') {
      this.state.frameReady = true;
      return;
    }
    if (data.type !== 'rects' || !data.rects) {
      return;
    }

    this.state.rects = data.rects;
    this.state.contentHeight = Number(data.scrollHeight) || 0;
    this._safe('sync rects', () => this.engine.syncRects(data.rects), null);
    this.emit('geometry');
  }

  // ============================================================== helpers ===

  /**
   * Pulls the selection back out of the engine and tells the panels.
   *
   * Every path that changes the selection ends here rather than assigning
   * `state.selection` itself — the engine drops ids whose nodes are gone, so
   * it is the only thing that knows what is really selected after a delete or
   * an undo.
   */
  _syncSelectionFromEngine() {
    const ids = this._safe('read selection', () => this.engine.selectedIds(), []);
    const primary = ids.length > 0 ? ids[ids.length - 1] : null;
    const same =
      primary === this.state.selection &&
      ids.length === this.state.selected.length &&
      ids.every((id, index) => id === this.state.selected[index]);
    if (same) {
      return;
    }
    this.state.selected = ids;
    this.state.selection = primary;
    this.emit('selection', primary);
  }

  /** Schedules an autosave of the current document. */
  _markDirty() {
    if (this._autosaveHandle) {
      clearTimeout(this._autosaveHandle);
    }
    this._autosaveHandle = window.setTimeout(async () => {
      this._autosaveHandle = 0;
      try {
        window.localStorage.setItem(AUTOSAVE_KEY, await this.serializeProject());
      } catch (error) {
        // Quota, or a privacy mode that blocks storage — not fatal.
        console.warn('[devlove] autosave skipped', error);
      }
    }, AUTOSAVE_DELAY);
  }

  /** @returns {boolean} whether a saved document was restored */
  _restoreAutosave() {
    let saved = null;
    try {
      saved = window.localStorage.getItem(AUTOSAVE_KEY);
    } catch (error) {
      console.warn('[devlove] could not read autosave', error);
      return false;
    }
    if (!saved) {
      return false;
    }
    const ok = this._safe(
      'restore autosave',
      () => {
        this.engine.importProject(saved);
        return true;
      },
      false
    );
    if (ok) {
      this.setStatus('Restored your last session');
    }
    return ok;
  }

  /**
   * Runs an engine call, converting a thrown error into a status message.
   *
   * The engine validates everything it is given and throws messages written
   * for a human. Routing them here means a malformed input can never take the
   * editor down — it just says why it refused.
   *
   * @template T
   * @param {string} label
   * @param {() => T} action
   * @param {T} fallback
   * @returns {T}
   */
  _safe(label, action, fallback) {
    try {
      return action();
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      console.error(`[devlove] ${label} failed:`, error);
      this.setStatus(`${label}: ${detail}`, 'danger');
      return fallback;
    }
  }

  /**
   * @param {string} text
   * @param {'info' | 'muted' | 'danger'} [tone]
   */
  setStatus(text, tone = 'info') {
    this.emit('status', { text, tone });
  }
}

/** The single app instance every panel imports. */
export const app = new DevloveApp();
