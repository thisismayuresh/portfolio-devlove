/**
 * Top application bar: branding, history, mode switch and file actions.
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
      gap: var(--gap-2);
      height: 100%;
      padding: 0 8px 0 10px;
      background: var(--surface-app);
      border-bottom: 1px solid var(--line);
    }

    .brand { display: flex; align-items: center; gap: 8px; padding-right: 4px; }
    .brand__mark {
      width: 18px; height: 18px;
      border-radius: 5px;
      background: linear-gradient(150deg, var(--accent), #8a5cff);
      box-shadow: 0 2px 6px rgba(74,140,255,.32);
    }
    .brand__name {
      font-size: var(--text-md);
      font-weight: 600;
      color: var(--ink-strong);
      letter-spacing: -0.01em;
    }

    .divider { width: 1px; height: 18px; background: var(--line); flex: 0 0 auto; }

    .group { display: flex; align-items: center; gap: 2px; }
    .spacer { flex: 1 1 auto; }

    .doc {
      min-width: 0;
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 0 6px;
      color: var(--ink-dim);
      font-size: var(--text-sm);
    }
    .doc__name {
      max-width: 260px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: var(--ink);
    }
    .doc__nodes { font-variant-numeric: tabular-nums; color: var(--ink-faint); }

    .mode { width: 168px; }
    .mode button { height: 22px; font-size: var(--text-sm); }
  `;

  template() {
    return `
      <div class="brand">
        <div class="brand__mark"></div>
        <span class="brand__name">Forge</span>
      </div>

      <div class="divider"></div>

      <div class="group">
        <button class="icon-btn" data-action="undo" title="Undo (Ctrl+Z)" aria-label="Undo">
          ${icon('undo')}
        </button>
        <button class="icon-btn" data-action="redo" title="Redo (Ctrl+Shift+Z)" aria-label="Redo">
          ${icon('redo')}
        </button>
      </div>

      <div class="divider"></div>

      <div class="doc">
        <span class="doc__name" id="doc-name">Untitled page</span>
        <span class="doc__nodes" id="doc-nodes"></span>
      </div>

      <div class="spacer"></div>

      <div class="segmented mode" role="group" aria-label="Editor mode">
        <button data-mode="design" aria-pressed="true">${icon('cursor', 13)}<span>Design</span></button>
        <button data-mode="preview" aria-pressed="false">${icon('play', 13)}<span>Preview</span></button>
      </div>

      <div class="spacer"></div>

      <div class="group">
        <button class="btn btn--ghost" data-action="new" title="Clear the canvas">
          ${icon('reset', 14)}<span>New</span>
        </button>
        <button class="btn btn--ghost" data-action="open" title="Open a .forge.json project">
          ${icon('upload', 14)}<span>Open</span>
        </button>
        <button class="btn btn--ghost" data-action="save" title="Save the project file">
          ${icon('save', 14)}<span>Save</span>
        </button>
        <button class="btn btn--primary" data-action="export" title="Download a standalone HTML file">
          ${icon('download', 14)}<span>Export HTML</span>
        </button>
      </div>
    `;
  }

  mounted() {
    this.bind(this.root, 'click', (event) => this._onClick(/** @type {MouseEvent} */ (event)));
    this.listen(['ready', 'document', 'page'], () => this._sync());
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
      case 'undo':
        app.undo();
        break;
      case 'redo':
        app.redo();
        break;
      case 'new':
        this._confirmReset();
        break;
      case 'open':
        this._openProject();
        break;
      case 'save':
        this._saveProject();
        break;
      case 'export':
        this._exportHtml();
        break;
      default:
        break;
    }
  }

  _confirmReset() {
    const ok = window.confirm('Clear every element on the canvas? This can be undone with Ctrl+Z.');
    if (ok) {
      app.resetProject();
    }
  }

  async _openProject() {
    try {
      const text = await pickTextFile('.json,.forge.json,application/json');
      if (text !== null) {
        app.loadProject(text);
      }
    } catch (error) {
      app.setStatus(`Could not read that file: ${error?.message || error}`, 'danger');
    }
  }

  _saveProject() {
    const page = app.getPage();
    downloadText(`${slug(page.title)}.forge.json`, app.serializeProject(), 'application/json');
    app.setStatus('Project saved to your downloads');
  }

  _exportHtml() {
    const page = app.getPage();
    const html = app.exportHtml();
    if (!html) {
      return;
    }
    downloadText(`${slug(page.title)}.html`, html, 'text/html');
    app.setStatus('Exported a standalone HTML file');
  }

  _sync() {
    if (!app.engine) {
      return;
    }
    const page = app.getPage();
    const nameNode = this.$('#doc-name');
    if (nameNode) {
      nameNode.textContent = page.title || 'Untitled page';
    }
    const countNode = this.$('#doc-nodes');
    if (countNode) {
      const count = app.engine.nodeCount() - 1; // the page body itself is not an element
      countNode.textContent = `· ${count} element${count === 1 ? '' : 's'}`;
    }
    const undo = this.$('[data-action="undo"]');
    const redo = this.$('[data-action="redo"]');
    if (undo) {
      /** @type {HTMLButtonElement} */ (undo).disabled = !app.engine.canUndo();
    }
    if (redo) {
      /** @type {HTMLButtonElement} */ (redo).disabled = !app.engine.canRedo();
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
