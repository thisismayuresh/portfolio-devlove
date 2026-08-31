/**
 * Left dock: the layer tree.
 *
 * Mirrors the engine's node hierarchy, drives selection, and supports
 * drag-to-reparent with three drop zones per row (above / into / below).
 * Dragging is pointer-based so it behaves identically inside a shadow root
 * and can also drop onto the canvas — see `core/drag-controller.js`.
 *
 * @module ui/components/dl-layers
 */

import { PanelElement, esc } from '../panel-element.js';
import { icon } from '../icons.js';
import { app } from '../../core/app.js';
import { dragController } from '../../core/drag-controller.js';
import { blueprintFor } from '../../registry/elements.js';

/** Fraction of a row height treated as an "insert beside" zone. */
const EDGE_ZONE = 0.3;

export class DlLayers extends PanelElement {
  static styles = `
    .root {
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 0;
      background: var(--surface-panel);
    }

    .tree { flex: 1 1 auto; min-height: 0; padding: 4px 0 16px; }

    .row {
      position: relative;
      display: flex;
      align-items: center;
      gap: 5px;
      height: var(--row-h);
      padding-right: 5px;
      color: var(--ink-dim);
      cursor: default;
      user-select: none;
      touch-action: none;
    }
    .row:hover { background: var(--surface-hover); color: var(--ink); }
    .row[data-selected="true"] { background: var(--surface-active); color: var(--ink-strong); }
    .row[data-selected="true"]::before {
      content: "";
      position: absolute;
      left: 0; top: 0; bottom: 0;
      width: 1px;
      background: var(--ink-strong);
    }
    .row[data-peek="true"] { background: var(--surface-active); }
    .row[data-dim="true"] { opacity: 0.45; }

    .row[data-drop="into"] { box-shadow: inset 0 0 0 1px var(--accent); }
    .row[data-drop="before"]::after,
    .row[data-drop="after"]::after {
      content: "";
      position: absolute;
      left: 6px; right: 6px;
      height: 1px;
      background: var(--accent);
    }
    .row[data-drop="before"]::after { top: -1px; }
    .row[data-drop="after"]::after { bottom: -1px; }

    .row__caret {
      display: grid;
      place-items: center;
      width: 14px; height: 14px;
      flex: 0 0 auto;
      color: var(--ink-faint);
    }
    .row__caret:hover { background: var(--surface-active); color: var(--ink); }
    .row__caret[data-leaf="true"] { visibility: hidden; }
    .row__caret[data-open="false"] svg { transform: rotate(-90deg); }
    .row__caret svg { transition: transform 110ms var(--ease); }

    .row__icon { flex: 0 0 auto; color: var(--ink-faint); }
    .row[data-selected="true"] .row__icon { color: var(--ink-strong); }

    .row__name {
      flex: 1 1 auto;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: var(--text-sm);
    }

    .row__toggle {
      display: grid;
      place-items: center;
      width: 18px; height: 18px;
      flex: 0 0 auto;
      color: var(--ink-faint);
      opacity: 0;
    }
    .row:hover .row__toggle,
    .row__toggle[data-on="true"] { opacity: 1; }
    .row__toggle:hover { background: var(--surface-active); color: var(--ink); }
  `;

  template() {
    return `
      <div class="panel-head">
        ${icon('layers', 14)}
        <span class="panel-head__title">Layers</span>
        <button class="icon-btn" data-action="collapse" title="Collapse all" aria-label="Collapse all">
          ${icon('minus', 14)}
        </button>
      </div>
      <div class="tree scroll" id="tree" role="tree" aria-label="Layers"></div>
    `;
  }

  mounted() {
    /** ids that are expanded; the root starts open @type {Set<string>} */
    this._open = new Set(['root']);
    /** @type {string | null} */
    this._dragId = null;

    const tree = this.$('#tree');
    this.bind(tree, 'click', (e) => this._onClick(/** @type {MouseEvent} */ (e)));
    this.bind(tree, 'dblclick', (e) => this._onRename(/** @type {MouseEvent} */ (e)));
    this.bind(tree, 'pointerover', (e) => this._onHover(/** @type {PointerEvent} */ (e)));
    this.bind(tree, 'pointerdown', (e) => this._onPointerDown(/** @type {PointerEvent} */ (e)));
    this.bind(tree, 'pointerleave', () => app.setHover(null));

    this.bind(this.$('[data-action="collapse"]'), 'click', () => {
      this._open = new Set(['root']);
      this._render();
    });

    // Reparent-by-drag: the controller owns the pointer, this panel just paints
    // the insertion marker for whichever row is underneath.
    this.listen('drag:start', (payload) => {
      if (payload.type === 'node') {
        this._dragId = payload.id;
      }
    });
    this.listen('drag:move', (payload) => this._paintDropZone(payload));
    this.listen('drag:end', (payload) => this._finishDrag(payload));

    this.listen(['ready', 'document', 'node'], () => this._render());
    this.listen('selection', () => this._syncSelection());
    this.listen('hover', () => this._syncHover());
    this._render();
  }

  _render() {
    if (!app.engine) {
      return;
    }
    const tree = app.getTree();
    const host = this.$('#tree');
    if (!tree) {
      host.innerHTML = '<div class="empty">No document</div>';
      return;
    }
    host.innerHTML = this._renderNode(tree, 0);
    this._syncSelection();
    this._syncHover();
  }

  /**
   * @param {any} node
   * @param {number} depth
   * @returns {string}
   */
  _renderNode(node, depth) {
    const blueprint = blueprintFor(node.kind);
    const hasChildren = node.children.length > 0;
    const open = this._open.has(node.id);
    const indent = 5 + depth * 12;

    const row = `
      <div class="row" role="treeitem" tabindex="-1"
           data-id="${esc(node.id)}"
           data-kind="${esc(node.kind)}"
           data-label="${esc(node.name)}"
           data-icon="${esc(blueprint.icon)}"
           data-dim="${node.hidden}"
           aria-expanded="${hasChildren ? open : 'false'}"
           style="padding-left:${indent}px">
        <span class="row__caret" data-role="caret" data-leaf="${!hasChildren}" data-open="${open}">
          ${icon('chevronDown', 12)}
        </span>
        <span class="row__icon">${icon(blueprint.icon, 14)}</span>
        <span class="row__name">${esc(node.name)}</span>
        <span class="row__toggle" data-role="visibility" data-on="${node.hidden}"
              title="${node.hidden ? 'Show' : 'Hide'}">
          ${icon(node.hidden ? 'eyeOff' : 'eye', 13)}
        </span>
        <span class="row__toggle" data-role="lock" data-on="${node.locked}"
              title="${node.locked ? 'Unlock' : 'Lock'}">
          ${icon(node.locked ? 'lock' : 'unlock', 13)}
        </span>
      </div>`;

    if (!hasChildren || !open) {
      return row;
    }
    return row + node.children.map((child) => this._renderNode(child, depth + 1)).join('');
  }

  _syncSelection() {
    const selected = app.state.selected;
    const primary = app.state.selection;
    for (const row of this.$$('.row')) {
      const id = row.getAttribute('data-id');
      row.setAttribute('data-selected', String(selected.includes(id)));
      // Only the primary scrolls into view. Scrolling for every row of a
      // multi-selection would fight itself and land on whichever was last.
      if (id === primary) {
        row.scrollIntoView({ block: 'nearest' });
      }
    }
  }

  _syncHover() {
    const hovered = app.state.hover;
    for (const row of this.$$('.row')) {
      row.setAttribute('data-peek', String(row.getAttribute('data-id') === hovered));
    }
  }

  // ------------------------------------------------------------- pointer --

  /** @param {PointerEvent} event */
  _onPointerDown(event) {
    const target = /** @type {HTMLElement} */ (event.target);
    if (target.closest('[data-role]')) {
      return; // caret / eye / lock are clicks, never drags
    }
    const row = target.closest('.row');
    const id = row && row.getAttribute('data-id');
    if (!id || id === 'root') {
      return;
    }
    dragController.arm(event, {
      type: 'node',
      id,
      label: row.getAttribute('data-label') || id,
      iconName: row.getAttribute('data-icon') || 'container',
    });
  }

  /** @param {MouseEvent} event */
  _onClick(event) {
    const target = /** @type {HTMLElement} */ (event.target);
    const row = target.closest('.row');
    if (!row) {
      return;
    }
    const id = row.getAttribute('data-id');
    const role = target.closest('[data-role]')?.getAttribute('data-role');

    if (role === 'caret') {
      if (this._open.has(id)) {
        this._open.delete(id);
      } else {
        this._open.add(id);
      }
      this._render();
      return;
    }
    if (role === 'visibility') {
      const node = app.getNode(id);
      app.setProperty(id, 'hidden', node && node.hidden ? 'false' : 'true');
      this._render();
      return;
    }
    if (role === 'lock') {
      const node = app.getNode(id);
      app.setProperty(id, 'locked', node && node.locked ? 'false' : 'true');
      this._render();
      return;
    }
    const picked = id === 'root' ? null : id;
    // Ctrl-click adds to the selection, the same as on the canvas.
    if (picked && (event.ctrlKey || event.metaKey)) {
      app.toggleSelection(picked);
      return;
    }
    app.select(picked);
  }

  /** @param {MouseEvent} event */
  _onRename(event) {
    const row = /** @type {HTMLElement} */ (event.target).closest('.row');
    if (!row) {
      return;
    }
    const id = row.getAttribute('data-id');
    const node = app.getNode(id);
    if (!node) {
      return;
    }
    const next = window.prompt('Layer name', node.name);
    if (next !== null) {
      app.setProperty(id, 'name', next);
      this._render();
    }
  }

  /** @param {PointerEvent} event */
  _onHover(event) {
    if (dragController.active) {
      return;
    }
    const row = /** @type {HTMLElement} */ (event.target).closest('.row');
    app.setHover(row ? row.getAttribute('data-id') : null);
  }

  // ---------------------------------------------------------------- drag --

  /** @param {{clientX: number, clientY: number, type: string}} payload */
  _paintDropZone(payload) {
    if (payload.type !== 'node') {
      return;
    }
    this._clearDropMarkers();
    const row = this._rowAt(payload.clientX, payload.clientY);
    if (!row) {
      return;
    }
    row.setAttribute('data-drop', this._zoneFor(row, payload.clientY));
  }

  /** @param {any} payload */
  _finishDrag(payload) {
    const dragged = this._dragId;
    this._dragId = null;
    this._clearDropMarkers();

    if (payload.type !== 'node' || !dragged || payload.cancelled) {
      return;
    }
    const row = this._rowAt(payload.clientX, payload.clientY);
    if (!row) {
      return; // dropped elsewhere — the canvas handles that case
    }
    const targetId = row.getAttribute('data-id');
    if (!targetId || targetId === dragged) {
      return;
    }

    const zone = this._zoneFor(row, payload.clientY);
    if (zone === 'into') {
      if (app.reparent(dragged, targetId, -1)) {
        this._open.add(targetId);
      }
      return;
    }

    const target = app.getNode(targetId);
    if (!target) {
      return;
    }
    const parentId = target.parent || 'root';
    const parent = app.getNode(parentId);
    if (!parent) {
      return;
    }
    const position = parent.children.indexOf(targetId);
    app.reparent(dragged, parentId, zone === 'before' ? position : position + 1);
  }

  /**
   * @param {number} clientX
   * @param {number} clientY
   * @returns {Element | null}
   */
  _rowAt(clientX, clientY) {
    for (const row of this.$$('.row')) {
      const box = row.getBoundingClientRect();
      if (
        clientX >= box.left &&
        clientX <= box.right &&
        clientY >= box.top &&
        clientY <= box.bottom
      ) {
        return row;
      }
    }
    return null;
  }

  /**
   * @param {Element} row
   * @param {number} clientY
   * @returns {'before' | 'into' | 'after'}
   */
  _zoneFor(row, clientY) {
    const box = row.getBoundingClientRect();
    const ratio = (clientY - box.top) / Math.max(1, box.height);
    const kind = row.getAttribute('data-kind');
    const container = kind === 'root' || blueprintFor(kind).container;

    if (!container) {
      return ratio < 0.5 ? 'before' : 'after';
    }
    if (ratio < EDGE_ZONE) {
      return 'before';
    }
    if (ratio > 1 - EDGE_ZONE) {
      return 'after';
    }
    return 'into';
  }

  _clearDropMarkers() {
    for (const row of this.$$('.row[data-drop]')) {
      row.removeAttribute('data-drop');
    }
  }
}

customElements.define('dl-layers', DlLayers);
