/**
 * The compile worker.
 *
 * It holds no state. Every message carries the whole document, and the worker
 * answers with a string. That is the entire protocol, and it is what makes the
 * worker safe to think about: there is no second copy of the document to keep
 * in sync, nothing to invalidate, and the worker can be killed and recreated
 * at any moment without the editor noticing.
 *
 * The work it takes off the main thread is the part that actually costs
 * milliseconds — building the full HTML/CSS payload for a document, and
 * serialising a project to JSON — never anything a pointer gesture waits on.
 *
 * Protocol
 * --------
 *   in   `{id, job: 'compile', doc, options}` | `{id, job: 'serialize', doc}`
 *   out  `{id, ok: true, result}` | `{id, ok: false, error}`
 *
 * @module workers/compile.worker
 */

import { compileDocument } from '../engine/compiler.js';

self.addEventListener('message', (event) => {
  const { id, job, doc, options } = event.data || {};
  try {
    self.postMessage({ id, ok: true, result: run(job, doc, options) });
  } catch (error) {
    self.postMessage({ id, ok: false, error: error?.message || String(error) });
  }
});

/**
 * @param {string} job
 * @param {any} doc
 * @param {any} options
 * @returns {string}
 */
function run(job, doc, options) {
  switch (job) {
    case 'compile':
      return compileDocument(doc, options);
    case 'serialize':
      return JSON.stringify(doc);
    default:
      throw new Error(`unknown job \`${job}\``);
  }
}
