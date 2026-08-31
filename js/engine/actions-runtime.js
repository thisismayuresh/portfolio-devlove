/**
 * Click behaviour for the exported page.
 *
 * A static page is not the same thing as a dead one. A button that scrolls to
 * a section, a link that opens in a new tab, a menu that toggles on mobile —
 * these are what separate a page you can ship from a picture of one, and none
 * of them need a framework.
 *
 * An element opts in by setting `data.action` (and usually `data.target`).
 * The compiler turns that into `data-dl-action` / `data-dl-target` attributes
 * and, **only when at least one element uses an action**, appends this script.
 * A page with no interactive elements exports with no JavaScript at all.
 *
 * Written as a real function and stringified, for the same reasons as
 * `engine/preview-runtime.js`: it stays lintable and formattable rather than
 * being a blob of text. The same rule applies — it must be self-contained,
 * because none of this module's imports exist on the exported page.
 *
 * @module engine/actions-runtime
 */

/**
 * What each action does, as the inspector describes them.
 *
 * `submit` is absent on purpose: it needs no script. The compiler gives that
 * button `type="submit"` and the browser does the rest.
 *
 * @type {ReadonlyArray<{value: string, label: string, target: string}>}
 */
export const ACTIONS = Object.freeze([
  { value: '', label: 'Nothing', target: '' },
  { value: 'scroll', label: 'Scroll to section', target: 'Anchor name of the target section' },
  { value: 'open', label: 'Open a URL', target: 'https://example.com' },
  { value: 'openNew', label: 'Open a URL in a new tab', target: 'https://example.com' },
  { value: 'toggle', label: 'Show/hide a section', target: 'Anchor name of the target' },
  { value: 'copy', label: 'Copy text to clipboard', target: 'Text to copy' },
  { value: 'submit', label: 'Submit the form', target: '' },
  { value: 'back', label: 'Go back', target: '' },
]);

/** Actions the runtime handles. Anything else is either native or a no-op. */
export const SCRIPTED_ACTIONS = Object.freeze(
  ACTIONS.map((action) => action.value).filter((value) => value !== '' && value !== 'submit')
);

/** @returns {void} */
function actionsRuntime() {
  'use strict';

  /**
   * Sections are addressed by their anchor, which the compiler emits as the
   * element's `id`. Accepts it with or without a leading `#`.
   *
   * @param {string} target
   * @returns {Element | null}
   */
  function findTarget(target) {
    const name = String(target || '').replace(/^#/, '');
    if (name === '') {
      return null;
    }
    try {
      return document.getElementById(name);
    } catch {
      return null;
    }
  }

  /** @param {string} text */
  function copy(text) {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).catch(() => {});
      return;
    }
    // Older browsers, and any page not served over https.
    const scratch = document.createElement('textarea');
    scratch.value = text;
    scratch.setAttribute('readonly', '');
    scratch.style.position = 'fixed';
    scratch.style.left = '-9999px';
    document.body.append(scratch);
    scratch.select();
    try {
      document.execCommand('copy');
    } catch {
      // Nothing sensible to fall back to.
    }
    scratch.remove();
  }

  document.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-dl-action]');
    if (!trigger) {
      return;
    }
    const action = trigger.getAttribute('data-dl-action');
    const target = trigger.getAttribute('data-dl-target') || '';

    switch (action) {
      case 'scroll': {
        const destination = findTarget(target);
        if (destination) {
          event.preventDefault();
          destination.scrollIntoView({ behavior: 'smooth', block: 'start' });
          // Leave the URL usable as a deep link afterwards.
          if (destination.id) {
            history.replaceState(null, '', `#${destination.id}`);
          }
        }
        break;
      }
      case 'open':
        if (target) {
          event.preventDefault();
          location.href = target;
        }
        break;
      case 'openNew':
        if (target) {
          event.preventDefault();
          window.open(target, '_blank', 'noopener,noreferrer');
        }
        break;
      case 'toggle': {
        const panel = findTarget(target);
        if (panel) {
          event.preventDefault();
          const hidden = panel.hasAttribute('hidden');
          panel.toggleAttribute('hidden', !hidden);
          trigger.setAttribute('aria-expanded', String(hidden));
        }
        break;
      }
      case 'copy':
        event.preventDefault();
        copy(target);
        break;
      case 'back':
        event.preventDefault();
        history.back();
        break;
      default:
        break;
    }
  });

  // Anchors written by hand (`href="#work"`) should glide too, so the page
  // behaves the same however the link was made.
  document.addEventListener('click', (event) => {
    const link = event.target.closest('a[href^="#"]');
    if (!link || link.hasAttribute('data-dl-action')) {
      return;
    }
    const destination = findTarget(link.getAttribute('href'));
    if (destination) {
      event.preventDefault();
      destination.scrollIntoView({ behavior: 'smooth', block: 'start' });
      history.replaceState(null, '', link.getAttribute('href'));
    }
  });
}

/** The runtime as an immediately-invoked source string, ready to inline. */
export const ACTIONS_RUNTIME_JS = `(${actionsRuntime.toString()})();`;
