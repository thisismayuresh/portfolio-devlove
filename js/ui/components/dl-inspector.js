/**
 * Right rail: the property inspector.
 *
 * A renderer for {@link module:registry/inspector-schema} — it holds no
 * knowledge of specific elements, so exposing a new engine property in the UI
 * is one descriptor in the schema and nothing here.
 *
 * Presentation rule: a property is a **label and a value**, not a form
 * control. Values are borderless until hovered or focused. A panel full of
 * boxed inputs reads as a settings dialog; label/value rows read as a design
 * tool. The exceptions are deliberate — paired numbers (W/H, X/Y) share a
 * bordered cell so the pair reads as one unit, and multi-line text keeps a box
 * because it needs the affordance.
 *
 * @module ui/components/dl-inspector
 */

import { PanelElement, esc } from '../panel-element.js';
import { icon } from '../icons.js';
import { app } from '../../core/app.js';
import { blueprintFor } from '../../registry/elements.js';
import { sectionsFor, PAGE_FIELDS, INSPECTOR_TABS } from '../../registry/inspector-schema.js';
import { MAX_EMBED_BYTES, formatSize, pickFile, readAsDataUrl } from '../../util/files.js';

/**
 * A schema entry may give a plain value or a function of the node — the
 * Target field's placeholder changes with the chosen action, and a Source
 * field's `accept` differs between an image and a video.
 *
 * @param {any} value
 * @param {any} node
 * @returns {any}
 */
function resolve(value, node) {
  return typeof value === 'function' ? value(node) : value;
}

/**
 * Numeric fields that read better side by side than stacked. Each entry pairs
 * two schema keys; the renderer emits one row for the pair and skips the
 * second field when it comes around.
 * @type {ReadonlyArray<[string, string]>}
 */
const PAIRED_KEYS = Object.freeze([
  ['width', 'height'],
  ['x', 'y'],
  ['style.fontSize', 'style.lineHeight'],
  ['style.radius', 'style.borderWidth'],
  ['style.letterSpacing', 'style.gap'],
]);

export class DlInspector extends PanelElement {
  static styles = `
    .root {
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 0;
      background: var(--surface-panel);
    }

    .head {
      display: flex;
      align-items: center;
      gap: 9px;
      height: 48px;
      flex: 0 0 auto;
      padding: 0 8px 0 14px;
      border-bottom: 1px solid var(--line);
    }
    .head__icon {
      display: grid;
      place-items: center;
      width: 24px; height: 24px;
      flex: 0 0 auto;
      color: var(--ink-dim);
    }
    .head__text { flex: 1 1 auto; min-width: 0; }
    .head__title {
      display: block;
      font-size: var(--text-md);
      font-weight: 500;
      color: var(--ink-strong);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .head__sub {
      display: block;
      font-size: var(--text-xs);
      font-family: var(--font-mono);
      color: var(--ink-faint);
    }
    .head__actions { display: flex; gap: 1px; flex: 0 0 auto; }
    .head__actions .icon-btn { width: 26px; height: 26px; }

    .body { flex: 1 1 auto; min-height: 0; }

    .textarea { min-height: 66px; font-size: var(--text-md); }

    /* Custom CSS rows stay tabular — they are code, not prose. */
    /* URL box, upload button, and a clear button when there is something to
       clear. The upload button never wraps below the field. */
    .file {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto auto;
      gap: 4px;
      align-items: center;
    }
    .file .btn { flex: 0 0 auto; padding: 0 8px; }

    .css-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) 22px;
      gap: 5px;
      align-items: center;
      margin-bottom: 5px;
    }
    .css-row .input { height: 24px; font-family: var(--font-mono); font-size: var(--text-xs); }
    .css-row .icon-btn { width: 22px; height: 22px; }
    .css-add { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) 22px; gap: 5px; }
    .css-add .input { height: 24px; font-family: var(--font-mono); font-size: var(--text-xs); }
    .css-add .icon-btn { width: 22px; height: 22px; }

    .note {
      margin: 12px 0 0;
      color: var(--ink-faint);
      font-size: var(--text-xs);
      line-height: 1.6;
    }
  `;

  template() {
    return `
      <div class="head" id="head"></div>
      <div class="tabs" role="tablist" id="tabs">
        ${INSPECTOR_TABS.map(
          (tab, index) => `
            <button class="tab" role="tab" data-tab="${tab.id}"
                    aria-selected="${index === 0}">${esc(tab.label)}</button>`
        ).join('')}
      </div>
      <div class="body scroll" id="body"></div>
    `;
  }

  mounted() {
    /** @type {Set<string>} collapsed section ids */
    this._collapsed = new Set();
    this._tab = INSPECTOR_TABS[0].id;
    /** guards re-rendering while the user types @type {boolean} */
    this._editing = false;
    this._sliderOpen = false;
    this._typingOpen = false;

    const body = this.$('#body');
    this.bind(body, 'input', (e) => this._onInput(/** @type {Event} */ (e)));
    this.bind(body, 'change', (e) => this._onChange(/** @type {Event} */ (e)));
    this.bind(body, 'click', (e) => this._onClick(/** @type {MouseEvent} */ (e)));
    this.bind(body, 'keydown', (e) => this._onKeyDown(/** @type {KeyboardEvent} */ (e)));
    this.bind(body, 'focusin', () => {
      this._editing = true;
    });
    this.bind(body, 'focusout', () => {
      this._editing = false;
    });

    this.bind(this.$('#head'), 'click', (e) => this._onHeadClick(/** @type {MouseEvent} */ (e)));
    this.bind(this.$('#tabs'), 'click', (event) => {
      const tab = /** @type {HTMLElement} */ (event.target).closest('[data-tab]');
      if (tab) {
        this._tab = tab.getAttribute('data-tab');
        this.render();
      }
    });

    this.listen(['ready', 'selection', 'document', 'page'], () => this.render());
    this.listen('node', () => {
      if (!this._editing) {
        this.render();
      }
    });
    this.render();
  }

  render() {
    if (!app.engine) {
      return;
    }
    for (const tab of this.$$('[data-tab]')) {
      tab.setAttribute('aria-selected', String(tab.getAttribute('data-tab') === this._tab));
    }

    const id = app.state.selection;
    const node = id ? app.getNode(id) : null;
    if (node) {
      this._renderNode(id, node);
    } else {
      this._renderPage();
    }
  }

  // --------------------------------------------------------------- page ---

  _renderPage() {
    this.$('#head').innerHTML = `
      <span class="head__icon">${icon('root', 15)}</span>
      <span class="head__text">
        <span class="head__title">Page</span>
        <span class="head__sub">nothing selected</span>
      </span>
    `;

    if (this._tab === 'advanced') {
      this.$('#body').innerHTML = this._section(
        'page-advanced',
        'Document',
        `<p class="note">Select an element to edit its markup attributes and custom CSS.</p>`
      );
      return;
    }

    const page = app.getPage();
    this.$('#body').innerHTML = this._section(
      'page',
      'Document',
      this._renderFields(PAGE_FIELDS, page, 'page') +
        `<p class="note">Select an element on the canvas, or drag a new one in from the left.</p>`
    );
  }

  // --------------------------------------------------------------- node ---

  /**
   * @param {string} id
   * @param {any} node
   */
  _renderNode(id, node) {
    const blueprint = blueprintFor(node.kind);
    this.$('#head').innerHTML = `
      <span class="head__icon">${icon(blueprint.icon, 15)}</span>
      <span class="head__text">
        <span class="head__title">${esc(node.name)}</span>
        <span class="head__sub">${
          app.state.selected.length > 1
            ? `${app.state.selected.length} selected`
            : `${esc(node.kind)} · ${esc(id)}`
        }</span>
      </span>
      <span class="head__actions">
        <button class="icon-btn" data-action="backward" title="Send backward (Ctrl+[)">${icon('sendBackward', 15)}</button>
        <button class="icon-btn" data-action="forward" title="Bring forward (Ctrl+])">${icon('bringForward', 15)}</button>
        <button class="icon-btn" data-action="duplicate" title="Duplicate (Ctrl+D)">${icon('duplicate', 15)}</button>
        <button class="icon-btn btn--danger" data-action="delete" title="Delete (Del)">${icon('trash', 15)}</button>
      </span>
    `;

    const body = sectionsFor(node, this._tab)
      .map(({ section, fields }) =>
        this._section(section.id, section.title, this._renderFields(fields, node, 'node'))
      )
      .join('');

    this.$('#body').innerHTML =
      body + (this._tab === 'advanced' ? this._renderCustomSection(node) : '');
  }

  /**
   * @param {string} id
   * @param {string} title
   * @param {string} inner
   * @param {string} [badge]
   * @returns {string}
   */
  _section(id, title, inner, badge = '') {
    const open = !this._collapsed.has(id);
    return `
      <section class="section" data-open="${open}" data-section="${esc(id)}">
        <button class="section__head" type="button">
          <span class="section__title">${esc(title)}</span>
          ${badge ? `<span class="section__count">${esc(badge)}</span>` : ''}
          <span class="section__caret">${icon('chevronDown', 12)}</span>
        </button>
        <div class="section__body">${inner}</div>
      </section>`;
  }

  // -------------------------------------------------------------- fields --

  /**
   * Renders a field list, collapsing known numeric neighbours into one row.
   *
   * @param {any[]} fields
   * @param {any} source
   * @param {'node' | 'page'} scope
   * @returns {string}
   */
  _renderFields(fields, source, scope) {
    const out = [];
    const consumed = new Set();

    fields.forEach((field, index) => {
      if (consumed.has(index)) {
        return;
      }
      const pair = PAIRED_KEYS.find(([first]) => first === field.key);
      if (pair && field.type === 'number') {
        const partnerIndex = fields.findIndex(
          (candidate, position) =>
            position > index && candidate.key === pair[1] && candidate.type === 'number'
        );
        if (partnerIndex !== -1) {
          consumed.add(partnerIndex);
          out.push(this._renderPair(field, fields[partnerIndex], source, scope));
          return;
        }
      }
      out.push(this._renderField(field, source, scope));
    });

    return out.join('');
  }

  /**
   * @param {any} first
   * @param {any} second
   * @param {any} source
   * @param {'node' | 'page'} scope
   * @returns {string}
   */
  _renderPair(first, second, source, scope) {
    // A one- or two-character label (W, H, X, Y) fits inside the cell and is
    // worth showing. Anything longer would have to be abbreviated into
    // nonsense, so the row label carries the naming instead.
    const cell = (field) => {
      const inlineKey =
        field.label.length <= 2
          ? `<span class="pair__key" title="${esc(field.label)}">${esc(field.label)}</span>`
          : '';
      return `
        <span class="pair__cell${inlineKey ? '' : ' pair__cell--bare'}">
          ${inlineKey}
          <input class="value" type="number"
                 ${this._attrs(field, scope)}
                 value="${esc(field.read(source))}"
                 placeholder="${esc(field.placeholder || 'auto')}"
                 ${field.min !== undefined ? `min="${field.min}"` : ''}
                 ${field.max !== undefined ? `max="${field.max}"` : ''}
                 step="${field.step ?? 1}"
                 title="${esc(field.label)}"
                 aria-label="${esc(field.label)}" />
        </span>`;
    };

    return `
      <div class="prop">
        <span class="prop__label" title="${esc(first.label)} and ${esc(second.label)}">${esc(first.label)} &amp; ${esc(second.label)}</span>
        <span class="pair">${cell(first)}${cell(second)}</span>
      </div>`;
  }

  /**
   * @param {any} field
   * @param {'node' | 'page'} scope
   * @returns {string} shared data attributes
   */
  _attrs(field, scope) {
    return `data-key="${esc(field.key)}" data-scope="${scope}" data-live="${field.live ? 'true' : 'false'}"`;
  }

  /**
   * @param {any} field descriptor from the schema
   * @param {any} source node or page JSON
   * @param {'node' | 'page'} scope
   * @returns {string}
   */
  _renderField(field, source, scope) {
    const value = field.read(source);
    const attrs = this._attrs(field, scope);
    // A schema entry may compute its hint from the node — the Target field's
    // placeholder changes with the chosen action, for instance.
    const placeholder = resolve(field.placeholder, source);
    const row = (control) => `
      <div class="prop">
        <span class="prop__label" title="${esc(field.label)}">${esc(field.label)}</span>
        ${control}
      </div>`;
    const stacked = (control) => `
      <div class="prop prop--stacked">
        <span class="prop__label">${esc(field.label)}</span>
        ${control}
      </div>`;

    switch (field.type) {
      case 'number':
        // Borderless values need a placeholder: an empty box with no border
        // is indistinguishable from a missing control.
        return row(
          `<input class="value" type="number" ${attrs} value="${esc(value)}"
             placeholder="${esc(placeholder || 'auto')}"
             ${field.min !== undefined ? `min="${field.min}"` : ''}
             ${field.max !== undefined ? `max="${field.max}"` : ''}
             step="${field.step ?? 1}" aria-label="${esc(field.label)}" />`
        );

      case 'textarea':
        return stacked(
          `<textarea class="textarea" ${attrs}
             placeholder="${esc(placeholder || '')}">${esc(value)}</textarea>`
        );

      case 'color':
        return row(
          `<span class="swatch-row">
             <span class="swatch" style="background:${esc(value)}">
               <input type="color" ${attrs} value="${esc(value)}" aria-label="${esc(field.label)}" />
             </span>
             <input class="value" data-mirror="${esc(field.key)}" data-scope="${scope}"
                    value="${esc(value)}" spellcheck="false" aria-label="${esc(field.label)} hex" />
           </span>`
        );

      case 'select':
        return row(
          `<select class="value" ${attrs} aria-label="${esc(field.label)}">
             ${(field.options || [])
               .map(
                 (option) =>
                   `<option value="${esc(option.value)}" ${option.value === value ? 'selected' : ''}>${esc(option.label)}</option>`
               )
               .join('')}
           </select>`
        );

      case 'segmented':
        return stacked(
          `<div class="segmented" ${attrs} role="group" aria-label="${esc(field.label)}">
             ${(field.options || [])
               .map(
                 (option) =>
                   `<button type="button" data-value="${esc(option.value)}"
                      aria-pressed="${option.value === value}">${esc(option.label)}</button>`
               )
               .join('')}
           </div>`
        );

      case 'toggle':
        return `
          <div class="prop">
            <span class="prop__label" title="${esc(field.label)}">${esc(field.label)}</span>
            <span class="bool" ${attrs} role="group" aria-label="${esc(field.label)}">
              <button type="button" data-value="false" aria-pressed="${value !== 'true'}">False</button>
              <button type="button" data-value="true" aria-pressed="${value === 'true'}">True</button>
            </span>
          </div>`;

      case 'slider':
        return row(
          `<input class="range" type="range" ${attrs}
             min="${field.min ?? 0}" max="${field.max ?? 1}" step="${field.step ?? 0.01}"
             value="${esc(value || '1')}" aria-label="${esc(field.label)}" />`
        );

      case 'file':
        // A URL box *and* an upload button, not one or the other. Pasting a
        // CDN link is the right answer for a real site; picking a local file
        // is the right answer while you are still designing.
        return stacked(
          `<div class="file">
             <input class="input" type="text" ${attrs} value="${esc(value)}"
                    placeholder="${esc(placeholder || 'https://…')}" spellcheck="false"
                    aria-label="${esc(field.label)}" />
             <button class="btn btn--ghost" data-action="upload"
                     data-upload-key="${esc(field.key)}" data-scope="${scope}"
                     data-accept="${esc(resolve(field.accept, source) || 'image/*')}"
                     data-wrap="${field.key.startsWith('style.') ? 'url' : 'raw'}"
                     title="Choose a file from this computer">
               ${icon('upload', 13)}<span>Upload</span>
             </button>
             ${value ? `<button class="icon-btn" data-action="clear-file" data-upload-key="${esc(field.key)}" data-scope="${scope}" title="Remove">${icon('minus', 12)}</button>` : ''}
           </div>`
        );

      case 'text':
      default:
        return row(
          `<input class="value" type="text" ${attrs} value="${esc(value)}"
             placeholder="${esc(placeholder || '—')}" spellcheck="false"
             aria-label="${esc(field.label)}" />`
        );
    }
  }

  /**
   * Reads a local file and stores it on the node as a `data:` URI.
   *
   * Files are embedded rather than uploaded anywhere, because there is nowhere
   * to upload to: devlove has no server, and the export has to be one
   * self-contained file. The cost is size — a data URI is about a third larger
   * than the file, and it lands in the project JSON and in `localStorage` —
   * so anything sizeable is refused with an explanation rather than silently
   * blowing the autosave quota.
   *
   * @param {HTMLElement} button the upload control that was clicked
   * @returns {Promise<void>}
   */
  async _upload(button) {
    const key = button.getAttribute('data-upload-key');
    const accept = button.getAttribute('data-accept') || 'image/*';
    const wrap = button.getAttribute('data-wrap') === 'url';

    let file;
    try {
      file = await pickFile(accept);
    } catch (error) {
      app.setStatus(`Could not open that file: ${error?.message || error}`, 'danger');
      return;
    }
    if (!file) {
      return;
    }
    if (file.size > MAX_EMBED_BYTES) {
      app.setStatus(
        `${file.name} is ${formatSize(file.size)}. Files are embedded in the page, ` +
          `so keep them under ${formatSize(MAX_EMBED_BYTES)} — or paste a URL instead.`,
        'danger'
      );
      return;
    }

    const dataUri = await readAsDataUrl(file);
    const id = app.state.selection;
    if (!id) {
      return;
    }
    app.setProperty(id, key, wrap ? `url("${dataUri}")` : dataUri);
    app.setStatus(`Embedded ${file.name} (${formatSize(file.size)})`);
    this.render();
  }

  /**
   * Raw CSS escape hatch: every `custom.*` declaration the node carries.
   *
   * @param {any} node
   * @returns {string}
   */
  _renderCustomSection(node) {
    const entries = Object.entries((node.style && node.style.custom) || {});
    return this._section(
      'custom',
      'Custom CSS',
      entries
        .map(
          ([property, value]) => `
            <div class="css-row">
              <input class="input" value="${esc(property)}" readonly tabindex="-1" />
              <input class="input" data-custom-value="${esc(property)}" value="${esc(value)}" />
              <button class="icon-btn" data-action="drop-custom" data-property="${esc(property)}"
                      title="Remove ${esc(property)}">${icon('minus', 12)}</button>
            </div>`
        )
        .join('') +
        `<div class="css-add">
           <input class="input" id="custom-key" placeholder="property" aria-label="CSS property" />
           <input class="input" id="custom-value" placeholder="value" aria-label="CSS value" />
           <button class="icon-btn" data-action="add-custom" title="Add declaration">${icon('plus', 12)}</button>
         </div>
         <p class="note">Anything valid in a CSS declaration block. Applied to this element only.</p>`,
      entries.length ? String(entries.length) : ''
    );
  }

  // -------------------------------------------------------------- events --

  /** Continuous input: fires on every keystroke / drag tick. */
  _onInput(event) {
    const target = /** @type {HTMLElement} */ (event.target);

    // The hex field beside a swatch: commit it and mirror it back.
    const mirrorKey = target.getAttribute('data-mirror');
    if (mirrorKey) {
      const hex = /** @type {HTMLInputElement} */ (target).value;
      this._openTypingGesture();
      this._commit(mirrorKey, target.getAttribute('data-scope'), hex, true);
      this._syncSwatch(target, hex);
      return;
    }

    const key = target.getAttribute('data-key');
    if (!key) {
      return;
    }
    const scope = target.getAttribute('data-scope');
    const value = /** @type {HTMLInputElement} */ (target).value;
    const isColor = target.getAttribute('type') === 'color';

    if (target.classList.contains('range') || isColor) {
      if (!this._sliderOpen) {
        this._sliderOpen = true;
        app.beginGesture();
      }
      this._commit(key, scope, value, true);
      if (isColor) {
        this._syncSwatch(target, value);
      }
      return;
    }

    // Text-ish inputs write live so the canvas keeps up with typing; the undo
    // entry is opened once per focus, not per keystroke.
    this._openTypingGesture();
    this._commit(key, scope, value, true);
  }

  _openTypingGesture() {
    if (!this._typingOpen) {
      this._typingOpen = true;
      app.beginGesture();
    }
  }

  /** Discrete change: fires on commit (blur, Enter, select choice). */
  _onChange(event) {
    const target = /** @type {HTMLElement} */ (event.target);
    this._sliderOpen = false;
    this._typingOpen = false;

    const customProperty = target.getAttribute('data-custom-value');
    if (customProperty) {
      const id = app.state.selection;
      if (id) {
        app.setProperty(
          id,
          `custom.${customProperty}`,
          /** @type {HTMLInputElement} */ (target).value
        );
      }
      return;
    }

    const key = target.getAttribute('data-key');
    if (key) {
      this._commit(
        key,
        target.getAttribute('data-scope'),
        /** @type {HTMLInputElement} */ (target).value,
        false
      );
    }
  }

  /** @param {KeyboardEvent} event */
  _onKeyDown(event) {
    // The canvas owns global keys; a field must be free to type any letter.
    event.stopPropagation();
    if (event.key === 'Enter' && event.target instanceof HTMLInputElement) {
      event.target.blur();
    }
  }

  /** @param {MouseEvent} event */
  _onClick(event) {
    const target = /** @type {HTMLElement} */ (event.target);

    const head = target.closest('.section__head');
    if (head) {
      const section = head.closest('.section');
      const id = section.getAttribute('data-section');
      if (this._collapsed.has(id)) {
        this._collapsed.delete(id);
        section.setAttribute('data-open', 'true');
      } else {
        this._collapsed.add(id);
        section.setAttribute('data-open', 'false');
      }
      return;
    }

    // Segmented controls and True/False pairs share one shape.
    const choice = target.closest('.segmented button, .bool button');
    if (choice) {
      const group = choice.closest('[data-key]');
      this._commit(
        group.getAttribute('data-key'),
        group.getAttribute('data-scope'),
        choice.getAttribute('data-value'),
        false
      );
      return;
    }

    const action = target.closest('[data-action]');
    if (!action) {
      return;
    }
    const id = app.state.selection;
    switch (action.getAttribute('data-action')) {
      case 'upload':
        this._upload(action);
        break;
      case 'clear-file':
        if (id) {
          app.setProperty(id, action.getAttribute('data-upload-key'), '');
          this.render();
        }
        break;
      case 'add-custom':
        this._addCustom();
        break;
      case 'drop-custom':
        if (id) {
          app.setProperty(id, `custom.${action.getAttribute('data-property')}`, '');
          this.render();
        }
        break;
      default:
        break;
    }
  }

  /** @param {MouseEvent} event */
  _onHeadClick(event) {
    const action = /** @type {HTMLElement} */ (event.target).closest('[data-action]');
    const id = app.state.selection;
    if (!action || !id) {
      return;
    }
    switch (action.getAttribute('data-action')) {
      case 'duplicate':
        app.duplicateElement(id);
        break;
      case 'delete':
        app.removeElement(id);
        break;
      case 'forward':
        app.reorder(id, 1);
        break;
      case 'backward':
        app.reorder(id, -1);
        break;
      default:
        break;
    }
  }

  _addCustom() {
    const id = app.state.selection;
    const keyInput = /** @type {HTMLInputElement} */ (this.$('#custom-key'));
    const valueInput = /** @type {HTMLInputElement} */ (this.$('#custom-value'));
    if (!id || !keyInput || !valueInput) {
      return;
    }
    const property = keyInput.value.trim();
    const value = valueInput.value.trim();
    if (!property || !value) {
      app.setStatus('Enter both a property and a value', 'muted');
      return;
    }
    if (app.setProperty(id, `custom.${property}`, value)) {
      keyInput.value = '';
      valueInput.value = '';
      this.render();
    }
  }

  /**
   * @param {string} key
   * @param {string | null} scope
   * @param {string} value
   * @param {boolean} live
   */
  _commit(key, scope, value, live) {
    if (scope === 'page') {
      app.setPageProperty(key, value, { live });
      return;
    }
    // Applies to every selected element, not just the one the fields were
    // rendered from. Selecting four buttons and setting the radius once is the
    // only reason to have selected four buttons.
    app.setSelectedProperty(key, value, { live });
  }

  /**
   * Keeps the swatch and the hex field in step while a colour is dragged.
   *
   * @param {HTMLElement} source
   * @param {string} value
   */
  _syncSwatch(source, value) {
    const row = source.closest('.swatch-row');
    if (!row) {
      return;
    }
    const swatch = /** @type {HTMLElement | null} */ (row.querySelector('.swatch'));
    if (swatch) {
      swatch.style.background = value;
    }
    const mirror = row.querySelector('[data-mirror]');
    if (mirror && mirror !== source) {
      /** @type {HTMLInputElement} */ (mirror).value = value;
    }
    const picker = row.querySelector('input[type="color"]');
    if (picker && picker !== source && /^#[0-9a-f]{6}$/i.test(value)) {
      /** @type {HTMLInputElement} */ (picker).value = value;
    }
  }
}

customElements.define('dl-inspector', DlInspector);
