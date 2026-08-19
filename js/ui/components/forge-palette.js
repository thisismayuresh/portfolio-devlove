/**
 * Left rail, top half: the element palette.
 *
 * Tiles are native HTML5 drag sources. The canvas is the drop target; the two
 * only agree on the {@link DRAG_MIME} key and the element kind string.
 *
 * @module ui/components/forge-palette
 */

import { PanelElement, esc } from '../panel-element.js';
import { icon } from '../icons.js';
import { app } from '../../core/app.js';
import { BLUEPRINT_GROUPS, DRAG_MIME } from '../../registry/elements.js';

export class ForgePalette extends PanelElement {
  static styles = `
    .root {
      display: grid;
      grid-template-rows: auto minmax(0, 1fr);
      height: 100%;
      min-height: 0;
      background: var(--surface-panel);
      border-bottom: 1px solid var(--line);
    }

    .head {
      display: flex;
      align-items: center;
      gap: 6px;
      height: 30px;
      padding: 0 8px;
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

    .search { padding: 8px 8px 4px; }
    .body { padding: 0 8px 10px; }

    .group { margin-top: 10px; }
    .group__label {
      margin: 0 0 6px 2px;
      font-size: var(--text-xs);
      color: var(--ink-faint);
      letter-spacing: 0.04em;
    }

    .tiles {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 6px;
    }

    .tile {
      display: grid;
      justify-items: center;
      align-content: center;
      gap: 6px;
      height: 60px;
      padding: 6px 4px;
      border: 1px solid var(--line);
      border-radius: var(--radius-md);
      background: var(--surface-raised);
      color: var(--ink-dim);
      cursor: grab;
      user-select: none;
      transition: background 90ms var(--ease), border-color 90ms var(--ease),
                  color 90ms var(--ease), transform 90ms var(--ease);
    }
    .tile:hover {
      background: #262a31;
      border-color: var(--line-strong);
      color: var(--ink);
    }
    .tile:active { cursor: grabbing; transform: scale(0.97); }
    .tile:focus-visible { outline: none; box-shadow: var(--focus-ring); }
    .tile[data-dragging="true"] { opacity: 0.4; }

    .tile__label {
      font-size: var(--text-xs);
      letter-spacing: 0.01em;
      text-align: center;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: 100%;
    }

    .hint {
      margin: 12px 2px 0;
      padding: 8px;
      border-radius: var(--radius-sm);
      background: var(--surface-sunken);
      color: var(--ink-faint);
      font-size: var(--text-xs);
      line-height: 1.5;
    }

    .no-match { padding: 20px 8px; text-align: center; color: var(--ink-faint); font-size: var(--text-sm); }
  `;

  template() {
    return `
      <div class="head">
        ${icon('grid', 14)}
        <span class="head__title">Elements</span>
      </div>
      <div class="scroll">
        <div class="search">
          <input class="input" id="filter" type="search" placeholder="Search elements" aria-label="Search elements" />
        </div>
        <div class="body" id="body"></div>
      </div>
    `;
  }

  mounted() {
    this._filter = '';
    this._renderGroups();

    const search = /** @type {HTMLInputElement} */ (this.$('#filter'));
    this.bind(search, 'input', () => {
      this._filter = search.value.trim().toLowerCase();
      this._renderGroups();
    });

    const body = this.$('#body');
    this.bind(body, 'dragstart', (event) => this._onDragStart(/** @type {DragEvent} */ (event)));
    this.bind(body, 'dragend', (event) => this._onDragEnd(/** @type {DragEvent} */ (event)));
    this.bind(body, 'dblclick', (event) => this._onDoubleClick(/** @type {MouseEvent} */ (event)));
    this.bind(body, 'keydown', (event) => this._onKeyDown(/** @type {KeyboardEvent} */ (event)));
  }

  _renderGroups() {
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
      body.innerHTML = `<p class="no-match">No element matches “${esc(query)}”.</p>`;
      return;
    }

    body.innerHTML =
      groups
        .map(
          (group) => `
            <section class="group">
              <p class="group__label">${esc(group.title)}</p>
              <div class="tiles">
                ${group.items
                  .map(
                    (item) => `
                      <button class="tile" type="button" draggable="true"
                              data-kind="${esc(item.kind)}"
                              title="${esc(item.hint)} — drag onto the canvas, or double-click to drop it in the centre">
                        ${icon(item.icon, 18)}
                        <span class="tile__label">${esc(item.label)}</span>
                      </button>`
                  )
                  .join('')}
              </div>
            </section>`
        )
        .join('') +
      `<p class="hint">Drag a tile onto the canvas. Hold <span class="kbd">Alt</span> while dragging an element to duplicate it.</p>`;
  }

  /** @param {DragEvent} event */
  _onDragStart(event) {
    const tile = /** @type {HTMLElement} */ (event.target).closest('[data-kind]');
    if (!tile || !event.dataTransfer) {
      return;
    }
    const kind = tile.getAttribute('data-kind');
    event.dataTransfer.setData(DRAG_MIME, kind);
    event.dataTransfer.setData('text/plain', kind);
    event.dataTransfer.effectAllowed = 'copy';
    tile.setAttribute('data-dragging', 'true');
    app.setStatus(`Drop the ${kind} anywhere on the canvas`, 'muted');
  }

  /** @param {DragEvent} event */
  _onDragEnd(event) {
    const tile = /** @type {HTMLElement} */ (event.target).closest('[data-kind]');
    if (tile) {
      tile.removeAttribute('data-dragging');
    }
  }

  /** @param {MouseEvent} event */
  _onDoubleClick(event) {
    const tile = /** @type {HTMLElement} */ (event.target).closest('[data-kind]');
    if (tile) {
      this._dropInCentre(tile.getAttribute('data-kind'));
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
      this._dropInCentre(tile.getAttribute('data-kind'));
    }
  }

  /**
   * Keyboard and double-click path: place the element near the top-centre of
   * the page so it is always visible without a drag.
   *
   * @param {string | null} kind
   */
  _dropInCentre(kind) {
    if (!kind) {
      return;
    }
    const page = app.getPage();
    const width = Number(page.width) || 1280;
    app.addElement(kind, 'root', Math.round(width / 2 - 160), 64);
  }
}

customElements.define('forge-palette', ForgePalette);
