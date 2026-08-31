/**
 * The measurement runtime that lives inside the sandboxed preview frame.
 *
 * It owns three jobs and nothing else:
 *   1. report every node's measured box to the editor, coalesced into one
 *      `requestAnimationFrame`;
 *   2. apply single-node style and text patches during a drag, without a
 *      document reload;
 *   3. relay wheel scrolling forwarded by the editor's canvas overlay.
 *
 * The frame runs with `sandbox="allow-scripts"` and no `allow-same-origin`, so
 * it has an opaque origin and cannot reach into the editor document, its
 * storage or its cookies. `postMessage` is the only channel between them.
 *
 * ## Why this is a real function and not a string
 *
 * It is written as ordinary JavaScript and turned into source with
 * `Function.prototype.toString()`. That keeps it lintable, formattable and
 * syntax-highlighted like every other file, instead of being a blob of text no
 * tool can see inside of. The project has no build step, so what you read here
 * is byte-for-byte what runs in the frame.
 *
 * The one rule that follows: **`previewRuntime` must be self-contained.** It
 * cannot reference an import or a module-level constant, because none of them
 * exist inside the frame. Anything it needs has to be declared in its body.
 *
 * @module engine/preview-runtime
 */

/**
 * The channel name tagging every message in both directions. The editor checks
 * it, and additionally verifies `event.source === frame.contentWindow` — which
 * is the meaningful identity check for a frame with an opaque origin.
 */
export const FRAME_CHANNEL = 'dl-frame';

/** @returns {void} */
function previewRuntime() {
  'use strict';

  const CHANNEL = 'dl-frame';

  /** @param {Record<string, unknown>} message */
  function post(message) {
    try {
      parent.postMessage({ ...message, source: CHANNEL }, '*');
    } catch {
      // The editor went away — nothing useful to do from in here.
    }
  }

  let pending = 0;

  /** Measures every node and reports it, at most once per frame. */
  function measure() {
    if (pending) {
      return;
    }
    pending = requestAnimationFrame(() => {
      pending = 0;
      const rects = Object.create(null);
      for (const element of document.querySelectorAll('[data-nid]')) {
        const box = element.getBoundingClientRect();
        rects[element.getAttribute('data-nid')] = [box.left, box.top, box.width, box.height];
      }
      post({
        type: 'rects',
        rects,
        viewport: [window.innerWidth, window.innerHeight],
        scroll: [window.scrollX, window.scrollY],
        scrollHeight: document.documentElement.scrollHeight,
      });
    });
  }

  /**
   * @param {unknown} id
   * @returns {Element | null}
   */
  function find(id) {
    if (typeof id !== 'string' || id === '') {
      return null;
    }
    return document.querySelector(`[data-nid="${CSS.escape(id)}"]`);
  }

  window.addEventListener('message', (event) => {
    const data = event.data;
    if (!data || data.target !== CHANNEL) {
      return;
    }
    switch (data.type) {
      case 'patch': {
        const target = find(data.id);
        if (target) {
          target.style.cssText = typeof data.css === 'string' ? data.css : '';
        }
        measure();
        break;
      }
      case 'text': {
        const target = find(data.id);
        if (target) {
          target.textContent = typeof data.text === 'string' ? data.text : '';
        }
        measure();
        break;
      }
      case 'scrollBy':
        window.scrollBy(Number(data.dx) || 0, Number(data.dy) || 0);
        measure();
        break;
      case 'measure':
        measure();
        break;
      default:
        break;
    }
  });

  window.addEventListener('resize', measure);
  window.addEventListener('scroll', measure, true);
  window.addEventListener('load', measure);

  // Images and webfonts change layout after first paint, so re-measure when
  // they land rather than reporting boxes the user will never see.
  for (const image of document.images) {
    image.addEventListener('load', measure);
    image.addEventListener('error', measure);
  }
  if (document.fonts) {
    document.fonts.ready.then(measure).catch(() => {});
  }
  new MutationObserver(measure).observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    characterData: true,
  });

  post({ type: 'ready' });
  measure();
}

/** The runtime as an immediately-invoked source string, ready to inline. */
export const PREVIEW_RUNTIME_JS = `(${previewRuntime.toString()})();`;
