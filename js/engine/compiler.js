/**
 * Compiles a document into an HTML/CSS payload.
 *
 * Two flavours share one code path:
 *   * **editor** documents carry the measurement runtime and a few editing
 *     affordances, and are handed to the preview iframe through `srcdoc`;
 *   * **export** documents are pure, runtime-free HTML the user can ship.
 *
 * Identical markup, identical stylesheet — the only difference is what the
 * editor flavour adds. That is why "it looked right in the editor" and "it
 * looks right on my server" cannot diverge.
 *
 * Every function here is a pure function of a plain document object, with no
 * reference to the DOM, so this module runs unchanged in two places: on the
 * main thread for the single-node drag fast path, and inside
 * `workers/compile.worker.js` for whole-document compiles.
 *
 * @module engine/compiler
 */

import { ACTIONS_RUNTIME_JS } from './actions-runtime.js';
import { parentLayout } from './document.js';
import { definitionOf, isFlowLayout, isVoid, hasText, tagOf } from './kinds.js';
import { PREVIEW_RUNTIME_JS } from './preview-runtime.js';
import { writeDeclarations } from './style.js';
import {
  escapeAttr,
  escapeClass,
  escapeHtml,
  escapeRichText,
  px,
  sanitizeValue,
} from './values.js';

/**
 * The declaration block for a single node, including the geometry its position
 * mode implies.
 *
 * Shared by the stylesheet compiler and by the live-patch drag path, so a
 * dragged element and a freshly recompiled document can never disagree about
 * what that element should look like.
 *
 * @param {any} doc
 * @param {any} node
 * @returns {string}
 */
export function declarationsFor(doc, node) {
  if (node.kind === 'root') {
    return (
      'position:relative;margin:0 auto;box-sizing:border-box;' +
      `width:${px(doc.page.width)};min-height:${px(doc.page.minHeight)};` +
      writeDeclarations(node.style)
    );
  }

  // A child of a flow container is placed by its parent, so its own x/y are
  // meaningless and must not be emitted.
  const parentMode = parentLayout(doc, node);
  const flowed = isFlowLayout(parentMode);
  let out = flowed
    ? 'position:relative;'
    : `position:absolute;left:${px(node.x)};top:${px(node.y)};`;

  if (parentMode === 'grid') {
    // The track decides the width; an authored one would fight it.
    out += 'width:auto;';
  } else {
    out += `width:${px(node.width)};`;
  }

  if (node.autoHeight) {
    out += 'height:auto;';
    // A floor, but only for a box that has nothing in it. Otherwise "hug
    // height" would not hug: a row of 40px buttons in a container authored at
    // 200px would keep the 200, and `align-items:center` would then centre the
    // buttons 80px below where they were placed. Empty containers still get
    // the floor, because a zero-height box cannot be clicked or dropped into.
    const empty = node.children.length === 0 && !node.content;
    if (!flowed && empty) {
      out += `min-height:${px(node.height)};`;
    }
  } else {
    out += `height:${px(node.height)};`;
  }

  if (parentMode === 'row' || parentMode === 'column') {
    // Without this, flex would shrink the box away from its authored width.
    out += 'flex:0 0 auto;';
  }

  out += LAYOUT_DECLARATIONS[node.layout] || '';
  if (node.layout === 'grid' && node.style.gridColumns === undefined) {
    // Only when the user has not chosen a count — otherwise `style.gridColumns`
    // would emit a second, winning declaration and the compiled CSS would
    // carry a rule that never applies.
    out += 'grid-template-columns:repeat(2,minmax(0,1fr));';
  }

  if (node.hidden) {
    out += 'display:none;';
  }

  // Written last so a style property always beats the geometry defaults above
  // — that is what makes the Custom CSS field an escape hatch rather than a
  // suggestion.
  return out + writeDeclarations(node.style);
}

/**
 * What each layout mode means, as CSS.
 *
 * `align-items` differs per mode on purpose: a row of cards should sit on a
 * shared top edge, while a column should stretch its children to full width.
 * Both are overridable — `style.alignItems` is emitted after this.
 *
 * @type {Readonly<Record<string, string>>}
 */
const LAYOUT_DECLARATIONS = Object.freeze({
  row: 'display:flex;flex-direction:row;align-items:flex-start;',
  column: 'display:flex;flex-direction:column;align-items:stretch;',
  grid: 'display:grid;align-items:start;',
});

/**
 * The full stylesheet: a short reset, then one rule per node.
 *
 * @param {any} doc
 * @returns {string}
 */
export function compileCss(doc) {
  const background = sanitizeValue(doc.page.background);
  let css =
    '*,*::before,*::after{box-sizing:border-box}' +
    'html{-webkit-text-size-adjust:100%}' +
    `body{margin:0;padding:0;font-family:${sanitizeValue(doc.page.fontFamily)};background:${background};}` +
    `html{background:${background};}` +
    'img{display:block;max-width:100%}' +
    'button,input{font:inherit;color:inherit}' +
    'button{cursor:pointer}' +
    'a{text-decoration:none}' +
    'hr{border:0;margin:0}' +
    'p,h1,h2,h3,h4,h5,h6{margin:0}';

  /** @param {string} id */
  const walk = (id) => {
    const node = doc.nodes[id];
    if (!node) {
      return;
    }
    const scope = `.el-${escapeClass(node.id)}`;
    const declarations = declarationsFor(doc, node);
    if (declarations !== '') {
      css += `${scope}{${declarations}}`;
    }
    // Rules for the descendants a kind generates itself — table cells, list
    // items. Author-written CSS from `engine/kinds.js`, never user input, so
    // it needs no escaping; only the scope selector is substituted.
    const { descendantCss } = definitionOf(node.kind);
    if (descendantCss) {
      css += descendantCss.replaceAll('&', scope);
    }
    node.children.forEach(walk);
  };
  walk(doc.root);

  return css;
}

/**
 * The `<body>` markup for the document.
 *
 * @param {any} doc
 * @returns {string}
 */
export function compileHtml(doc) {
  return writeNode(doc, doc.root);
}

/**
 * @param {any} doc
 * @param {string} id
 * @returns {string}
 */
function writeNode(doc, id) {
  const node = doc.nodes[id];
  if (!node) {
    return '';
  }

  const definition = definitionOf(node.kind);
  const tag = tagOf(node);

  let out = `<${tag} class="el-${escapeClass(node.id)}" data-nid="${escapeAttr(node.id)}"`;

  // Attributes every kind can carry, emitted before the kind's own so that a
  // kind could deliberately override one.
  for (const [name, value] of Object.entries(commonAttributes(node))) {
    if (value !== null && value !== undefined) {
      out += ` ${name}="${escapeAttr(value)}"`;
    }
  }
  for (const [name, value] of Object.entries(definition.attrs ? definition.attrs(node) : {})) {
    if (value !== null && value !== undefined) {
      out += ` ${name}="${escapeAttr(value)}"`;
    }
  }
  out += '>';

  if (isVoid(node.kind)) {
    return out;
  }

  if (definition.body) {
    // A kind with a `body` hook owns its inner markup completely — the plain
    // `content` path below is skipped rather than added to.
    out += renderFragment(definition.body(node));
  } else if (hasText(node.kind) && node.content !== '') {
    out += escapeRichText(node.content);
  }

  for (const child of node.children) {
    out += writeNode(doc, child);
  }
  return `${out}</${tag}>`;
}

/**
 * Attributes any element can carry, independent of its kind.
 *
 * The anchor becomes the element's `id`, which is what makes it addressable
 * by a nav link (`href="#pricing"`) and by a Scroll action. Actions are
 * emitted as `data-dl-*` and read by `engine/actions-runtime.js` — the markup
 * stays declarative and there is no inline `onclick` for a
 * Content-Security-Policy to reject.
 *
 * @param {any} node
 * @returns {Record<string, string | null>}
 */
function commonAttributes(node) {
  const action = node.data?.action;
  const scripted = action && action !== 'submit';
  return {
    id: node.anchor || null,
    'data-dl-action': scripted ? action : null,
    'data-dl-target': scripted && node.data?.target ? node.data.target : null,
    'aria-expanded': action === 'toggle' ? 'true' : null,
  };
}

/**
 * Whether any node in the document needs the click runtime.
 *
 * A page built entirely from text and images exports as pure HTML with no
 * `<script>` at all, which is the point of asking rather than always shipping
 * it.
 *
 * @param {any} doc
 * @returns {boolean}
 */
function usesActions(doc) {
  return Object.values(doc.nodes).some((node) => {
    const action = /** @type {any} */ (node).data?.action;
    return Boolean(action) && action !== 'submit';
  });
}

/** Tags that never receive a closing tag, for fragments built by a `body` hook. */
const VOID_TAGS = new Set(['br', 'hr', 'img', 'input', 'source', 'track', 'wbr']);

/**
 * Renders a fragment spec returned by a kind's `body` hook.
 *
 * Every `text` and every attribute value is escaped here, which is the point
 * of the whole mechanism: a `body` hook returns a structure, so it has no way
 * to inject markup even if it tries. Tags come from `engine/kinds.js` and are
 * never user input.
 *
 * @param {any} spec a string, an element spec, an array of either, or nothing
 * @returns {string}
 */
function renderFragment(spec) {
  if (spec === null || spec === undefined || spec === false) {
    return '';
  }
  if (Array.isArray(spec)) {
    return spec.map(renderFragment).join('');
  }
  if (typeof spec !== 'object') {
    // A bare value is text. Escaped without turning newlines into `<br>` —
    // inside a <pre> or a <textarea> the newline itself is what is wanted.
    return escapeHtml(String(spec));
  }

  let out = `<${spec.tag}`;
  for (const [name, value] of Object.entries(spec.attrs || {})) {
    if (value !== null && value !== undefined) {
      out += ` ${name}="${escapeAttr(value)}"`;
    }
  }
  out += '>';

  if (VOID_TAGS.has(spec.tag)) {
    return out;
  }
  if (spec.text !== undefined) {
    out += escapeHtml(String(spec.text));
  }
  return `${out}${renderFragment(spec.children)}</${spec.tag}>`;
}

/**
 * Assembles a complete, self-contained HTML document.
 *
 * @param {any} doc
 * @param {{editor?: boolean}} [options] `editor: true` adds the measurement
 *   runtime and the editing affordances; the default is the shippable export
 * @returns {string}
 */
export function compileDocument(doc, options = {}) {
  const editor = options.editor === true;
  const lang = sanitizeValue(doc.page.lang || 'en') || 'en';

  let out =
    `<!doctype html><html lang="${escapeAttr(lang)}"><head><meta charset="utf-8">` +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    `<title>${escapeHtml(doc.page.title)}</title>`;

  if (doc.page.description) {
    out += `<meta name="description" content="${escapeAttr(doc.page.description)}">`;
    // Enough for a link preview to show something sensible without asking the
    // user to fill in a second set of fields.
    out += `<meta property="og:title" content="${escapeAttr(doc.page.title)}">`;
    out += `<meta property="og:description" content="${escapeAttr(doc.page.description)}">`;
  }

  out += '<style>' + compileCss(doc);
  if (editor) {
    out += EDITOR_CHROME_CSS;
  }
  out += '</style></head>';
  out += compileHtml(doc);

  if (editor) {
    out += `<script>${PREVIEW_RUNTIME_JS}</script>`;
  }
  // Click behaviour ships with the export as well as the preview — a button
  // that scrolls in the editor and does nothing on the user's server would be
  // worse than not offering the feature.
  if (usesActions(doc)) {
    out += `<script>${ACTIONS_RUNTIME_JS}</script>`;
  }
  return `${out}</html>`;
}

/**
 * Editor-only styling injected into the preview frame. Never exported.
 *
 * Pointer events are disabled on interactive elements so that clicking a
 * button on the canvas selects it instead of pressing it; Preview mode drops
 * this stylesheet entirely and the page becomes genuinely interactive.
 */
const EDITOR_CHROME_CSS =
  'body{cursor:default;-webkit-user-select:none;user-select:none;}' +
  '[data-nid]{outline-offset:-1px}' +
  'div[data-nid]:empty,section[data-nid]:empty{outline:1px dashed rgba(120,140,180,.55)}' +
  'a[data-nid],button[data-nid],input[data-nid],textarea[data-nid],video[data-nid],label[data-nid]' +
  '{pointer-events:none}';
