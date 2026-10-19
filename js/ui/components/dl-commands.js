/**
 * The command palette — everything reachable by typing, on one list.
 *
 * Three sources feed it, each for the same reason: the list cannot drift from
 * the reality of the tool.
 *
 *   1. `BINDINGS` — every keyboard shortcut, keycaps included. A shortcut
 *      that exists is in the palette; one that is removed disappears from it.
 *   2. `SHORTCUT_TO_KIND` — the palette's own "Add Heading" rows, generated
 *      from the element registry rather than hand-listed.
 *   3. A short table of file actions mirroring the toolbar's, since those are
 *      the commands people reach for by name but not by key.
 *
 * Matching is `core/commands`' problem, not this panel's: the same pure
 * ranking the unit tests pin down is what orders the rows here.
 *
 * The overlay follows `dl-help`'s structure — scrim, sheet, Escape bound in
 * the capture phase so it beats the global shortcut handler — at a
 * z-index above every other fixed layer, because nothing should stack over
 * the thing you are typing into.
 *
 * @module ui/components/dl-commands
 */

import { PanelElement, esc } from '../panel-element.js';
import { icon } from '../icons.js';
import { app } from '../../core/app.js';
import { BINDINGS, capsFor, dropElementInView } from '../../core/shortcuts.js';
import { SHORTCUT_TO_KIND, blueprintFor } from '../../registry/elements.js';
import { TEMPLATES } from '../../templates/index.js';
import { filterCommands } from '../../core/commands.js';
import { downloadText, pickTextFile, slug } from '../../util/files.js';

/** File actions the toolbar owns by button; the palette owns them by name. */
const FILE_COMMANDS = Object.freeze([
  {
    id: 'file:new',
    label: 'New: clear the canvas',
    group: 'File',
    detail: 'undo with Ctrl+Z',
    run: () => {
      if (window.confirm('Clear every element on the canvas? This can be undone with Ctrl+Z.')) {
        app.resetProject();
      }
    },
  },
  {
    id: 'file:open',
    label: 'Open a project file…',
    group: 'File',
    detail: '.devlove.json',
    run: async () => {
      try {
        const text = await pickTextFile('.json,application/json');
        if (text !== null) {
          app.loadProject(text);
        }
      } catch (error) {
        app.setStatus(`Could not read that file: ${error?.message || error}`, 'danger');
      }
    },
  },
  {
    id: 'file:save',
    label: 'Save the project file',
    group: 'File',
    detail: '.devlove.json',
    run: async () => {
      const json = await app.serializeProject();
      downloadText(`${slug(app.getPage().title)}.devlove.json`, json, 'application/json');
      app.setStatus('Project saved to your downloads');
    },
  },
  {
    id: 'file:export',
    label: 'Export to a single HTML file',
    group: 'File',
    run: async () => {
      const html = await app.exportHtml();
      if (html) {
        downloadText(`${slug(app.getPage().title)}.html`, html, 'text/html');
        app.setStatus('Exported a standalone HTML file');
      }
    },
  },
  {
    id: 'file:copy-html',
    label: 'Copy the exported HTML',
    group: 'File',
    run: async () => {
      const html = await app.exportHtml();
      if (!html) {
        return;
      }
      try {
        await navigator.clipboard.writeText(html);
        app.setStatus('Exported HTML copied to the clipboard');
      } catch {
        app.setStatus('Clipboard blocked — use Export to download instead', 'danger');
      }
    },
  },
]);

/**
 * The full command list, rebuilt on every open so it always reflects the
 * registries as they are right now.
 *
 * @returns {import('../../core/commands.js').Command[]}
 */
function buildCommands() {
  /** @type {import('../../core/commands.js').Command[]} */
  const list = [];

  for (const binding of BINDINGS) {
    list.push({
      id: `key:${binding.keys}`,
      label: binding.description,
      group: binding.group || 'Other',
      keys: binding.keys,
      run: () => binding.run(new KeyboardEvent('keydown')),
    });
  }

  for (const [letter, kind] of Object.entries(SHORTCUT_TO_KIND)) {
    const blueprint = blueprintFor(kind);
    list.push({
      id: `add:${kind}`,
      label: `Add ${blueprint.label}`,
      group: 'Add',
      keys: letter,
      detail: blueprint.hint,
      run: () => dropElementInView(kind),
    });
  }

  for (const template of TEMPLATES) {
    list.push({
      id: `template:${template.id}`,
      label: `Apply template: ${template.name}`,
      group: 'Templates',
      detail: template.summary,
      run: () => app.applyTemplateById(template.id),
    });
  }

  list.push(...FILE_COMMANDS);
  return list;
}

export class DlCommands extends PanelElement {
  static styles = `
    /* A zero-size anchor until open — and above dl-help, because the palette
       must win every stacking contest with every other fixed layer. */
    :host { position: fixed; inset: 0; z-index: 70; display: none; }
    :host([data-open="true"]) { display: block; }

    .scrim { position: absolute; inset: 0; background: rgba(0, 0, 0, 0.45); }

    .pal {
      position: absolute;
      top: 14vh;
      left: 50%;
      transform: translateX(-50%);
      width: min(640px, calc(100vw - 48px));
      display: flex;
      flex-direction: column;
      border: 1px solid var(--line-strong);
      background: var(--surface-panel);
      box-shadow: var(--shadow-pop);
    }

    .prompt {
      display: flex;
      align-items: center;
      gap: 8px;
      flex: 0 0 auto;
      padding: 8px 10px;
      border-bottom: 1px solid var(--line);
      color: var(--ink-faint);
    }
    .field {
      flex: 1 1 auto;
      min-width: 0;
      background: transparent;
      border: 0;
      outline: 0;
      color: var(--ink-strong);
      font-family: var(--font-mono);
      font-size: var(--text-md);
    }
    .field::placeholder { color: var(--ink-faint); font-family: var(--font-ui); }

    .list { max-height: 46vh; min-height: 44px; }

    .row {
      display: flex;
      align-items: center;
      gap: 10px;
      width: 100%;
      height: 26px;
      padding: 0 10px;
      color: var(--ink);
      cursor: pointer;
    }
    .row[data-active="true"] { background: var(--surface-active); }
    .row__label {
      flex: 1 1 auto;
      min-width: 0;
      font-size: var(--text-sm);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .row__group {
      flex: 0 0 auto;
      font-size: var(--text-xs);
      color: var(--ink-faint);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .row__keys { flex: 0 0 auto; display: flex; gap: 3px; }
    .cap {
      min-width: 16px;
      height: 16px;
      padding: 0 4px;
      display: grid;
      place-items: center;
      border: 1px solid var(--line-strong);
      background: var(--surface-raised);
      color: var(--ink-dim);
      font-family: var(--font-mono);
      font-size: 9.5px;
      line-height: 1;
    }

    .no-match {
      margin: 0;
      padding: 14px 12px;
      text-align: center;
      color: var(--ink-faint);
      font-size: var(--text-sm);
    }

    .foot {
      flex: 0 0 auto;
      padding: 6px 10px;
      border-top: 1px solid var(--line);
      color: var(--ink-faint);
      font-size: var(--text-xs);
    }
  `;

  template() {
    return `
      <div class="scrim" data-action="close"></div>
      <div class="pal" role="dialog" aria-modal="true" aria-label="Commands">
        <div class="prompt">
          ${icon('terminal', 14)}
          <input class="field" id="cmd" type="text" role="combobox"
                 aria-expanded="true" aria-controls="list" aria-autocomplete="list"
                 placeholder="Type a command…" autocomplete="off" spellcheck="false"
                 aria-label="Command" />
        </div>
        <div class="list scroll" id="list" role="listbox" aria-label="Commands"></div>
        <div class="foot">Arrow keys navigate · Enter runs · Esc closes</div>
      </div>
    `;
  }

  mounted() {
    /** @type {import('../../core/commands.js').Command[]} */
    this._commands = [];
    /** @type {import('../../core/commands.js').Command[]} */
    this._visible = [];
    this._active = 0;

    const input = /** @type {HTMLInputElement} */ (this.$('#cmd'));

    this.listen('commands:open', () => this.open());

    // Escape closes the palette rather than falling through to the global
    // handler, in the capture phase — the same reasoning as dl-help.
    this.bind(
      window,
      'keydown',
      (event) => {
        const keyEvent = /** @type {KeyboardEvent} */ (event);
        if (keyEvent.key === 'Escape' && this.isOpen) {
          event.preventDefault();
          event.stopPropagation();
          this.close();
        }
      },
      true
    );

    this.bind(this.root, 'click', (event) => {
      const target = /** @type {HTMLElement} */ (event.target);
      if (target.closest('[data-action="close"]')) {
        this.close();
        return;
      }
      const row = target.closest('[data-index]');
      if (row) {
        this._run(Number(row.getAttribute('data-index')));
      }
    });

    // Clicking a row must not pull focus out of the input, or every arrow key
    // after the first click would go nowhere.
    this.bind(this.$('#list'), 'mousedown', (event) => event.preventDefault());

    this.bind(input, 'input', () => {
      this._active = 0;
      this._render();
    });
    this.bind(this.root, 'keydown', (event) => {
      const keyEvent = /** @type {KeyboardEvent} */ (event);
      if (!this.isOpen) {
        return;
      }
      if (keyEvent.key === 'ArrowDown') {
        event.preventDefault();
        this._move(1);
      } else if (keyEvent.key === 'ArrowUp') {
        event.preventDefault();
        this._move(-1);
      } else if (keyEvent.key === 'Enter') {
        event.preventDefault();
        this._run(this._active);
      }
    });
  }

  /** @returns {boolean} */
  get isOpen() {
    return this.getAttribute('data-open') === 'true';
  }

  open() {
    this._commands = buildCommands();
    this._active = 0;
    this.setAttribute('data-open', 'true');

    const input = /** @type {HTMLInputElement} */ (this.$('#cmd'));
    input.value = '';
    this._render();
    input.focus();
    input.select();
    app.setStatus('Press Esc to close', 'muted');
  }

  close() {
    this.setAttribute('data-open', 'false');
  }

  _render() {
    const list = this.$('#list');
    const input = /** @type {HTMLInputElement} */ (this.$('#cmd'));
    if (!list) {
      return;
    }

    const query = input ? input.value : '';
    this._visible = filterCommands(this._commands, query);
    if (this._active >= this._visible.length) {
      this._active = Math.max(0, this._visible.length - 1);
    }

    if (this._visible.length === 0) {
      list.innerHTML = `<p class="no-match">No matching commands.</p>`;
      if (input) {
        input.removeAttribute('aria-activedescendant');
      }
      return;
    }

    list.innerHTML = this._visible
      .map(
        (command, index) => `
        <div class="row" role="option" id="cmd-${index}" data-index="${index}"
             data-active="${index === this._active}"
             aria-selected="${index === this._active}">
          <span class="row__label">${esc(command.label)}</span>
          <span class="row__group">${esc(command.group)}</span>
          ${
            command.keys
              ? `<span class="row__keys">${capsFor(command.keys)
                  .map((cap) => `<span class="cap">${esc(cap)}</span>`)
                  .join('')}</span>`
              : ''
          }
        </div>`
      )
      .join('');

    if (input) {
      input.setAttribute('aria-activedescendant', `cmd-${this._active}`);
    }
    const active = list.querySelector('[data-active="true"]');
    if (active) {
      active.scrollIntoView({ block: 'nearest' });
    }
  }

  /** @param {number} delta */
  _move(delta) {
    if (this._visible.length === 0) {
      return;
    }
    const last = this._visible.length - 1;
    this._active = Math.min(last, Math.max(0, this._active + delta));
    this._render();
  }

  /** @param {number} index */
  _run(index) {
    const command = this._visible[index];
    if (!command) {
      return;
    }
    this.close();
    try {
      command.run();
    } catch (error) {
      app.setStatus(`Command failed: ${error && error.message}`, 'danger');
    }
  }
}

customElements.define('dl-commands', DlCommands);
