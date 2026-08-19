/**
 * Application controller.
 *
 * This is the only module that talks to the WASM engine. Panels read state
 * from `app.state`, call command methods, and re-render when the topics they
 * subscribed to fire. Keeping the bridge in one place is what makes the UI
 * replaceable and the engine testable.
 *
 * Topics
 * ------
 *   ready      engine instantiated, first document compiled
 *   document   tree structure changed — panels should re-read everything
 *   node       one node's properties changed
 *   selection  selected id changed
 *   geometry   the preview frame reported new measurements
 *   mode       design/preview switch
 *   zoom       canvas zoom changed
 *   page       page settings changed
 *   status     a message for the status bar
 *
 * @module core/app
 */

import { Emitter } from './emitter.js';
import { createEngine } from './wasm-bridge.js';
import { STARTER_TEMPLATE } from './starter-template.js';

/** postMessage channel shared with the runtime compiled into the frame. */
const FRAME_CHANNEL = 'tb-frame';

/** localStorage key for the autosaved document. */
const AUTOSAVE_KEY = 'forge.autosave.v1';

/** Debounce window for autosaving, in milliseconds. */
const AUTOSAVE_DELAY = 700;

/**
 * Property keys whose effect cannot be expressed as a single inline style
 * patch, so they force a full document recompile.
 * @type {ReadonlySet<string>}
 */
const STRUCTURAL_KEYS = new Set([
  'layout',
  'hidden',
  'autoHeight',
  'src',
  'href',
  'placeholder',
]);

export class ForgeApp extends Emitter {
  constructor() {
    super();

    /** @type {any} the `DesignerEngine` instance living in WASM memory */
    this.engine = null;

    /** @type {HTMLIFrameElement | null} */
    this.frame = null;

    this.state = {
      ready: false,
      mode: /** @type {'design' | 'preview'} */ ('design'),
      zoom: 1,
      selection: /** @type {string | null} */ (null),
      hover: /** @type {string | null} */ (null),
      /** measured boxes reported by the frame: id -> [x, y, w, h] */
      rects: /** @type {Record<string, number[]>} */ (Object.create(null)),
      contentHeight: 0,
      frameReady: false,
    };

    this._recompileHandle = 0;
    this._autosaveHandle = 0;
    this._pendingPatches = new Set();
    this._patchHandle = 0;

    this._onFrameMessage = this._onFrameMessage.bind(this);
  }

  // =========================================================== lifecycle ===

  /**
   * Instantiates the engine and restores or seeds a document.
   *
   * @returns {Promise<void>}
   */
  async boot() {
    const { engine } = await createEngine();
    this.engine = engine;

    window.addEventListener('message', this._onFrameMessage);

    if (!this._restoreAutosave()) {
      this.applyTemplate(STARTER_TEMPLATE);
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

  /** @returns {any | null} parsed JSON for the selected node */
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
    return this._safe('read node', () => JSON.parse(this.engine.getElement(id)), null);
  }

  /** @returns {any} parsed page settings */
  getPage() {
    return this._safe('read page', () => JSON.parse(this.engine.getPage()), {});
  }

  /** @returns {any} nested layer tree */
  getTree() {
    return this._safe('read tree', () => JSON.parse(this.engine.getTree()), null);
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
      () => this.engine.addElement(kind, parentId ?? undefined, x, y),
      null
    );
    if (id) {
      this.state.selection = id;
      this.emit('selection', id);
      this.invalidate();
      this.setStatus(`Added ${kind}`);
    }
    return id;
  }

  /** @param {string} id */
  removeElement(id) {
    if (!id || id === 'root') {
      return;
    }
    if (this._safe('delete element', () => this.engine.deleteElement(id), false) !== false) {
      if (this.state.selection === id) {
        this.state.selection = null;
        this.emit('selection', null);
      }
      this.invalidate();
      this.setStatus('Deleted element');
    }
  }

  /** @param {string} id */
  duplicateElement(id) {
    if (!id || id === 'root') {
      return;
    }
    const clone = this._safe('duplicate element', () => this.engine.duplicateElement(id), null);
    if (clone) {
      this.state.selection = clone;
      this.emit('selection', clone);
      this.invalidate();
      this.setStatus('Duplicated element');
    }
  }

  /**
   * @param {string} id
   * @param {string} parentId
   * @param {number} [index] `-1` appends
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

  /** @param {string | null} id */
  select(id) {
    const next = id || null;
    if (this.state.selection === next) {
      return;
    }
    this.state.selection = next;
    this._safe('select', () => this.engine.select(next ?? undefined), null);
    this.emit('selection', next);
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

    if (STRUCTURAL_KEYS.has(key)) {
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
   * @param {string} key
   * @param {string} value
   * @param {{live?: boolean}} [options]
   */
  setPageProperty(key, value, options = {}) {
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
      if (options.live) {
        // Nothing extra: the recompile already reflects the value.
      }
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
    if (this._safe('move element', () => { this.engine.moveElement(id, x, y); return true; }, false)) {
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
      this._safe('resize element', () => { this.engine.resizeElement(id, width, height); return true; }, false)
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
    const id = this.state.selection;
    if (!id || id === 'root') {
      return;
    }
    const node = this.getNode(id);
    if (!node) {
      return;
    }
    this.beginGesture();
    this.moveElement(id, node.x + dx, node.y + dy);
  }

  // ========================================================= persistence ===

  /** @returns {string} the project as JSON */
  serializeProject() {
    return this._safe('export project', () => this.engine.exportProject(), '{}');
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
   * Rebuilds the document from a declarative template.
   *
   * @param {{page?: Record<string, string|number>, nodes: Array<any>}} template
   */
  applyTemplate(template) {
    this._safe(
      'apply template',
      () => {
        this.engine.resetProject();
        for (const [key, value] of Object.entries(template.page || {})) {
          this.engine.updatePage(key, String(value));
        }
        /** @type {Record<string, string>} */
        const aliases = Object.create(null);
        for (const spec of template.nodes) {
          const parent = spec.parent ? aliases[spec.parent] || spec.parent : 'root';
          const id = this.engine.addElementWith(
            spec.kind,
            parent,
            Number(spec.x) || 0,
            Number(spec.y) || 0,
            JSON.stringify(spec.props || {})
          );
          if (spec.ref) {
            aliases[spec.ref] = id;
          }
        }
        return true;
      },
      false
    );
    this.select(null);
    this.invalidate();
  }

  /** @returns {string} the shippable HTML document */
  exportHtml() {
    return this._safe('export html', () => this.engine.compileExport(), '');
  }

  // ============================================================ rendering ===

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

  _recompile() {
    if (!this.engine || !this.frame) {
      return;
    }
    const payload = this._safe(
      'compile document',
      () =>
        this.state.mode === 'preview'
          ? this.engine.compileExport()
          : this.engine.compilePreview(),
      null
    );
    if (payload === null) {
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
      console.error('[app] postMessage to preview frame failed', error);
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
    this._safe('sync rects', () => this.engine.syncRects(JSON.stringify(data.rects)), null);
    this.emit('geometry');
  }

  // ============================================================== helpers ===

  _syncSelectionFromEngine() {
    const current = this._safe('read selection', () => this.engine.selection(), undefined);
    const next = current === undefined || current === null ? null : current;
    if (next !== this.state.selection) {
      this.state.selection = next;
      this.emit('selection', next);
    }
  }

  /** Schedules an autosave of the current document. */
  _markDirty() {
    if (this._autosaveHandle) {
      clearTimeout(this._autosaveHandle);
    }
    this._autosaveHandle = window.setTimeout(() => {
      this._autosaveHandle = 0;
      try {
        window.localStorage.setItem(AUTOSAVE_KEY, this.serializeProject());
      } catch (error) {
        // Quota or a privacy mode that blocks storage — not fatal.
        console.warn('[app] autosave skipped', error);
      }
    }, AUTOSAVE_DELAY);
  }

  /** @returns {boolean} whether a saved document was restored */
  _restoreAutosave() {
    let saved = null;
    try {
      saved = window.localStorage.getItem(AUTOSAVE_KEY);
    } catch (error) {
      console.warn('[app] could not read autosave', error);
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
   * Runs an engine call, converting a thrown `JsValue` into a status message.
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
      const detail = typeof error === 'string' ? error : error?.message || String(error);
      console.error(`[app] ${label} failed:`, error);
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
export const app = new ForgeApp();
