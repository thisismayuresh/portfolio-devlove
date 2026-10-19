/**
 * Left dock: Find.
 *
 * Searches node names, text content, kinds and per-kind content fields through
 * `engine/insights.findNodes` — pure, so what this panel shows is exactly what
 * the unit tests assert. Selecting a result performs the same
 * select-and-reveal round trip as the layers tree.
 *
 * The panel opens itself when something emits `find:open` (the Ctrl+F
 * binding), taking care of both halves: asking the rail to show it, and
 * putting the caret in the field — the rail never knows about focus.
 *
 * @module ui/components/dl-find
 */

import { PanelElement, esc } from '../panel-element.js';
import { icon } from '../icons.js';
import { app } from '../../core/app.js';
import { findNodes } from '../../engine/insights.js';
import { blueprintFor } from '../../registry/elements.js';

export class DlFind extends PanelElement {
  static styles = `
    .root {
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 0;
      background: var(--surface-panel);
    }

    .count {
      font-family: var(--font-mono);
      font-size: var(--text-xs);
      color: var(--ink-dim);
    }

    .search { flex: 0 0 auto; padding: 6px 10px; }
    .body { flex: 1 1 auto; min-height: 0; }

    .row {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      height: var(--row-h);
      padding: 0 10px;
      text-align: left;
      color: var(--ink);
    }
    .row:hover { background: var(--surface-hover); }
    .row:focus-visible { outline: 1px solid var(--accent); outline-offset: -2px; }

    .row__icon { flex: 0 0 auto; display: grid; place-items: center; color: var(--ink-dim); }
    .row__name {
      flex: 0 1 auto;
      font-size: var(--text-sm);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .row__snippet {
      flex: 1 1 auto;
      min-width: 0;
      font-size: var(--text-xs);
      color: var(--ink-faint);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      text-align: right;
    }
    .row__hidden {
      flex: 0 0 auto;
      color: var(--ink-faint);
      display: grid;
      place-items: center;
    }

    .empty, .idle {
      padding: 24px 12px;
      text-align: center;
      color: var(--ink-faint);
      font-size: var(--text-sm);
      line-height: 1.7;
    }
  `;

  template() {
    return `
      <div class="panel-head">
        <span class="panel-head__title">Find</span>
        <span class="count" id="count"></span>
      </div>
      <div class="search">
        <input class="input" id="query" type="search" placeholder="Find text or elements"
               aria-label="Find text or elements" autocomplete="off" spellcheck="false" />
      </div>
      <div class="body scroll" id="body"></div>
    `;
  }

  mounted() {
    this._query = '';

    const input = /** @type {HTMLInputElement} */ (this.$('#query'));
    this.bind(input, 'input', () => {
      this._query = input.value;
      this._render();
    });
    this.bind(input, 'keydown', (event) => {
      const keyEvent = /** @type {KeyboardEvent} */ (event);
      if (keyEvent.key === 'Enter') {
        const first = this.$('[data-id]');
        if (first) {
          this._go(first.getAttribute('data-id'));
        }
      } else if (keyEvent.key === 'Escape') {
        if (input.value) {
          input.value = '';
          this._query = '';
          this._render();
        } else {
          input.blur();
        }
        keyEvent.stopPropagation();
      }
    });

    const body = this.$('#body');
    this.bind(body, 'click', (event) => {
      const row = /** @type {HTMLElement | null} */ (event.target).closest('[data-id]');
      if (row) {
        this._go(row.getAttribute('data-id'));
      }
    });

    // Ctrl+F and the rail's Find slot both land here; the panel focuses
    // itself, since nothing else can reach into its shadow root.
    this.listen('find:open', () => {
      app.emit('dock:request', 'find');
      input.focus();
      input.select();
    });
    this.listen('dock:show', (panel) => {
      if (panel === 'find') {
        this._render();
        input.focus();
      }
    });
    this.listen(['ready', 'document'], () => this._render());

    this._render();
  }

  _render() {
    const body = this.$('#body');
    const count = this.$('#count');
    if (!body) {
      return;
    }

    const query = this._query.trim();
    if (!query) {
      if (count) {
        count.textContent = '';
      }
      body.innerHTML = `<p class="idle">Type to search names, text and element types.</p>`;
      return;
    }

    const results = app.engine ? findNodes(app.engine.snapshot(), query) : [];
    if (count) {
      count.textContent = String(results.length);
    }

    if (results.length === 0) {
      body.innerHTML = `<p class="empty">No matches for &ldquo;${esc(query)}&rdquo;.</p>`;
      return;
    }

    body.innerHTML = results
      .map((result) => {
        const meta = blueprintFor(result.kind);
        return `
          <button class="row" type="button" data-id="${esc(result.id)}"
                  title="${esc(result.name)}">
            <span class="row__icon">${icon(meta.icon, 14)}</span>
            <span class="row__name">${esc(result.name)}</span>
            ${result.snippet ? `<span class="row__snippet">${esc(result.snippet)}</span>` : ''}
            ${result.hidden ? `<span class="row__hidden" title="Hidden">${icon('eyeOff', 13)}</span>` : ''}
          </button>`;
      })
      .join('');
  }

  /**
   * @param {string | null} id
   */
  _go(id) {
    if (!id) {
      return;
    }
    app.select(id);
    app.emit('reveal:request', id);
  }
}

customElements.define('dl-find', DlFind);
