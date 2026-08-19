/**
 * Base class for every panel in the editor.
 *
 * Handles the boring half of a Custom Element: attaching the shadow root,
 * injecting shared + component styles once, and tearing down app
 * subscriptions when the element leaves the DOM.
 *
 * Subclasses implement:
 *   static styles  →  component-specific CSS string
 *   template()     →  initial markup for the shadow root
 *   mounted()      →  wire events and subscriptions (called once)
 *
 * @module ui/panel-element
 */

import { SHARED_CSS } from './shared-styles.js';
import { app } from '../core/app.js';

export class PanelElement extends HTMLElement {
  /** Component CSS. Overridden by subclasses. */
  static styles = '';

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    /** @type {Array<() => void>} */
    this._disposers = [];
    this._mounted = false;
  }

  connectedCallback() {
    if (this._mounted) {
      return;
    }
    this._mounted = true;

    const style = document.createElement('style');
    style.textContent = SHARED_CSS + '\n' + /** @type {typeof PanelElement} */ (this.constructor).styles;
    this.shadowRoot.append(style);

    const holder = document.createElement('div');
    holder.className = 'root';
    holder.innerHTML = this.template();
    this.shadowRoot.append(holder);
    /** @type {HTMLElement} */
    this.root = holder;

    this.mounted();
  }

  disconnectedCallback() {
    for (const dispose of this._disposers) {
      dispose();
    }
    this._disposers = [];
  }

  /** @returns {string} initial shadow markup */
  template() {
    return '';
  }

  /** Called once, after the shadow tree exists. */
  mounted() {}

  /**
   * Subscribes to app topics and auto-unsubscribes on disconnect.
   *
   * @param {string | string[]} topics
   * @param {(payload: any) => void} handler
   */
  listen(topics, handler) {
    const dispose = Array.isArray(topics)
      ? app.onAny(topics, handler)
      : app.on(topics, handler);
    this._disposers.push(dispose);
  }

  /**
   * Adds a DOM listener that is removed on disconnect.
   *
   * @param {EventTarget} target
   * @param {string} type
   * @param {EventListenerOrEventListenerObject} handler
   * @param {AddEventListenerOptions | boolean} [options]
   */
  bind(target, type, handler, options) {
    target.addEventListener(type, handler, options);
    this._disposers.push(() => target.removeEventListener(type, handler, options));
  }

  /**
   * `querySelector` scoped to the shadow root.
   *
   * @template {Element} T
   * @param {string} selector
   * @returns {T | null}
   */
  $(selector) {
    return /** @type {T | null} */ (this.shadowRoot.querySelector(selector));
  }

  /**
   * `querySelectorAll` scoped to the shadow root, as an array.
   *
   * @param {string} selector
   * @returns {Element[]}
   */
  $$(selector) {
    return [...this.shadowRoot.querySelectorAll(selector)];
  }
}

/**
 * Escapes text before it goes into an `innerHTML` template.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
