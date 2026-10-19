/**
 * Top application bar: branding, document name, mode switch, file actions.
 *
 * @module ui/components/dl-toolbar
 */

import { PanelElement } from '../panel-element.js';
import { icon } from '../icons.js';
import { app } from '../../core/app.js';
import { downloadText, pickTextFile, slug } from '../../util/files.js';

export class DlToolbar extends PanelElement {
  static styles = `
    .root {
      display: flex;
      align-items: center;
      gap: 8px;
      height: 100%;
      padding: 0 8px;
      background: var(--surface-chrome);
    }

    /* A wordmark in the same monospace the tool uses for every literal value.
       No logo blob and no gradient: the title bar of an editor is not where a
       brand belongs. */
    .brand {
      flex: 0 0 auto;
      padding-left: 4px;
      font-family: var(--font-mono);
      font-size: var(--text-md);
      color: var(--ink-dim);
      user-select: none;
    }
    .brand b { font-weight: 600; color: var(--ink); }

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
      <div class="brand"><b>devlove</b></div>

      <div class="sep"></div>

      <div class="segmented mode" role="group" aria-label="Editor mode">
        <button data-mode="design" aria-pressed="true">${icon('cursor', 13)}<span>Design</span></button>
        <button data-mode="preview" aria-pressed="false">${icon('play', 13)}<span>Preview</span></button>
      </div>

      <div class="spacer"></div>
      <input class="doc" id="docName" aria-label="Document name" spellcheck="false" />
      <div class="spacer"></div>

      <div class="sep"></div>

      <div class="group">
        <button
          class="icon-btn"
          data-action="toggle-left"
          title="Hide the left sidebar (Ctrl+B)"
          aria-pressed="true"
          aria-label="Toggle the left sidebar"
        >
          ${icon('panelLeft', 15)}
        </button>
        <button
          class="icon-btn"
          data-action="toggle-right"
          title="Hide the right sidebar (Ctrl+Alt+B)"
          aria-pressed="true"
          aria-label="Toggle the right sidebar"
        >
          ${icon('panelRight', 15)}
        </button>
      </div>

      <div class="sep"></div>

      <div class="group">
        <button class="icon-btn" data-action="new" title="Clear the canvas" aria-label="New">
          ${icon('reset', 15)}
        </button>
        <button class="icon-btn" data-action="open" title="Open a .devlove.json project" aria-label="Open">
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
    this.listen('sidebar', () => this._syncSidebars());
    this._sync();
    this._syncSidebars();
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
      case 'toggle-left':
        app.toggleSidebar('left');
        break;
      case 'toggle-right':
        app.toggleSidebar('right');
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

  async _saveProject() {
    const json = await app.serializeProject();
    downloadText(`${slug(app.getPage().title)}.devlove.json`, json, 'application/json');
    app.setStatus('Project saved to your downloads');
  }

  async _copyHtml() {
    const html = await app.exportHtml();
    if (!html) {
      return;
    }
    try {
      await navigator.clipboard.writeText(html);
      app.setStatus('Exported HTML copied to the clipboard');
    } catch {
      // Clipboard access needs a secure context and user permission.
      app.setStatus('Clipboard blocked — use Export to download instead', 'danger');
    }
  }

  async _exportHtml() {
    const html = await app.exportHtml();
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

  /** Pressed while the sidebar is showing; the title follows the action. */
  _syncSidebars() {
    const sides = [
      ['toggle-left', 'left', app.state.leftSidebar, 'Ctrl+B'],
      ['toggle-right', 'right', app.state.rightSidebar, 'Ctrl+Alt+B'],
    ];
    for (const [action, side, open, keys] of sides) {
      const button = /** @type {HTMLElement | null} */ (this.$(`[data-action="${action}"]`));
      if (!button) {
        continue;
      }
      button.setAttribute('aria-pressed', String(open));
      button.title = `${open ? 'Hide' : 'Show'} the ${side} sidebar (${keys})`;
    }
  }
}

customElements.define('dl-toolbar', DlToolbar);
