/**
 * Left dock: the element palette.
 *
 * Tiles are pointer-drag sources handled by {@link module:core/drag-controller};
 * the canvas is the drop target. The two only agree on a payload — an element
 * `kind` or a block `id` — so neither knows anything about the other.
 *
 * The panel shows two kinds of tile from two registries. A **blueprint** adds
 * one node; a **block** adds a whole arrangement of them. They look the same
 * and drag the same, and the only place that difference exists is the one line
 * in `_renderTile` that picks which attribute to write.
 *
 * @module ui/components/dl-palette
 */

import { PanelElement, esc } from '../panel-element.js';
import { icon } from '../icons.js';
import { app } from '../../core/app.js';
import { dragController } from '../../core/drag-controller.js';
import { BLUEPRINT_GROUPS } from '../../registry/elements.js';
import { BLOCK_GROUPS } from '../../registry/blocks.js';

export class DlPalette extends PanelElement {
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
      padding: 6px 10px;
    }

    .body { flex: 1 1 auto; min-height: 0; padding: 0 0 16px; }

    .group { border-bottom: 0; }

    /* Caret first, then the label — the shape VS Code's tree views use, and
       the reason the rows below can indent under it. */
    .group__head {
      display: flex;
      align-items: center;
      gap: 4px;
      width: 100%;
      height: var(--row-h);
      padding: 0 10px 0 4px;
      color: var(--ink);
      user-select: none;
    }
    .group__head:hover { background: var(--surface-hover); }
    .group__title {
      flex: 1 1 auto;
      text-align: left;
      font-size: var(--text-xs);
      font-weight: 600;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }
    .group__caret {
      display: grid; place-items: center;
      width: 16px; height: 16px;
      color: var(--ink-dim);
      transition: transform 100ms var(--ease);
    }
    .group[data-open="false"] .group__caret { transform: rotate(-90deg); }
    .group[data-open="false"] .tiles { display: none; }

    /* Square tiles on a hairline grid, not rounded cards and not a plain list.
       A drag source wants a target big enough to grab, and a shape that says
       "pick me up" — but the corners stay square like everything else here,
       and the borders are shared 1px rules rather than a gap between floating
       chips. It reads as a tool palette rather than as a web page. */
    .tiles {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 1px;
      margin: 0 10px 10px;
      padding: 1px;
      background: var(--line);
      border: 1px solid var(--line);
    }

    .tile {
      display: grid;
      justify-items: center;
      align-content: center;
      gap: 7px;
      aspect-ratio: 1 / 1;
      padding: 4px 2px;
      background: var(--surface-panel);
      color: var(--ink-dim);
      cursor: grab;
      user-select: none;
      touch-action: none;
      transition: background 70ms var(--ease), color 70ms var(--ease);
    }
    .tile:hover { background: var(--surface-raised); color: var(--ink-strong); }
    .tile:active { background: var(--surface-active); }
    .tile:focus-visible { outline: 1px solid var(--accent); outline-offset: -2px; }

    .tile__label {
      max-width: 100%;
      font-size: var(--text-sm);
      color: var(--ink);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .tile:hover .tile__label { color: var(--ink-strong); }

    /* The shortcut letter sits in the corner, the way a keycap hint does in
       an editor's command palette. */
    .tile__key {
      position: absolute;
      top: 3px;
      right: 4px;
      color: var(--ink-faint);
      font-family: var(--font-mono);
      font-size: 9.5px;
      line-height: 1;
    }
    .tile { position: relative; }
    .tile:hover .tile__key { color: var(--ink-dim); }

    .tile--filler { cursor: default; pointer-events: none; }
    .tile--filler:hover { background: var(--surface-panel); }

    .hint {
      margin: 10px 12px 0;
      padding: 0;
      color: var(--ink-faint);
      font-size: var(--text-xs);
      line-height: 1.7;
    }

    .no-match { padding: 24px 10px; text-align: center; color: var(--ink-faint); font-size: var(--text-sm); }
  `;

  template() {
    return `
      <div class="panel-head">
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
    this.bind(body, 'pointerdown', (event) =>
      this._onPointerDown(/** @type {PointerEvent} */ (event))
    );
    this.bind(body, 'click', (event) => this._onClick(/** @type {MouseEvent} */ (event)));
    this.bind(body, 'dblclick', (event) => this._onDoubleClick(/** @type {MouseEvent} */ (event)));
    this.bind(body, 'keydown', (event) => this._onKeyDown(/** @type {KeyboardEvent} */ (event)));
  }

  _render() {
    const query = this._filter;
    const groups = [...BLUEPRINT_GROUPS, ...BLOCK_GROUPS]
      .map((group) => ({
        title: group.title,
        items: group.items.filter(
          (item) =>
            !query ||
            item.label.toLowerCase().includes(query) ||
            (item.kind || item.block).includes(query) ||
            item.hint.toLowerCase().includes(query)
        ),
      }))
      .filter((group) => group.items.length > 0);

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
                <span class="group__caret">${icon('chevronDown', 14)}</span>
                <span class="group__title">${esc(group.title)}</span>
              </button>
              <div class="tiles">
                ${group.items.map((item) => this._renderTile(item)).join('')}
                ${fillers(group.items.length)}
              </div>
            </section>`;
        })
        .join('') +
      `<p class="hint">Drag onto the canvas, or double-click to drop it in.
        Hold <span class="kbd">Alt</span> while dragging to duplicate.</p>`;
  }

  /**
   * One tile, for either registry.
   *
   * A block carries `data-block` and an element carries `data-kind`; that
   * single attribute is the whole difference, here and downstream.
   *
   * @param {import('../../registry/elements.js').Blueprint |
   *         import('../../registry/blocks.js').Block} item
   * @returns {string}
   */
  _renderTile(item) {
    const payload = item.block
      ? `data-block="${esc(item.block)}"`
      : `data-kind="${esc(item.kind)}"`;
    return `
      <button class="tile" type="button"
              ${payload}
              data-icon="${esc(item.icon)}"
              data-label="${esc(item.label)}"
              title="${esc(item.hint)}${item.shortcut ? ` — press ${item.shortcut}` : ''}">
        ${icon(item.icon, 19)}
        <span class="tile__label">${esc(item.label)}</span>
        ${item.shortcut ? `<span class="tile__key">${esc(item.shortcut)}</span>` : ''}
      </button>`;
  }

  /** @param {PointerEvent} event */
  _onPointerDown(event) {
    const tile = /** @type {HTMLElement} */ (event.target).closest(TILE_SELECTOR);
    if (!tile) {
      return;
    }
    const block = tile.getAttribute('data-block');
    dragController.arm(event, {
      ...(block
        ? { type: 'block', block }
        : { type: 'blueprint', kind: tile.getAttribute('data-kind') }),
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
    const tile = /** @type {HTMLElement} */ (event.target).closest(TILE_SELECTOR);
    if (tile) {
      this._dropInView(tile);
    }
  }

  /** @param {KeyboardEvent} event */
  _onKeyDown(event) {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }
    const tile = /** @type {HTMLElement} */ (event.target).closest(TILE_SELECTOR);
    if (tile) {
      event.preventDefault();
      this._dropInView(tile);
    }
  }

  /**
   * Keyboard and double-click path: place it near the top-centre of the page
   * so it is always visible without a drag.
   *
   * @param {HTMLElement} tile
   */
  _dropInView(tile) {
    const page = app.getPage();
    const x = Math.round((Number(page.width) || 1280) / 2 - 160);
    const block = tile.getAttribute('data-block');
    if (block) {
      app.addBlock(block, 'root', x, 64);
      return;
    }
    const kind = tile.getAttribute('data-kind');
    if (kind) {
      app.addElement(kind, 'root', x, 64);
    }
  }
}

/** Matches a tile from either registry. */
const TILE_SELECTOR = '[data-kind],[data-block]';

/** Tiles per row; must match `grid-template-columns` above. */
const COLUMNS = 3;

/**
 * Blank cells padding a group's last row out to a full one.
 *
 * The grid draws its own hairlines by showing its background through 1px gaps,
 * which is what keeps the tiles flush instead of floating. The cost is that a
 * short last row would leave a strip of that background exposed — these fill
 * it, and nothing else.
 *
 * @param {number} count how many real tiles the group has
 * @returns {string}
 */
function fillers(count) {
  const missing = (COLUMNS - (count % COLUMNS)) % COLUMNS;
  return '<span class="tile tile--filler" aria-hidden="true"></span>'.repeat(missing);
}

customElements.define('dl-palette', DlPalette);
