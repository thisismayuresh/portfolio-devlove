/**
 * Left dock: the template gallery.
 *
 * Applying a template replaces the document, so every row asks first — and
 * says in the confirmation that it can be undone, because it can: the whole
 * replacement is one entry on the undo stack.
 *
 * The panel is a pure renderer over `js/templates/index.js`. Adding a template
 * changes nothing here.
 *
 * @module ui/components/dl-templates
 */

import { PanelElement, esc } from '../panel-element.js';
import { icon } from '../icons.js';
import { app } from '../../core/app.js';
import { TEMPLATES } from '../../templates/index.js';

export class DlTemplates extends PanelElement {
  static styles = `
    .root {
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 0;
      background: var(--surface-panel);
    }

    .body { flex: 1 1 auto; min-height: 0; padding: 6px 0 16px; }

    .card {
      display: block;
      width: 100%;
      padding: 10px 12px;
      border: 0;
      border-bottom: 1px solid var(--line-soft);
      background: transparent;
      color: var(--ink);
      text-align: left;
      cursor: pointer;
      transition: background 70ms var(--ease);
    }
    .card:hover { background: var(--surface-hover); }
    .card:focus-visible { outline: 1px solid var(--accent); outline-offset: -2px; }

    .card__name {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: var(--text-md);
      font-weight: 600;
      color: var(--ink-strong);
    }
    .card__name svg { color: var(--ink-faint); }
    .card:hover .card__name svg { color: var(--ink-strong); }

    .card__summary {
      margin: 3px 0 7px;
      color: var(--ink-dim);
      font-size: var(--text-sm);
      line-height: 1.5;
    }

    .tags { display: flex; flex-wrap: wrap; gap: 4px; }
    .tag {
      padding: 1px 5px;
      border: 1px solid var(--line-strong);
      color: var(--ink-faint);
      font-size: 10px;
      line-height: 15px;
      letter-spacing: 0.02em;
    }

    .note {
      margin: 12px 12px 0;
      color: var(--ink-faint);
      font-size: var(--text-xs);
      line-height: 1.7;
    }
  `;

  template() {
    return `
      <div class="panel-head">
        <span class="panel-head__title">Templates</span>
      </div>
      <div class="body scroll">
        ${TEMPLATES.map(
          (item) => `
            <button class="card" type="button" data-template="${esc(item.id)}">
              <span class="card__name">${esc(item.name)}${icon('chevronRight', 12)}</span>
              <span class="card__summary">${esc(item.summary)}</span>
              <span class="tags">
                ${item.tags.map((tag) => `<span class="tag">${esc(tag)}</span>`).join('')}
              </span>
            </button>`
        ).join('')}
        <p class="note">
          Applying a template replaces everything on the canvas.
          <span class="kbd">Ctrl</span> <span class="kbd">Z</span> puts it back.
        </p>
      </div>
    `;
  }

  mounted() {
    this.bind(this.root, 'click', (event) => {
      const card = /** @type {HTMLElement} */ (event.target).closest('[data-template]');
      if (card) {
        this._apply(card.getAttribute('data-template'));
      }
    });
  }

  /** @param {string} id */
  _apply(id) {
    const empty = app.engine && app.engine.nodeCount() <= 1;
    if (!empty && !window.confirm('Replace everything on the canvas with this template?')) {
      return;
    }
    app.applyTemplateById(id);
  }
}

customElements.define('dl-templates', DlTemplates);
