/**
 * The stage: canvas toolbar, sandboxed preview frame, and the interaction
 * overlay.
 *
 * Nothing here knows what an element *is*. The overlay converts pointer
 * positions into page coordinates, asks the engine what lives there, and
 * forwards the resulting intent (select / move / resize / drop) back to it.
 * The frame itself is never touched directly — it is redrawn from compiled
 * output, or patched one declaration block at a time during a gesture.
 *
 * @module ui/components/dl-canvas
 */

import { PanelElement } from '../panel-element.js';
import { icon } from '../icons.js';
import { app } from '../../core/app.js';
import { MAX_EMBED_BYTES, formatSize, readAsDataUrl } from '../../util/files.js';

/** Pointer travel, in page pixels, before a press becomes a drag. */
const DRAG_THRESHOLD = 3;

/**
 * How far outside a flow container the pointer must travel before a drag stops
 * meaning "reorder" and starts meaning "take it out of here".
 *
 * Without an escape, a child of a Stack or Grid is trapped: its own `x`/`y` are
 * never compiled, so the only gesture its parent understands is a reorder, and
 * there is no way to drag a button out of a row and put it somewhere else. The
 * margin keeps a normal reorder from becoming an escape when the pointer
 * wanders a few pixels past the edge of a snug row.
 */
const FLOW_ESCAPE_MARGIN = 16;

/** Snap radius in screen pixels; divided by zoom before use. */
const SNAP_RADIUS = 6;

/** Element kinds whose text can be edited in place. */
const EDITABLE_KINDS = new Set(['heading', 'text', 'button', 'link']);

/** Handle directions, in render order. */
const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

/** The non-breaking space contenteditable inserts for runs of spaces. */
const NBSP = '\u00A0';

/**
 * Canvas width presets. Adding a breakpoint is one entry here.
 * @type {ReadonlyArray<{id: string, icon: string, label: string, width: number}>}
 */
export const DEVICES = Object.freeze([
  { id: 'phone', icon: 'phone', label: 'Phone', width: 390 },
  { id: 'tablet', icon: 'tablet', label: 'Tablet', width: 768 },
  { id: 'laptop', icon: 'laptop', label: 'Laptop', width: 1280 },
  { id: 'desktop', icon: 'desktop', label: 'Desktop', width: 1512 },
]);

export class DlCanvas extends PanelElement {
  static styles = `
    .root {
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 0;
    }

    /* ------------------------------------------------------- canvas toolbar */
    .toolbar {
      display: flex;
      align-items: center;
      gap: 10px;
      height: var(--bar-canvas-h);
      flex: 0 0 auto;
      padding: 0 10px;
      border-bottom: 1px solid var(--line);
      background: var(--surface-chrome);
    }
    :host([data-mode="preview"]) .toolbar { display: none; }

    /* A page tab, not a chip: this is where multi-page support will land, and
       the shape should already say so. */
    .page-tabs { display: flex; align-items: stretch; height: 100%; flex: 0 0 auto; }
    .page-tab {
      position: relative;
      display: inline-flex;
      align-items: center;
      gap: 7px;
      height: 100%;
      padding: 0 14px;
      color: var(--ink-strong);
      font-size: var(--text-md);
      max-width: 210px;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
      background: var(--surface-panel);
    }
    .page-tab::after {
      content: "";
      position: absolute;
      left: 0; right: 0; top: 0;
      height: 1px;
      background: var(--ink-strong);
    }
    .page-tab svg { color: var(--ink-dim); }

    .toolbar__group { display: flex; align-items: center; gap: 1px; }
    .toolbar__spacer { flex: 1 1 auto; }
    .toolbar__sep { width: 1px; height: 16px; background: var(--line); }

    .devices {
      display: flex;
      gap: 1px;
      padding: 1px;
      border: 1px solid var(--line-strong);
      background: var(--surface-sunken);
    }
    .devices button {
      display: grid;
      place-items: center;
      width: 26px;
      height: 20px;
      color: var(--ink-faint);
      transition: color 90ms var(--ease), background 90ms var(--ease);
    }
    .devices button:hover { color: var(--ink); background: var(--surface-hover); }
    .devices button[aria-pressed="true"] { color: var(--ink-strong); background: var(--surface-raised); }

    .zoom { display: flex; align-items: center; gap: 1px; }
    .zoom__value {
      min-width: 46px;
      height: 22px;
      color: var(--ink);
      font-size: var(--text-sm);
      font-variant-numeric: tabular-nums;
      text-align: center;
    }
    .zoom__value:hover { background: var(--surface-hover); }
    .zoom .icon-btn { width: 22px; height: 22px; }

    /* -------------------------------------------------------------- stage */
    .viewport {
      position: relative;
      flex: 1 1 auto;
      min-height: 0;
      overflow: auto;
      background-color: var(--canvas-backdrop);
      background-image: radial-gradient(var(--canvas-grid) 1px, transparent 1px);
      background-size: 16px 16px;
      background-position: -1px -1px;
    }

    .pad {
      display: flex;
      align-items: flex-start;
      justify-content: center;
      min-width: min-content;
      min-height: 100%;
      padding: 48px 40px 120px;
    }

    /* The checkerboard shows through wherever the page itself is transparent,
       the same signal an image editor gives. */
    .page-box {
      position: relative;
      flex: 0 0 auto;
      background-image:
        linear-gradient(45deg, #34363d 25%, transparent 25%, transparent 75%, #34363d 75%),
        linear-gradient(45deg, #34363d 25%, transparent 25%, transparent 75%, #34363d 75%);
      background-size: 16px 16px;
      background-position: 0 0, 8px 8px;
      box-shadow: var(--canvas-page-shadow);
    }

    /* Floating, editable width readout pinned above the page. Keeping it here
       rather than in the toolbar puts the number next to the thing it
       describes, and keeps the toolbar down to actions. */
    .page-meta {
      position: absolute;
      right: 0;
      top: -28px;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      color: var(--ink-dim);
      font-size: var(--text-sm);
      user-select: none;
    }
    .page-meta input {
      width: 46px;
      height: 20px;
      padding: 0 4px;
      border: 1px solid transparent;
      border-radius: var(--radius-sm);
      background: transparent;
      color: var(--ink);
      font: inherit;
      font-variant-numeric: tabular-nums;
      text-align: right;
      -moz-appearance: textfield;
    }
    .page-meta input::-webkit-outer-spin-button,
    .page-meta input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
    .page-meta input:hover { border-color: var(--line); background: var(--surface-input); }
    .page-meta input:focus {
      outline: none;
      border-color: var(--accent);
      background: var(--surface-input);
    }
    :host([data-mode="preview"]) .page-meta { display: none; }

    .scaler {
      position: absolute;
      top: 0;
      left: 0;
      transform-origin: 0 0;
    }

    .frame {
      display: block;
      width: 100%;
      height: 100%;
      border: 0;
      background: #fff;
    }
    :host([data-mode="design"]) .frame { pointer-events: none; }

    .overlay {
      position: absolute;
      inset: 0;
      touch-action: none;
    }
    :host([data-mode="preview"]) .overlay { display: none; }
    .overlay[data-gesture="move"] { cursor: grabbing; }

    .marker {
      position: absolute;
      pointer-events: none;
      display: none;
      box-sizing: border-box;
    }
    .marker[data-on="true"] { display: block; }

    .marker--hover { outline: 1px solid var(--marker-hover); }

    /* Where a flow child will land. A line between siblings, not a box around
       one, because in a row or a column the question is "before or after",
       not "inside what". */
    .insert {
      position: absolute;
      display: none;
      background: var(--marker-select);
      pointer-events: none;
    }
    .insert[data-on="true"] { display: block; }
    .marker--drop {
      outline: 1px solid var(--marker-drop);
      background: rgba(137, 209, 133, 0.1);
    }
    .marker--select { outline: 1.5px solid var(--marker-select); }

    /* With more than one element selected there is no single box to resize,
       so the handles go away. Group resize is a different feature with its own
       rules about which edge scales what, and half-implementing it here would
       be worse than not offering it. */
    .marker--select[data-multi="true"] .handle { display: none; }

    /* Outlines for the selected elements that are not the primary one. Thinner
       and unhandled: they follow the primary, they are not the thing being
       manipulated. */
    .others { position: absolute; inset: 0; pointer-events: none; }
    .others__box {
      position: absolute;
      box-sizing: border-box;
      outline: 1px solid var(--marker-select);
      background: rgba(0, 120, 212, 0.06);
    }

    /* Square handles, matching every other corner in the tool. They are the
       one place a filled accent is still right: a resize handle has to be
       findable against arbitrary page content underneath it. */
    .handle {
      position: absolute;
      width: 8px;
      height: 8px;
      background: #fff;
      border: 1px solid var(--marker-select);
      box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.25);
      pointer-events: auto;
    }
    .handle[data-h="nw"] { top: -5.5px; left: -5.5px; cursor: nwse-resize; }
    .handle[data-h="n"]  { top: -5.5px; left: 50%; margin-left: -5px; cursor: ns-resize; }
    .handle[data-h="ne"] { top: -5.5px; right: -5.5px; cursor: nesw-resize; }
    .handle[data-h="e"]  { top: 50%; right: -5.5px; margin-top: -5px; cursor: ew-resize; }
    .handle[data-h="se"] { bottom: -5.5px; right: -5.5px; cursor: nwse-resize; }
    .handle[data-h="s"]  { bottom: -5.5px; left: 50%; margin-left: -5px; cursor: ns-resize; }
    .handle[data-h="sw"] { bottom: -5.5px; left: -5.5px; cursor: nesw-resize; }
    .handle[data-h="w"]  { top: 50%; left: -5.5px; margin-top: -5px; cursor: ew-resize; }

    .tag {
      position: absolute;
      display: none;
      align-items: center;
      height: 17px;
      padding: 0 6px;
      background: var(--marker-select);
      color: #fff;
      font-size: 10px;
      line-height: 17px;
      white-space: nowrap;
      pointer-events: none;
      transform: translate(0, -100%);
    }
    .tag[data-on="true"] { display: flex; }

    .badge {
      position: absolute;
      display: none;
      padding: 2px 6px;
      background: var(--marker-select);
      color: #fff;
      font-family: var(--font-mono);
      font-size: 10px;
      line-height: 14px;
      white-space: nowrap;
      pointer-events: none;
      transform: translate(0, 6px);
    }
    .badge[data-on="true"] { display: block; }

    .guide {
      position: absolute;
      display: none;
      background: var(--marker-guide);
      pointer-events: none;
    }
    .guide[data-on="true"] { display: block; }
    .guide--v { width: 1px; top: 0; bottom: 0; }
    .guide--h { height: 1px; left: 0; right: 0; }

    .text-editor {
      position: absolute;
      display: none;
      margin: 0;
      padding: 0;
      border: 1px solid var(--marker-select);
      outline: none;
      background: rgba(255, 255, 255, 0.98);
      color: #0f1729;
      white-space: pre-wrap;
      overflow: hidden;
      box-shadow: 0 0 0 1px var(--marker-select);
      pointer-events: auto;
    }
    .text-editor[data-on="true"] { display: block; }

    .exit-preview {
      position: absolute;
      right: 16px;
      bottom: 16px;
      display: none;
      gap: 6px;
      z-index: 3;
    }
    :host([data-mode="preview"]) .exit-preview { display: inline-flex; }
  `;

  template() {
    return `
      <div class="toolbar">
        <span class="page-tabs">
          <span class="page-tab">${icon('frame', 13)}<span id="pageName">Page</span></span>
        </span>

        <span class="toolbar__sep"></span>

        <span class="toolbar__group">
          <button class="icon-btn" data-action="undo" title="Undo (Ctrl+Z)" aria-label="Undo">${icon('undo', 15)}</button>
          <button class="icon-btn" data-action="redo" title="Redo (Ctrl+Shift+Z)" aria-label="Redo">${icon('redo', 15)}</button>
        </span>

        <span class="toolbar__spacer"></span>

        <span class="devices" role="group" aria-label="Canvas width">
          ${DEVICES.map(
            (device) => `
              <button data-device="${device.id}" aria-pressed="false"
                      title="${device.label} — ${device.width}px" aria-label="${device.label}">
                ${icon(device.icon, 14)}
              </button>`
          ).join('')}
        </span>

        <span class="toolbar__spacer"></span>

        <span class="zoom">
          <button class="icon-btn" data-zoom="out" title="Zoom out (Ctrl+-)" aria-label="Zoom out">${icon('minus', 14)}</button>
          <button class="zoom__value" id="zoomValue" title="Reset to 100%">100%</button>
          <button class="icon-btn" data-zoom="in" title="Zoom in (Ctrl++)" aria-label="Zoom in">${icon('plus', 14)}</button>
          <button class="icon-btn" data-zoom="fit" title="Fit page in view" aria-label="Fit page">${icon('frame', 14)}</button>
        </span>
      </div>

      <div class="viewport scroll" id="viewport">
        <div class="pad">
          <div class="page-box" id="pageBox">
            <span class="page-meta">
              ${icon('desktop', 13)}
              <input id="widthInput" type="number" min="240" max="6000" step="1"
                     aria-label="Canvas width in pixels" /><span>px</span>
            </span>
            <div class="scaler" id="scaler">
              <iframe class="frame" id="frame" title="Page preview"
                      sandbox="allow-scripts allow-forms allow-popups allow-modals"></iframe>
              <div class="overlay" id="overlay">
                <div class="marker marker--drop" id="dropMarker"></div>
                <div class="marker marker--hover" id="hoverMarker"></div>
                <div class="others" id="selectOthers"></div>
                <div class="insert" id="insertLine"></div>
                <div class="marker marker--select" id="selectMarker">
                  ${HANDLES.map((h) => `<span class="handle" data-h="${h}"></span>`).join('')}
                </div>
                <div class="tag" id="selectTag"></div>
                <div class="badge" id="sizeBadge"></div>
                <div class="guide guide--v" id="guideV"></div>
                <div class="guide guide--h" id="guideH"></div>
                <div class="text-editor" id="textEditor" contenteditable="true" spellcheck="false"></div>
              </div>
            </div>
          </div>
        </div>

        <button class="btn btn--primary exit-preview" data-action="exit-preview">
          ${icon('cursor', 14)}<span>Back to design</span>
        </button>
      </div>
    `;
  }

  mounted() {
    this.frame = /** @type {HTMLIFrameElement} */ (this.$('#frame'));
    this.overlay = /** @type {HTMLElement} */ (this.$('#overlay'));
    this.scaler = /** @type {HTMLElement} */ (this.$('#scaler'));
    this.pageBox = /** @type {HTMLElement} */ (this.$('#pageBox'));
    this.viewport = /** @type {HTMLElement} */ (this.$('#viewport'));
    this.textEditor = /** @type {HTMLElement} */ (this.$('#textEditor'));

    /** @type {null | Record<string, any>} */
    this._gesture = null;
    /** id currently open in the inline text editor @type {string | null} */
    this._editing = null;
    this._pageWidth = 1280;
    this._pageMinHeight = 860;
    this._pageTitle = 'Page';
    /** guards the one-shot zoom-to-fit on first paint @type {boolean} */
    this._fitted = false;

    this.setAttribute('data-mode', app.state.mode);
    app.registerPreviewFrame(this.frame);

    this._wireToolbar();
    this._wirePointer();
    this._wireExternalDrag();
    this._wireTextEditor();

    /**
     * Rects predicted by the gesture in progress, keyed by node id.
     * `null` when nothing is being dragged, which is when the frame's own
     * measurements are the truth.
     * @type {Record<string, number[]> | null}
     */
    this._predicted = null;

    this.listen(['ready', 'document', 'page'], () => {
      this._readPage();
      this._layout();
      this._syncToolbar();
      this._drawMarkers();
    });
    this.listen('geometry', () => {
      this._layout();
      this._fitOnFirstPaint();
      this._drawMarkers();
    });
    this.listen(['selection', 'hover', 'node'], () => this._drawMarkers());
    this.listen('zoom', () => {
      this._layout();
      this._syncZoomLabel();
    });
    this.listen('mode', (mode) => {
      this.setAttribute('data-mode', mode);
      this._closeTextEditor(false);
    });

    // Panels ask for an element to be brought into view after selecting it —
    // the canvas is the only thing that knows where the viewport is.
    this.listen('reveal:request', (id) => this._reveal(id));

    this._readPage();
    this._layout();
    this._syncToolbar();
  }

  // ============================================================== layout ===

  _readPage() {
    if (!app.engine) {
      return;
    }
    const page = app.getPage();
    this._pageWidth = Number(page.width) || 1280;
    this._pageMinHeight = Number(page.minHeight) || 860;
    this._pageTitle = page.title || 'Page';
  }

  /** Sizes the frame to the content and applies the zoom transform. */
  _layout() {
    const zoom = app.state.zoom;
    const height = Math.max(this._pageMinHeight || 860, this._measuredHeight());

    this.scaler.style.width = `${this._pageWidth}px`;
    this.scaler.style.height = `${height}px`;
    this.scaler.style.transform = `scale(${zoom})`;
    this.pageBox.style.width = `${this._pageWidth * zoom}px`;
    this.pageBox.style.height = `${height * zoom}px`;
  }

  /**
   * Tallest measured content edge. Derived from the frame's own report so the
   * page can grow *and* shrink as elements move.
   *
   * @returns {number}
   */
  _measuredHeight() {
    let bottom = 0;
    for (const rect of Object.values(app.state.rects)) {
      if (Array.isArray(rect) && rect.length >= 4) {
        bottom = Math.max(bottom, rect[1] + rect[3]);
      }
    }
    return Math.ceil(bottom);
  }

  // ============================================================= toolbar ===

  _wireToolbar() {
    this.bind(this.root, 'click', (event) => {
      const target = /** @type {HTMLElement} */ (event.target);

      const device = target.closest('[data-device]');
      if (device) {
        const preset = DEVICES.find((entry) => entry.id === device.getAttribute('data-device'));
        if (preset) {
          app.setPageProperty('width', String(preset.width));
        }
        return;
      }

      const zoom = target.closest('[data-zoom]');
      if (zoom) {
        const action = zoom.getAttribute('data-zoom');
        if (action === 'in') {
          app.zoomBy(1.2);
        } else if (action === 'out') {
          app.zoomBy(1 / 1.2);
        } else {
          this.zoomToFit();
        }
        return;
      }

      if (target.closest('#zoomValue')) {
        app.setZoom(1);
        return;
      }

      const action = target.closest('[data-action]');
      if (!action) {
        return;
      }
      switch (action.getAttribute('data-action')) {
        case 'undo':
          app.undo();
          break;
        case 'redo':
          app.redo();
          break;
        case 'exit-preview':
          app.setMode('design');
          break;
        default:
          break;
      }
    });

    const widthInput = /** @type {HTMLInputElement} */ (this.$('#widthInput'));
    this.bind(widthInput, 'change', () => app.setPageProperty('width', widthInput.value));

    // Ctrl/⌘ + wheel zooms; plain wheel keeps the native scroll behaviour.
    this.bind(
      this.viewport,
      'wheel',
      (event) => {
        const wheelEvent = /** @type {WheelEvent} */ (event);
        if (!wheelEvent.ctrlKey && !wheelEvent.metaKey) {
          return;
        }
        wheelEvent.preventDefault();
        app.zoomBy(wheelEvent.deltaY < 0 ? 1.1 : 1 / 1.1);
      },
      { passive: false }
    );

    this._syncZoomLabel();
  }

  _syncToolbar() {
    const name = this.$('#pageName');
    if (name) {
      name.textContent = this._pageTitle;
    }

    const widthInput = /** @type {HTMLInputElement} */ (this.$('#widthInput'));
    if (widthInput && this.shadowRoot.activeElement !== widthInput) {
      widthInput.value = String(Math.round(this._pageWidth));
    }

    for (const button of this.$$('[data-device]')) {
      const preset = DEVICES.find((entry) => entry.id === button.getAttribute('data-device'));
      button.setAttribute(
        'aria-pressed',
        String(Boolean(preset) && preset.width === this._pageWidth)
      );
    }

    if (app.engine) {
      const undo = /** @type {HTMLButtonElement | null} */ (this.$('[data-action="undo"]'));
      const redo = /** @type {HTMLButtonElement | null} */ (this.$('[data-action="redo"]'));
      if (undo) {
        undo.disabled = !app.engine.canUndo();
      }
      if (redo) {
        redo.disabled = !app.engine.canRedo();
      }
    }
  }

  /**
   * Zooms out once, on the first real measurement, if the page is wider than
   * the stage. Opening to a page that runs off the edge reads as broken.
   */
  _fitOnFirstPaint() {
    if (this._fitted || this.viewport.clientWidth === 0) {
      return;
    }
    this._fitted = true;
    if (this._pageWidth * app.state.zoom > this.viewport.clientWidth - 80) {
      this.zoomToFit();
    }
  }

  /** Scales the page so it fits the visible viewport. */
  zoomToFit() {
    const available = this.viewport.clientWidth - 96;
    if (available <= 0 || !this._pageWidth) {
      return;
    }
    app.setZoom(Math.min(1, available / this._pageWidth));
  }

  /**
   * Scrolls the viewport until an element sits in the middle of it.
   *
   * The reverse of {@link _toPagePoint}: a page-space rect becomes the client
   * position it currently has on screen, and the viewport scrolls by the
   * distance between that and its own centre. Elements without a measured rect
   * (still compiling, or hidden from the frame) are left alone — selecting
   * them already did the visible work it can.
   *
   * @param {string} id
   */
  _reveal(id) {
    if (app.state.mode !== 'design') {
      return;
    }
    const rect = app.rectOf(id);
    if (!rect) {
      return;
    }
    const zoom = app.state.zoom || 1;
    const scalerBox = this.scaler.getBoundingClientRect();
    const viewBox = this.viewport.getBoundingClientRect();
    const centreX = scalerBox.left + (rect[0] + rect[2] / 2) * zoom;
    const centreY = scalerBox.top + (rect[1] + rect[3] / 2) * zoom;

    this.viewport.scrollTo({
      left: this.viewport.scrollLeft + (centreX - (viewBox.left + this.viewport.clientWidth / 2)),
      top: this.viewport.scrollTop + (centreY - (viewBox.top + this.viewport.clientHeight / 2)),
      behavior: 'smooth',
    });
  }

  _syncZoomLabel() {
    const label = this.$('#zoomValue');
    if (label) {
      label.textContent = `${Math.round(app.state.zoom * 100)}%`;
    }
  }

  // ============================================================= pointer ===

  _wirePointer() {
    this.bind(this.overlay, 'pointerdown', (e) =>
      this._onPointerDown(/** @type {PointerEvent} */ (e))
    );
    this.bind(this.overlay, 'pointermove', (e) =>
      this._onPointerMove(/** @type {PointerEvent} */ (e))
    );
    this.bind(this.overlay, 'pointerup', (e) => this._onPointerUp(/** @type {PointerEvent} */ (e)));
    this.bind(this.overlay, 'pointercancel', () => this._endGesture());
    this.bind(this.overlay, 'pointerleave', () => {
      if (!this._gesture) {
        app.setHover(null);
      }
    });
    this.bind(this.overlay, 'dblclick', (e) => this._onDoubleClick(/** @type {MouseEvent} */ (e)));
    this.bind(this.overlay, 'contextmenu', (e) =>
      this._onContextMenu(/** @type {MouseEvent} */ (e))
    );

    // Dropping an image file from the desktop is the one place this codebase
    // uses the native drag-and-drop API. Element dragging deliberately does
    // not (see CONTRIBUTING) — but a file coming from outside the browser has
    // no other event to arrive on, so there is no alternative to weigh.
    this.bind(this.overlay, 'dragover', (e) => this._onFileDragOver(/** @type {DragEvent} */ (e)));
    this.bind(this.overlay, 'dragleave', () => this._setMarker('#dropMarker', null));
    this.bind(this.overlay, 'drop', (e) => this._onFileDrop(/** @type {DragEvent} */ (e)));
  }

  // ======================================================== context menu ===

  /**
   * Right-click.
   *
   * The menu's contents are decided here, from what the pointer actually hit,
   * and handed to `dl-context-menu` as data. The hit becomes the selection
   * first, so the menu always acts on the thing under the cursor — right-click
   * is also a way of saying "this one".
   *
   * @param {MouseEvent} event
   */
  _onContextMenu(event) {
    // Always swallowed: the browser's own menu over a design canvas is never
    // what anyone wants, even mid-boot.
    event.preventDefault();
    if (app.state.mode !== 'design' || !app.engine) {
      return;
    }
    if (this._editing) {
      this._closeTextEditor(true);
    }

    const point = this._toPagePoint(event);
    const hit = app.engine.hitTest(point.x, point.y);

    // A hit already inside the selection keeps the selection (right-click
    // works on the group); anything else is replaced by what was clicked.
    if (hit && !app.isSelected(hit)) {
      app.select(hit);
    }

    const node = hit ? app.getNode(hit) : null;
    const items = this._contextMenuItems(hit, node);
    if (items.length === 0) {
      return;
    }
    app.emit('context:open', { x: event.clientX, y: event.clientY, items });
  }

  /**
   * The menu for one right-click, built from what it hit.
   *
   * Every entry calls the same public method the keyboard shortcut or the
   * inspector button does — the menu is another surface onto the app, never a
   * second implementation of it.
   *
   * @param {string | null} hit the element under the pointer, if any
   * @param {any | null} node its document node
   * @returns {any[]} items for `dl-context-menu`, possibly empty
   */
  _contextMenuItems(hit, node) {
    if (!hit || !node) {
      // Page level: actions on the document, not on a thing on it.
      return [
        {
          label: 'Paste',
          keys: 'ctrl+v',
          run: () => app.pasteClipboard(),
          disabled: !app.hasClipboard(),
        },
        { label: 'Select all', keys: 'ctrl+a', run: () => app.selectSiblings() },
        '---',
        { label: 'Undo', keys: 'ctrl+z', run: () => app.undo() },
        { label: 'Redo', keys: 'ctrl+shift+z', run: () => app.redo() },
        '---',
        { label: 'Fit page to screen', run: () => this.zoomToFit() },
      ];
    }

    const locked = Boolean(node.locked);
    const selected = app.state.selected.filter((id) => id !== 'root');
    const hasChildren = selected.some((id) => {
      const child = app.getNode(id);
      return child && child.children.length > 0;
    });

    return [
      EDITABLE_KINDS.has(node.kind) && !locked
        ? {
            label: 'Edit text',
            run: () => {
              app.select(hit);
              this._openTextEditor(hit, node);
            },
          }
        : null,
      '---',
      { label: 'Cut', keys: 'ctrl+x', run: () => app.cutSelection(), disabled: locked },
      { label: 'Copy', keys: 'ctrl+c', run: () => app.copySelection() },
      {
        label: 'Paste',
        keys: 'ctrl+v',
        run: () => app.pasteClipboard(),
        disabled: !app.hasClipboard(),
      },
      { label: 'Duplicate', keys: 'ctrl+d', run: () => app.duplicateSelection(), disabled: locked },
      '---',
      { label: 'Bring forward', keys: 'ctrl+]', run: () => app.reorderSelection(1) },
      { label: 'Send backward', keys: 'ctrl+[', run: () => app.reorderSelection(-1) },
      selected.length > 1
        ? { label: 'Group selection', keys: 'ctrl+g', run: () => app.groupSelection() }
        : null,
      hasChildren
        ? { label: 'Ungroup', keys: 'ctrl+shift+g', run: () => app.ungroupSelection() }
        : null,
      '---',
      {
        label: locked ? 'Unlock' : 'Lock',
        run: () => app.setProperty(hit, 'locked', locked ? 'false' : 'true'),
      },
      {
        label: node.hidden ? 'Show' : 'Hide',
        run: () => app.setProperty(hit, 'hidden', node.hidden ? 'false' : 'true'),
      },
      '---',
      {
        label: 'Delete',
        keys: 'delete',
        run: () => app.removeSelection(),
        disabled: locked,
        danger: true,
      },
    ].filter(Boolean);
  }

  // ========================================================== file drops ===

  /**
   * @param {DragEvent} event
   * @returns {boolean} whether the drag is carrying files we can use
   */
  _carriesFiles(event) {
    return Array.from(event.dataTransfer?.types || []).includes('Files');
  }

  /** @param {DragEvent} event */
  _onFileDragOver(event) {
    if (!this._carriesFiles(event)) {
      return;
    }
    // Without both of these the browser navigates away to the dropped file.
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';

    this._previewDropTarget(this._toPagePoint(event), null, null);
  }

  /** @param {DragEvent} event */
  async _onFileDrop(event) {
    if (!this._carriesFiles(event)) {
      return;
    }
    event.preventDefault();
    this._setMarker('#dropMarker', null);

    const files = Array.from(event.dataTransfer.files || []);
    const media = files.filter(
      (file) => file.type.startsWith('image/') || file.type.startsWith('video/')
    );
    if (media.length === 0) {
      app.setStatus('Only image and video files can be dropped onto the canvas', 'danger');
      return;
    }

    const point = this._toPagePoint(event);
    const parent = app.engine.dropTarget(point.x, point.y);
    const [localX, localY] = app.engine.toLocalPoint(parent, point.x, point.y);

    // Placed in a row rather than stacked, so dropping four at once gives four
    // visible elements instead of one on top of three.
    let offset = 0;
    for (const file of media) {
      if (file.size > MAX_EMBED_BYTES) {
        app.setStatus(
          `${file.name} is ${formatSize(file.size)}. Files are embedded in the page, ` +
            `so keep them under ${formatSize(MAX_EMBED_BYTES)}.`,
          'danger'
        );
        continue;
      }
      const kind = file.type.startsWith('video/') ? 'video' : 'image';
      const id = app.addElement(kind, parent, Math.round(localX + offset), Math.round(localY));
      if (id) {
        app.setProperty(id, 'src', await readAsDataUrl(file));
        app.setProperty(id, 'name', file.name.replace(/\.[^.]+$/, ''));
        offset += 24;
      }
    }
    app.setStatus(media.length === 1 ? `Added ${media[0].name}` : `Added ${media.length} files`);
  }

  /**
   * Converts client coordinates into page coordinates.
   *
   * @param {{clientX: number, clientY: number}} point
   * @returns {{x: number, y: number}}
   */
  _toPagePoint(point) {
    const box = this.scaler.getBoundingClientRect();
    const zoom = app.state.zoom || 1;
    return {
      x: (point.clientX - box.left) / zoom,
      y: (point.clientY - box.top) / zoom,
    };
  }

  /**
   * @param {number} clientX
   * @param {number} clientY
   * @returns {boolean} whether the point is over the scrollable canvas area
   */
  _isOverViewport(clientX, clientY) {
    const box = this.viewport.getBoundingClientRect();
    return (
      clientX >= box.left && clientX <= box.right && clientY >= box.top && clientY <= box.bottom
    );
  }

  /** @param {PointerEvent} event */
  _onPointerDown(event) {
    if (event.button !== 0 || app.state.mode !== 'design' || !app.engine) {
      return;
    }
    if (this._editing) {
      this._closeTextEditor(true);
    }

    const point = this._toPagePoint(event);
    const handle = /** @type {HTMLElement} */ (event.target).closest('[data-h]');

    // Handles only exist for a single selection, so this can only ever be the
    // primary — but check, because a stale handle could survive one frame.
    if (handle && app.state.selection && app.state.selected.length === 1) {
      this._startResize(app.state.selection, handle.getAttribute('data-h'), point, event);
      return;
    }

    const additive = event.ctrlKey || event.metaKey;
    const hit = app.engine.hitTest(point.x, point.y);

    if (!hit) {
      // Ctrl-clicking empty space is a miss, not "deselect everything" — it
      // would undo a careful selection with one slip of the pointer.
      if (!additive) {
        app.select(null);
      }
      return;
    }

    const node = app.getNode(hit);
    if (!node) {
      return;
    }

    if (additive) {
      // Toggle and stop. Adding to a selection and starting to drag it in the
      // same gesture makes it far too easy to nudge something by accident
      // while you are still choosing what to move.
      app.toggleSelection(hit);
      const count = app.state.selected.length;
      app.setStatus(count === 0 ? 'Nothing selected' : `${count} selected`, 'muted');
      return;
    }

    // Clicking something already in the selection keeps the selection, so a
    // drag carries the whole group. Clicking anything else replaces it.
    if (!app.isSelected(hit)) {
      app.select(hit);
    }

    if (node.locked) {
      app.setStatus('This layer is locked', 'muted');
      return;
    }

    this._capture(event.pointerId);
    this._gesture = {
      kind: 'press',
      id: hit,
      pointerId: event.pointerId,
      origin: point,
      startX: node.x,
      startY: node.y,
      width: node.width,
      height: node.height,
      parentId: node.parent || 'root',
      duplicate: event.altKey,
      guides: null,
      /** The rest of the selection, moved by the same delta. */
      followers: this._collectFollowers(hit),
      /**
       * Whether the parent positions this element itself.
       *
       * A child of a row, column or grid is placed by its parent, and its own
       * `x`/`y` are never compiled. Dragging one therefore cannot move it —
       * the only thing a drag can mean there is "put it somewhere else in the
       * order", which is what `_updateFlowMove` does.
       */
      flow: this._parentFlows(node),
      dropIndex: -1,
      /**
       * Where inside the element the pointer took hold of it, in page
       * coordinates. A flow child's `x`/`y` are meaningless, so this is the
       * only way to put it down where it looks like it was dropped.
       */
      grab: this._grabOffset(hit, point),
      /** Set once the pointer leaves a flow parent. See `_updateFlowMove`. */
      escaped: false,
    };
  }

  /**
   * How far into an element the pointer is, measured from its top-left.
   *
   * @param {string} id
   * @param {{x: number, y: number}} point page coordinates
   * @returns {[number, number]}
   */
  _grabOffset(id, point) {
    const rect = app.rectOf(id);
    return rect ? [point.x - rect[0], point.y - rect[1]] : [0, 0];
  }

  /**
   * @param {any} node
   * @returns {boolean} whether this node's parent lays out its children
   */
  _parentFlows(node) {
    const parent = app.getNode(node.parent || 'root');
    return Boolean(parent) && parent.layout !== 'absolute';
  }

  /**
   * The other selected elements a drag should carry, with where they started.
   *
   * Locked ones are left out — a lock has to mean something during a group
   * drag too — as are any whose ancestor is also being dragged, since moving
   * a container already moves its children.
   *
   * @param {string} primaryId
   * @returns {Array<{id: string, startX: number, startY: number, parentId: string, width: number, height: number}>}
   */
  _collectFollowers(primaryId) {
    const selected = new Set(app.state.selected);
    if (selected.size < 2) {
      return [];
    }

    /** @param {any} node */
    const hasSelectedAncestor = (node) => {
      for (let current = node; current && current.parent; current = app.getNode(current.parent)) {
        if (selected.has(current.parent)) {
          return true;
        }
      }
      return false;
    };

    const followers = [];
    for (const id of selected) {
      if (id === primaryId || id === 'root') {
        continue;
      }
      const node = app.getNode(id);
      if (!node || node.locked || hasSelectedAncestor(node)) {
        continue;
      }
      followers.push({
        id,
        startX: node.x,
        startY: node.y,
        width: node.width,
        height: node.height,
        parentId: node.parent || 'root',
      });
    }
    return followers;
  }

  /**
   * Pointer capture keeps a gesture alive when the cursor leaves the overlay.
   * Synthetic events (tests, assistive tech) have no active pointer, so a
   * failure here must not abort the gesture.
   *
   * @param {number} pointerId
   */
  _capture(pointerId) {
    try {
      this.overlay.setPointerCapture(pointerId);
    } catch {
      // No active pointer with that id — the gesture still works via bubbling.
    }
  }

  /** @param {PointerEvent} event */
  _onPointerMove(event) {
    if (app.state.mode !== 'design' || !app.engine) {
      return;
    }
    const point = this._toPagePoint(event);

    if (!this._gesture) {
      app.setHover(app.engine.hitTest(point.x, point.y));
      return;
    }

    if (this._gesture.kind === 'press') {
      const travelled =
        Math.abs(point.x - this._gesture.origin.x) + Math.abs(point.y - this._gesture.origin.y);
      if (travelled < DRAG_THRESHOLD) {
        return;
      }
      this._promoteToMove();
    }

    if (this._gesture.kind === 'move') {
      this._updateMove(point, event);
    } else if (this._gesture.kind === 'resize') {
      this._updateResize(point, event);
    }
  }

  /** @param {PointerEvent} event */
  _onPointerUp(event) {
    if (!this._gesture) {
      return;
    }
    if (this._gesture.kind === 'move') {
      this._commitMove(this._toPagePoint(event));
    }
    this._endGesture();
  }

  _endGesture() {
    // Measured rects are authoritative again the moment the gesture ends.
    this._predicted = null;
    if (this._gesture && this._gesture.pointerId !== undefined) {
      try {
        this.overlay.releasePointerCapture(this._gesture.pointerId);
      } catch {
        // Capture may already be gone (pointercancel); nothing to release.
      }
    }
    this._gesture = null;
    this.overlay.removeAttribute('data-gesture');
    this._setMarker('#dropMarker', null);
    this._setMarker('#insertLine', null);
    this._hideGuides();
    this._drawMarkers();
  }

  // ------------------------------------------------------------ move ------

  _promoteToMove() {
    const gesture = this._gesture;
    gesture.kind = 'move';
    this.overlay.setAttribute('data-gesture', 'move');

    if (gesture.duplicate) {
      // Alt-drag copies everything selected, then drags the copies.
      app.duplicateSelection();
      const clone = app.state.selection;
      if (clone && clone !== gesture.id) {
        const node = app.getNode(clone);
        gesture.id = clone;
        if (node) {
          // `duplicateElement` offsets a copy by 24px; rebase the gesture so
          // the copy sits under the pointer rather than jumping away from it.
          gesture.startX = node.x - 24;
          gesture.startY = node.y - 24;
        }
        gesture.followers = this._collectFollowers(clone).map((follower) => ({
          ...follower,
          startX: follower.startX - 24,
          startY: follower.startY - 24,
        }));
      }
      gesture.duplicate = false;
    } else {
      app.beginGesture();
    }

    gesture.guides = this._readGuides(gesture.id);
  }

  /**
   * @param {{x: number, y: number}} point
   * @param {PointerEvent} event
   */
  _updateMove(point, event) {
    const gesture = this._gesture;
    if (gesture.flow) {
      this._updateFlowMove(point);
      return;
    }
    let nextX = gesture.startX + (point.x - gesture.origin.x);
    let nextY = gesture.startY + (point.y - gesture.origin.y);

    if (event.shiftKey) {
      // Constrain to the dominant axis.
      if (Math.abs(point.x - gesture.origin.x) > Math.abs(point.y - gesture.origin.y)) {
        nextY = gesture.startY;
      } else {
        nextX = gesture.startX;
      }
    }

    const snapped =
      event.ctrlKey || event.metaKey
        ? { x: nextX, y: nextY, guideX: null, guideY: null }
        : this._applySnapping(nextX, nextY, gesture);

    app.moveElement(gesture.id, Math.round(snapped.x), Math.round(snapped.y));

    // Followers take the delta the primary actually ended up with, snapping
    // included, so the group keeps its shape.
    const dx = snapped.x - gesture.startX;
    const dy = snapped.y - gesture.startY;
    /** @type {Record<string, number[]>} */
    const predicted = {};
    for (const follower of gesture.followers) {
      const x = Math.round(follower.startX + dx);
      const y = Math.round(follower.startY + dy);
      app.moveElement(follower.id, x, y);
      predicted[follower.id] = this._predictRect(follower, x, y, follower.width, follower.height);
    }

    this._paintGuides(gesture.parentId, snapped.guideX, snapped.guideY);
    // Reparenting a whole group into a different container is not something a
    // single drop point can describe, so the drop router only runs for one.
    if (gesture.followers.length === 0) {
      this._previewDropTarget(point, gesture.id, gesture.parentId);
    }
    predicted[gesture.id] = this._predictRect(gesture, snapped.x, snapped.y);
    this._rememberPredicted(predicted);
    this._drawMarkers();
  }

  /**
   * Dragging inside a row, column or grid: work out where in the order the
   * element would land, and show a line there.
   *
   * Nothing is mutated until the pointer comes up. Reordering on every frame
   * would put a checkpoint and a full recompile behind each pointer move, and
   * an undo stack with forty entries in it for one drag.
   *
   * @param {{x: number, y: number}} point
   */
  _updateFlowMove(point) {
    const gesture = this._gesture;
    const parent = app.getNode(gesture.parentId);
    if (!parent) {
      return;
    }

    // Far enough outside the parent and this is no longer a reorder. Hand the
    // rest of the drag to the same drop-target preview an absolutely
    // positioned element uses, so the two gestures look identical from here on.
    const escaped = this._hasLeftParent(point, gesture.parentId);
    if (escaped !== gesture.escaped) {
      gesture.escaped = escaped;
      app.setStatus(
        escaped ? 'Release to take it out of the container' : 'Drop to reorder',
        'muted'
      );
    }
    if (escaped) {
      this._setMarker('#insertLine', null);
      this._previewDropTarget(point, gesture.id, gesture.parentId);
      this._drawMarkers();
      return;
    }
    this._setMarker('#dropMarker', null);

    const siblings = parent.children;
    const vertical = parent.layout !== 'row';
    const along = vertical ? point.y : point.x;

    // The first sibling whose middle the pointer has not yet passed.
    let index = siblings.length;
    for (let at = 0; at < siblings.length; at += 1) {
      const rect = app.rectOf(siblings[at]);
      if (!rect) {
        continue;
      }
      const middle = vertical ? rect[1] + rect[3] / 2 : rect[0] + rect[2] / 2;
      if (along < middle) {
        index = at;
        break;
      }
    }

    gesture.dropIndex = index;
    this._paintInsertLine(parent, siblings, index, vertical);
    this._drawMarkers();
  }

  /**
   * Whether the pointer has left a container by more than the escape margin.
   *
   * Measured against the container's real box on screen rather than its
   * declared size, because a hugging Stack is only as big as what is in it.
   *
   * @param {{x: number, y: number}} point page coordinates
   * @param {string} parentId
   * @returns {boolean}
   */
  _hasLeftParent(point, parentId) {
    const rect = app.rectOf(parentId);
    if (!rect) {
      return false;
    }
    const [left, top, width, height] = rect;
    return (
      point.x < left - FLOW_ESCAPE_MARGIN ||
      point.x > left + width + FLOW_ESCAPE_MARGIN ||
      point.y < top - FLOW_ESCAPE_MARGIN ||
      point.y > top + height + FLOW_ESCAPE_MARGIN
    );
  }

  /**
   * @param {any} parent
   * @param {string[]} siblings
   * @param {number} index insertion point, `siblings.length` meaning "at the end"
   * @param {boolean} vertical
   */
  _paintInsertLine(parent, siblings, index, vertical) {
    const line = /** @type {HTMLElement} */ (this.$('#insertLine'));
    const parentRect = app.rectOf(parent.id);
    if (!parentRect) {
      line.setAttribute('data-on', 'false');
      return;
    }

    // Before a sibling, or after the last one.
    const anchor = index < siblings.length ? app.rectOf(siblings[index]) : null;
    const trailing = siblings.length > 0 ? app.rectOf(siblings[siblings.length - 1]) : null;

    let x;
    let y;
    if (vertical) {
      y = anchor ? anchor[1] : trailing ? trailing[1] + trailing[3] : parentRect[1];
      x = parentRect[0];
      line.style.width = `${parentRect[2]}px`;
      line.style.height = '2px';
    } else {
      x = anchor ? anchor[0] : trailing ? trailing[0] + trailing[2] : parentRect[0];
      y = parentRect[1];
      line.style.width = '2px';
      line.style.height = `${parentRect[3]}px`;
    }
    line.style.left = `${x - 1}px`;
    line.style.top = `${y - 1}px`;
    line.setAttribute('data-on', 'true');
  }

  /** @param {{x: number, y: number}} point */
  _commitMove(point) {
    const gesture = this._gesture;

    if (gesture.flow) {
      this._setMarker('#insertLine', null);
      if (gesture.escaped) {
        this._dropOutOfFlow(point, gesture);
        return;
      }
      const parent = app.getNode(gesture.parentId);
      const from = parent ? parent.children.indexOf(gesture.id) : -1;
      let to = gesture.dropIndex;
      // Removing the element first shifts everything after it down one.
      if (to > from && from >= 0) {
        to -= 1;
      }
      if (from >= 0 && to >= 0 && to !== from) {
        app.reparent(gesture.id, gesture.parentId, to);
        app.setStatus('Reordered');
      }
      return;
    }

    if (gesture.followers.length > 0) {
      // A group drag moves; it does not reparent. See `_updateMove`.
      return;
    }
    const targetParent = app.engine.dropTarget(point.x, point.y, gesture.id);
    this._setMarker('#dropMarker', null);

    if (!targetParent || targetParent === gesture.parentId) {
      return;
    }

    // Keep the element visually where the pointer released it by converting
    // the page point into the new parent's coordinate space.
    const grabX = point.x - gesture.origin.x + gesture.startX;
    const grabY = point.y - gesture.origin.y + gesture.startY;
    const parentRect = app.rectOf(gesture.parentId);
    const pageX = parentRect ? parentRect[0] + grabX : grabX;
    const pageY = parentRect ? parentRect[1] + grabY : grabY;

    if (!app.reparent(gesture.id, targetParent, -1)) {
      return;
    }
    const local = this._localPoint(targetParent, pageX, pageY);
    app.moveElement(gesture.id, Math.round(local[0]), Math.round(local[1]));
    app.setStatus(targetParent === 'root' ? 'Moved to the page' : 'Nested inside a container');
  }

  /**
   * @param {string} parentId
   * @param {number} pageX
   * @param {number} pageY
   * @returns {number[]} `[x, y]` local to the parent
   */
  _localPoint(parentId, pageX, pageY) {
    try {
      return app.engine.toLocalPoint(parentId, pageX, pageY);
    } catch (error) {
      console.warn('[devlove:canvas] toLocalPoint failed', error);
      return [pageX, pageY];
    }
  }

  // ---------------------------------------------------------- resize ------

  /**
   * @param {string} id
   * @param {string | null} direction
   * @param {{x: number, y: number}} point
   * @param {PointerEvent} event
   */
  _startResize(id, direction, point, event) {
    const node = app.getNode(id);
    if (!node || node.locked || !direction) {
      return;
    }
    app.beginGesture();
    this._capture(event.pointerId);
    this._gesture = {
      kind: 'resize',
      id,
      direction,
      pointerId: event.pointerId,
      origin: point,
      startX: node.x,
      startY: node.y,
      width: node.width,
      height: node.height,
      parentId: node.parent || 'root',
      ratio: node.height > 0 ? node.width / node.height : 1,
    };
  }

  /**
   * @param {{x: number, y: number}} point
   * @param {PointerEvent} event
   */
  _updateResize(point, event) {
    const gesture = this._gesture;
    const dx = point.x - gesture.origin.x;
    const dy = point.y - gesture.origin.y;
    const direction = gesture.direction;

    let x = gesture.startX;
    let y = gesture.startY;
    let width = gesture.width;
    let height = gesture.height;

    if (direction.includes('e')) {
      width = gesture.width + dx;
    }
    if (direction.includes('s')) {
      height = gesture.height + dy;
    }
    if (direction.includes('w')) {
      width = gesture.width - dx;
      x = gesture.startX + dx;
    }
    if (direction.includes('n')) {
      height = gesture.height - dy;
      y = gesture.startY + dy;
    }

    width = Math.max(4, width);
    height = Math.max(4, height);

    // Shift locks the aspect ratio on corner handles.
    if (event.shiftKey && direction.length === 2 && gesture.ratio > 0) {
      height = Math.max(4, width / gesture.ratio);
      if (direction.includes('n')) {
        y = gesture.startY + (gesture.height - height);
      }
    }

    app.resizeElement(gesture.id, Math.round(width), Math.round(height));
    if (x !== gesture.startX || y !== gesture.startY) {
      app.moveElement(gesture.id, Math.round(x), Math.round(y));
    }
    this._rememberPredicted({ [gesture.id]: this._predictRect(gesture, x, y, width, height) });
    this._drawMarkers();
  }

  // ---------------------------------------------------------- snapping ----

  /**
   * @param {string} id
   * @returns {{v: number[], h: number[]}}
   */
  _readGuides(id) {
    try {
      return app.engine.snapGuides(id);
    } catch (error) {
      console.warn('[devlove:canvas] could not read snap guides', error);
      return { v: [], h: [] };
    }
  }

  /**
   * Snaps the leading, centre and trailing edges to sibling geometry.
   *
   * @param {number} x
   * @param {number} y
   * @param {any} gesture
   */
  _applySnapping(x, y, gesture) {
    const guides = gesture.guides || { v: [], h: [] };
    const radius = SNAP_RADIUS / (app.state.zoom || 1);
    const width = gesture.width;
    const height = gesture.height;

    let bestX = { value: x, guide: null, distance: radius };
    for (const candidate of guides.v) {
      for (const [edge, offset] of [
        [x, 0],
        [x + width / 2, width / 2],
        [x + width, width],
      ]) {
        const distance = Math.abs(edge - candidate);
        if (distance < bestX.distance) {
          bestX = { value: candidate - offset, guide: candidate, distance };
        }
      }
    }

    let bestY = { value: y, guide: null, distance: radius };
    for (const candidate of guides.h) {
      for (const [edge, offset] of [
        [y, 0],
        [y + height / 2, height / 2],
        [y + height, height],
      ]) {
        const distance = Math.abs(edge - candidate);
        if (distance < bestY.distance) {
          bestY = { value: candidate - offset, guide: candidate, distance };
        }
      }
    }

    return { x: bestX.value, y: bestY.value, guideX: bestX.guide, guideY: bestY.guide };
  }

  /**
   * @param {string} parentId
   * @param {number | null} guideX
   * @param {number | null} guideY
   */
  _paintGuides(parentId, guideX, guideY) {
    const parentRect = app.rectOf(parentId) || [0, 0, 0, 0];
    const vertical = /** @type {HTMLElement} */ (this.$('#guideV'));
    const horizontal = /** @type {HTMLElement} */ (this.$('#guideH'));

    if (guideX === null || guideX === undefined) {
      vertical.setAttribute('data-on', 'false');
    } else {
      vertical.style.left = `${parentRect[0] + guideX}px`;
      vertical.setAttribute('data-on', 'true');
    }

    if (guideY === null || guideY === undefined) {
      horizontal.setAttribute('data-on', 'false');
    } else {
      horizontal.style.top = `${parentRect[1] + guideY}px`;
      horizontal.setAttribute('data-on', 'true');
    }
  }

  _hideGuides() {
    this.$('#guideV').setAttribute('data-on', 'false');
    this.$('#guideH').setAttribute('data-on', 'false');
  }

  // ------------------------------------------------------------ markers ---

  /**
   * Predicts a rect for the element being dragged so the outline tracks the
   * pointer without waiting for the frame to re-measure.
   */
  _predictRect(gesture, x, y, width = gesture.width, height = gesture.height) {
    const parentRect = app.rectOf(gesture.parentId) || [0, 0, 0, 0];
    return [parentRect[0] + x, parentRect[1] + y, width, height];
  }

  /**
   * Paints the selection outlines, the hover outline, and the label and size
   * badge on the primary.
   *
   * Takes no arguments on purpose. Every rect comes from one lookup —
   * `this._predicted` while a gesture is running, `app.rectOf` otherwise —
   * keyed by node id. Both halves of that matter, and each was a bug:
   *
   * 1. **Predicted rects have to outlive the frame that produced them.**
   *    Moving an element posts a style patch into the preview frame, which
   *    re-measures and fires `geometry`, which repaints these markers. That
   *    repaint knows nothing about the drag, so without the cache it fell back
   *    to a measurement one or two frames old and the outlines alternated
   *    between predicted and measured every frame.
   * 2. **The lookup has to be by id.** The element under the pointer is not
   *    necessarily the primary selection — select three things, then grab the
   *    first — so a single "override the primary's rect" argument painted one
   *    element's outline at another element's position.
   */
  _drawMarkers() {
    const selection = app.state.selection;
    const selected = app.state.selected;
    const hover = app.state.hover;

    /** @param {string} id */
    const rectOf = (id) => (this._predicted && this._predicted[id]) || app.rectOf(id);

    const selectionRect = selection ? rectOf(selection) : null;
    const marker = /** @type {HTMLElement} */ (this.$('#selectMarker'));
    this._setMarker('#selectMarker', selectionRect);
    marker.setAttribute('data-multi', String(selected.length > 1));

    this._drawOtherOutlines(
      selected
        .filter((id) => id !== selection)
        .map(rectOf)
        .filter(Boolean)
    );

    const tag = /** @type {HTMLElement} */ (this.$('#selectTag'));
    const badge = /** @type {HTMLElement} */ (this.$('#sizeBadge'));
    if (selectionRect && selection) {
      const node = app.getNode(selection);
      const name = node ? node.name : selection;
      tag.textContent = selected.length > 1 ? `${name}  +${selected.length - 1}` : name;
      tag.style.left = `${selectionRect[0]}px`;
      tag.style.top = `${selectionRect[1]}px`;
      tag.setAttribute('data-on', 'true');

      badge.textContent = `${Math.round(selectionRect[2])} × ${Math.round(selectionRect[3])}`;
      badge.style.left = `${selectionRect[0]}px`;
      badge.style.top = `${selectionRect[1] + selectionRect[3]}px`;
      badge.setAttribute('data-on', 'true');
    } else {
      tag.setAttribute('data-on', 'false');
      badge.setAttribute('data-on', 'false');
    }

    const hoverRect = hover && !selected.includes(hover) ? app.rectOf(hover) : null;
    this._setMarker('#hoverMarker', hoverRect);
  }

  /**
   * Holds on to the rects a gesture just predicted, so a repaint triggered by
   * anything else during that gesture draws the same thing. Cleared when the
   * gesture ends.
   *
   * @param {Record<string, number[]>} rects
   */
  _rememberPredicted(rects) {
    this._predicted = rects;
  }

  /**
   * Draws one outline per non-primary selection.
   *
   * The boxes are pooled rather than rebuilt: this runs on every frame of a
   * group drag, and churning the DOM sixty times a second to draw four
   * rectangles is a waste of a frame budget that the drag needs.
   *
   * @param {number[][]} rects
   */
  _drawOtherOutlines(rects) {
    const layer = /** @type {HTMLElement} */ (this.$('#selectOthers'));
    while (layer.childElementCount < rects.length) {
      const box = document.createElement('div');
      box.className = 'others__box';
      layer.append(box);
    }
    for (let index = 0; index < layer.childElementCount; index += 1) {
      const box = /** @type {HTMLElement} */ (layer.children[index]);
      const rect = rects[index];
      if (!rect) {
        box.style.display = 'none';
        continue;
      }
      box.style.display = 'block';
      box.style.left = `${rect[0]}px`;
      box.style.top = `${rect[1]}px`;
      box.style.width = `${rect[2]}px`;
      box.style.height = `${rect[3]}px`;
    }
  }

  /**
   * @param {string} selector
   * @param {number[] | null} rect `[x, y, w, h]` in page pixels
   */
  _setMarker(selector, rect) {
    const marker = /** @type {HTMLElement} */ (this.$(selector));
    if (!marker) {
      return;
    }
    if (!rect) {
      marker.setAttribute('data-on', 'false');
      return;
    }
    marker.style.left = `${rect[0]}px`;
    marker.style.top = `${rect[1]}px`;
    marker.style.width = `${rect[2]}px`;
    marker.style.height = `${rect[3]}px`;
    marker.setAttribute('data-on', 'true');
  }

  /**
   * Highlights the container that would receive a drop.
   *
   * @param {{x: number, y: number}} point
   * @param {string | null} exclude
   * @param {string | null} currentParent already-the-parent targets stay quiet
   * @returns {string} the resolved container id
   */
  _previewDropTarget(point, exclude, currentParent) {
    const target = app.engine.dropTarget(point.x, point.y, exclude ?? undefined);
    this._setMarker('#dropMarker', target && target !== currentParent ? app.rectOf(target) : null);
    return target;
  }

  // ============================================ palette / layers drop-in ===

  /**
   * Receives pointer drags started elsewhere in the editor — a blueprint from
   * the palette, or a layer from the tree. See `core/drag-controller.js` for
   * why this is not the HTML5 drag-and-drop API.
   */
  _wireExternalDrag() {
    this.listen('drag:move', (payload) => {
      if (app.state.mode !== 'design' || !app.engine) {
        return;
      }
      if (!this._isOverViewport(payload.clientX, payload.clientY)) {
        this._setMarker('#dropMarker', null);
        return;
      }
      const point = this._toPagePoint(payload);
      this._previewDropTarget(point, payload.id ?? null, null);
    });

    this.listen('drag:end', (payload) => {
      this._setMarker('#dropMarker', null);
      if (payload.cancelled || app.state.mode !== 'design' || !app.engine) {
        return;
      }
      if (!this._isOverViewport(payload.clientX, payload.clientY)) {
        return;
      }
      const point = this._toPagePoint(payload);
      const parent = app.engine.dropTarget(point.x, point.y, payload.id ?? undefined) || 'root';
      const local = this._localPoint(parent, point.x, point.y);

      if (payload.type === 'blueprint') {
        app.addElement(payload.kind, parent, Math.round(local[0]), Math.round(local[1]));
        return;
      }
      if (payload.type === 'block') {
        app.addBlock(payload.block, parent, Math.round(local[0]), Math.round(local[1]));
        return;
      }
      if (payload.type === 'node' && payload.id) {
        if (app.reparent(payload.id, parent, -1)) {
          app.moveElement(payload.id, Math.round(local[0]), Math.round(local[1]));
          app.select(payload.id);
        }
      }
    });
  }

  // ========================================================= text editing ==

  _wireTextEditor() {
    this.bind(this.textEditor, 'keydown', (event) => {
      const keyEvent = /** @type {KeyboardEvent} */ (event);
      keyEvent.stopPropagation();
      if (keyEvent.key === 'Escape') {
        keyEvent.preventDefault();
        this._closeTextEditor(false);
      } else if (keyEvent.key === 'Enter' && !keyEvent.shiftKey) {
        keyEvent.preventDefault();
        this._closeTextEditor(true);
      }
    });
    this.bind(this.textEditor, 'blur', () => this._closeTextEditor(true));
  }

  /** @param {MouseEvent} event */
  _onDoubleClick(event) {
    if (app.state.mode !== 'design' || !app.engine) {
      return;
    }
    const point = this._toPagePoint(event);
    const hit = app.engine.hitTest(point.x, point.y);
    if (!hit) {
      return;
    }
    const node = app.getNode(hit);
    if (!node || !EDITABLE_KINDS.has(node.kind) || node.locked) {
      return;
    }
    app.select(hit);
    this._openTextEditor(hit, node);
  }

  /**
   * Takes a flow child out of its container and puts it wherever the pointer
   * released it.
   *
   * The element's stored `x`/`y` are whatever they were before it was ever put
   * in a Stack, so they are no help. The position comes from the pointer and
   * the grab offset instead, which is what makes the element land under the
   * cursor rather than jumping to a stale coordinate.
   *
   * @param {{x: number, y: number}} point
   * @param {any} gesture
   */
  _dropOutOfFlow(point, gesture) {
    this._setMarker('#dropMarker', null);
    const target = app.engine.dropTarget(point.x, point.y, gesture.id);
    if (!target || target === gesture.parentId) {
      app.setStatus('Left it where it was', 'muted');
      return;
    }
    if (!app.reparent(gesture.id, target, -1)) {
      return;
    }
    const local = this._localPoint(target, point.x - gesture.grab[0], point.y - gesture.grab[1]);
    app.moveElement(gesture.id, Math.round(local[0]), Math.round(local[1]));
    app.setStatus(target === 'root' ? 'Moved to the page' : 'Nested inside a container');
  }

  /**
   * @param {string} id
   * @param {any} node
   */
  _openTextEditor(id, node) {
    const rect = app.rectOf(id);
    if (!rect) {
      return;
    }
    const editor = this.textEditor;
    const style = node.style || {};
    const padding = Number(style.padding) || 0;

    editor.style.left = `${rect[0]}px`;
    editor.style.top = `${rect[1]}px`;
    editor.style.minWidth = `${rect[2]}px`;
    editor.style.minHeight = `${rect[3]}px`;
    editor.style.padding = `${padding}px`;
    editor.style.fontSize = style.fontSize ? `${style.fontSize}px` : '16px';
    editor.style.fontWeight = style.fontWeight || '400';
    editor.style.lineHeight = style.lineHeight ? String(style.lineHeight) : '1.5';
    editor.style.textAlign = style.textAlign || 'left';
    editor.textContent = node.content || '';
    editor.setAttribute('data-on', 'true');

    this._editing = id;
    editor.focus();

    const range = document.createRange();
    range.selectNodeContents(editor);
    const selection = window.getSelection();
    if (selection) {
      selection.removeAllRanges();
      selection.addRange(range);
    }
    app.setStatus('Editing text — Enter to commit, Escape to cancel', 'muted');
  }

  /** @param {boolean} commit */
  _closeTextEditor(commit) {
    const id = this._editing;
    if (!id) {
      return;
    }
    this._editing = null;
    // contenteditable inserts non-breaking spaces; normalise them back.
    const value = this.textEditor.innerText.split(NBSP).join(' ');
    this.textEditor.setAttribute('data-on', 'false');
    this.textEditor.textContent = '';
    if (commit) {
      app.beginGesture();
      app.setProperty(id, 'content', value);
      app.invalidate();
    }
  }
}

customElements.define('dl-canvas', DlCanvas);
