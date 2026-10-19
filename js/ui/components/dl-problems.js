/**
 * Left dock: Problems.
 *
 * A read-only report from `engine/insights` — every rule that decides what
 * counts as a problem lives there, unit-tested without this panel. The panel's
 * whole job is to render the list, navigate to what a row describes, and
 * publish the count the rail's badge shows.
 *
 * Rows select their node and ask the canvas to reveal it, which is the same
 * round trip a layer-tree click makes: `select`, then `reveal:request`.
 *
 * @module ui/components/dl-problems
 */

import { PanelElement, esc } from '../panel-element.js';
import { icon } from '../icons.js';
import { app } from '../../core/app.js';
import { listProblems } from '../../engine/insights.js';
import { blueprintFor } from '../../registry/elements.js';

/** Severity → the glyph the row wears. */
const SEVERITY_ICON = Object.freeze({ error: 'error', warning: 'warning', info: 'info' });

export class DlProblems extends PanelElement {
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

    .body { flex: 1 1 auto; min-height: 0; }

    .row {
      display: flex;
      gap: 8px;
      width: 100%;
      padding: 7px 10px;
      text-align: left;
      color: var(--ink);
      border-left: 2px solid transparent;
    }
    .row:hover { background: var(--surface-hover); }
    .row:focus-visible { outline: 1px solid var(--accent); outline-offset: -2px; }

    .row__sev {
      flex: 0 0 auto;
      display: grid;
      place-items: center;
      width: 16px;
      height: 16px;
      margin-top: 1px;
    }
    .row__sev[data-sev="error"] { color: var(--danger); }
    .row__sev[data-sev="warning"] { color: var(--warn); }
    .row__sev[data-sev="info"] { color: var(--accent); }

    .row__main { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .row__msg { font-size: var(--text-sm); line-height: 1.4; color: var(--ink); }
    .row__meta { font-size: var(--text-xs); color: var(--ink-faint); }

    .empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      padding: 28px 12px;
      color: var(--ink-faint);
      font-size: var(--text-sm);
    }
    .empty svg { color: var(--marker-drop); }
  `;

  template() {
    return `
      <div class="panel-head">
        <span class="panel-head__title">Problems</span>
        <span class="count" id="count"></span>
      </div>
      <div class="body scroll" id="body"></div>
    `;
  }

  mounted() {
    this._render();
    this.listen(['ready', 'document', 'node', 'page'], () => this._render());
    this.listen('dock:show', (panel) => {
      if (panel === 'problems') {
        this._render();
      }
    });

    const body = this.$('#body');
    this.bind(body, 'click', (event) => {
      const row = /** @type {HTMLElement | null} */ (event.target).closest('[data-id]');
      if (row) {
        this._navigate(row.getAttribute('data-id'));
      }
    });
  }

  _render() {
    const body = this.$('#body');
    const count = this.$('#count');
    if (!body) {
      return;
    }

    const problems = app.engine ? listProblems(app.engine.snapshot()) : [];
    app.emit('problems:count', problems.length);
    if (count) {
      count.textContent = problems.length > 0 ? String(problems.length) : '';
    }

    if (problems.length === 0) {
      body.innerHTML = `
        <p class="empty">${icon('info', 18)}<span>No problems found</span></p>`;
      return;
    }

    body.innerHTML = problems
      .map((problem) => {
        const node = problem.id === 'root' ? null : app.getNode(problem.id);
        const kind = node ? node.kind : 'root';
        const meta = blueprintFor(kind);
        const name = node ? String(node.name || kind) : 'Page';
        return `
          <button class="row" type="button" data-id="${esc(problem.id)}"
                  title="${esc(problem.message)}">
            <span class="row__sev" data-sev="${problem.severity}"
                  aria-label="${problem.severity}">${icon(SEVERITY_ICON[problem.severity], 14)}</span>
            <span class="row__main">
              <span class="row__msg">${esc(problem.message)}</span>
              <span class="row__meta">${esc(name)} · ${esc(meta.label)}</span>
            </span>
          </button>`;
      })
      .join('');
  }

  /**
   * @param {string | null} id
   */
  _navigate(id) {
    if (!id) {
      return;
    }
    if (id === 'root') {
      // Page-level problems address the document; there is no box to scroll
      // to, so the status line carries the sentence instead.
      const problem = listProblems(app.engine.snapshot()).find((entry) => entry.id === 'root');
      app.setStatus(problem ? problem.message : 'Page problem', 'muted');
      return;
    }
    app.select(id);
    app.emit('reveal:request', id);
  }
}

customElements.define('dl-problems', DlProblems);
