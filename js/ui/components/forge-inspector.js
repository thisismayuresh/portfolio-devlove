/**
 * Right rail: the property inspector.
 *
 * The panel is a renderer for {@link module:registry/inspector-schema}. It has
 * no per-element branching of its own — adding a control means adding a field
 * descriptor to the schema.
 *
 * @module ui/components/forge-inspector
 */

import { PanelElement, esc } from '../panel-element.js';
import { icon } from '../icons.js';
import { app } from '../../core/app.js';
import { blueprintFor } from '../../registry/elements.js';
import { sectionsFor, PAGE_FIELDS } from '../../registry/inspector-schema.js';

export class ForgeInspector extends PanelElement {
  static styles = `
    .root {
      display: grid;
      grid-template-rows: auto minmax(0, 1fr);
      height: 100%;
      min-height: 0;
      background: var(--surface-panel);
    }

    .head {
      display: flex;
      align-items: center;
      gap: 6px;
      height: 34px;
      padding: 0 6px 0 10px;
      border-bottom: 1px solid var(--line);
    }
    .head__icon { color: var(--accent); }
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
      font-size: 10px;
      font-family: var(--font-mono);
      color: var(--ink-faint);
    }
    .head__actions { display: flex; gap: 1px; flex: 0 0 auto; }

    .grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
    }

    .custom-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) 22px;
      gap: 4px;
      align-items: center;
      margin-bottom: 4px;
    }
    .custom-row .input { height: 22px; font-family: var(--font-mono); font-size: 10.5px; }
    .custom-row .icon-btn { width: 22px; height: 22px; }

    .add-row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) 22px; gap: 4px; }
    .add-row .input { height: 22px; font-family: var(--font-mono); font-size: 10.5px; }
    .add-row .icon-btn { width: 22px; height: 22px; }

    .note {
      margin: 8px 0 0;
      color: var(--ink-faint);
      font-size: var(--text-xs);
      line-height: 1.5;
    }
  `;

  template() {
    return `
      <div class="head" id="head"></div>
      <div class="scroll" id="body"></div>
    `;
  }

  mounted() {
    /** collapsed section ids @type {Set<string>} */
    this._collapsed = new Set();
    /** guards re-rendering while the user types @type {boolean} */
    this._editing = false;

    const body = this.$('#body');
    this.bind(body, 'input', (event) => this._onInput(/** @type {Event} */ (event)));
    this.bind(body, 'change', (event) => this._onChange(/** @type {Event} */ (event)));
    this.bind(body, 'click', (event) => this._onClick(/** @type {MouseEvent} */ (event)));
    this.bind(body, 'focusin', () => {
      this._editing = true;
    });
    this.bind(body, 'focusout', () => {
      this._editing = false;
    });
    this.bind(this.$('#head'), 'click', (event) => this._onHeadClick(/** @type {MouseEvent} */ (event)));

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
    const id = app.state.selection;
    const node = id ? app.getNode(id) : null;

    if (!node) {
      this._renderPage();
      return;
    }
    this._renderNode(id, node);
  }

  // --------------------------------------------------------------- page ---

  _renderPage() {
    this.$('#head').innerHTML = `
      <span class="head__icon">${icon('root', 16)}</span>
      <span class="head__text">
        <span class="head__title">Page</span>
        <span class="head__sub">nothing selected</span>
      </span>
    `;

    const page = app.getPage();
    this.$('#body').innerHTML = `
      <section class="section" data-open="true" data-section="page">
        <button class="section__head" type="button">
          <span class="section__caret">${icon('chevronDown', 12)}</span>
          <span class="section__title">Document</span>
        </button>
        <div class="section__body">
          <div class="grid">
            ${PAGE_FIELDS.map((field) => this._renderField(field, page, 'page')).join('')}
          </div>
          <p class="note">
            Select an element on the canvas to edit it, or drag a new one in from the left rail.
          </p>
        </div>
      </section>
    `;
  }

  // --------------------------------------------------------------- node ---

  /**
   * @param {string} id
   * @param {any} node
   */
  _renderNode(id, node) {
    const blueprint = blueprintFor(node.kind);
    this.$('#head').innerHTML = `
      <span class="head__icon">${icon(blueprint.icon, 16)}</span>
      <span class="head__text">
        <span class="head__title">${esc(node.name)}</span>
        <span class="head__sub">${esc(node.kind)} · ${esc(id)}</span>
      </span>
      <span class="head__actions">
        <button class="icon-btn" data-action="backward" title="Send backward">${icon('sendBackward', 14)}</button>
        <button class="icon-btn" data-action="forward" title="Bring forward">${icon('bringForward', 14)}</button>
        <button class="icon-btn" data-action="duplicate" title="Duplicate (Ctrl+D)">${icon('duplicate', 14)}</button>
        <button class="icon-btn btn--danger" data-action="delete" title="Delete (Del)">${icon('trash', 14)}</button>
      </span>
    `;

    const sections = sectionsFor(node);
    this.$('#body').innerHTML =
      sections
        .map(({ section, fields }) => {
          const open = !this._collapsed.has(section.id);
          return `
            <section class="section" data-open="${open}" data-section="${esc(section.id)}">
              <button class="section__head" type="button">
                <span class="section__caret">${icon('chevronDown', 12)}</span>
                <span class="section__title">${esc(section.title)}</span>
              </button>
              <div class="section__body">
                <div class="grid">
                  ${fields.map((field) => this._renderField(field, node, 'node')).join('')}
                </div>
              </div>
            </section>`;
        })
        .join('') + this._renderCustomSection(node);
  }

  /**
   * Raw CSS escape hatch: every `custom.*` declaration the node carries.
   *
   * @param {any} node
   * @returns {string}
   */
  _renderCustomSection(node) {
    const custom = (node.style && node.style.custom) || {};
    const entries = Object.entries(custom);
    const open = !this._collapsed.has('custom');

    return `
      <section class="section" data-open="${open}" data-section="custom">
        <button class="section__head" type="button">
          <span class="section__caret">${icon('chevronDown', 12)}</span>
          <span class="section__title">Custom CSS</span>
          <span class="section__count">${entries.length || ''}</span>
        </button>
        <div class="section__body">
          ${entries
            .map(
              ([property, value]) => `
                <div class="custom-row">
                  <input class="input" value="${esc(property)}" readonly tabindex="-1" />
                  <input class="input" data-custom-value="${esc(property)}" value="${esc(value)}" />
                  <button class="icon-btn" data-action="drop-custom" data-property="${esc(property)}"
                          title="Remove ${esc(property)}">${icon('minus', 12)}</button>
                </div>`
            )
            .join('')}
          <div class="add-row">
            <input class="input" id="custom-key" placeholder="property" aria-label="CSS property" />
            <input class="input" id="custom-value" placeholder="value" aria-label="CSS value" />
            <button class="icon-btn" data-action="add-custom" title="Add declaration">${icon('plus', 12)}</button>
          </div>
          <p class="note">Anything valid in a CSS declaration block. Applied to this element only.</p>
        </div>
      </section>
    `;
  }

  // -------------------------------------------------------------- fields --

  /**
   * @param {any} field descriptor from the schema
   * @param {any} source node or page JSON
   * @param {'node' | 'page'} scope
   * @returns {string}
   */
  _renderField(field, source, scope) {
    const value = field.read(source);
    const wide = field.span === 2 ? ' field--wide' : '';
    const common = `data-key="${esc(field.key)}" data-scope="${scope}" data-live="${field.live ? 'true' : 'false'}"`;

    let control;
    switch (field.type) {
      case 'number':
        control = `<input class="input" type="number" ${common}
          value="${esc(value)}"
          ${field.min !== undefined ? `min="${field.min}"` : ''}
          ${field.max !== undefined ? `max="${field.max}"` : ''}
          step="${field.step ?? 1}" />`;
        break;

      case 'textarea':
        control = `<textarea class="textarea" ${common}
          placeholder="${esc(field.placeholder || '')}">${esc(value)}</textarea>`;
        break;

      case 'color':
        control = `
          <div class="color">
            <span class="color__well" style="background:${esc(value)}">
              <input type="color" ${common} value="${esc(value)}" aria-label="${esc(field.label)}" />
            </span>
            <input class="input" data-mirror="${esc(field.key)}" data-scope="${scope}"
                   value="${esc(value)}" spellcheck="false" />
          </div>`;
        break;

      case 'select':
        control = `<select class="select" ${common}>
          ${(field.options || [])
            .map(
              (option) =>
                `<option value="${esc(option.value)}" ${option.value === value ? 'selected' : ''}>${esc(
                  option.label
                )}</option>`
            )
            .join('')}
        </select>`;
        break;

      case 'segmented':
        control = `<div class="segmented" ${common} role="group" aria-label="${esc(field.label)}">
          ${(field.options || [])
            .map(
              (option) =>
                `<button type="button" data-value="${esc(option.value)}"
                   aria-pressed="${option.value === value}"
                   title="${esc(option.label)}">${
                     option.icon ? icon(option.icon, 12) : esc(option.label)
                   }</button>`
            )
            .join('')}
        </div>`;
        break;

      case 'toggle':
        control = `<div class="switch" ${common} role="switch" tabindex="0"
                        aria-checked="${value === 'true'}">
          <span class="switch__label">${esc(field.label)}</span>
          <span class="switch__track"></span>
        </div>`;
        // The switch renders its own label.
        return `<div class="field${wide}">${control}</div>`;

      case 'slider':
        control = `<input class="range" type="range" ${common}
          min="${field.min ?? 0}" max="${field.max ?? 1}" step="${field.step ?? 0.01}"
          value="${esc(value || '1')}" />`;
        break;

      case 'text':
      default:
        control = `<input class="input" type="text" ${common}
          value="${esc(value)}" placeholder="${esc(field.placeholder || '')}" spellcheck="false" />`;
        break;
    }

    return `
      <div class="field${wide}">
        <label class="field__label">${esc(field.label)}</label>
        ${control}
      </div>`;
  }

  // -------------------------------------------------------------- events --

  /** Continuous input: fires on every keystroke / drag tick. */
  _onInput(event) {
    const target = /** @type {HTMLElement} */ (event.target);

    // The hex field beside a colour well: commit it, and mirror it back into
    // the swatch and the native picker.
    const mirrorKey = target.getAttribute('data-mirror');
    if (mirrorKey) {
      const hex = /** @type {HTMLInputElement} */ (target).value;
      if (!this._typingOpen) {
        this._typingOpen = true;
        app.beginGesture();
      }
      this._commit(mirrorKey, target.getAttribute('data-scope'), hex, true);
      this._syncColorWell(target, hex);
      return;
    }

    const key = target.getAttribute('data-key');
    if (!key) {
      return;
    }
    const live = target.getAttribute('data-live') === 'true';
    const scope = target.getAttribute('data-scope');
    const value = /** @type {HTMLInputElement} */ (target).value;

    if (target.classList.contains('range') || target.getAttribute('type') === 'color') {
      if (!this._sliderOpen) {
        this._sliderOpen = true;
        app.beginGesture();
      }
      this._commit(key, scope, value, true);
      if (target.getAttribute('type') === 'color') {
        this._syncColorWell(target, value);
      }
      return;
    }

    // Text-ish inputs write live so the canvas keeps up with typing; the undo
    // entry is opened once per focus, not per keystroke.
    if (!this._typingOpen) {
      this._typingOpen = true;
      app.beginGesture();
    }
    this._commit(key, scope, value, true);
    if (live) {
      this._syncColorWell(target, value);
    }
  }

  /** Discrete change: fires on commit (blur, Enter, select choice). */
  _onChange(event) {
    const target = /** @type {HTMLElement} */ (event.target);
    this._sliderOpen = false;
    this._typingOpen = false;

    // A row in the Custom CSS section.
    const customProperty = target.getAttribute('data-custom-value');
    if (customProperty) {
      const id = app.state.selection;
      if (id) {
        app.setProperty(id, `custom.${customProperty}`, /** @type {HTMLInputElement} */ (target).value);
      }
      return;
    }

    const key = target.getAttribute('data-key');
    if (!key) {
      return;
    }
    const scope = target.getAttribute('data-scope');
    const value = /** @type {HTMLInputElement} */ (target).value;
    this._commit(key, scope, value, false);
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

    const segment = target.closest('.segmented button');
    if (segment) {
      const group = segment.closest('.segmented');
      this._commit(
        group.getAttribute('data-key'),
        group.getAttribute('data-scope'),
        segment.getAttribute('data-value'),
        false
      );
      return;
    }

    const toggle = target.closest('.switch');
    if (toggle) {
      const next = toggle.getAttribute('aria-checked') !== 'true';
      this._commit(toggle.getAttribute('data-key'), toggle.getAttribute('data-scope'), String(next), false);
      return;
    }

    const action = target.closest('[data-action]');
    if (!action) {
      return;
    }
    const id = app.state.selection;
    switch (action.getAttribute('data-action')) {
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
    const id = app.state.selection;
    if (id) {
      app.setProperty(id, key, value, { live });
    }
  }

  /**
   * Keeps the swatch and the hex text field in step while a colour is dragged.
   *
   * @param {HTMLElement} source
   * @param {string} value
   */
  _syncColorWell(source, value) {
    const field = source.closest('.color');
    if (!field) {
      return;
    }
    const well = field.querySelector('.color__well');
    if (well) {
      /** @type {HTMLElement} */ (well).style.background = value;
    }
    const mirror = field.querySelector('[data-mirror]');
    if (mirror && mirror !== source) {
      /** @type {HTMLInputElement} */ (mirror).value = value;
    }
    const picker = field.querySelector('input[type="color"]');
    if (picker && picker !== source && /^#[0-9a-f]{6}$/i.test(value)) {
      /** @type {HTMLInputElement} */ (picker).value = value;
    }
  }
}

customElements.define('forge-inspector', ForgeInspector);
