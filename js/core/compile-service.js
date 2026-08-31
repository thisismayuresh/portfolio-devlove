/**
 * The main-thread side of the compile worker.
 *
 * Two jobs run off-thread, and they are the two that cost real time on a big
 * document: building the full HTML/CSS payload, and serialising a project to
 * JSON for autosave or a download. Neither is on the path of a pointer
 * gesture — dragging patches one node's declarations synchronously through
 * `Engine.nodeCss`, and never waits for this.
 *
 * If a worker cannot be created — no `Worker` at all, a page opened over
 * `file://`, a Content-Security-Policy that forbids it — the same functions
 * run inline on the main thread instead. The editor is slower under load but
 * behaves identically, because both sides call the same
 * `engine/compiler.js`. There is no second implementation to keep in step.
 *
 * @module core/compile-service
 */

import { compileDocument } from '../engine/compiler.js';

export class CompileService {
  constructor() {
    /** @type {Worker | null} */
    this._worker = null;

    /** Set once a worker has failed, so we stop trying to create another. */
    this._degraded = false;

    /** @type {Map<number, {resolve: (value: string) => void, reject: (error: Error) => void, inline: () => string}>} */
    this._pending = new Map();
    this._nextId = 0;
  }

  /**
   * Whether work is currently going off the main thread. Reported in the
   * status bar so the mode is visible rather than a mystery.
   *
   * @returns {boolean}
   */
  get offThread() {
    return this._worker !== null;
  }

  /**
   * Compiles a whole document.
   *
   * @param {any} doc a document snapshot, structured-cloned on the way over
   * @param {{editor?: boolean}} [options]
   * @returns {Promise<string>}
   */
  compile(doc, options = {}) {
    return this._run('compile', doc, options, () => compileDocument(doc, options));
  }

  /**
   * Serialises a document to project JSON.
   *
   * @param {any} doc
   * @returns {Promise<string>}
   */
  serialize(doc) {
    return this._run('serialize', doc, undefined, () => JSON.stringify(doc));
  }

  /** Tears the worker down. Only the tests need this. */
  dispose() {
    if (this._worker) {
      this._worker.terminate();
      this._worker = null;
    }
    for (const { reject } of this._pending.values()) {
      reject(new Error('compile service disposed'));
    }
    this._pending.clear();
  }

  /**
   * Sends a job to the worker, or runs the inline equivalent when there is no
   * worker to send it to.
   *
   * @param {string} job
   * @param {any} doc
   * @param {any} options
   * @param {() => string} inline the same work, on this thread
   * @returns {Promise<string>}
   */
  _run(job, doc, options, inline) {
    const worker = this._ensureWorker();
    if (!worker) {
      // Still a promise, so callers never have two shapes to handle.
      return Promise.resolve().then(inline);
    }

    const id = (this._nextId += 1);
    return new Promise((resolve, reject) => {
      // `inline` is kept so a worker that dies mid-job can be answered here
      // instead of failing the caller.
      this._pending.set(id, { resolve, reject, inline });
      worker.postMessage({ id, job, doc, options });
    });
  }

  /**
   * @returns {Worker | null} the worker, creating it on first use
   */
  _ensureWorker() {
    if (this._worker || this._degraded) {
      return this._worker;
    }
    try {
      const worker = new Worker(new URL('../workers/compile.worker.js', import.meta.url), {
        type: 'module',
        name: 'devlove-compile',
      });
      worker.addEventListener('message', (event) => this._onMessage(event));
      worker.addEventListener('error', (event) => this._onFailure(event.message));
      worker.addEventListener('messageerror', () => this._onFailure('message could not be cloned'));
      this._worker = worker;
    } catch (error) {
      this._onFailure(error?.message || String(error));
    }
    return this._worker;
  }

  /** @param {MessageEvent} event */
  _onMessage(event) {
    const { id, ok, result, error } = event.data || {};
    const entry = this._pending.get(id);
    if (!entry) {
      return;
    }
    this._pending.delete(id);
    if (ok) {
      entry.resolve(result);
    } else {
      entry.reject(new Error(error || 'compile failed'));
    }
  }

  /**
   * Drops to inline compiling, permanently. A worker that failed once will
   * fail again, and retrying it on every keystroke would be worse than being
   * a little slower.
   *
   * @param {string} detail
   */
  _onFailure(detail) {
    console.warn(`[devlove] compile worker unavailable — running inline (${detail})`);
    this._degraded = true;
    if (this._worker) {
      this._worker.terminate();
      this._worker = null;
    }
    // Finish whatever was in flight on this thread, so a worker dying is
    // invisible to the caller rather than a failed export.
    const inFlight = [...this._pending.values()];
    this._pending.clear();
    for (const { resolve, reject, inline } of inFlight) {
      try {
        resolve(inline());
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    }
  }
}

/** The single service instance the app uses. */
export const compileService = new CompileService();
