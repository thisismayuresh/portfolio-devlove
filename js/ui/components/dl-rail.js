/**
 * The far-left icon rail.
 *
 * Owns which panel occupies the left dock. Panels declare themselves with a
 * `data-panel` attribute in `index.html`; the rail shows one and hides the
 * rest, so adding a dock panel is one entry in {@link RAIL_ITEMS} plus the
 * element in the markup.
 *
 * @module ui/components/dl-rail
 */

import { PanelElement } from '../panel-element.js';
import { icon } from '../icons.js';
import { app } from '../../core/app.js';

/**
 * @typedef {object} RailItem
 * @property {string} panel  matches a `data-panel` attribute in the left dock
 * @property {string} icon
 * @property {string} label
 * @property {string} [shortcut] shown in the tooltip
 */

/** @type {ReadonlyArray<RailItem>} */
export const RAIL_ITEMS = Object.freeze([
  { panel: 'elements', icon: 'plus', label: 'Elements', shortcut: '1' },
  { panel: 'layers', icon: 'layers', label: 'Layers', shortcut: '2' },
  { panel: 'templates', icon: 'templates', label: 'Templates', shortcut: '3' },
]);

export class DlRail extends PanelElement {
  /**
   * Styled as VS Code's activity bar, deliberately.
   *
   * Slots are full-bleed squares with no radius and no background fill. The
   * active one is signalled the way VS Code signals it — the icon goes white
   * and a 1px white border appears on the leading edge. No coloured pill: an
   * accent-filled rounded chip reads as decoration, and there is nothing here
   * for decoration to say.
   */
  static styles = `
    .root {
      display: flex;
      flex-direction: column;
      align-items: stretch;
      height: 100%;
      background: var(--surface-rail);
    }

    .slot {
      position: relative;
      display: grid;
      place-items: center;
      width: 100%;
      height: var(--rail-w);
      color: var(--ink-faint);
      transition: color 100ms var(--ease);
    }
    .slot:hover { color: var(--ink-strong); }
    .slot[aria-pressed="true"] { color: var(--ink-strong); }
    .slot[aria-pressed="true"]::before {
      content: "";
      position: absolute;
      left: 0;
      top: 0;
      bottom: 0;
      width: 1px;
      background: var(--ink-strong);
    }
    /* Inset so the ring is not clipped by the rail's own edge. */
    .slot:focus-visible { outline: 1px solid var(--accent); outline-offset: -2px; }

    .spacer { flex: 1 1 auto; }
  `;

  template() {
    return `
      ${RAIL_ITEMS.map(
        (item) => `
          <button class="slot" data-panel="${item.panel}" type="button"
                  aria-pressed="false"
                  title="${item.label}${item.shortcut ? ` (${item.shortcut})` : ''}"
                  aria-label="${item.label}">
            ${icon(item.icon, 20)}
          </button>`
      ).join('')}
      <span class="spacer"></span>
      <button class="slot" data-action="help" type="button" title="Keyboard shortcuts" aria-label="Keyboard shortcuts">
        ${icon('help', 20)}
      </button>
    `;
  }

  mounted() {
    this._active = RAIL_ITEMS[0].panel;

    this.bind(this.root, 'click', (event) => {
      const target = /** @type {HTMLElement} */ (event.target);
      const slot = target.closest('[data-panel]');
      if (slot) {
        this.show(slot.getAttribute('data-panel'));
        return;
      }
      if (target.closest('[data-action="help"]')) {
        app.emit('help:open');
      }
    });

    this.listen('dock:show', (panel) => this._sync(panel));
    this.show(this._active);
  }

  /**
   * Reveals one dock panel and hides the others.
   * @param {string} panel
   */
  show(panel) {
    this._active = panel;
    const dock = document.getElementById('left-dock');
    if (dock) {
      for (const child of dock.children) {
        child.toggleAttribute('hidden', child.getAttribute('data-panel') !== panel);
      }
    }
    this._sync(panel);
    app.emit('dock:show', panel);
  }

  /** @param {string} panel */
  _sync(panel) {
    for (const slot of this.$$('[data-panel]')) {
      slot.setAttribute('aria-pressed', String(slot.getAttribute('data-panel') === panel));
    }
  }
}

customElements.define('dl-rail', DlRail);
