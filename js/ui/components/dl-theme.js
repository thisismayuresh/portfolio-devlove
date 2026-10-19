/**
 * Left dock: Theme.
 *
 * Every colour the document actually paints — harvested by
 * `engine/insights.listColors` from the typed colour fields, raw `custom`
 * declarations and the page background — with the two things you do with a
 * palette: copy a value, or stamp it onto the selection as text colour or
 * fill.
 *
 * Applying goes through `app.setSelectedProperty`, so recolouring a multi-
 * selection is one undo step, the same as editing any other property with
 * several things selected.
 *
 * @module ui/components/dl-theme
 */

import { PanelElement, esc } from '../panel-element.js';
import { app } from '../../core/app.js';
import { listColors } from '../../engine/insights.js';

export class DlTheme extends PanelElement {
  static styles = `
    .root {
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 0;
      background: var(--surface-panel);
    }

    .body { flex: 1 1 auto; min-height: 0; }

    .row {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      padding: 5px 10px;
    }
    .row:hover { background: var(--surface-hover); }

    .swatch {
      flex: 0 0 auto;
      width: 22px;
      height: 22px;
      padding: 0;
      border: 1px solid var(--line-strong);
      background-image:
        linear-gradient(45deg, #808080 25%, transparent 25%),
        linear-gradient(-45deg, #808080 25%, transparent 25%),
        linear-gradient(45deg, transparent 75%, #808080 75%),
        linear-gradient(-45deg, transparent 75%, #808080 75%);
      background-size: 8px 8px;
      background-position: 0 0, 0 4px, 4px -4px, -4px 0;
      cursor: copy;
      position: relative;
    }
    .swatch::after {
      content: "";
      position: absolute;
      inset: 0;
      background: var(--swatch, transparent);
    }
    .swatch:focus-visible { outline: 1px solid var(--accent); outline-offset: 1px; }

    .hex {
      flex: 1 1 auto;
      min-width: 0;
      font-family: var(--font-mono);
      font-size: var(--text-xs);
      color: var(--ink);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .uses {
      flex: 0 0 auto;
      font-size: var(--text-xs);
      color: var(--ink-faint);
    }

    .acts { flex: 0 0 auto; display: flex; gap: 4px; }
    .act {
      width: 22px;
      height: 20px;
      padding: 0;
      font-size: 10.5px;
      font-weight: 600;
      color: var(--ink-dim);
      background: var(--surface-raised);
      border: 1px solid var(--line);
      cursor: pointer;
    }
    .act:hover:not(:disabled) { color: var(--ink-strong); border-color: var(--line-strong); }
    .act:disabled { opacity: 0.4; cursor: default; }

    .hint {
      flex: 0 0 auto;
      margin: 0;
      padding: 8px 12px 14px;
      border-top: 1px solid var(--line);
      color: var(--ink-faint);
      font-size: var(--text-xs);
      line-height: 1.7;
    }

    .empty {
      padding: 24px 12px;
      text-align: center;
      color: var(--ink-faint);
      font-size: var(--text-sm);
    }
  `;

  template() {
    return `
      <div class="panel-head">
        <span class="panel-head__title">Theme</span>
      </div>
      <div class="body scroll" id="body"></div>
      <p class="hint">Click a swatch to copy its value. <strong>A</strong> applies
        it as text colour and <strong>▨</strong> as fill to the selection.</p>
    `;
  }

  mounted() {
    const body = this.$('#body');

    this.bind(body, 'click', (event) => {
      const target = /** @type {HTMLElement} */ (event.target);
      const row = target.closest('[data-value]');
      if (!row) {
        return;
      }
      const value = row.getAttribute('data-value');
      const action = target.closest('[data-do]');
      const kind = action && action.getAttribute('data-do');
      if (kind === 'text') {
        this._apply('style.color', value);
      } else if (kind === 'fill') {
        this._apply('style.background', value);
      } else {
        this._copy(value);
      }
    });

    this.listen(['ready', 'document', 'node', 'page', 'selection'], () => this._render());
    this._render();
  }

  _render() {
    const body = this.$('#body');
    if (!body) {
      return;
    }

    const colors = app.engine ? listColors(app.engine.snapshot()) : [];
    if (colors.length === 0) {
      body.innerHTML = `<p class="empty">No colours in this document yet.</p>`;
      return;
    }

    const selected = app.state.selected || [];
    const canApply = selected.length > 0 && !selected.every((id) => id === 'root');

    body.innerHTML = colors
      .map(
        (color) => `
        <div class="row" data-value="${esc(color.value)}">
          <button class="swatch" type="button" style="--swatch: ${esc(color.value)}"
                  title="Copy ${esc(color.value)}" aria-label="Copy ${esc(color.value)}"></button>
          <span class="hex">${esc(color.value)}</span>
          <span class="uses">${color.count} use${color.count === 1 ? '' : 's'}</span>
          <span class="acts">
            <button class="act" type="button" data-do="text" ${canApply ? '' : 'disabled'}
                    title="Apply as text colour">A</button>
            <button class="act" type="button" data-do="fill" ${canApply ? '' : 'disabled'}
                    title="Apply as fill">▨</button>
          </span>
        </div>`
      )
      .join('');
  }

  /**
   * @param {'style.color' | 'style.background'} key
   * @param {string | null} value
   */
  _apply(key, value) {
    if (!value) {
      return;
    }
    const ok = app.setSelectedProperty(key, value);
    app.setStatus(
      ok ? `Applied ${value}` : 'Select something to recolour first',
      ok ? 'info' : 'muted'
    );
  }

  /** @param {string | null} value */
  async _copy(value) {
    if (!value) {
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      app.setStatus(`Copied ${value}`);
    } catch {
      // Clipboard access needs a secure context and user permission; the
      // textarea fallback covers the rest without demanding either.
      const scratch = document.createElement('textarea');
      scratch.value = value;
      scratch.style.position = 'fixed';
      scratch.style.left = '-9999px';
      document.body.append(scratch);
      scratch.select();
      const ok = document.execCommand('copy');
      scratch.remove();
      app.setStatus(
        ok ? `Copied ${value}` : 'Clipboard blocked — select the value to copy',
        ok ? 'info' : 'danger'
      );
    }
  }
}

customElements.define('dl-theme', DlTheme);
