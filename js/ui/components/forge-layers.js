/**
 * Left rail, bottom half: the layer tree.
 *
 * Mirrors the engine's node hierarchy, drives selection, and supports
 * drag-to-reparent with three drop zones per row (above / into / below).
 *
 * @module ui/components/forge-layers
 */

import { PanelElement, esc } from '../panel-element.js';
import { icon } from '../icons.js';
import { app } from '../../core/app.js';
import { blueprintFor } from '../../registry/elements.js';

/** DataTransfer key used when dragging a row. */
const NODE_MIME = 'application/x-forge-node';

/** Fraction of a row height treated as an "insert beside" zone. */
const EDGE_ZONE = 0.28;

export class ForgeLayers extends PanelElement {
  static styles = `
    .root {
      display: grid;
      grid-template-rows: auto minmax(0, 1fr);
      height: 100%;
      min-height: 0;
      background: var(--surface-panel);
    }

    .head {
      display: flex;
      align-items: center;
      gap: 6px;
      height: 30px;
      padding: 0 6px 0 8px;
      border-bottom: 1px solid var(--line-soft);
      color: var(--ink-dim);
    }
    .head__title {
      flex: 1 1 auto;
      font-size: var(--text-xs);
      font-weight: 600;
      letter-spacing: 0.07em;
      text-transform: uppercase;
    }

    .tree { padding: 4px 0 12px; }

    .row {
      position: relative;
      display: flex;
      align-items: center;
      gap: 4px;
      height: var(--row-h);
      padding-right: 4px;
      color: var(--ink-dim);
      cursor: default;
      user-select: none;
    }
    .row:hover { background: var(--surface-hover); color: var(--ink); }
    .row[data-selected="true"] { background: var(--accent-wash); color: var(--ink-strong); }
    .row[data-selected="true"]::before {
      content: "";
      position: absolute;
      left: 0; top: 0; bottom: 0;
      width: 2px;
      background: var(--accent);
    }
    .row[data-hidden="true"] { opacity: 0.45; }
    .row[data-dragging="true"] { opacity: 0.4; }

    .row[data-drop="into"] { box-shadow: inset 0 0 0 1px var(--accent); border-radius: 3px; }
    .row[data-drop="before"]::after,
    .row[data-drop="after"]::after {
      content: "";
      position: absolute;
      left: 6px; right: 6px;
      height: 2px;
      background: var(--accent);
      border-radius: 2px;
    }
    .row[data-drop="before"]::after { top: -1px; }
    .row[data-drop="after"]::after { bottom: -1px; }

    .row__caret {
      display: grid;
      place-items: center;
      width: 14px; height: 14px;
      flex: 0 0 auto;
      color: var(--ink-faint);
      border-radius: 2px;
    }
    .row__caret:hover { background: var(--surface-active); color: var(--ink); }
    .row__caret[data-leaf="true"] { visibility: hidden; }
    .row__caret[data-open="false"] svg { transform: rotate(-90deg); }
    .row__caret svg { transition: transform 110ms var(--ease); }

    .row__icon { flex: 0 0 auto; color: var(--ink-faint); }
    .row[data-selected="true"] .row__icon { color: var(--accent); }

    .row__name {
      flex: 1 1 auto;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: var(--text-sm);
    }

    .row__tag {
      flex: 0 0 auto;
      color: var(--ink-faint);
      font-size: 10px;
      font-family: var(--font-mono);
      opacity: 0;
    }
    .row:hover .row__tag { opacity: 1; }

    .row__toggle {
      display: grid;
      place-items: center;
      width: 18px; height: 18px;
      flex: 0 0 auto;
      border-radius: 3px;
      color: var(--ink-faint);
      opacity: 0;
    }
    .row:hover .row__toggle,
    .row__toggle[data-on="true"] { opacity: 1; }
    .row__toggle:hover { background: var(--surface-active); color: var(--ink); }
  `;

  template() {
    return `
      <div class="head">
        ${icon('layers', 14)}
        <span class="head__title">Layers</span>
        <button class="icon-btn" data-action="collapse" title="Collapse all" aria-label="Collapse all">
          ${icon('minus', 14)}
        </button>
      </div>
      <div class="scroll">
        <div class="tree" id="tree" role="tree" aria-label="Layers"></div>
      </div>
    `;
  }

  mounted() {
    /** ids that are expanded; the root starts open @type {Set<string>} */
    this._open = new Set(['root']);
    /** @type {string | null} */
    this._dragId = null;

    const tree = this.$('#tree');
    this.bind(tree, 'click', (event) => this._onClick(/** @type {MouseEvent} */ (event)));
    this.bind(tree, 'dblclick', (event) => this._onRename(/** @type {MouseEvent} */ (event)));
    this.bind(tree, 'pointerover', (event) => this._onHover(/** @type {PointerEvent} */ (event)));
    this.bind(tree, 'pointerleave', () => app.setHover(null));
    this.bind(tree, 'dragstart', (event) => this._onDragStart(/** @type {DragEvent} */ (event)));
    this.bind(tree, 'dragover', (event) => this._onDragOver(/** @type {DragEvent} */ (event)));
    this.bind(tree, 'dragleave', (event) => this._onDragLeave(/** @type {DragEvent} */ (event)));
    this.bind(tree, 'drop', (event) => this._onDrop(/** @type {DragEvent} */ (event)));
    this.bind(tree, 'dragend', () => this._clearDropMarkers());

    const collapse = this.$('[data-action="collapse"]');
    this.bind(collapse, 'click', () => {
      this._open = new Set(['root']);
      this._render();
    });

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
    const indent = 4 + depth * 12;

    const row = `
      <div class="row" role="treeitem" tabindex="-1"
           data-id="${esc(node.id)}"
           data-hidden="${node.hidden}"
           draggable="${node.id === 'root' ? 'false' : 'true'}"
           aria-expanded="${hasChildren ? open : 'false'}"
           style="padding-left:${indent}px">
        <span class="row__caret" data-role="caret" data-leaf="${!hasChildren}" data-open="${open}">
          ${icon('chevronDown', 12)}
        </span>
        <span class="row__icon">${icon(blueprint.icon, 14)}</span>
        <span class="row__name">${esc(node.name)}</span>
        <span class="row__tag">${esc(node.kind)}</span>
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
    const selected = app.state.selection;
    for (const row of this.$$('.row')) {
      const isSelected = row.getAttribute('data-id') === selected;
      row.setAttribute('data-selected', String(isSelected));
      if (isSelected) {
        row.scrollIntoView({ block: 'nearest' });
      }
    }
  }

  _syncHover() {
    const hovered = app.state.hover;
    for (const row of this.$$('.row')) {
      row.toggleAttribute('data-peek', row.getAttribute('data-id') === hovered);
    }
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
    app.select(id === 'root' ? null : id);
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
    const row = /** @type {HTMLElement} */ (event.target).closest('.row');
    app.setHover(row ? row.getAttribute('data-id') : null);
  }

  /** @param {DragEvent} event */
  _onDragStart(event) {
    const row = /** @type {HTMLElement} */ (event.target).closest('.row');
    if (!row || !event.dataTransfer) {
      return;
    }
    const id = row.getAttribute('data-id');
    if (!id || id === 'root') {
      event.preventDefault();
      return;
    }
    this._dragId = id;
    row.setAttribute('data-dragging', 'true');
    event.dataTransfer.setData(NODE_MIME, id);
    event.dataTransfer.effectAllowed = 'move';
  }

  /** @param {DragEvent} event */
  _onDragOver(event) {
    if (!this._dragId) {
      return;
    }
    const row = /** @type {HTMLElement} */ (event.target).closest('.row');
    if (!row) {
      return;
    }
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
    this._clearDropMarkers();
    row.setAttribute('data-drop', this._zoneFor(row, event.clientY));
  }

  /** @param {DragEvent} event */
  _onDragLeave(event) {
    const row = /** @type {HTMLElement} */ (event.target).closest('.row');
    if (row) {
      row.removeAttribute('data-drop');
    }
  }

  /**
   * @param {Element} row
   * @param {number} clientY
   * @returns {'before' | 'into' | 'after'}
   */
  _zoneFor(row, clientY) {
    const box = row.getBoundingClientRect();
    const ratio = (clientY - box.top) / Math.max(1, box.height);
    const id = row.getAttribute('data-id');
    const node = app.getNode(id);
    const container = Boolean(node) && blueprintFor(node.kind).container;

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

  /** @param {DragEvent} event */
  _onDrop(event) {
    const dragged = this._dragId;
    this._dragId = null;
    if (!dragged) {
      return;
    }
    event.preventDefault();

    const row = /** @type {HTMLElement} */ (event.target).closest('.row');
    this._clearDropMarkers();
    if (!row) {
      return;
    }
    const targetId = row.getAttribute('data-id');
    if (!targetId || targetId === dragged) {
      return;
    }

    const zone = this._zoneFor(row, event.clientY);
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
    const index = zone === 'before' ? position : position + 1;
    app.reparent(dragged, parentId, index);
  }

  _clearDropMarkers() {
    for (const row of this.$$('.row[data-drop]')) {
      row.removeAttribute('data-drop');
    }
    for (const row of this.$$('.row[data-dragging]')) {
      row.removeAttribute('data-dragging');
    }
  }
}

customElements.define('forge-layers', ForgeLayers);
