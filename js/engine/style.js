/**
 * The style bag: one table that drives both writing CSS and validating input.
 *
 * A node's `style` is a plain object holding only the keys that were actually
 * set, plus a `custom` map for raw CSS the typed fields do not cover.
 *
 * **Adding a style property is one entry in `STYLE_FIELDS`** — it becomes
 * settable through `setStyleProp`, emitted by the compiler in table order, and
 * exposable in the inspector by naming `style.<key>` in
 * `registry/inspector-schema.js`.
 *
 * Field contract
 * --------------
 *   key      the name used in `style.<key>` property paths, camelCase
 *   css      the CSS property it emits, or `null` when another field emits it
 *   input    `'text'` or `'number'` — how a typed value is validated
 *   format   turns a stored value into the CSS side of the declaration
 *   emit     optional override producing the whole declaration, for the rare
 *            property built from more than one field
 *
 * @module engine/style
 */

import { clamp, num, parseNumber, px, sanitizeProperty, sanitizeValue } from './values.js';

/** @param {unknown} value @returns {string} */
const asText = (value) => sanitizeValue(String(value));

/** @param {unknown} value @returns {string} */
const asPx = (value) => px(Number(value));

/** @param {unknown} value @returns {string} */
const asNumber = (value) => num(Number(value));

/** @param {unknown} value @returns {string} */
const asOpacity = (value) => num(clamp(Number(value), 0, 1));

/** @param {unknown} value @returns {string} an integer, for `z-index` */
const asInteger = (value) => String(Math.round(Number(value)) || 0);

/**
 * Accepts either a bare URL or a full CSS image value.
 *
 * `background-image` is the one place where what people naturally paste — a
 * URL — is not valid CSS on its own. Anything containing a `(` is already a
 * CSS function (`url(…)`, `linear-gradient(…)`) and is passed through; a bare
 * URL gets wrapped.
 *
 * @param {unknown} value
 * @returns {string}
 */
const asImage = (value) => {
  const text = asText(value);
  return text === '' || text.includes('(') ? text : `url("${text.replace(/"/g, '')}")`;
};

/**
 * Border takes three fields to make one declaration, so it owns its own
 * emitter. A width of zero is emitted as `border:0` rather than skipped,
 * because it has to beat a browser default on `<button>` and `<input>`.
 *
 * @param {Record<string, any>} style
 * @returns {string}
 */
function emitBorder(style) {
  const width = style.borderWidth;
  if (width === undefined) {
    return '';
  }
  if (width > 0) {
    const line = style.borderStyle === undefined ? 'solid' : asText(style.borderStyle);
    const ink = style.borderColor === undefined ? '#000000' : asText(style.borderColor);
    return `border:${asPx(width)} ${line} ${ink};`;
  }
  return 'border:0;';
}

/**
 * Column count for a grid container.
 *
 * `minmax(0, 1fr)` rather than a plain `1fr`: a grid track's default minimum
 * is `auto`, so one long unbreakable child would otherwise widen its column
 * and knock the whole grid out of alignment.
 *
 * @param {unknown} value
 * @returns {string}
 */
const asGridColumns = (value) =>
  `repeat(${Math.max(1, Math.round(Number(value)) || 1)},minmax(0,1fr))`;

/**
 * Rotation and scale share one `transform`, so one of them owns the emitter.
 *
 * They are separate fields rather than a single free-text `transform` because
 * two number inputs are draggable and a CSS function string is not.
 *
 * @param {Record<string, any>} style
 * @returns {string}
 */
function emitTransform(style) {
  const parts = [];
  if (style.rotate !== undefined && style.rotate !== 0) {
    parts.push(`rotate(${num(style.rotate)}deg)`);
  }
  if (style.scale !== undefined && style.scale !== 1) {
    parts.push(`scale(${num(style.scale)})`);
  }
  return parts.length > 0 ? `transform:${parts.join(' ')};` : '';
}

/**
 * A CSS `transition` from a duration in milliseconds.
 *
 * `all` is the right default here even though it is the wrong default in
 * hand-written CSS: the user has just told the builder "animate this box", and
 * they have no way to name which properties they meant.
 *
 * @param {unknown} value
 * @returns {string}
 */
const asTransition = (value) => `all ${Math.max(0, Math.round(Number(value)) || 0)}ms ease`;

/**
 * Every typed style property, **in the order the compiler emits them**.
 * The order is part of the contract: an unchanged document has to compile to
 * a byte-identical string, or the preview reloads for no reason.
 *
 * Grouped the way the inspector groups them — fill, then type, then box, then
 * layout, then effects — so that reading the compiled CSS and reading the
 * right-hand panel feel like reading the same list.
 *
 * @type {ReadonlyArray<{key: string, css: string | null, input: 'text' | 'number', format?: (value: any) => string, emit?: (style: any) => string}>}
 */
export const STYLE_FIELDS = Object.freeze([
  // -- fill
  { key: 'background', css: 'background', input: 'text', format: asText },
  { key: 'backgroundImage', css: 'background-image', input: 'text', format: asImage },
  { key: 'backgroundSize', css: 'background-size', input: 'text', format: asText },
  { key: 'backgroundPosition', css: 'background-position', input: 'text', format: asText },
  { key: 'backgroundRepeat', css: 'background-repeat', input: 'text', format: asText },

  // -- type
  { key: 'color', css: 'color', input: 'text', format: asText },
  { key: 'fontSize', css: 'font-size', input: 'number', format: asPx },
  { key: 'fontWeight', css: 'font-weight', input: 'text', format: asText },
  { key: 'fontStyle', css: 'font-style', input: 'text', format: asText },
  { key: 'fontFamily', css: 'font-family', input: 'text', format: asText },
  { key: 'lineHeight', css: 'line-height', input: 'number', format: asNumber },
  { key: 'letterSpacing', css: 'letter-spacing', input: 'number', format: asPx },
  { key: 'textAlign', css: 'text-align', input: 'text', format: asText },
  { key: 'textTransform', css: 'text-transform', input: 'text', format: asText },
  { key: 'textDecoration', css: 'text-decoration', input: 'text', format: asText },
  { key: 'textShadow', css: 'text-shadow', input: 'text', format: asText },
  { key: 'listStyle', css: 'list-style-type', input: 'text', format: asText },
  { key: 'whiteSpace', css: 'white-space', input: 'text', format: asText },

  // -- box. The `-Top` style overrides are emitted after the shorthand so a
  //    single side can be adjusted without abandoning the shorthand.
  { key: 'margin', css: 'margin', input: 'number', format: asPx },
  { key: 'marginTop', css: 'margin-top', input: 'number', format: asPx },
  { key: 'marginRight', css: 'margin-right', input: 'number', format: asPx },
  { key: 'marginBottom', css: 'margin-bottom', input: 'number', format: asPx },
  { key: 'marginLeft', css: 'margin-left', input: 'number', format: asPx },
  { key: 'padding', css: 'padding', input: 'number', format: asPx },
  { key: 'paddingTop', css: 'padding-top', input: 'number', format: asPx },
  { key: 'paddingRight', css: 'padding-right', input: 'number', format: asPx },
  { key: 'paddingBottom', css: 'padding-bottom', input: 'number', format: asPx },
  { key: 'paddingLeft', css: 'padding-left', input: 'number', format: asPx },
  { key: 'minHeight', css: 'min-height', input: 'number', format: asPx },
  { key: 'maxWidth', css: 'max-width', input: 'number', format: asPx },
  { key: 'aspectRatio', css: 'aspect-ratio', input: 'text', format: asText },
  { key: 'objectFit', css: 'object-fit', input: 'text', format: asText },
  { key: 'objectPosition', css: 'object-position', input: 'text', format: asText },
  { key: 'radius', css: 'border-radius', input: 'number', format: asPx },
  { key: 'borderWidth', css: null, input: 'number', emit: emitBorder },
  { key: 'borderStyle', css: null, input: 'text' },
  { key: 'borderColor', css: null, input: 'text' },

  // -- child layout
  { key: 'gap', css: 'gap', input: 'number', format: asPx },
  { key: 'justifyContent', css: 'justify-content', input: 'text', format: asText },
  { key: 'alignItems', css: 'align-items', input: 'text', format: asText },
  { key: 'flexWrap', css: 'flex-wrap', input: 'text', format: asText },
  { key: 'gridColumns', css: 'grid-template-columns', input: 'number', format: asGridColumns },

  // -- effects
  { key: 'opacity', css: 'opacity', input: 'number', format: asOpacity },
  { key: 'shadow', css: 'box-shadow', input: 'text', format: asText },
  { key: 'filter', css: 'filter', input: 'text', format: asText },
  { key: 'backdropFilter', css: 'backdrop-filter', input: 'text', format: asText },
  { key: 'rotate', css: null, input: 'number', emit: emitTransform },
  { key: 'scale', css: null, input: 'number' },
  { key: 'transition', css: 'transition', input: 'number', format: asTransition },
  { key: 'cursor', css: 'cursor', input: 'text', format: asText },
  { key: 'overflow', css: 'overflow', input: 'text', format: asText },
  { key: 'zIndex', css: 'z-index', input: 'number', format: asInteger },
]);

/** Lookup from any accepted spelling (camelCase or snake_case) to a field. */
const FIELDS_BY_NAME = new Map();
for (const field of STYLE_FIELDS) {
  FIELDS_BY_NAME.set(field.key, field);
  const snake = field.key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
  if (snake !== field.key) {
    FIELDS_BY_NAME.set(snake, field);
  }
}

/** Every style key the engine understands, for docs and tests. */
export const STYLE_KEYS = Object.freeze(STYLE_FIELDS.map((field) => field.key));

/**
 * Builds a style bag from a kind's table row.
 *
 * @param {Record<string, string | number>} [defaults]
 * @param {Record<string, string>} [custom]
 * @returns {Record<string, any>}
 */
export function createStyle(defaults = {}, custom = {}) {
  /** @type {Record<string, any>} */
  const style = { custom: { ...custom } };
  for (const [key, value] of Object.entries(defaults)) {
    style[key] = value;
  }
  return style;
}

/**
 * Appends every declaration this bag owns to a string.
 *
 * `custom` is emitted last and in sorted key order, so the compiled payload is
 * stable no matter what order the user typed the properties in.
 *
 * @param {Record<string, any>} style
 * @returns {string}
 */
export function writeDeclarations(style) {
  let out = '';
  for (const field of STYLE_FIELDS) {
    if (field.emit) {
      out += field.emit(style);
      continue;
    }
    const value = style[field.key];
    if (value === undefined || field.css === null) {
      continue;
    }
    out += `${field.css}:${field.format(value)};`;
  }

  const custom = style.custom || {};
  for (const property of Object.keys(custom).sort()) {
    const name = sanitizeProperty(property);
    if (name === '') {
      continue;
    }
    out += `${name}:${asText(custom[property])};`;
  }
  return out;
}

/**
 * Applies one style key. An empty value clears the property.
 *
 * @param {Record<string, any>} style
 * @param {string} key camelCase or snake_case name of a `STYLE_FIELDS` entry
 * @param {string} value
 * @throws {Error} on an unknown key, or a number field given a non-number
 */
export function setStyleProp(style, key, value) {
  const field = FIELDS_BY_NAME.get(key);
  if (!field) {
    throw new Error(`unknown style property \`${key}\``);
  }

  const trimmed = String(value).trim();
  if (trimmed === '') {
    delete style[field.key];
    return;
  }

  if (field.input === 'number') {
    const parsed = parseNumber(trimmed);
    if (parsed === null) {
      throw new Error(`\`${key}\` expects a number, received \`${value}\``);
    }
    style[field.key] = parsed;
    return;
  }
  style[field.key] = trimmed;
}

/**
 * Applies one raw CSS declaration. An empty value removes it.
 *
 * @param {Record<string, any>} style
 * @param {string} property
 * @param {string} value
 * @throws {Error} when the property name sanitises down to nothing
 */
export function setCustomProp(style, property, value) {
  const name = sanitizeProperty(property);
  if (name === '') {
    throw new Error('custom property name is empty');
  }
  if (!style.custom) {
    style.custom = {};
  }
  const trimmed = String(value).trim();
  if (trimmed === '') {
    delete style.custom[name];
  } else {
    style.custom[name] = trimmed;
  }
}
