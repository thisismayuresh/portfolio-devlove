/**
 * Undo/redo, as whole-document snapshots.
 *
 * Snapshots rather than a command log, on purpose. A command log needs a
 * correct inverse for every operation, and that is exactly where undo bugs
 * live — one operation forgets to restore one field and the document quietly
 * drifts. A snapshot is `structuredClone` and cannot be wrong.
 *
 * The cost is memory: a document of a few thousand nodes is a few hundred
 * kilobytes, and the stack is capped at `HISTORY_LIMIT` entries.
 *
 * @module engine/history
 */

/** Maximum number of undo steps retained. */
export const HISTORY_LIMIT = 200;

export class History {
  /** @param {number} [limit] */
  constructor(limit = HISTORY_LIMIT) {
    this.limit = limit;
    /** @type {any[]} */
    this._undo = [];
    /** @type {any[]} */
    this._redo = [];
  }

  /** @returns {boolean} */
  get canUndo() {
    return this._undo.length > 0;
  }

  /** @returns {boolean} */
  get canRedo() {
    return this._redo.length > 0;
  }

  /**
   * Captures a document so the next mutation can be undone.
   *
   * Recording a new step invalidates the redo stack, which is what every
   * editor does and what users expect.
   *
   * @param {any} doc
   */
  push(doc) {
    this._undo.push(structuredClone(doc));
    if (this._undo.length > this.limit) {
      this._undo.shift();
    }
    this._redo.length = 0;
  }

  /**
   * Throws away the most recent capture without restoring it.
   *
   * Used when a guarded mutation turned out to fail, so a rejected action
   * leaves no empty step in the history for the user to undo past.
   */
  discard() {
    this._undo.pop();
  }

  /**
   * @param {any} current the document as it stands now
   * @returns {any | null} the document to restore, or `null` if there is none
   */
  undo(current) {
    const previous = this._undo.pop();
    if (!previous) {
      return null;
    }
    this._redo.push(structuredClone(current));
    return previous;
  }

  /**
   * @param {any} current
   * @returns {any | null}
   */
  redo(current) {
    const next = this._redo.pop();
    if (!next) {
      return null;
    }
    this._undo.push(structuredClone(current));
    return next;
  }

  /**
   * Drops everything. Called once a document has finished loading, so the user
   * cannot undo their way back past the start of the session.
   */
  clear() {
    this._undo.length = 0;
    this._redo.length = 0;
  }
}
