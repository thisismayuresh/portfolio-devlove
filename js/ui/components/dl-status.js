/**
 * Bottom status strip: transient messages on the left, live document facts on
 * the right.
 *
 * @module ui/components/dl-status
 */

import { PanelElement } from '../panel-element.js';
import { icon } from '../icons.js';
import { app } from '../../core/app.js';
import { compileService } from '../../core/compile-service.js';

/** How long an info message stays before falling back to the idle hint. */
const MESSAGE_TTL = 4000;

const IDLE_HINT = 'Drag an element from the left · double-click text to edit · Ctrl+scroll to zoom';

export class DlStatus extends PanelElement {
  static styles = `
    .root {
      display: flex;
      align-items: center;
      gap: 12px;
      height: 100%;
      padding: 0 10px;
      background: var(--surface-chrome);
      border-top: 1px solid var(--line);
      font-size: var(--text-xs);
      color: var(--ink-faint);
      user-select: none;
    }

    .message {
      display: flex;
      align-items: center;
      gap: 5px;
      min-width: 0;
      flex: 1 1 auto;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .message[data-tone="danger"] { color: var(--danger); }
    .message[data-tone="info"] { color: var(--ink-dim); }

    .facts { display: flex; align-items: center; gap: 12px; flex: 0 0 auto; }
    .fact { display: flex; align-items: center; gap: 4px; font-variant-numeric: tabular-nums; }
    .fact strong { color: var(--ink-dim); font-weight: 500; }
    .dot { width: 1px; height: 12px; background: var(--line); }
  `;

  template() {
    return `
      <span class="message" id="message" data-tone="muted"></span>
      <span class="facts">
        <span class="fact" id="fact-selection">—</span>
        <span class="dot"></span>
        <span class="fact" id="fact-size"></span>
        <span class="dot"></span>
        <span class="fact" id="fact-zoom"></span>
        <span class="dot"></span>
        <span class="fact" id="fact-engine" title="Where documents are compiled">
          ${icon('code', 11)}<strong id="fact-engine-label">—</strong>
        </span>
      </span>
    `;
  }

  mounted() {
    this._timer = 0;
    this.listen('status', (payload) => this._showMessage(payload));
    this.listen(['ready', 'selection', 'geometry', 'node', 'document'], () => this._syncFacts());
    this.listen('zoom', () => this._syncFacts());
    this._showMessage({ text: IDLE_HINT, tone: 'muted' });
    this._syncFacts();
  }

  /** @param {{text: string, tone: string}} payload */
  _showMessage({ text, tone }) {
    const node = this.$('#message');
    node.textContent = text;
    node.setAttribute('data-tone', tone || 'muted');

    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = 0;
    }
    if (tone !== 'muted') {
      this._timer = window.setTimeout(() => {
        node.textContent = IDLE_HINT;
        node.setAttribute('data-tone', 'muted');
      }, MESSAGE_TTL);
    }
  }

  _syncFacts() {
    const selection = app.state.selection;
    const node = selection ? app.getNode(selection) : null;

    this.$('#fact-selection').textContent = node ? `${node.kind} · ${node.name}` : 'no selection';

    const rect = selection ? app.rectOf(selection) : null;
    this.$('#fact-size').textContent = rect
      ? `${Math.round(rect[2])} × ${Math.round(rect[3])}`
      : `${app.engine ? app.engine.nodeCount() - 1 : 0} elements`;

    this.$('#fact-zoom').textContent = `${Math.round(app.state.zoom * 100)}%`;

    // Whether compiles are going off the main thread. Worth surfacing: the
    // editor silently falls back to inline compiling if a worker cannot be
    // created, and "why did it get slow" should not be a mystery.
    this.$('#fact-engine-label').textContent = compileService.offThread ? 'Worker' : 'Inline';
  }
}

customElements.define('dl-status', DlStatus);
