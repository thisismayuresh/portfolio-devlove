/**
 * The first-run welcome notification.
 *
 * The editor's landing document *is* a demo — a default developer portfolio
 * that doubles as a real portfolio and as a showcase of what the builder can
 * make — and until now nothing on screen said so. This card states it once,
 * points at the three gestures that matter (drag, double-click, `?`), and then
 * gets out of the way for good.
 *
 * Its body copy is chosen from `app.firstRun` when `ready` fires, so a
 * returning visitor with a restored session is told their work came back
 * rather than that they are looking at the default page.
 *
 * @module ui/components/dl-welcome
 */

import { PanelElement } from '../panel-element.js';
import { icon } from '../icons.js';
import { app } from '../../core/app.js';

/** localStorage flag. Set on dismiss; the card never nags twice. */
const SEEN_KEY = 'devlove.welcome.v1';

const FIRST_RUN =
  '<b>This is devlove</b> — a drag-and-drop website builder written in plain ' +
  'JavaScript, no framework and no build step. The canvas opens on its default ' +
  'page: a developer portfolio, yours to take apart and rebuild.';

const RETURNING =
  '<b>Welcome back.</b> Your last session was restored — everything on the ' +
  'canvas is editable, and the Templates panel in the left dock holds more ' +
  'starting points.';

export class DlWelcome extends PanelElement {
  static styles = `
    /* A notification, not a panel: pinned over the stage's bottom-right
       corner, clear of the inspector and the status bar, outside the grid. */
    :host {
      position: fixed;
      right: calc(var(--panel-right-w) + 14px);
      bottom: calc(var(--bar-bottom-h) + 14px);
      z-index: 50;
      display: none;
    }
    :host([data-open='true']) { display: block; }

    .card {
      width: 344px;
      padding: 13px 14px 12px;
      border: 1px solid var(--line-strong);
      background: var(--surface-panel);
      box-shadow: var(--shadow-pop);
      font-size: var(--text-md);
      color: var(--ink);
    }

    .head { display: flex; align-items: center; gap: 8px; }
    .title {
      flex: 1 1 auto;
      min-width: 0;
      font-weight: 600;
      color: var(--ink-strong);
      font-size: var(--text-md);
    }

    .body {
      margin: 8px 0 0;
      line-height: 1.65;
      color: var(--ink-dim);
    }
    .body b { color: var(--ink); font-weight: 600; }

    .keys {
      margin: 8px 0 0;
      color: var(--ink-faint);
      font-size: var(--text-sm);
    }

    .actions { display: flex; gap: 6px; margin-top: 12px; }
  `;

  template() {
    return `
      <div class="card" role="status">
        <div class="head">
          <span class="title">Welcome to devlove</span>
          <button class="icon-btn" data-action="dismiss" aria-label="Dismiss">${icon('close', 13)}</button>
        </div>
        <p class="body" id="body"></p>
        <p class="keys">
          Drag from the palette · double-click text to edit · press
          <span class="kbd">?</span> for every shortcut
        </p>
        <div class="actions">
          <button class="btn btn--primary" data-action="dismiss">Start building</button>
          <button class="btn btn--ghost" data-action="tour">Show me around</button>
        </div>
      </div>
    `;
  }

  mounted() {
    this._dismissed = this._seen();

    // Hidden while a preview is on stage: the chrome around the canvas is not
    // what a preview is for. The card returns if the visitor comes back to
    // Design before ever dismissing it.
    this._inPreview = app.state.mode === 'preview';

    // `ready` fires once the engine is live and the default document is on the
    // canvas — the moment the card has something to point at. Reading
    // `app.firstRun` here rather than at mount matters: boot runs after the
    // panels upgrade.
    this.listen('ready', () => this._sync());
    this.listen('mode', (mode) => {
      this._inPreview = mode === 'preview';
      this._sync();
    });

    this.bind(this.root, 'click', (event) => this._onClick(/** @type {MouseEvent} */ (event)));
  }

  /** @param {MouseEvent} event */
  _onClick(event) {
    const target = /** @type {HTMLElement} */ (event.target);
    if (target.closest('[data-action="tour"]')) {
      this._dismiss();
      app.emit('help:open');
      return;
    }
    if (target.closest('[data-action="dismiss"]')) {
      this._dismiss();
    }
  }

  _sync() {
    if (!app.state.ready || this._dismissed || this._inPreview) {
      this.setAttribute('data-open', 'false');
      return;
    }
    const body = /** @type {HTMLElement | null} */ (this.$('#body'));
    if (body) {
      body.innerHTML = app.firstRun ? FIRST_RUN : RETURNING;
    }
    this.setAttribute('data-open', 'true');
  }

  _dismiss() {
    this._dismissed = true;
    this.setAttribute('data-open', 'false');
    try {
      window.localStorage.setItem(SEEN_KEY, '1');
    } catch {
      // Private browsing, storage disabled — worst case the card shows again.
    }
  }

  /** @returns {boolean} */
  _seen() {
    try {
      return window.localStorage.getItem(SEEN_KEY) === '1';
    } catch {
      return false;
    }
  }
}

customElements.define('dl-welcome', DlWelcome);
