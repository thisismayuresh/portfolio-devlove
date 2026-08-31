/**
 * Pointer-driven drag coordination.
 *
 * The HTML5 Drag and Drop API is deliberately not used. It is unreliable
 * across shadow boundaries and form controls, it cannot report a position
 * during `dragover` on every platform, it has no touch story, and its drag
 * image cannot be styled. Pointer Events have none of those problems and give
 * the editor a drag ghost it fully controls.
 *
 * Two kinds of drag flow through here:
 *   `blueprint` — a new element being dragged out of the palette;
 *   `node`      — an existing layer being dragged in the layers tree.
 *
 * Canvas-internal move/resize gestures do *not* use this module; they own
 * their pointer capture directly because they never leave the canvas.
 *
 * Topics emitted on the app bus:
 *   drag:start  {type, kind, id, label, clientX, clientY}
 *   drag:move   {…payload, clientX, clientY}
 *   drag:end    {…payload, clientX, clientY, cancelled}
 *
 * @module core/drag-controller
 */

import { app } from './app.js';
import { icon } from '../ui/icons.js';

/** Pointer travel in CSS pixels before a press becomes a drag. */
const START_THRESHOLD = 4;

class DragController {
  constructor() {
    /** @type {null | {type: string, kind?: string, id?: string, label: string, iconName: string}} */
    this.payload = null;
    /** @type {HTMLElement | null} */
    this.ghost = null;
    this._armed = null;
    this._onMove = this._onMove.bind(this);
    this._onUp = this._onUp.bind(this);
    this._onKeyDown = this._onKeyDown.bind(this);
  }

  /** @returns {boolean} whether a drag is currently in flight */
  get active() {
    return this.payload !== null;
  }

  /**
   * Arms a potential drag on pointerdown. The drag only actually begins once
   * the pointer has travelled past {@link START_THRESHOLD}, so a plain click
   * still behaves like a click.
   *
   * @param {PointerEvent} event
   * @param {{type: 'blueprint' | 'node', kind?: string, id?: string, label: string, iconName?: string}} payload
   */
  arm(event, payload) {
    if (event.button !== 0) {
      return;
    }
    this._armed = {
      payload: { iconName: 'container', ...payload },
      startX: event.clientX,
      startY: event.clientY,
    };
    window.addEventListener('pointermove', this._onMove, true);
    window.addEventListener('pointerup', this._onUp, true);
    window.addEventListener('pointercancel', this._onUp, true);
    window.addEventListener('keydown', this._onKeyDown, true);
  }

  /** @param {PointerEvent} event */
  _onMove(event) {
    if (this._armed && !this.payload) {
      const travelled =
        Math.abs(event.clientX - this._armed.startX) + Math.abs(event.clientY - this._armed.startY);
      if (travelled < START_THRESHOLD) {
        return;
      }
      this._begin(event);
    }
    if (!this.payload) {
      return;
    }
    event.preventDefault();
    this._moveGhost(event.clientX, event.clientY);
    app.emit('drag:move', { ...this.payload, clientX: event.clientX, clientY: event.clientY });
  }

  /** @param {PointerEvent} event */
  _begin(event) {
    this.payload = this._armed.payload;
    document.body.setAttribute('data-dragging', 'true');

    this.ghost = document.createElement('div');
    this.ghost.className = 'drag-ghost';
    this.ghost.innerHTML = `${icon(this.payload.iconName, 14)}<span></span>`;
    this.ghost.querySelector('span').textContent = this.payload.label;
    document.body.append(this.ghost);

    this._moveGhost(event.clientX, event.clientY);
    app.emit('drag:start', { ...this.payload, clientX: event.clientX, clientY: event.clientY });
  }

  /**
   * @param {number} clientX
   * @param {number} clientY
   */
  _moveGhost(clientX, clientY) {
    if (this.ghost) {
      this.ghost.style.transform = `translate3d(${clientX + 12}px, ${clientY + 12}px, 0)`;
    }
  }

  /** @param {PointerEvent} event */
  _onUp(event) {
    const wasDragging = this.active;
    const payload = this.payload;
    this._teardown();
    if (wasDragging) {
      app.emit('drag:end', {
        ...payload,
        clientX: event.clientX,
        clientY: event.clientY,
        cancelled: event.type === 'pointercancel',
      });
    }
  }

  /** @param {KeyboardEvent} event */
  _onKeyDown(event) {
    if (event.key !== 'Escape' || !this.active) {
      return;
    }
    event.preventDefault();
    const payload = this.payload;
    this._teardown();
    app.emit('drag:end', { ...payload, clientX: -1, clientY: -1, cancelled: true });
  }

  /** Cancels any in-flight drag without emitting a drop. */
  cancel() {
    if (this.active) {
      const payload = this.payload;
      this._teardown();
      app.emit('drag:end', { ...payload, clientX: -1, clientY: -1, cancelled: true });
    } else {
      this._teardown();
    }
  }

  _teardown() {
    window.removeEventListener('pointermove', this._onMove, true);
    window.removeEventListener('pointerup', this._onUp, true);
    window.removeEventListener('pointercancel', this._onUp, true);
    window.removeEventListener('keydown', this._onKeyDown, true);
    if (this.ghost) {
      this.ghost.remove();
      this.ghost = null;
    }
    document.body.removeAttribute('data-dragging');
    this.payload = null;
    this._armed = null;
  }
}

/** Single instance shared by the palette, the layers tree and the canvas. */
export const dragController = new DragController();
