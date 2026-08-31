/**
 * Small, dependency-free helpers shared by every other engine module:
 * number formatting, input parsing, and the escaping used by the compiler.
 *
 * Everything here is a pure function of its arguments. That is what lets the
 * same modules run unchanged on the main thread and inside the compile worker.
 *
 * @module engine/values
 */

/** Smallest allowed box edge, in CSS pixels. */
export const MIN_SIZE = 4;

/** Bounds applied to any number the user types, to keep the page finite. */
export const NUMBER_LIMIT = 1_000_000;

/**
 * Renders a number with at most two decimals and no trailing `.0`.
 *
 * The compiler calls this for every declaration, so the output has to be
 * stable: the same node must always produce the same string, or the
 * "did anything change" comparisons downstream become meaningless.
 *
 * @param {number} value
 * @returns {string}
 */
export function num(value) {
  if (!Number.isFinite(value)) {
    return '0';
  }
  const rounded = Math.round(value * 100) / 100;
  const text = String(rounded);
  return text === '-0' ? '0' : text;
}

/**
 * Renders a number as a CSS pixel length.
 *
 * @param {number} value
 * @returns {string}
 */
export function px(value) {
  return `${num(value)}px`;
}

/**
 * Clamps a number into a range.
 *
 * @param {number} value
 * @param {number} low
 * @param {number} high
 * @returns {number}
 */
export function clamp(value, low, high) {
  return Math.min(high, Math.max(low, value));
}

/**
 * Parses a user-supplied string into a bounded finite number.
 *
 * Returns `null` rather than `NaN` so callers have to make a decision — a
 * silent `NaN` was the single most common source of "the box vanished".
 *
 * @param {string | number} raw
 * @returns {number | null}
 */
export function parseNumber(raw) {
  const text = String(raw).trim();
  if (text === '') {
    return null;
  }
  const value = Number(text);
  if (!Number.isFinite(value)) {
    return null;
  }
  return clamp(value, -NUMBER_LIMIT, NUMBER_LIMIT);
}

/**
 * Parses a user-supplied string into a boolean. Anything unrecognised is
 * `false`, which is what a checkbox that was never touched should mean.
 *
 * @param {string | boolean} raw
 * @returns {boolean}
 */
export function parseBoolean(raw) {
  return ['1', 'true', 'yes', 'on'].includes(String(raw).trim().toLowerCase());
}

/**
 * Escapes text destined for an element body.
 *
 * @param {string} input
 * @returns {string}
 */
export function escapeHtml(input) {
  return String(input).replace(/[&<>]/g, (character) => HTML_ENTITIES[character]);
}

/**
 * Escapes text destined for a double-quoted attribute value.
 *
 * @param {string} input
 * @returns {string}
 */
export function escapeAttr(input) {
  return String(input).replace(/[&<>"']/g, (character) => HTML_ENTITIES[character]);
}

/** @type {Record<string, string>} */
const HTML_ENTITIES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/**
 * Escapes body text and turns newlines into hard breaks.
 *
 * @param {string} input
 * @returns {string}
 */
export function escapeRichText(input) {
  return escapeHtml(input).replace(/\n/g, '<br>');
}

/**
 * Makes an id safe to use as a CSS class name.
 *
 * The engine generates ids itself, but the import path can carry hand-edited
 * ones — keep the selector valid regardless of what a project file contains.
 *
 * @param {string} id
 * @returns {string}
 */
export function escapeClass(id) {
  return String(id).replace(/[^a-zA-Z0-9_-]/g, '_');
}

/**
 * Strips characters that could break out of a CSS declaration block.
 *
 * @param {string} raw
 * @returns {string}
 */
export function sanitizeValue(raw) {
  return String(raw)
    .replace(/[;{}<>]/g, '')
    .trim();
}

/**
 * Keeps only characters legal in a CSS property name.
 *
 * @param {string} raw
 * @returns {string}
 */
export function sanitizeProperty(raw) {
  return String(raw)
    .trim()
    .replace(/[^a-zA-Z0-9-]/g, '');
}
