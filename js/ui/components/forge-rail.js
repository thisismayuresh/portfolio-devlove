/**
 * The far-left icon rail.
 *
 * Owns which panel occupies the left dock. Panels declare themselves with a
 * `data-panel` attribute in `index.html`; the rail shows one and hides the
 * rest, so adding a dock panel is one entry in {@link RAIL_ITEMS} plus the
 * element in the markup.
 *
 * @module ui/components/forge-rail
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
]);

export class ForgeRail extends PanelElement {
  static styles = `
    .root {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      height: 100%;
      padding: 8px 0;
      background: var(--surface-rail);
    }

    .slot {
      position: relative;
      display: grid;
      place-items: center;
      width: 32px;
      height: 32px;
      border-radius: var(--radius-md);
      color: var(--ink-faint);
      transition: color 90ms var(--ease), background 90ms var(--ease);
    }
    .slot:hover { color: var(--ink); background: var(--surface-hover); }
    .slot[aria-pressed="true"] { color: var(--accent); background: var(--accent-wash); }
    .slot[aria-pressed="true"]::before {
      content: "";
      position: absolute;
      left: -8px;
      top: 6px;
      bottom: 6px;
      width: 2px;
      border-radius: 0 2px 2px 0;
      background: var(--accent);
    }
    .slot:focus-visible { outline: none; box-shadow: var(--focus-ring); }

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
            ${icon(item.icon, 17)}
          </button>`
      ).join('')}
      <span class="spacer"></span>
      <button class="slot" data-action="help" type="button" title="Keyboard shortcuts" aria-label="Keyboard shortcuts">
        ${icon('help', 17)}
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

customElements.define('forge-rail', ForgeRail);
