/**
 * Left dock: the template gallery.
 *
 * Every row shows a **live thumbnail of the actual page**, not an illustration
 * of one. A name and two lines of prose do not tell you whether a template is
 * the shape you want; a picture of it does, and a hand-drawn mock-up of a
 * template is a thing that goes stale the first time someone edits the
 * template.
 *
 * The thumbnail is the real compiled document in a sandboxed frame, scaled
 * down. It is built through `app.previewTemplate`, which replays the template
 * into a throwaway engine — the same replay `applyTemplate` uses — so what you
 * see is what you get.
 *
 * Previews are built **lazily**, the first time the panel is shown. Compiling
 * four pages at boot to fill a panel most people never open would be a poor
 * trade.
 *
 * Applying a template replaces the document, so every row asks first — and
 * says in the confirmation that it can be undone, because it can: the whole
 * replacement is one entry on the undo stack.
 *
 * @module ui/components/dl-templates
 */

import { PanelElement, esc } from '../panel-element.js';
import { app } from '../../core/app.js';
import { TEMPLATES } from '../../templates/index.js';

/** Width the thumbnails are scaled to. Must match `.thumb` below. */
const THUMB_WIDTH = 244;

/** How much of the page's height a thumbnail shows, before scaling. */
const THUMB_PAGE_HEIGHT = 900;

export class DlTemplates extends PanelElement {
  static styles = `
    .root {
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 0;
      background: var(--surface-panel);
    }

    .body { flex: 1 1 auto; min-height: 0; padding: 8px 0 16px; }

    /* A div with a button role, not a <button>. A button may not contain
       interactive content, and the thumbnail is an <iframe> — nesting one
       inside a button is invalid HTML and browsers disagree about what to do
       with it. Clicks are delegated on the panel either way; the role and the
       keydown handler are what give keyboard users the same affordance. */
    .card {
      display: block;
      width: 100%;
      padding: 0 0 12px;
      margin: 0 0 12px;
      border-bottom: 1px solid var(--line-soft);
      color: var(--ink);
      text-align: left;
      cursor: pointer;
    }
    .card:last-of-type { border-bottom: 0; }
    .card:focus-visible { outline: 1px solid var(--accent); outline-offset: -2px; }

    /* The frame is the page at full size; the wrapper crops and scales it.
       The frame is also click-through: the thumbnail is a picture, and a click
       anywhere on the row has to reach the row, not the page inside it.
       (No backticks in here — these styles live in a template literal.) */
    .thumb {
      display: block;
      position: relative;
      width: ${THUMB_WIDTH}px;
      height: ${Math.round(THUMB_PAGE_HEIGHT * (THUMB_WIDTH / 1280))}px;
      margin: 0 auto 8px;
      overflow: hidden;
      border: 1px solid var(--line-strong);
      background: var(--surface-sunken);
    }
    .card:hover .thumb { border-color: var(--ink-faint); }

    .thumb iframe {
      position: absolute;
      top: 0;
      left: 0;
      width: 1280px;
      height: ${THUMB_PAGE_HEIGHT}px;
      border: 0;
      transform: scale(${THUMB_WIDTH / 1280});
      transform-origin: 0 0;
      pointer-events: none;
    }

    /* Shown until the compile lands, so the row never flashes an empty box. */
    .thumb__pending {
      position: absolute;
      inset: 0;
      display: grid;
      place-items: center;
      color: var(--ink-faint);
      font-size: var(--text-xs);
    }
    .thumb[data-ready='true'] .thumb__pending { display: none; }

    .card__body { display: block; padding: 0 12px; }

    .card__name {
      display: block;
      font-size: var(--text-md);
      font-weight: 600;
      color: var(--ink-strong);
    }

    .card__summary {
      display: block;
      margin: 2px 0 7px;
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
      margin: 4px 12px 0;
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
            <div class="card" role="button" tabindex="0"
                 aria-label="Apply the ${esc(item.name)} template"
                 data-template="${esc(item.id)}">
              <span class="thumb" data-thumb="${esc(item.id)}">
                <span class="thumb__pending">rendering…</span>
              </span>
              <span class="card__body">
                <span class="card__name">${esc(item.name)}</span>
                <span class="card__summary">${esc(item.summary)}</span>
                <span class="tags">
                  ${item.tags.map((tag) => `<span class="tag">${esc(tag)}</span>`).join('')}
                </span>
              </span>
            </div>`
        ).join('')}
        <p class="note">
          Applying a template replaces everything on the canvas.
          <span class="kbd">Ctrl</span> <span class="kbd">Z</span> puts it back.
        </p>
      </div>
    `;
  }

  mounted() {
    this._built = false;

    this.bind(this.root, 'click', (event) => {
      const card = /** @type {HTMLElement} */ (event.target).closest('[data-template]');
      if (card) {
        this._apply(card.getAttribute('data-template'));
      }
    });

    // What a real <button> would have given us for free.
    this.bind(this.root, 'keydown', (event) => {
      const key = /** @type {KeyboardEvent} */ (event).key;
      if (key !== 'Enter' && key !== ' ') {
        return;
      }
      const card = /** @type {HTMLElement} */ (event.target).closest('[data-template]');
      if (card) {
        event.preventDefault();
        this._apply(card.getAttribute('data-template'));
      }
    });

    // Built on first reveal, not at boot. The rail announces which dock panel
    // is showing; anything else is somebody else's turn.
    this.listen('dock:show', (panel) => {
      if (panel === 'templates') {
        this._buildPreviews();
      }
    });
  }

  /**
   * Compiles each template and drops it into its thumbnail frame.
   *
   * Sequential rather than parallel: the compile worker handles one job at a
   * time anyway, and going in order means the first row fills first, which is
   * the one being looked at.
   *
   * @returns {Promise<void>}
   */
  async _buildPreviews() {
    if (this._built) {
      return;
    }
    this._built = true;

    for (const item of TEMPLATES) {
      const html = await app.previewTemplate(item.id);
      // The panel may have been disconnected while we were compiling.
      const slot = this.shadowRoot && this.$(`[data-thumb="${item.id}"]`);
      if (!slot || !html) {
        continue;
      }
      const frame = document.createElement('iframe');
      // No `allow-scripts`: a thumbnail has nothing to run, and the pages
      // being previewed are the ones that carry a click runtime.
      frame.setAttribute('sandbox', '');
      frame.setAttribute('scrolling', 'no');
      frame.setAttribute('tabindex', '-1');
      frame.setAttribute('aria-hidden', 'true');
      frame.srcdoc = html;
      slot.append(frame);
      slot.setAttribute('data-ready', 'true');
    }
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
