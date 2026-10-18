/**
 * The canvas context menu.
 *
 * The canvas decides *what* the menu offers — it builds an item list from the
 * element under the pointer (or the page, when the pointer hit nothing) and
 * emits it on the `context:open` topic. This component only lays the list out
 * and runs whichever entry is chosen. That split is the point: the menu knows
 * nothing about elements, and the canvas knows nothing about pixels-on-screen
 * for menus.
 *
 * The menu closes on Escape, on any key it does not handle, on a pointerdown
 * outside itself, on window resize, on any scroll (captured, so the canvas's
 * own scrolling counts), and on a switch into preview mode.
 *
 * @module ui/components/dl-context-menu
 */

import { PanelElement, esc } from '../panel-element.js';

/** How the menu spells a binding, matching the inspector's tooltip style. */
const KEY_NAMES = Object.freeze({
  ctrl: 'Ctrl',
  shift: 'Shift',
  alt: 'Alt',
  delete: 'Del',
  backspace: '⌫',
  escape: 'Esc',
  enter: 'Enter',
});

/**
 * @param {string} keys a binding signature, e.g. `'ctrl+shift+z'`
 * @returns {string} the same binding as a reader would spell it
 */
function formatKeys(keys) {
  return keys
    .split('+')
    .map((part) => KEY_NAMES[part] || part.charAt(0).toUpperCase() + part.slice(1))
    .join('+');
}

export class DlContextMenu extends PanelElement {
  static styles = `
    /* Hidden host; the menu positions itself in viewport coordinates. */
    :host { position: fixed; inset: 0 auto auto 0; z-index: 55; display: none; }
    :host([data-open='true']) { display: block; }

    .menu {
      position: fixed;
      min-width: 200px;
      max-height: calc(100vh - 24px);
      overflow: auto;
      padding: 4px 0;
      border: 1px solid var(--line-strong);
      background: var(--surface-panel);
      box-shadow: var(--shadow-pop);
      font-size: var(--text-md);
      color: var(--ink);
      user-select: none;
    }

    .item {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      height: 26px;
      padding: 0 14px 0 12px;
      border: 0;
      background: transparent;
      color: inherit;
      font: inherit;
      text-align: left;
      cursor: default;
    }
    .item:hover:not(:disabled),
    .item[data-active='true']:not(:disabled) {
      background: var(--surface-hover);
    }
    .item[data-active='true']:not(:disabled) {
      background: var(--accent-wash);
    }
    .item:disabled { opacity: 0.4; }
    .item--danger { color: var(--danger); }
    .item--danger:hover:not(:disabled) { background: var(--danger-wash); }

    .label { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .keys { flex: 0 0 auto; margin-left: auto; padding-left: 18px; color: var(--ink-faint); font-size: var(--text-sm); }

    .sep { height: 1px; margin: 4px 0; background: var(--line); }
  `;

  template() {
    return `<div class="menu" id="menu" role="menu"></div>`;
  }

  mounted() {
    /** @type {Array<any>} the list last passed to {@link open}. */
    this._items = [];
    this._active = -1;

    this.listen('context:open', (payload) => this.open(payload));
    // Preview mode hides the canvas overlay; a menu left open would act on a
    // document the pointer can no longer reach.
    this.listen('mode', () => this.close());

    this.bind(this.root, 'click', (event) => this._onClick(/** @type {MouseEvent} */ (event)));
    this.bind(this.root, 'pointerover', (event) =>
      this._onHover(/** @type {MouseEvent} */ (event))
    );

    // Capture phase, so a click on an item still sees the pointerdown go by
    // without dismissing the menu under the pointer that chose it.
    this.bind(
      window,
      'pointerdown',
      (event) => {
        if (this.isOpen && !event.composedPath().includes(this)) {
          this.close();
        }
      },
      true
    );
    this.bind(
      window,
      'keydown',
      (event) => {
        this._onKeyDown(/** @type {KeyboardEvent} */ (event));
      },
      true
    );
    this.bind(window, 'resize', () => this.close());
    // Scroll does not bubble, but it does propagate in the capture phase —
    // including scrolls inside the canvas viewport.
    this.bind(
      window,
      'scroll',
      () => {
        if (this.isOpen) {
          this.close();
        }
      },
      true
    );
  }

  /** @returns {boolean} */
  get isOpen() {
    return this.getAttribute('data-open') === 'true';
  }

  /**
   * Renders the menu at a viewport point.
   *
   * @param {{x: number, y: number, items: any[]}} payload items are either
   *   `'---'` for a separator or `{label, keys?, run?, disabled?, danger?}`
   */
  open({ x, y, items }) {
    if (!Array.isArray(items) || items.length === 0) {
      return;
    }
    this._items = items;
    this._active = -1;

    const menu = /** @type {HTMLElement} */ (this.$('#menu'));
    menu.innerHTML = items
      .map((item, index) => {
        if (item === '---') {
          return '<div class="sep" role="separator"></div>';
        }
        return (
          `<button class="item${item.danger ? ' item--danger' : ''}" role="menuitem" ` +
          `data-index="${index}"${item.disabled ? ' disabled' : ''}>` +
          `<span class="label">${esc(item.label)}</span>` +
          (item.keys ? `<span class="keys">${esc(formatKeys(item.keys))}</span>` : '') +
          '</button>'
        );
      })
      .join('');

    this.setAttribute('data-open', 'true');

    // On-screen first, measured, then flipped back if it would run off an
    // edge — a menu that opens half outside the window is a menu nobody reads.
    menu.style.left = '0px';
    menu.style.top = '0px';
    const rect = menu.getBoundingClientRect();
    const left = Math.max(8, Math.min(x, window.innerWidth - rect.width - 8));
    const top = Math.max(8, Math.min(y, window.innerHeight - rect.height - 8));
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
  }

  close() {
    this.setAttribute('data-open', 'false');
    this._active = -1;
    this._syncActive();
  }

  /** @param {MouseEvent} event */
  _onClick(event) {
    const button = /** @type {HTMLElement} */ (event.target).closest('.item');
    if (!button || button.hasAttribute('disabled')) {
      return;
    }
    this._run(Number(button.getAttribute('data-index')));
  }

  /** @param {MouseEvent} event */
  _onHover(event) {
    const button = /** @type {HTMLElement} */ (event.target).closest('.item');
    if (!button || button.hasAttribute('disabled')) {
      return;
    }
    this._active = Number(button.getAttribute('data-index'));
    this._syncActive();
  }

  /** @param {KeyboardEvent} event */
  _onKeyDown(event) {
    if (!this.isOpen) {
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.close();
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      event.stopPropagation();
      this._move(event.key === 'ArrowDown' ? 1 : -1);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      if (this._active >= 0) {
        this._run(this._active);
      }
      return;
    }
    // Anything else: close rather than let the keystroke act on the document
    // behind the menu — a stray Delete while browsing should not delete.
    event.preventDefault();
    event.stopPropagation();
    this.close();
  }

  /** @param {number} delta */
  _move(delta) {
    const enabled = this._items
      .map((item, index) => ({ item, index }))
      .filter((entry) => entry.item !== '---' && !entry.item.disabled);
    if (enabled.length === 0) {
      return;
    }
    const at = enabled.findIndex((entry) => entry.index === this._active);
    const next =
      at === -1
        ? delta > 0
          ? 0
          : enabled.length - 1
        : (at + delta + enabled.length) % enabled.length;
    this._active = enabled[next].index;
    this._syncActive();
  }

  _syncActive() {
    for (const button of this.$$('.item')) {
      button.setAttribute(
        'data-active',
        String(Number(button.getAttribute('data-index')) === this._active)
      );
    }
  }

  /** @param {number} index */
  _run(index) {
    const item = this._items[index];
    this.close();
    if (item && !item.disabled && typeof item.run === 'function') {
      item.run();
    }
  }
}

customElements.define('dl-context-menu', DlContextMenu);
