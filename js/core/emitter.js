/**
 * A 30-line publish/subscribe hub — the app's entire "state management"
 * dependency. Panels subscribe to the topics they care about and are handed a
 * payload; nothing else couples them together.
 *
 * @module core/emitter
 */

export class Emitter {
  constructor() {
    /** @type {Map<string, Set<Function>>} */
    this._topics = new Map();
  }

  /**
   * Subscribes to a topic.
   *
   * @param {string} topic
   * @param {(payload: any) => void} handler
   * @returns {() => void} unsubscribe function
   */
  on(topic, handler) {
    if (typeof handler !== 'function') {
      throw new TypeError(`handler for "${topic}" must be a function`);
    }
    let handlers = this._topics.get(topic);
    if (!handlers) {
      handlers = new Set();
      this._topics.set(topic, handlers);
    }
    handlers.add(handler);
    return () => this.off(topic, handler);
  }

  /**
   * Subscribes to several topics with one handler.
   *
   * @param {string[]} topics
   * @param {(payload: any) => void} handler
   * @returns {() => void} unsubscribe function for all of them
   */
  onAny(topics, handler) {
    const disposers = topics.map((topic) => this.on(topic, handler));
    return () => disposers.forEach((dispose) => dispose());
  }

  /**
   * @param {string} topic
   * @param {Function} handler
   */
  off(topic, handler) {
    const handlers = this._topics.get(topic);
    if (!handlers) {
      return;
    }
    handlers.delete(handler);
    if (handlers.size === 0) {
      this._topics.delete(topic);
    }
  }

  /**
   * Notifies every subscriber. A throwing subscriber is reported but never
   * prevents the others from running.
   *
   * @param {string} topic
   * @param {any} [payload]
   */
  emit(topic, payload) {
    const handlers = this._topics.get(topic);
    if (!handlers) {
      return;
    }
    for (const handler of [...handlers]) {
      try {
        handler(payload);
      } catch (error) {
        console.error(`[emitter] subscriber of "${topic}" threw`, error);
      }
    }
  }
}
