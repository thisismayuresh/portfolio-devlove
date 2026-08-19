/**
 * The stage: sandboxed preview frame plus the interaction overlay.
 *
 * Nothing here knows what an element *is*. The overlay converts pointer
 * positions into page coordinates, asks the Rust engine what lives there, and
 * forwards the resulting intent (select / move / resize / drop) back to it.
 * The frame itself is never touched directly — it is redrawn from compiled
 * output, or patched one declaration block at a time during a gesture.
 *
 * @module ui/components/forge-canvas
 */

import { PanelElement } from '../panel-element.js';
import { icon } from '../icons.js';
import { app } from '../../core/app.js';
import { DRAG_MIME } from '../../registry/elements.js';

/** Pointer travel, in page pixels, before a press becomes a drag. */
const DRAG_THRESHOLD = 3;

/** Snap radius in screen pixels; divided by zoom before use. */
const SNAP_RADIUS = 6;

/** Element kinds whose text can be edited in place. */
const EDITABLE_KINDS = new Set(['heading', 'text', 'button', 'link']);

/** Handle directions, in render order. */
const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

export class ForgeCanvas extends PanelElement {
  static styles = `
    .root { position: relative; height: 100%; min-height: 0; }

    .viewport {
      position: absolute;
      inset: 0;
      overflow: auto;
      background-color: var(--canvas-backdrop);
      background-image:
        radial-gradient(var(--canvas-grid) 1px, transparent 1px);
      background-size: 16px 16px;
      background-position: -1px -1px;
    }

    .pad {
      display: flex;
      align-items: flex-start;
      justify-content: center;
      min-width: min-content;
      min-height: 100%;
      padding: 40px 48px 96px;
    }

    .page-box { position: relative; flex: 0 0 auto; }

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
      box-shadow: var(--canvas-page-shadow);
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

    .marker--hover { outline: 1px solid var(--marker-hover); outline-offset: 0; }
    .marker--drop {
      outline: 1px dashed var(--marker-drop);
      background: rgba(63, 185, 80, 0.07);
    }
    .marker--select { outline: 1px solid var(--marker-select); }

    .handle {
      position: absolute;
      width: 7px;
      height: 7px;
      background: #fff;
      border: 1px solid var(--marker-select);
      border-radius: 1px;
      pointer-events: auto;
    }
    .handle[data-h="nw"] { top: -4px; left: -4px; cursor: nwse-resize; }
    .handle[data-h="n"]  { top: -4px; left: 50%; margin-left: -3.5px; cursor: ns-resize; }
    .handle[data-h="ne"] { top: -4px; right: -4px; cursor: nesw-resize; }
    .handle[data-h="e"]  { top: 50%; right: -4px; margin-top: -3.5px; cursor: ew-resize; }
    .handle[data-h="se"] { bottom: -4px; right: -4px; cursor: nwse-resize; }
    .handle[data-h="s"]  { bottom: -4px; left: 50%; margin-left: -3.5px; cursor: ns-resize; }
    .handle[data-h="sw"] { bottom: -4px; left: -4px; cursor: nesw-resize; }
    .handle[data-h="w"]  { top: 50%; left: -4px; margin-top: -3.5px; cursor: ew-resize; }

    .badge {
      position: absolute;
      display: none;
      padding: 2px 6px;
      border-radius: 3px;
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

    .tag {
      position: absolute;
      display: none;
      padding: 1px 5px;
      border-radius: 3px 3px 0 0;
      background: var(--marker-select);
      color: #fff;
      font-size: 10px;
      line-height: 14px;
      white-space: nowrap;
      pointer-events: none;
      transform: translate(0, -100%);
    }
    .tag[data-on="true"] { display: block; }

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
      box-shadow: 0 0 0 3px var(--accent-wash);
      pointer-events: auto;
    }
    .text-editor[data-on="true"] { display: block; }

    /* ------------------------------------------------------------ zoom bar */
    .zoombar {
      position: absolute;
      right: 14px;
      bottom: 14px;
      display: flex;
      align-items: center;
      gap: 2px;
      padding: 3px;
      border: 1px solid var(--line);
      border-radius: var(--radius-md);
      background: rgba(27, 29, 34, 0.92);
      backdrop-filter: blur(8px);
      box-shadow: var(--shadow-pop);
    }
    :host([data-mode="preview"]) .zoombar { display: none; }

    .zoombar__value {
      min-width: 46px;
      height: 22px;
      padding: 0 4px;
      border-radius: 3px;
      color: var(--ink);
      font-size: var(--text-sm);
      font-variant-numeric: tabular-nums;
      text-align: center;
      line-height: 22px;
    }
    .zoombar__value:hover { background: var(--surface-hover); }

    .zoombar .icon-btn { width: 22px; height: 22px; }

    .exit-preview {
      position: absolute;
      right: 14px;
      bottom: 14px;
      display: none;
      gap: 6px;
    }
    :host([data-mode="preview"]) .exit-preview { display: inline-flex; }
  `;

  template() {
    return `
      <div class="viewport scroll" id="viewport">
        <div class="pad">
          <div class="page-box" id="pageBox">
            <div class="scaler" id="scaler">
              <iframe class="frame" id="frame" title="Page preview"
                      sandbox="allow-scripts allow-forms allow-popups allow-modals"></iframe>
              <div class="overlay" id="overlay">
                <div class="marker marker--drop" id="dropMarker"></div>
                <div class="marker marker--hover" id="hoverMarker"></div>
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
      </div>

      <div class="zoombar">
        <button class="icon-btn" data-zoom="out" title="Zoom out (Ctrl+-)">${icon('minus', 13)}</button>
        <button class="zoombar__value" id="zoomValue" title="Reset to 100%">100%</button>
        <button class="icon-btn" data-zoom="in" title="Zoom in (Ctrl++)">${icon('plus', 13)}</button>
        <button class="icon-btn" data-zoom="fit" title="Fit page in view">${icon('frame', 13)}</button>
      </div>

      <button class="btn btn--primary exit-preview" data-action="exit-preview">
        ${icon('cursor', 14)}<span>Back to design</span>
      </button>
    `;
  }

  mounted() {
    this.frame = /** @type {HTMLIFrameElement} */ (this.$('#frame'));
    this.overlay = /** @type {HTMLElement} */ (this.$('#overlay'));
    this.scaler = /** @type {HTMLElement} */ (this.$('#scaler'));
    this.pageBox = /** @type {HTMLElement} */ (this.$('#pageBox'));
    this.viewport = /** @type {HTMLElement} */ (this.$('#viewport'));
    this.textEditor = /** @type {HTMLElement} */ (this.$('#textEditor'));

    /** @type {null | {kind: string, id: string, [key: string]: any}} */
    this._gesture = null;
    /** id currently open in the inline text editor @type {string | null} */
    this._editing = null;
    this._pageWidth = 1280;
    this._pageHeight = 860;

    this.setAttribute('data-mode', app.state.mode);
    app.registerPreviewFrame(this.frame);

    this._wirePointer();
    this._wireDropTarget();
    this._wireZoom();
    this._wireTextEditor();

    this.listen(['ready', 'document', 'page'], () => {
      this._readPage();
      this._layout();
      this._drawMarkers();
    });
    this.listen('geometry', () => {
      this._layout();
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

    this._readPage();
    this._layout();
  }

  // ============================================================== layout ===

  _readPage() {
    if (!app.engine) {
      return;
    }
    const page = app.getPage();
    this._pageWidth = Number(page.width) || 1280;
    this._pageMinHeight = Number(page.min_height) || 860;
  }

  /** Sizes the frame to the content and applies the zoom transform. */
  _layout() {
    const zoom = app.state.zoom;
    const height = Math.max(this._pageMinHeight || 860, this._measuredHeight());

    this._pageHeight = height;
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

  // ============================================================= pointer ===

  _wirePointer() {
    this.bind(this.overlay, 'pointerdown', (e) => this._onPointerDown(/** @type {PointerEvent} */ (e)));
    this.bind(this.overlay, 'pointermove', (e) => this._onPointerMove(/** @type {PointerEvent} */ (e)));
    this.bind(this.overlay, 'pointerup', (e) => this._onPointerUp(/** @type {PointerEvent} */ (e)));
    this.bind(this.overlay, 'pointercancel', () => this._endGesture());
    this.bind(this.overlay, 'pointerleave', () => {
      if (!this._gesture) {
        app.setHover(null);
      }
    });
    this.bind(this.overlay, 'dblclick', (e) => this._onDoubleClick(/** @type {MouseEvent} */ (e)));
    this.bind(this.overlay, 'contextmenu', (e) => e.preventDefault());
  }

  /**
   * Converts a pointer event into page coordinates.
   *
   * @param {{clientX: number, clientY: number}} event
   * @returns {{x: number, y: number}}
   */
  _toPagePoint(event) {
    const box = this.scaler.getBoundingClientRect();
    const zoom = app.state.zoom || 1;
    return {
      x: (event.clientX - box.left) / zoom,
      y: (event.clientY - box.top) / zoom,
    };
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

    if (handle && app.state.selection) {
      this._startResize(app.state.selection, handle.getAttribute('data-h'), point, event);
      return;
    }

    const hit = app.engine.hitTest(point.x, point.y);
    if (!hit) {
      app.select(null);
      return;
    }

    const node = app.getNode(hit);
    if (!node) {
      return;
    }
    app.select(hit);

    if (node.locked) {
      app.setStatus('This layer is locked', 'muted');
      return;
    }

    this.overlay.setPointerCapture(event.pointerId);
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
    };
  }

  /** @param {PointerEvent} event */
  _onPointerMove(event) {
    if (app.state.mode !== 'design' || !app.engine) {
      return;
    }
    const point = this._toPagePoint(event);

    if (!this._gesture) {
      const hit = app.engine.hitTest(point.x, point.y);
      app.setHover(hit);
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
    const gesture = this._gesture;

    if (gesture.kind === 'move') {
      this._commitMove(this._toPagePoint(event));
    }
    this._endGesture();
  }

  _endGesture() {
    if (this._gesture && this._gesture.pointerId !== undefined) {
      try {
        this.overlay.releasePointerCapture(this._gesture.pointerId);
      } catch (error) {
        // The capture may already be gone (pointercancel); nothing to release.
      }
    }
    this._gesture = null;
    this.overlay.removeAttribute('data-gesture');
    this._hideGuides();
    this._drawMarkers();
  }

  // ------------------------------------------------------------ move ------

  _promoteToMove() {
    const gesture = this._gesture;
    gesture.kind = 'move';
    this.overlay.setAttribute('data-gesture', 'move');

    if (gesture.duplicate) {
      app.duplicateElement(gesture.id);
      const clone = app.state.selection;
      if (clone && clone !== gesture.id) {
        const node = app.getNode(clone);
        gesture.id = clone;
        if (node) {
          gesture.startX = node.x - 24;
          gesture.startY = node.y - 24;
        }
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

    const snapped = event.ctrlKey || event.metaKey
      ? { x: nextX, y: nextY, guideX: null, guideY: null }
      : this._applySnapping(nextX, nextY, gesture);

    app.moveElement(gesture.id, Math.round(snapped.x), Math.round(snapped.y));
    this._paintGuides(gesture.parentId, snapped.guideX, snapped.guideY);
    this._previewDropTarget(point, gesture.id);
    this._drawMarkers(this._predictRect(gesture, snapped.x, snapped.y));
  }

  /**
   * @param {{x: number, y: number}} point
   */
  _commitMove(point) {
    const gesture = this._gesture;
    const targetParent = app.engine.dropTarget(point.x, point.y, gesture.id);
    this._setMarker('#dropMarker', null);

    if (!targetParent || targetParent === gesture.parentId) {
      return;
    }

    // Keep the element visually where the pointer released it by converting
    // the page point into the new parent's coordinate space.
    const node = app.getNode(gesture.id);
    if (!node) {
      return;
    }
    const grabX = point.x - gesture.origin.x + gesture.startX;
    const grabY = point.y - gesture.origin.y + gesture.startY;
    const parentRect = app.rectOf(gesture.parentId);
    const pageX = parentRect ? parentRect[0] + grabX : grabX;
    const pageY = parentRect ? parentRect[1] + grabY : grabY;

    if (!app.reparent(gesture.id, targetParent, -1)) {
      return;
    }
    const local = JSON.parse(app.engine.toLocalPoint(targetParent, pageX, pageY));
    app.moveElement(gesture.id, Math.round(local[0]), Math.round(local[1]));
    app.setStatus(`Moved into ${targetParent === 'root' ? 'the page' : targetParent}`);
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
    this.overlay.setPointerCapture(event.pointerId);
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
    this._drawMarkers(this._predictRect(gesture, x, y, width, height));
  }

  // ---------------------------------------------------------- snapping ----

  /**
   * @param {string} id
   * @returns {{v: number[], h: number[]}}
   */
  _readGuides(id) {
    try {
      return JSON.parse(app.engine.snapGuides(id));
    } catch (error) {
      console.warn('[canvas] could not read snap guides', error);
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
      for (const [edge, offset] of [[x, 0], [x + width / 2, width / 2], [x + width, width]]) {
        const distance = Math.abs(edge - candidate);
        if (distance < bestX.distance) {
          bestX = { value: candidate - offset, guide: candidate, distance };
        }
      }
    }

    let bestY = { value: y, guide: null, distance: radius };
    for (const candidate of guides.h) {
      for (const [edge, offset] of [[y, 0], [y + height / 2, height / 2], [y + height, height]]) {
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
   * @param {number[] | null} [selectionOverride]
   */
  _drawMarkers(selectionOverride = null) {
    const selection = app.state.selection;
    const hover = app.state.hover;

    const selectionRect = selectionOverride || (selection ? app.rectOf(selection) : null);
    this._setMarker('#selectMarker', selectionRect);

    const tag = /** @type {HTMLElement} */ (this.$('#selectTag'));
    const badge = /** @type {HTMLElement} */ (this.$('#sizeBadge'));
    if (selectionRect && selection) {
      const node = app.getNode(selection);
      tag.textContent = node ? node.name : selection;
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

    const hoverRect = hover && hover !== selection ? app.rectOf(hover) : null;
    this._setMarker('#hoverMarker', hoverRect);
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
   * @param {{x: number, y: number}} point
   * @param {string | null} exclude
   * @returns {string} the container that would receive the drop
   */
  _previewDropTarget(point, exclude) {
    const target = app.engine.dropTarget(point.x, point.y, exclude ?? undefined);
    const currentParent = this._gesture ? this._gesture.parentId : null;
    this._setMarker('#dropMarker', target && target !== currentParent ? app.rectOf(target) : null);
    return target;
  }

  // ============================================== external drag and drop ===

  _wireDropTarget() {
    const accept = (event) => {
      const types = event.dataTransfer ? [...event.dataTransfer.types] : [];
      return types.includes(DRAG_MIME);
    };

    this.bind(this.overlay, 'dragover', (event) => {
      const dragEvent = /** @type {DragEvent} */ (event);
      if (!accept(dragEvent)) {
        return;
      }
      dragEvent.preventDefault();
      dragEvent.dataTransfer.dropEffect = 'copy';
      const point = this._toPagePoint(dragEvent);
      this._previewDropTarget(point, null);
    });

    this.bind(this.overlay, 'dragleave', () => this._setMarker('#dropMarker', null));

    this.bind(this.overlay, 'drop', (event) => {
      const dragEvent = /** @type {DragEvent} */ (event);
      if (!accept(dragEvent)) {
        return;
      }
      dragEvent.preventDefault();
      this._setMarker('#dropMarker', null);

      const kind = dragEvent.dataTransfer.getData(DRAG_MIME);
      if (!kind) {
        return;
      }
      const point = this._toPagePoint(dragEvent);
      const parent = app.engine.dropTarget(point.x, point.y, undefined) || 'root';
      const local = JSON.parse(app.engine.toLocalPoint(parent, point.x, point.y));
      app.addElement(kind, parent, Math.round(local[0]), Math.round(local[1]));
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
    editor.style.fontSize = style.font_size ? `${style.font_size}px` : '16px';
    editor.style.fontWeight = style.font_weight || '400';
    editor.style.lineHeight = style.line_height ? String(style.line_height) : '1.5';
    editor.style.textAlign = style.text_align || 'left';
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
    const value = this.textEditor.innerText.split('\u00A0').join(' ');
    this.textEditor.setAttribute('data-on', 'false');
    this.textEditor.textContent = '';
    if (commit) {
      app.beginGesture();
      app.setProperty(id, 'content', value);
      app.invalidate();
    }
  }

  // ================================================================ zoom ===

  _wireZoom() {
    this.bind(this.root, 'click', (event) => {
      const target = /** @type {HTMLElement} */ (event.target);
      const zoomButton = target.closest('[data-zoom]');
      if (zoomButton) {
        const action = zoomButton.getAttribute('data-zoom');
        if (action === 'in') {
          app.zoomBy(1.2);
        } else if (action === 'out') {
          app.zoomBy(1 / 1.2);
        } else if (action === 'fit') {
          this.zoomToFit();
        }
        return;
      }
      if (target.closest('#zoomValue')) {
        app.setZoom(1);
      }
      if (target.closest('[data-action="exit-preview"]')) {
        app.setMode('design');
      }
    });

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

  /** Scales the page so it fits the visible viewport. */
  zoomToFit() {
    const available = this.viewport.clientWidth - 96;
    if (available <= 0 || !this._pageWidth) {
      return;
    }
    app.setZoom(Math.min(1, available / this._pageWidth));
  }

  _syncZoomLabel() {
    const label = this.$('#zoomValue');
    if (label) {
      label.textContent = `${Math.round(app.state.zoom * 100)}%`;
    }
  }
}

customElements.define('forge-canvas', ForgeCanvas);
