/**
 * The element catalogue — one table row per primitive the builder can create.
 *
 * This is the extension point of the whole engine. **Adding an element is one
 * entry in `ELEMENT_KINDS` plus a palette tile in `registry/elements.js`.**
 * Nothing else in `js/engine/` branches on element type: the compiler asks the
 * table for a tag, the drop router asks it whether children are allowed, and
 * the inspector asks it for defaults.
 *
 * Row contract
 * ------------
 *   label         human name, also the default layer name
 *   tag           HTML tag the compiler emits. A function `(node) => tag` when
 *                 it depends on the node — a list is `<ul>` or `<ol>`
 *   container     may hold children (the drop router only nests into these)
 *   layout        starting layout mode for its children, default `'absolute'`
 *   void          no closing tag and no children — `<img>`, `<input>`, `<hr>`
 *   text          renders editable text; gives it a Content field and
 *                 double-click-to-edit on the canvas
 *   size          `[width, height]` in CSS pixels when first dropped
 *   hugHeight     start with `height:auto` and let the content size the box
 *   content       starting body text
 *   attributes    starting values for the typed `href` / `src` / `placeholder`
 *   data          starting values for the `data` bag — see `engine/node.js`
 *   style         starting style bag (see `engine/style.js` for the keys)
 *   custom        starting raw CSS declarations, for what the style bag has no
 *                 typed field for
 *   attrs         `(node) => ({name: value})` — extra HTML attributes the
 *                 compiler should emit. Entries that are `null` or `undefined`
 *                 are skipped; `''` is emitted, because an empty `alt` means
 *                 "decorative" and dropping it would be an accessibility bug.
 *                 Every value that is emitted is escaped.
 *   body          `(node) => Fragment` — builds the element's inner markup
 *                 from the node, for anything more structured than one run of
 *                 text. See the note below.
 *   descendantCss static CSS for the element's own generated descendants.
 *                 `&` is replaced with the node's class selector
 *
 * ## The `body` hook
 *
 * A table has rows and cells; a list has items. Those are built by `body`,
 * which returns a **fragment spec** rather than an HTML string:
 *
 *   a string                    → escaped text
 *   `{tag, attrs?, text?, children?}` → one element
 *   an array                    → several of the above, in order
 *   `null` / `undefined`        → nothing
 *
 * The compiler escapes every `text` and every attribute value while rendering
 * it, so a `body` hook **cannot** emit unescaped user content even by mistake.
 * That is the whole reason it returns a structure instead of a string.
 *
 * A kind that defines `body` takes full control of its inner markup: the
 * ordinary `content` path is skipped. `code` and `textarea` use that to render
 * their text with real newlines rather than `<br>`.
 *
 * @module engine/kinds
 */

import { HIGHLIGHT_CSS, highlight } from './highlight.js';

/**
 * Inline SVG placeholder so a dropped image never renders as a broken icon
 * and never makes a network request.
 */
export const PLACEHOLDER_IMAGE =
  "data:image/svg+xml;utf8,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20width='320'%20height='220'%3E%3Crect%20width='100%25'%20height='100%25'%20fill='%23e3e8f0'/%3E%3Cpath%20d='M0%20220%20L110%20105%20L180%20170%20L235%20125%20L320%20220%20Z'%20fill='%23a8b3c5'/%3E%3Ccircle%20cx='236'%20cy='58'%20r='26'%20fill='%23a8b3c5'/%3E%3C/svg%3E";

/**
 * Splits a multi-line `data` value into trimmed, non-empty lines.
 *
 * @param {unknown} text
 * @returns {string[]}
 */
export function splitLines(text) {
  return String(text ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
}

/**
 * Splits one line into pipe-separated cells.
 *
 * `|` rather than a comma because prose in a table cell contains commas far
 * more often than it contains pipes.
 *
 * @param {unknown} line
 * @returns {string[]}
 */
export function splitCells(line) {
  return String(line ?? '')
    .split('|')
    .map((cell) => cell.trim());
}

/**
 * @typedef {object} ElementKind
 * @property {string} label
 * @property {string | ((node: any) => string)} tag
 * @property {boolean} [container]
 * @property {string} [layout]
 * @property {boolean} [void]
 * @property {boolean} [text]
 * @property {[number, number]} size
 * @property {boolean} [hugHeight]
 * @property {string} [content]
 * @property {Record<string, string>} [attributes]
 * @property {Record<string, string>} [data]
 * @property {Record<string, string | number>} [style]
 * @property {Record<string, string>} [custom]
 * @property {(node: any) => Record<string, string | null>} [attrs]
 * @property {(node: any) => any} [body]
 * @property {string} [descendantCss]
 */

/** @type {Readonly<Record<string, ElementKind>>} */
export const ELEMENT_KINDS = Object.freeze({
  // ============================================================ structure ===

  root: {
    label: 'Page',
    tag: 'body',
    container: true,
    size: [1280, 800],
    style: { background: '#ffffff', color: '#0f1729' },
  },

  section: {
    label: 'Section',
    tag: 'section',
    container: true,
    size: [960, 420],
    style: { background: '#0f1729', color: '#ffffff', padding: 48 },
  },

  container: {
    label: 'Container',
    tag: 'div',
    container: true,
    size: [360, 240],
    style: {
      background: '#f3f5f9',
      radius: 14,
      padding: 20,
      borderWidth: 1,
      borderColor: '#dfe4ec',
    },
  },

  stack: {
    label: 'Stack',
    tag: 'div',
    container: true,
    // A "Stack" that does not stack until you find the layout dropdown is a
    // small betrayal of its own name.
    layout: 'column',
    size: [320, 200],
    // Flow containers hug by default: a column with a fixed height clips its
    // own children the moment you add one too many.
    hugHeight: true,
    style: { background: 'transparent', gap: 16, padding: 12 },
  },

  grid: {
    label: 'Grid',
    tag: 'div',
    container: true,
    layout: 'grid',
    size: [960, 300],
    hugHeight: true,
    style: { background: 'transparent', gap: 20, padding: 12, gridColumns: 3 },
  },

  divider: {
    label: 'Divider',
    tag: 'hr',
    void: true,
    size: [360, 2],
    style: { background: '#dfe4ec', borderWidth: 0 },
  },

  spacer: {
    label: 'Spacer',
    tag: 'div',
    size: [200, 40],
    // No styles at all: a spacer that paints anything is not a spacer. In the
    // editor it shows as a dashed empty box; in the export it is invisible.
    style: {},
  },

  form: {
    label: 'Form',
    tag: 'form',
    container: true,
    layout: 'column',
    size: [420, 320],
    hugHeight: true,
    // The key is `endpoint`, not `action`: `data.action` is reserved across
    // every kind for the click behaviour in `engine/actions-runtime.js`, and a
    // form storing a URL there would be compiled as one.
    attrs: (node) => ({
      action: node.data?.endpoint || null,
      method: node.data?.method || 'post',
      target: node.data?.newTab === 'true' ? '_blank' : null,
    }),
    data: { method: 'post' },
    style: { background: 'transparent', gap: 10, padding: 0 },
  },

  // ============================================================== content ===

  heading: {
    label: 'Heading',
    tag: 'h2',
    text: true,
    size: [420, 52],
    hugHeight: true,
    content: 'Your headline goes here',
    style: { fontSize: 36, fontWeight: '700', color: '#0f1729' },
  },

  text: {
    label: 'Text',
    tag: 'p',
    text: true,
    size: [360, 72],
    hugHeight: true,
    content:
      'Double-click on the canvas to edit this paragraph. It wraps like normal flowing text.',
    style: { fontSize: 16, color: '#41506b', lineHeight: 1.6 },
  },

  list: {
    label: 'List',
    tag: (node) => (node.data?.ordered === 'true' ? 'ol' : 'ul'),
    size: [320, 120],
    hugHeight: true,
    data: {
      items: 'React, Redux Toolkit\nNode.js, Express\nMongoDB, Mongoose',
      ordered: 'false',
    },
    body: (node) => splitLines(node.data?.items).map((text) => ({ tag: 'li', text })),
    style: { fontSize: 16, color: '#41506b', lineHeight: 1.7 },
    custom: { 'padding-left': '22px' },
    descendantCss: '& li{margin:0 0 6px}',
  },

  table: {
    label: 'Table',
    tag: 'table',
    size: [560, 180],
    hugHeight: true,
    data: {
      columns: 'Project | Stack | Year',
      rows: 'Chatterbox | MERN + Socket.IO | 2024\nLedger | Next.js + Postgres | 2023',
    },
    body: (node) => {
      const columns = splitCells(node.data?.columns).filter((cell) => cell !== '');
      const rows = splitLines(node.data?.rows).map(splitCells);
      return [
        columns.length > 0
          ? {
              tag: 'thead',
              children: { tag: 'tr', children: columns.map((text) => ({ tag: 'th', text })) },
            }
          : null,
        {
          tag: 'tbody',
          children: rows.map((cells) => ({
            tag: 'tr',
            children: cells.map((text) => ({ tag: 'td', text })),
          })),
        },
      ];
    },
    style: { fontSize: 15, color: '#41506b' },
    custom: { 'border-collapse': 'collapse', 'table-layout': 'fixed' },
    descendantCss:
      '& th,& td{padding:10px 12px;border-bottom:1px solid #e4e8f0;text-align:left;vertical-align:top}' +
      '& th{font-weight:600;color:#0f1729}',
  },

  quote: {
    label: 'Quote',
    tag: 'blockquote',
    text: true,
    size: [420, 90],
    hugHeight: true,
    content: 'Ship the boring version first. You can always make it clever later.',
    style: { fontSize: 18, color: '#41506b', lineHeight: 1.6, fontStyle: 'italic' },
    custom: { 'border-left': '3px solid #dfe4ec', 'padding-left': '20px' },
  },

  code: {
    label: 'Code',
    tag: 'pre',
    text: true,
    size: [460, 140],
    hugHeight: true,
    content:
      "@Controller('projects')\n" +
      'export class ProjectsController {\n' +
      '  constructor(private readonly projects: ProjectsService) {}\n' +
      '\n' +
      '  @Get()\n' +
      '  findAll(@Query() query: ListProjectsDto) {\n' +
      '    return this.projects.findAll(query);\n' +
      '  }\n' +
      '}',
    data: { language: 'typescript' },
    // `body` rather than the ordinary text path, for two reasons: inside a
    // <pre> a real newline is the point (the text path would emit `<br>`), and
    // the highlighter needs to wrap tokens in spans. It returns a fragment
    // spec, so every run of source is still escaped by the compiler.
    body: (node) => highlight(node.content, node.data?.language),
    style: {
      background: '#0f1729',
      color: '#d7e0f5',
      radius: 10,
      padding: 18,
      fontSize: 13.5,
      lineHeight: 1.65,
      fontFamily: "'JetBrains Mono', 'Cascadia Mono', Consolas, ui-monospace, monospace",
    },
    custom: { 'white-space': 'pre', 'overflow-x': 'auto', 'tab-size': '2' },
    descendantCss: HIGHLIGHT_CSS,
  },

  image: {
    label: 'Image',
    tag: 'img',
    void: true,
    size: [280, 190],
    attributes: { src: PLACEHOLDER_IMAGE },
    // `content` doubles as the alt text for an image.
    attrs: (node) => ({
      src: node.src || PLACEHOLDER_IMAGE,
      alt: node.content,
      loading: 'lazy',
      decoding: 'async',
    }),
    style: { radius: 12 },
    custom: { 'object-fit': 'cover' },
  },

  video: {
    label: 'Video',
    tag: 'video',
    size: [480, 270],
    attrs: (node) => ({
      src: node.src,
      poster: node.data?.poster,
      controls: node.data?.controls === 'false' ? null : '',
      autoplay: node.data?.autoplay === 'true' ? '' : null,
      loop: node.data?.loop === 'true' ? '' : null,
      // Autoplay is blocked unless the video is muted, so tie them together
      // rather than leaving the user with a player that silently never starts.
      muted: node.data?.autoplay === 'true' ? '' : null,
      playsinline: '',
      preload: 'metadata',
    }),
    data: { controls: 'true', autoplay: 'false', loop: 'false' },
    style: { background: '#000000', radius: 10 },
    custom: { 'object-fit': 'cover' },
  },

  // ========================================================== interactive ===

  button: {
    label: 'Button',
    tag: 'button',
    text: true,
    size: [168, 46],
    content: 'Get started',
    // A button defaults to `type="button"`: inside a <form>, the browser's
    // default of `submit` would fire on every button on the page. The Submit
    // action is the one case where that is what was asked for, and it needs no
    // script — see `engine/actions-runtime.js`.
    attrs: (node) => ({
      type: node.data?.action === 'submit' ? 'submit' : 'button',
    }),
    style: {
      background: '#3f5bff',
      color: '#ffffff',
      radius: 10,
      fontSize: 15,
      fontWeight: '600',
      borderWidth: 0,
    },
  },

  link: {
    label: 'Link',
    tag: 'a',
    text: true,
    size: [140, 24],
    content: 'Learn more',
    attributes: { href: '#' },
    attrs: (node) => ({
      href: node.href || '#',
      target: node.data?.newTab === 'true' ? '_blank' : null,
      // Never hand a new tab an opener reference back to the page.
      rel: node.data?.newTab === 'true' ? 'noopener noreferrer' : null,
    }),
    style: { color: '#3f5bff', fontSize: 15 },
  },

  label: {
    label: 'Label',
    tag: 'label',
    text: true,
    size: [200, 22],
    hugHeight: true,
    content: 'Email address',
    style: { fontSize: 13, fontWeight: '600', color: '#41506b' },
    custom: { display: 'block' },
  },

  input: {
    label: 'Input',
    tag: 'input',
    void: true,
    size: [280, 44],
    attributes: { placeholder: 'Type here…' },
    attrs: (node) => ({
      type: node.data?.type || 'text',
      placeholder: node.placeholder,
      value: node.content || null,
      required: node.data?.required === 'true' ? '' : null,
    }),
    data: { type: 'text', required: 'false' },
    style: {
      background: '#ffffff',
      color: '#0f1729',
      radius: 10,
      padding: 12,
      borderWidth: 1,
      borderColor: '#cbd3e1',
      fontSize: 15,
    },
  },

  textarea: {
    label: 'Textarea',
    tag: 'textarea',
    text: true,
    size: [320, 120],
    content: '',
    attrs: (node) => ({
      placeholder: node.placeholder,
      rows: node.data?.rows || '4',
    }),
    attributes: { placeholder: 'Tell me about your project…' },
    data: { rows: '4' },
    // A <textarea>'s value is its raw text content — `<br>` would appear
    // literally in the field.
    body: (node) => node.content,
    style: {
      background: '#ffffff',
      color: '#0f1729',
      radius: 10,
      padding: 12,
      borderWidth: 1,
      borderColor: '#cbd3e1',
      fontSize: 15,
      lineHeight: 1.5,
    },
    custom: { resize: 'vertical' },
  },
});

/**
 * Friendly spellings accepted by `resolveKind`, so a template or a pasted
 * project can say `div` or `p` and still land on the right primitive.
 * @type {Readonly<Record<string, string>>}
 */
export const KIND_ALIASES = Object.freeze({
  div: 'container',
  box: 'container',
  flex: 'stack',
  h2: 'heading',
  title: 'heading',
  paragraph: 'text',
  p: 'text',
  a: 'link',
  img: 'image',
  field: 'input',
  hr: 'divider',
  rule: 'divider',
  ul: 'list',
  ol: 'list',
  bullets: 'list',
  blockquote: 'quote',
  pre: 'code',
  gap: 'spacer',
});

/** Every kind a user may place, in palette order. `root` is not one of them. */
export const PLACEABLE_KINDS = Object.freeze(
  Object.keys(ELEMENT_KINDS).filter((kind) => kind !== 'root')
);

/**
 * Normalises a kind name written by a human or a template.
 *
 * @param {string} raw
 * @returns {string | null} the canonical kind, or `null` if unknown
 */
export function resolveKind(raw) {
  const key = String(raw).trim().toLowerCase();
  if (Object.hasOwn(ELEMENT_KINDS, key)) {
    return key;
  }
  return KIND_ALIASES[key] ?? null;
}

/**
 * Looks up a kind's definition, falling back to `container` so a corrupted
 * project file renders as a plain box instead of throwing during compile.
 *
 * @param {string} kind
 * @returns {ElementKind}
 */
export function definitionOf(kind) {
  return ELEMENT_KINDS[kind] ?? ELEMENT_KINDS.container;
}

/**
 * The HTML tag for one node. Separate from `definitionOf(kind).tag` because a
 * kind may choose its tag from the node — a list is `<ul>` or `<ol>`.
 *
 * @param {any} node
 * @returns {string}
 */
export function tagOf(node) {
  const { tag } = definitionOf(node.kind);
  return typeof tag === 'function' ? tag(node) : tag;
}

/** @param {string} kind @returns {boolean} */
export function acceptsChildren(kind) {
  return definitionOf(kind).container === true;
}

/** @param {string} kind @returns {boolean} */
export function isVoid(kind) {
  return definitionOf(kind).void === true;
}

/** @param {string} kind @returns {boolean} */
export function hasText(kind) {
  return definitionOf(kind).text === true;
}

/** How a container arranges its children. */
export const LAYOUT_MODES = Object.freeze(['absolute', 'row', 'column', 'grid']);

/** Spellings accepted for a layout mode. */
const LAYOUT_ALIASES = Object.freeze({
  free: 'absolute',
  horizontal: 'row',
  vertical: 'column',
});

/**
 * @param {string} raw
 * @returns {string | null} a member of `LAYOUT_MODES`, or `null`
 */
export function resolveLayout(raw) {
  const key = String(raw).trim().toLowerCase();
  if (LAYOUT_MODES.includes(key)) {
    return key;
  }
  return LAYOUT_ALIASES[key] ?? null;
}

/**
 * Whether a layout mode positions its children itself, so their `x`/`y` are
 * ignored and must not be compiled into `left`/`top`.
 *
 * @param {string} layout
 * @returns {boolean}
 */
export function isFlowLayout(layout) {
  return layout === 'row' || layout === 'column' || layout === 'grid';
}
