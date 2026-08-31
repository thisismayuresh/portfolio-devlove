/**
 * Left dock: the element palette.
 *
 * Tiles are pointer-drag sources handled by {@link module:core/drag-controller};
 * the canvas is the drop target. The two only agree on an element `kind`
 * string, so neither knows anything about the other.
 *
 * @module ui/components/forge-palette
 */

import { PanelElement, esc } from '../panel-element.js';
import { icon } from '../icons.js';
import { app } from '../../core/app.js';
import { dragController } from '../../core/drag-controller.js';
import { BLUEPRINT_GROUPS } from '../../registry/elements.js';

export class ForgePalette extends PanelElement {
  static styles = `
    .root {
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 0;
      background: var(--surface-panel);
    }

    .search {
      flex: 0 0 auto;
      padding: 8px 10px;
      border-bottom: 1px solid var(--line-soft);
    }

    .body { flex: 1 1 auto; min-height: 0; padding: 4px 0 16px; }

    .group { border-bottom: 1px solid var(--line-soft); }
    .group:last-child { border-bottom: 0; }

    .group__head {
      display: flex;
      align-items: center;
      gap: 7px;
      width: 100%;
      height: 30px;
      padding: 0 8px 0 10px;
      color: var(--ink-dim);
      user-select: none;
    }
    .group__head:hover { background: var(--surface-hover); color: var(--ink); }
    .group__title {
      flex: 1 1 auto;
      text-align: left;
      font-size: var(--text-sm);
      font-weight: 500;
    }
    .group__caret {
      display: grid; place-items: center;
      width: 14px; height: 14px;
      color: var(--ink-faint);
      transition: transform 130ms var(--ease);
    }
    .group[data-open="false"] .group__caret { transform: rotate(-90deg); }
    .group[data-open="false"] .tiles { display: none; }

    .tiles {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 6px;
      padding: 2px 10px 12px;
    }

    .tile {
      display: grid;
      justify-items: center;
      align-content: center;
      gap: 7px;
      height: 62px;
      padding: 6px 3px;
      border: 1px solid var(--line);
      border-radius: var(--radius-md);
      background: var(--surface-raised);
      color: var(--ink-dim);
      cursor: grab;
      user-select: none;
      touch-action: none;
      transition: background 90ms var(--ease), border-color 90ms var(--ease),
                  color 90ms var(--ease), transform 90ms var(--ease);
    }
    .tile:hover {
      background: #2c3038;
      border-color: var(--line-strong);
      color: var(--ink-strong);
    }
    .tile:active { transform: scale(0.96); }
    .tile:focus-visible { outline: none; box-shadow: var(--focus-ring); }

    .tile__label {
      display: flex;
      align-items: baseline;
      gap: 3px;
      max-width: 100%;
      font-size: var(--text-xs);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .tile__key {
      color: var(--ink-faint);
      font-family: var(--font-mono);
      font-size: 9.5px;
    }
    .tile:hover .tile__key { color: var(--ink-dim); }

    .hint {
      margin: 12px 10px 0;
      padding: 9px 10px;
      border-radius: var(--radius-sm);
      background: var(--surface-sunken);
      color: var(--ink-faint);
      font-size: var(--text-xs);
      line-height: 1.6;
    }

    .no-match { padding: 24px 10px; text-align: center; color: var(--ink-faint); font-size: var(--text-sm); }
  `;

  template() {
    return `
      <div class="panel-head">
        ${icon('grid', 14)}
        <span class="panel-head__title">Elements</span>
      </div>
      <div class="search">
        <input class="input" id="filter" type="search" placeholder="Search elements"
               aria-label="Search elements" />
      </div>
      <div class="body scroll" id="body"></div>
    `;
  }

  mounted() {
    this._filter = '';
    /** @type {Set<string>} collapsed group titles */
    this._collapsed = new Set();
    this._render();

    const search = /** @type {HTMLInputElement} */ (this.$('#filter'));
    this.bind(search, 'input', () => {
      this._filter = search.value.trim().toLowerCase();
      this._render();
    });

    const body = this.$('#body');
    this.bind(body, 'pointerdown', (event) => this._onPointerDown(/** @type {PointerEvent} */ (event)));
    this.bind(body, 'click', (event) => this._onClick(/** @type {MouseEvent} */ (event)));
    this.bind(body, 'dblclick', (event) => this._onDoubleClick(/** @type {MouseEvent} */ (event)));
    this.bind(body, 'keydown', (event) => this._onKeyDown(/** @type {KeyboardEvent} */ (event)));
  }

  _render() {
    const query = this._filter;
    const groups = BLUEPRINT_GROUPS.map((group) => ({
      title: group.title,
      items: group.items.filter(
        (item) =>
          !query ||
          item.label.toLowerCase().includes(query) ||
          item.kind.includes(query) ||
          item.hint.toLowerCase().includes(query)
      ),
    })).filter((group) => group.items.length > 0);

    const body = this.$('#body');
    if (groups.length === 0) {
      body.innerHTML = `<p class="no-match">No element matches &ldquo;${esc(query)}&rdquo;.</p>`;
      return;
    }

    body.innerHTML =
      groups
        .map((group) => {
          const open = query ? true : !this._collapsed.has(group.title);
          return `
            <section class="group" data-open="${open}" data-group="${esc(group.title)}">
              <button class="group__head" type="button">
                <span class="group__title">${esc(group.title)}</span>
                <span class="group__caret">${icon('chevronDown', 12)}</span>
              </button>
              <div class="tiles">
                ${group.items.map((item) => this._renderTile(item)).join('')}
              </div>
            </section>`;
        })
        .join('') +
      `<p class="hint">Drag a tile onto the canvas, or double-click to drop it in.
        Hold <span class="kbd">Alt</span> while dragging an element to duplicate it.</p>`;
  }

  /**
   * @param {import('../../registry/elements.js').Blueprint} item
   * @returns {string}
   */
  _renderTile(item) {
    return `
      <button class="tile" type="button"
              data-kind="${esc(item.kind)}"
              data-icon="${esc(item.icon)}"
              data-label="${esc(item.label)}"
              title="${esc(item.hint)}${item.shortcut ? ` — press ${item.shortcut}` : ''}">
        ${icon(item.icon, 18)}
        <span class="tile__label">
          <span>${esc(item.label)}</span>${
            item.shortcut ? `<span class="tile__key">${esc(item.shortcut)}</span>` : ''
          }
        </span>
      </button>`;
  }

  /** @param {PointerEvent} event */
  _onPointerDown(event) {
    const tile = /** @type {HTMLElement} */ (event.target).closest('[data-kind]');
    if (!tile) {
      return;
    }
    dragController.arm(event, {
      type: 'blueprint',
      kind: tile.getAttribute('data-kind'),
      label: tile.getAttribute('data-label'),
      iconName: tile.getAttribute('data-icon'),
    });
  }

  /** @param {MouseEvent} event */
  _onClick(event) {
    const head = /** @type {HTMLElement} */ (event.target).closest('.group__head');
    if (!head) {
      return;
    }
    const group = head.closest('.group');
    const title = group.getAttribute('data-group');
    if (this._collapsed.has(title)) {
      this._collapsed.delete(title);
    } else {
      this._collapsed.add(title);
    }
    group.setAttribute('data-open', String(!this._collapsed.has(title)));
  }

  /** @param {MouseEvent} event */
  _onDoubleClick(event) {
    const tile = /** @type {HTMLElement} */ (event.target).closest('[data-kind]');
    if (tile) {
      this._dropInView(tile.getAttribute('data-kind'));
    }
  }

  /** @param {KeyboardEvent} event */
  _onKeyDown(event) {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }
    const tile = /** @type {HTMLElement} */ (event.target).closest('[data-kind]');
    if (tile) {
      event.preventDefault();
      this._dropInView(tile.getAttribute('data-kind'));
    }
  }

  /**
   * Keyboard and double-click path: place the element near the top-centre of
   * the page so it is always visible without a drag.
   *
   * @param {string | null} kind
   */
  _dropInView(kind) {
    if (!kind) {
      return;
    }
    const page = app.getPage();
    const width = Number(page.width) || 1280;
    app.addElement(kind, 'root', Math.round(width / 2 - 160), 64);
  }
}

customElements.define('forge-palette', ForgePalette);
