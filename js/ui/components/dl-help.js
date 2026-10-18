/**
 * The keyboard shortcut overlay.
 *
 * Rendered straight from {@link module:core/shortcuts.BINDINGS}, so a
 * contributor who adds a shortcut gets it documented here for free — and,
 * more to the point, cannot add one that this panel forgets to mention.
 *
 * The element-drop letters are generated from the palette registry rather than
 * listed, for the same reason.
 *
 * @module ui/components/dl-help
 */

import { PanelElement, esc } from '../panel-element.js';
import { icon } from '../icons.js';
import { app } from '../../core/app.js';
import { BINDINGS } from '../../core/shortcuts.js';
import { BLUEPRINT_GROUPS } from '../../registry/elements.js';

/** Section order. Anything with no `group` falls into the last one. */
const GROUPS = ['Edit', 'Select', 'Arrange', 'View'];
const OTHER = 'Other';

/** How a binding's `keys` string is spelled for a reader. */
const KEY_LABELS = Object.freeze({
  ctrl: navigator.platform.startsWith('Mac') ? '⌘' : 'Ctrl',
  shift: 'Shift',
  alt: 'Alt',
  escape: 'Esc',
  arrowup: '↑',
  arrowdown: '↓',
  arrowleft: '←',
  arrowright: '→',
  delete: 'Del',
  backspace: '⌫',
});

/**
 * @param {string} keys
 * @returns {string[]} the individual keycaps
 */
function capsFor(keys) {
  return keys.split('+').map((part) => KEY_LABELS[part] || part.toUpperCase());
}

export class DlHelp extends PanelElement {
  static styles = `
    /* The panel host is a zero-size anchor until the overlay is open, so it
       never sits in the shell grid taking up space. */
    :host { position: fixed; inset: 0; z-index: 60; display: none; }
    :host([data-open="true"]) { display: block; }

    .scrim {
      position: absolute;
      inset: 0;
      background: rgba(0, 0, 0, 0.55);
    }

    .sheet {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: min(760px, calc(100vw - 48px));
      max-height: min(680px, calc(100vh - 64px));
      display: flex;
      flex-direction: column;
      border: 1px solid var(--line-strong);
      background: var(--surface-panel);
      box-shadow: var(--shadow-pop);
    }

    .head {
      display: flex;
      align-items: center;
      gap: 8px;
      height: 40px;
      flex: 0 0 auto;
      padding: 0 8px 0 14px;
      border-bottom: 1px solid var(--line);
    }
    .head__title {
      flex: 1 1 auto;
      font-size: var(--text-md);
      font-weight: 600;
      color: var(--ink-strong);
    }

    .body {
      flex: 1 1 auto;
      min-height: 0;
      overflow: auto;
      padding: 4px 14px 18px;
      column-count: 2;
      column-gap: 28px;
    }
    @media (max-width: 620px) { .body { column-count: 1; } }

    .group {
      break-inside: avoid;
      margin-top: 14px;
    }
    .group__title {
      margin: 0 0 6px;
      font-size: var(--text-xs);
      font-weight: 600;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--ink-dim);
    }

    .row {
      display: flex;
      align-items: baseline;
      gap: 10px;
      padding: 3px 0;
    }
    .row__label {
      flex: 1 1 auto;
      min-width: 0;
      color: var(--ink);
      font-size: var(--text-sm);
    }
    .row__keys { flex: 0 0 auto; display: flex; gap: 3px; }

    .letters {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      margin-top: 2px;
    }
    .letter {
      display: flex;
      align-items: baseline;
      gap: 4px;
      padding: 2px 6px 2px 4px;
      border: 1px solid var(--line);
      color: var(--ink-dim);
      font-size: var(--text-xs);
    }

    .note {
      margin: 16px 0 0;
      color: var(--ink-faint);
      font-size: var(--text-xs);
      line-height: 1.7;
    }
  `;

  template() {
    return `
      <div class="scrim" data-action="close"></div>
      <div class="sheet" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts">
        <div class="head">
          <span class="head__title">Keyboard shortcuts</span>
          <button class="icon-btn" data-action="close" aria-label="Close">${icon('close', 14)}</button>
        </div>
        <div class="body">
          ${this._renderGroups()}
          <div class="group">
            <p class="group__title">Add an element</p>
            <div class="letters">
              ${BLUEPRINT_GROUPS.flatMap((group) => group.items)
                .filter((item) => item.shortcut)
                .map(
                  (item) =>
                    `<span class="letter"><span class="kbd">${esc(item.shortcut)}</span>${esc(item.label)}</span>`
                )
                .join('')}
            </div>
            <p class="note">
              Hold <span class="kbd">Ctrl</span> and click to select more than one element.
              Drag inside a Stack or Grid to reorder it; drag anywhere else to move.
              Right-click anything on the canvas for the actions that apply to it.
            </p>
          </div>
        </div>
      </div>
    `;
  }

  /** @returns {string} */
  _renderGroups() {
    /** @type {Map<string, {description: string, keys: string}[]>} */
    const sections = new Map([...GROUPS, OTHER].map((name) => [name, []]));

    for (const binding of BINDINGS) {
      const section = sections.get(binding.group) || sections.get(OTHER);
      // Redo has two bindings and Delete has two keys; one row each is enough.
      if (!section.some((entry) => entry.description === binding.description)) {
        section.push(binding);
      }
    }

    return [...sections]
      .filter(([, rows]) => rows.length > 0)
      .map(
        ([name, rows]) => `
          <section class="group">
            <p class="group__title">${esc(name)}</p>
            ${rows
              .map(
                (row) => `
                  <div class="row">
                    <span class="row__label">${esc(row.description)}</span>
                    <span class="row__keys">
                      ${capsFor(row.keys)
                        .map((cap) => `<span class="kbd">${esc(cap)}</span>`)
                        .join('')}
                    </span>
                  </div>`
              )
              .join('')}
          </section>`
      )
      .join('');
  }

  mounted() {
    this.listen('help:open', () => this.open());

    this.bind(this.root, 'click', (event) => {
      if (/** @type {HTMLElement} */ (event.target).closest('[data-action="close"]')) {
        this.close();
      }
    });

    // Escape closes the overlay rather than clearing the selection, so it is
    // bound in the capture phase to run before the global shortcut handler.
    // `bind` disposes it when the panel disconnects, like every other listener.
    this.bind(
      window,
      'keydown',
      (event) => {
        if (/** @type {KeyboardEvent} */ (event).key === 'Escape' && this.isOpen) {
          event.preventDefault();
          event.stopPropagation();
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

  open() {
    this.setAttribute('data-open', 'true');
    app.setStatus('Press Esc to close', 'muted');
  }

  close() {
    this.setAttribute('data-open', 'false');
  }
}

customElements.define('dl-help', DlHelp);
