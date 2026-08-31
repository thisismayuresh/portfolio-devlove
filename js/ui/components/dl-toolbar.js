/**
 * Top application bar: branding, document name, mode switch, file actions.
 *
 * @module ui/components/forge-toolbar
 */

import { PanelElement } from '../panel-element.js';
import { icon } from '../icons.js';
import { app } from '../../core/app.js';
import { downloadText, pickTextFile } from '../../util/files.js';

export class ForgeToolbar extends PanelElement {
  static styles = `
    .root {
      display: flex;
      align-items: center;
      gap: 10px;
      height: 100%;
      padding: 0 10px 0 12px;
      background: var(--surface-chrome);
    }

    .brand { display: flex; align-items: center; gap: 8px; flex: 0 0 auto; }
    .brand__mark {
      width: 20px; height: 20px;
      border-radius: 6px;
      background: linear-gradient(150deg, var(--accent), #8a5cff);
      box-shadow: 0 2px 8px rgba(76, 141, 255, 0.35);
    }
    .brand__name {
      font-size: var(--text-md);
      font-weight: 600;
      color: var(--ink-strong);
      letter-spacing: -0.01em;
    }

    .sep { width: 1px; height: 18px; background: var(--line); flex: 0 0 auto; }
    .spacer { flex: 1 1 auto; }
    .group { display: flex; align-items: center; gap: 2px; flex: 0 0 auto; }

    /* Document title doubles as a rename field. */
    .doc {
      min-width: 0;
      max-width: 320px;
      height: 26px;
      padding: 0 8px;
      border: 1px solid transparent;
      border-radius: var(--radius-sm);
      background: transparent;
      color: var(--ink);
      font: inherit;
      font-size: var(--text-sm);
      text-align: center;
      text-overflow: ellipsis;
    }
    .doc:hover { border-color: var(--line); background: var(--surface-input); }
    .doc:focus {
      outline: none;
      border-color: var(--accent);
      background: var(--surface-input);
      text-align: left;
    }

    .mode { width: 158px; }
    .mode button { height: 22px; font-size: var(--text-sm); }
  `;

  template() {
    return `
      <div class="brand">
        <div class="brand__mark"></div>
        <span class="brand__name">Forge</span>
      </div>

      <div class="sep"></div>

      <div class="segmented mode" role="group" aria-label="Editor mode">
        <button data-mode="design" aria-pressed="true">${icon('cursor', 13)}<span>Design</span></button>
        <button data-mode="preview" aria-pressed="false">${icon('play', 13)}<span>Preview</span></button>
      </div>

      <div class="spacer"></div>
      <input class="doc" id="docName" aria-label="Document name" spellcheck="false" />
      <div class="spacer"></div>

      <div class="group">
        <button class="icon-btn" data-action="new" title="Clear the canvas" aria-label="New">
          ${icon('reset', 15)}
        </button>
        <button class="icon-btn" data-action="open" title="Open a .forge.json project" aria-label="Open">
          ${icon('upload', 15)}
        </button>
        <button class="icon-btn" data-action="save" title="Save the project file" aria-label="Save">
          ${icon('save', 15)}
        </button>
        <button class="icon-btn" data-action="code" title="Copy the exported HTML" aria-label="Copy HTML">
          ${icon('html', 15)}
        </button>
      </div>

      <div class="sep"></div>

      <button class="btn btn--primary" data-action="export" title="Download a standalone HTML file">
        ${icon('download', 14)}<span>Export</span>
      </button>
    `;
  }

  mounted() {
    this.bind(this.root, 'click', (e) => this._onClick(/** @type {MouseEvent} */ (e)));

    const docName = /** @type {HTMLInputElement} */ (this.$('#docName'));
    this.bind(docName, 'change', () => app.setPageProperty('title', docName.value));
    this.bind(docName, 'keydown', (event) => {
      const keyEvent = /** @type {KeyboardEvent} */ (event);
      keyEvent.stopPropagation();
      if (keyEvent.key === 'Enter') {
        docName.blur();
      }
    });

    this.listen(['ready', 'document', 'page', 'node'], () => this._sync());
    this.listen('mode', (mode) => this._syncMode(mode));
    this._sync();
  }

  /** @param {MouseEvent} event */
  _onClick(event) {
    const target = /** @type {HTMLElement} */ (event.target);

    const modeButton = target.closest('[data-mode]');
    if (modeButton) {
      app.setMode(/** @type {'design' | 'preview'} */ (modeButton.getAttribute('data-mode')));
      return;
    }

    const actionButton = target.closest('[data-action]');
    if (!actionButton) {
      return;
    }
    switch (actionButton.getAttribute('data-action')) {
      case 'new':
        this._confirmReset();
        break;
      case 'open':
        this._openProject();
        break;
      case 'save':
        this._saveProject();
        break;
      case 'code':
        this._copyHtml();
        break;
      case 'export':
        this._exportHtml();
        break;
      default:
        break;
    }
  }

  _confirmReset() {
    if (window.confirm('Clear every element on the canvas? This can be undone with Ctrl+Z.')) {
      app.resetProject();
    }
  }

  async _openProject() {
    try {
      const text = await pickTextFile('.json,application/json');
      if (text !== null) {
        app.loadProject(text);
      }
    } catch (error) {
      app.setStatus(`Could not read that file: ${error?.message || error}`, 'danger');
    }
  }

  _saveProject() {
    downloadText(`${slug(app.getPage().title)}.forge.json`, app.serializeProject(), 'application/json');
    app.setStatus('Project saved to your downloads');
  }

  async _copyHtml() {
    const html = app.exportHtml();
    if (!html) {
      return;
    }
    try {
      await navigator.clipboard.writeText(html);
      app.setStatus('Exported HTML copied to the clipboard');
    } catch (error) {
      // Clipboard access needs a secure context and user permission.
      app.setStatus('Clipboard blocked — use Export to download instead', 'danger');
    }
  }

  _exportHtml() {
    const html = app.exportHtml();
    if (!html) {
      return;
    }
    downloadText(`${slug(app.getPage().title)}.html`, html, 'text/html');
    app.setStatus('Exported a standalone HTML file');
  }

  _sync() {
    if (!app.engine) {
      return;
    }
    const input = /** @type {HTMLInputElement} */ (this.$('#docName'));
    if (input && this.shadowRoot.activeElement !== input) {
      input.value = app.getPage().title || 'Untitled page';
    }
  }

  /** @param {string} mode */
  _syncMode(mode) {
    for (const button of this.$$('[data-mode]')) {
      button.setAttribute('aria-pressed', String(button.getAttribute('data-mode') === mode));
    }
  }
}

/**
 * @param {string} value
 * @returns {string} filesystem-safe file stem
 */
function slug(value) {
  const cleaned = String(value || 'untitled')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned || 'untitled';
}

customElements.define('forge-toolbar', ForgeToolbar);
