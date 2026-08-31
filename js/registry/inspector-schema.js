/**
 * Declarative schema for the property inspector.
 *
 * The inspector renders whatever this file describes — it contains no
 * knowledge of specific elements. Exposing a new engine property in the UI is
 * one object literal appended to the right section.
 *
 * The predicates below come from `engine/kinds.js` rather than from lists of
 * kind names written out here. That matters: a hard-coded `['heading', 'text',
 * 'button']` is a third place to remember when an element is added, and it
 * will be the one that gets forgotten.
 *
 * Section contract
 * ----------------
 *   id       stable key used to remember the collapsed state
 *   title    row label
 *   icon     key into `ui/icons.js`
 *   tab      `"visual"` (styling) or `"advanced"` (markup and raw CSS)
 *   when     (node) => boolean — optional visibility predicate
 *
 * Field contract
 * --------------
 *   key      dotted property path understood by `Engine.updateElement`
 *            (`"x"`, `"style.padding"`, `"data.rows"`, `"custom.display"`, …).
 *            The same path reads the value back out of a node, which is why
 *            `read` and `key` always name the same thing.
 *   type     number | text | textarea | color | select | toggle | segmented | slider
 *   read     (node) => string  — pulls the current value out of the node
 *   when     (node) => boolean — optional visibility predicate
 *   live     true when dragging the control should skip the undo stack
 *   span     1 = half width (default), 2 = full width
 *   unit     short suffix rendered inside the control
 *
 * @module registry/inspector-schema
 */

import { ACTIONS } from '../engine/actions-runtime.js';
import { LANGUAGES } from '../engine/highlight.js';
import { acceptsChildren, hasText, isFlowLayout } from '../engine/kinds.js';

/** Reads a dotted path out of a plain object, tolerating missing links. */
function at(node, path) {
  return path.split('.').reduce((value, part) => {
    if (value === null || value === undefined) {
      return undefined;
    }
    return value[part];
  }, node);
}

/** Turns any engine value into the string an `<input>` expects. */
function asText(value, fallback = '') {
  if (value === null || value === undefined) {
    return fallback;
  }
  return String(value);
}

/** Standard reader for a dotted path. */
const read =
  (path, fallback = '') =>
  (node) =>
    asText(at(node, path), fallback);

/** Reader for colour inputs, which reject anything that is not `#rrggbb`. */
const readColor = (path, fallback) => (node) => {
  const raw = at(node, path);
  return typeof raw === 'string' && /^#[0-9a-f]{6}$/i.test(raw.trim()) ? raw.trim() : fallback;
};

/** Reader for a `data` flag stored as the string `"true"` / `"false"`. */
const readFlag =
  (path, fallback = false) =>
  (node) => {
    const raw = at(node, path);
    return (raw === undefined ? fallback : raw === true || raw === 'true') ? 'true' : 'false';
  };

/** Builds `<select>` options from plain values, with an "inherit" first entry. */
const options = (values, blank = 'Default') => [
  { value: '', label: blank },
  ...values.map((value) => (typeof value === 'string' ? { value, label: value } : value)),
];

const isText = (node) => hasText(node.kind);
const isContainer = (node) => acceptsChildren(node.kind);
const isBox = (node) => node.kind !== 'root';
const isFlow = (node) => isFlowLayout(node.layout);
const isFlex = (node) => node.layout === 'row' || node.layout === 'column';
const isKind =
  (...kinds) =>
  (node) =>
    kinds.includes(node.kind);
const hasBackgroundImage = (node) => Boolean(node.style && node.style.backgroundImage);

/** Display names for the highlighter's language ids. */
const LANGUAGE_LABELS = Object.freeze({
  javascript: 'JavaScript',
  typescript: 'TypeScript / NestJS',
  json: 'JSON',
  html: 'HTML',
  css: 'CSS',
  bash: 'Shell',
  python: 'Python',
});

/** What the Target field is for, per action. Empty means the action needs none. */
const ACTION_TARGETS = Object.fromEntries(ACTIONS.map((action) => [action.value, action.target]));

/**
 * @param {string | undefined} action
 * @returns {string} the placeholder for Target, or `''` when it does not apply
 */
function targetHintFor(action) {
  return ACTION_TARGETS[action || ''] || '';
}

/**
 * The four per-side overrides for a box property.
 *
 * Generated rather than written out: eight near-identical field literals is
 * eight chances to paste `Left` next to `padding-right`.
 *
 * @param {'padding' | 'margin'} property
 * @param {string} prefix short label stem, e.g. `'Pad'`
 * @returns {any[]}
 */
function sideFields(property, prefix) {
  return ['Top', 'Right', 'Bottom', 'Left'].map((side) => ({
    key: `style.${property}${side}`,
    label: `${prefix} ${side.slice(0, 1)}`,
    type: 'number',
    step: 1,
    unit: 'px',
    read: read(`style.${property}${side}`, ''),
  }));
}

/** The two inspector tabs, in order. */
export const INSPECTOR_TABS = Object.freeze([
  { id: 'visual', label: 'Visual' },
  { id: 'advanced', label: 'Advanced' },
]);

/** @type {ReadonlyArray<any>} */
export const INSPECTOR_SECTIONS = Object.freeze([
  {
    id: 'geometry',
    title: 'Size & position',
    icon: 'frame',
    tab: 'visual',
    when: isBox,
    fields: [
      {
        key: 'width',
        label: 'W',
        type: 'number',
        step: 1,
        min: 4,
        unit: 'px',
        read: read('width', '0'),
      },
      {
        key: 'height',
        label: 'H',
        type: 'number',
        step: 1,
        min: 4,
        unit: 'px',
        read: read('height', '0'),
      },
      {
        key: 'x',
        label: 'X',
        type: 'number',
        step: 1,
        unit: 'px',
        read: read('x', '0'),
        when: (node) => !isFlow(node),
      },
      {
        key: 'y',
        label: 'Y',
        type: 'number',
        step: 1,
        unit: 'px',
        read: read('y', '0'),
        when: (node) => !isFlow(node),
      },
      {
        key: 'style.minHeight',
        label: 'Min H',
        type: 'number',
        min: 0,
        step: 10,
        unit: 'px',
        read: read('style.minHeight', ''),
      },
      {
        key: 'style.maxWidth',
        label: 'Max W',
        type: 'number',
        min: 0,
        step: 10,
        unit: 'px',
        read: read('style.maxWidth', ''),
      },
      {
        key: 'style.aspectRatio',
        label: 'Ratio',
        type: 'select',
        span: 2,
        read: read('style.aspectRatio', ''),
        options: options([
          { value: '16 / 9', label: '16:9 — video' },
          { value: '4 / 3', label: '4:3' },
          { value: '3 / 2', label: '3:2 — photo' },
          { value: '1 / 1', label: '1:1 — square' },
          { value: '2 / 3', label: '2:3 — portrait' },
        ]),
      },
      {
        key: 'autoHeight',
        label: 'Hug height',
        type: 'toggle',
        span: 2,
        read: (node) => (node.autoHeight ? 'true' : 'false'),
      },
    ],
  },

  {
    id: 'layout',
    title: 'Child layout',
    icon: 'grid',
    tab: 'visual',
    when: isContainer,
    fields: [
      {
        key: 'layout',
        label: 'Mode',
        type: 'segmented',
        span: 2,
        read: read('layout', 'absolute'),
        options: [
          { value: 'absolute', label: 'Free' },
          { value: 'row', label: 'Row' },
          { value: 'column', label: 'Column' },
          { value: 'grid', label: 'Grid' },
        ],
      },
      {
        key: 'style.gridColumns',
        label: 'Columns',
        type: 'number',
        min: 1,
        max: 12,
        step: 1,
        read: read('style.gridColumns', '2'),
        when: (node) => node.layout === 'grid',
      },
      {
        key: 'style.gap',
        label: 'Gap',
        type: 'number',
        min: 0,
        step: 1,
        unit: 'px',
        read: read('style.gap', ''),
        when: isFlow,
      },
      {
        key: 'style.justifyContent',
        label: 'Justify',
        type: 'select',
        span: 2,
        read: read('style.justifyContent', ''),
        options: options([
          { value: 'flex-start', label: 'Start' },
          { value: 'center', label: 'Center' },
          { value: 'flex-end', label: 'End' },
          { value: 'space-between', label: 'Space between' },
          { value: 'space-around', label: 'Space around' },
        ]),
        when: isFlow,
      },
      {
        key: 'style.alignItems',
        label: 'Align',
        type: 'select',
        span: 2,
        read: read('style.alignItems', ''),
        options: options([
          { value: 'flex-start', label: 'Start' },
          { value: 'center', label: 'Center' },
          { value: 'flex-end', label: 'End' },
          { value: 'stretch', label: 'Stretch' },
          { value: 'baseline', label: 'Baseline' },
        ]),
        when: isFlow,
      },
      {
        key: 'style.flexWrap',
        label: 'Wrap',
        type: 'select',
        read: read('style.flexWrap', ''),
        options: options([
          { value: 'nowrap', label: 'No wrap' },
          { value: 'wrap', label: 'Wrap' },
        ]),
        when: isFlex,
      },
      {
        key: 'style.overflow',
        label: 'Overflow',
        type: 'select',
        read: read('style.overflow', ''),
        options: options(['hidden', 'auto', 'scroll', 'visible']),
      },
    ],
  },

  {
    id: 'content',
    title: 'Content',
    icon: 'text',
    tab: 'visual',
    when: (node) => isText(node) || isKind('image', 'list', 'table')(node),
    fields: [
      {
        key: 'content',
        label: 'Text',
        type: 'textarea',
        span: 2,
        placeholder: 'Type the copy shown on the page',
        read: read('content'),
        when: isText,
      },
      {
        key: 'content',
        label: 'Alt text',
        type: 'text',
        span: 2,
        placeholder: 'Describes the image, or blank if decorative',
        read: read('content'),
        when: isKind('image'),
      },
      {
        key: 'content',
        label: 'Value',
        type: 'text',
        span: 2,
        read: read('content'),
        when: isKind('input'),
      },

      // -- list
      {
        key: 'data.items',
        label: 'Items',
        type: 'textarea',
        span: 2,
        placeholder: 'One item per line',
        read: read('data.items'),
        when: isKind('list'),
      },
      {
        key: 'data.ordered',
        label: 'Numbered',
        type: 'toggle',
        span: 2,
        read: readFlag('data.ordered'),
        when: isKind('list'),
      },

      // -- table. Edited as text rather than as nested nodes; see the note in
      //    `engine/node.js` for why.
      {
        key: 'data.columns',
        label: 'Columns',
        type: 'text',
        span: 2,
        placeholder: 'Name | Role | Year',
        read: read('data.columns'),
        when: isKind('table'),
      },
      {
        key: 'data.rows',
        label: 'Rows',
        type: 'textarea',
        span: 2,
        placeholder: 'One row per line, cells separated by |',
        read: read('data.rows'),
        when: isKind('table'),
      },

      // -- code
      {
        key: 'data.language',
        label: 'Language',
        type: 'select',
        span: 2,
        read: read('data.language', 'plain'),
        options: LANGUAGES.map((value) => ({
          value,
          label: value === 'plain' ? 'No highlighting' : LANGUAGE_LABELS[value] || value,
        })),
        when: isKind('code'),
      },
    ],
  },

  {
    id: 'typography',
    title: 'Typography',
    icon: 'heading',
    tab: 'visual',
    when: (node) =>
      isText(node) || isKind('input', 'textarea', 'root', 'list', 'table', 'code')(node),
    fields: [
      {
        key: 'style.fontSize',
        label: 'Size',
        type: 'number',
        min: 1,
        step: 1,
        unit: 'px',
        read: read('style.fontSize', ''),
      },
      {
        key: 'style.lineHeight',
        label: 'Line',
        type: 'number',
        min: 0,
        step: 0.05,
        read: read('style.lineHeight', ''),
      },
      {
        key: 'style.fontWeight',
        label: 'Weight',
        type: 'select',
        read: read('style.fontWeight', ''),
        options: options(
          [
            { value: '300', label: 'Light' },
            { value: '400', label: 'Regular' },
            { value: '500', label: 'Medium' },
            { value: '600', label: 'Semibold' },
            { value: '700', label: 'Bold' },
            { value: '800', label: 'Extrabold' },
          ],
          'Inherit'
        ),
      },
      {
        key: 'style.letterSpacing',
        label: 'Track',
        type: 'number',
        step: 0.1,
        unit: 'px',
        read: read('style.letterSpacing', ''),
      },
      {
        key: 'style.textAlign',
        label: 'Align',
        type: 'segmented',
        span: 2,
        read: read('style.textAlign', ''),
        options: [
          { value: 'left', label: 'Left' },
          { value: 'center', label: 'Center' },
          { value: 'right', label: 'Right' },
          { value: 'justify', label: 'Justify' },
        ],
      },
      {
        key: 'style.fontStyle',
        label: 'Style',
        type: 'select',
        read: read('style.fontStyle', ''),
        options: options([
          { value: 'normal', label: 'Normal' },
          { value: 'italic', label: 'Italic' },
        ]),
      },
      {
        key: 'style.textDecoration',
        label: 'Decoration',
        type: 'select',
        read: read('style.textDecoration', ''),
        options: options([
          { value: 'none', label: 'None' },
          { value: 'underline', label: 'Underline' },
          { value: 'line-through', label: 'Strikethrough' },
        ]),
      },
      {
        key: 'style.textTransform',
        label: 'Case',
        type: 'select',
        span: 2,
        read: read('style.textTransform', ''),
        options: options([
          { value: 'none', label: 'As typed' },
          { value: 'uppercase', label: 'UPPERCASE' },
          { value: 'lowercase', label: 'lowercase' },
          { value: 'capitalize', label: 'Capitalise' },
        ]),
      },
      {
        key: 'style.color',
        label: 'Text colour',
        type: 'color',
        span: 2,
        live: true,
        read: readColor('style.color', '#0f1729'),
      },
      {
        key: 'style.listStyle',
        label: 'Marker',
        type: 'select',
        span: 2,
        read: read('style.listStyle', ''),
        options: options([
          { value: 'disc', label: 'Bullet' },
          { value: 'circle', label: 'Ring' },
          { value: 'square', label: 'Square' },
          { value: 'decimal', label: '1. 2. 3.' },
          { value: 'lower-alpha', label: 'a. b. c.' },
          { value: 'none', label: 'None' },
        ]),
        when: isKind('list'),
      },
      {
        key: 'style.fontFamily',
        label: 'Font stack',
        type: 'text',
        span: 2,
        placeholder: 'Inherited from the page',
        read: read('style.fontFamily'),
      },
    ],
  },

  {
    id: 'fill',
    title: 'Fill & border',
    icon: 'droplet',
    tab: 'visual',
    fields: [
      {
        key: 'style.background',
        label: 'Fill',
        type: 'color',
        span: 2,
        live: true,
        read: readColor('style.background', '#ffffff'),
      },
      {
        key: 'style.backgroundImage',
        label: 'Image',
        type: 'file',
        span: 2,
        accept: 'image/*',
        placeholder: 'https://…, or upload a file',
        read: read('style.backgroundImage'),
      },
      {
        key: 'style.backgroundSize',
        label: 'Image fit',
        type: 'select',
        read: read('style.backgroundSize', ''),
        options: options(['cover', 'contain', 'auto', '100% 100%']),
        when: hasBackgroundImage,
      },
      {
        key: 'style.backgroundPosition',
        label: 'Anchor',
        type: 'select',
        read: read('style.backgroundPosition', ''),
        options: options(['center', 'top', 'bottom', 'left', 'right', 'top left', 'top right']),
        when: hasBackgroundImage,
      },
      {
        key: 'style.backgroundRepeat',
        label: 'Repeat',
        type: 'select',
        span: 2,
        read: read('style.backgroundRepeat', ''),
        options: options([
          { value: 'no-repeat', label: 'Once' },
          { value: 'repeat', label: 'Tile' },
          { value: 'repeat-x', label: 'Tile across' },
          { value: 'repeat-y', label: 'Tile down' },
        ]),
        when: hasBackgroundImage,
      },
      {
        key: 'style.radius',
        label: 'Radius',
        type: 'number',
        min: 0,
        step: 1,
        unit: 'px',
        read: read('style.radius', ''),
      },
      {
        key: 'style.borderWidth',
        label: 'Border',
        type: 'number',
        min: 0,
        step: 1,
        unit: 'px',
        read: read('style.borderWidth', ''),
      },
      {
        key: 'style.borderStyle',
        label: 'Line',
        type: 'select',
        read: read('style.borderStyle', ''),
        options: options(['solid', 'dashed', 'dotted', 'double'], 'Solid'),
      },
      {
        key: 'style.borderColor',
        label: 'Stroke',
        type: 'color',
        span: 2,
        live: true,
        read: readColor('style.borderColor', '#dfe4ec'),
      },
    ],
  },

  {
    id: 'spacing',
    title: 'Spacing',
    icon: 'spacing',
    tab: 'visual',
    fields: [
      {
        key: 'style.padding',
        label: 'Padding',
        type: 'number',
        min: 0,
        step: 1,
        unit: 'px',
        read: read('style.padding', ''),
      },
      {
        key: 'style.margin',
        label: 'Margin',
        type: 'number',
        step: 1,
        unit: 'px',
        read: read('style.margin', ''),
      },
      // Per-side overrides, emitted after the shorthand so one edge can be
      // adjusted without giving up the shorthand for the other three.
      ...sideFields('padding', 'Pad'),
      ...sideFields('margin', 'Mgn'),
    ],
  },

  {
    id: 'effects',
    title: 'Effects',
    icon: 'sparkle',
    tab: 'visual',
    fields: [
      {
        key: 'style.opacity',
        label: 'Opacity',
        type: 'slider',
        span: 2,
        min: 0,
        max: 1,
        step: 0.01,
        live: true,
        read: read('style.opacity', '1'),
      },
      {
        key: 'style.shadow',
        label: 'Shadow',
        type: 'text',
        span: 2,
        placeholder: '0 10px 30px rgba(0,0,0,.18)',
        read: read('style.shadow'),
      },
      {
        key: 'style.textShadow',
        label: 'Text shadow',
        type: 'text',
        span: 2,
        placeholder: '0 1px 2px rgba(0,0,0,.4)',
        read: read('style.textShadow'),
        when: isText,
      },
      {
        key: 'style.filter',
        label: 'Filter',
        type: 'select',
        span: 2,
        read: read('style.filter', ''),
        options: options([
          { value: 'blur(4px)', label: 'Blur' },
          { value: 'grayscale(1)', label: 'Greyscale' },
          { value: 'sepia(0.6)', label: 'Sepia' },
          { value: 'saturate(1.4)', label: 'Saturate' },
          { value: 'contrast(1.2)', label: 'Contrast' },
          { value: 'brightness(1.15)', label: 'Brighten' },
        ]),
      },
      {
        key: 'style.backdropFilter',
        label: 'Backdrop',
        type: 'select',
        span: 2,
        read: read('style.backdropFilter', ''),
        options: options([
          { value: 'blur(10px)', label: 'Frosted glass' },
          { value: 'blur(20px) saturate(1.4)', label: 'Frosted, vivid' },
        ]),
        when: isBox,
      },
      {
        key: 'style.rotate',
        label: 'Rotate',
        type: 'number',
        step: 1,
        unit: '°',
        live: true,
        read: read('style.rotate', ''),
        when: isBox,
      },
      {
        key: 'style.scale',
        label: 'Scale',
        type: 'number',
        min: 0,
        step: 0.05,
        live: true,
        read: read('style.scale', ''),
        when: isBox,
      },
      {
        key: 'style.transition',
        label: 'Animate',
        type: 'number',
        min: 0,
        max: 2000,
        step: 25,
        unit: 'ms',
        read: read('style.transition', ''),
        when: isBox,
      },
      {
        key: 'style.cursor',
        label: 'Cursor',
        type: 'select',
        read: read('style.cursor', ''),
        options: options(['pointer', 'default', 'text', 'not-allowed', 'grab', 'zoom-in']),
        when: isBox,
      },
      {
        key: 'style.zIndex',
        label: 'Stack order',
        type: 'number',
        step: 1,
        read: read('style.zIndex', ''),
        when: isBox,
      },
    ],
  },

  {
    id: 'media',
    title: 'Media fit',
    icon: 'image',
    tab: 'visual',
    when: isKind('image', 'video'),
    fields: [
      {
        key: 'style.objectFit',
        label: 'Fit',
        type: 'select',
        span: 2,
        read: read('style.objectFit', ''),
        options: options([
          { value: 'cover', label: 'Fill the box, crop' },
          { value: 'contain', label: 'Fit inside, letterbox' },
          { value: 'fill', label: 'Stretch' },
          { value: 'none', label: 'Original size' },
          { value: 'scale-down', label: 'Shrink only' },
        ]),
      },
      {
        key: 'style.objectPosition',
        label: 'Anchor',
        type: 'select',
        span: 2,
        read: read('style.objectPosition', ''),
        options: options(['center', 'top', 'bottom', 'left', 'right']),
      },
    ],
  },

  {
    id: 'interaction',
    title: 'On click',
    icon: 'cursor',
    tab: 'visual',
    when: isBox,
    fields: [
      {
        key: 'data.action',
        label: 'Does',
        type: 'select',
        span: 2,
        read: read('data.action', ''),
        options: ACTIONS.map(({ value, label }) => ({ value, label })),
      },
      {
        key: 'data.target',
        label: 'Target',
        type: 'text',
        span: 2,
        placeholder: (node) => targetHintFor(node.data && node.data.action),
        read: read('data.target'),
        when: (node) => Boolean(targetHintFor(node.data && node.data.action)),
      },
    ],
  },

  /* ----------------------------------------------------------- advanced -- */
  {
    id: 'identity',
    title: 'Layer',
    icon: 'info',
    tab: 'advanced',
    fields: [
      {
        key: 'name',
        label: 'Name',
        type: 'text',
        span: 2,
        placeholder: 'Layer name',
        read: read('name'),
      },
      {
        key: 'anchor',
        label: 'Anchor',
        type: 'text',
        span: 2,
        placeholder: 'pricing — becomes id="pricing"',
        read: read('anchor'),
        when: isBox,
      },
      {
        key: 'hidden',
        label: 'Hidden',
        type: 'toggle',
        span: 2,
        read: (node) => (node.hidden ? 'true' : 'false'),
      },
      {
        key: 'locked',
        label: 'Locked',
        type: 'toggle',
        span: 2,
        read: (node) => (node.locked ? 'true' : 'false'),
      },
    ],
  },

  {
    id: 'attributes',
    title: 'HTML attributes',
    icon: 'html',
    tab: 'advanced',
    when: isKind('link', 'image', 'video', 'input', 'textarea', 'form'),
    fields: [
      // -- form
      {
        key: 'data.endpoint',
        label: 'Sends to',
        type: 'text',
        span: 2,
        placeholder: 'https://formspree.io/f/… or /api/contact',
        read: read('data.endpoint'),
        when: isKind('form'),
      },
      {
        key: 'data.method',
        label: 'Method',
        type: 'segmented',
        span: 2,
        read: read('data.method', 'post'),
        options: [
          { value: 'post', label: 'POST' },
          { value: 'get', label: 'GET' },
        ],
        when: isKind('form'),
      },

      // -- link
      {
        key: 'href',
        label: 'Link URL',
        type: 'text',
        span: 2,
        placeholder: 'https://example.com',
        read: read('href'),
        when: isKind('link'),
      },
      {
        key: 'data.newTab',
        label: 'Open in new tab',
        type: 'toggle',
        span: 2,
        read: readFlag('data.newTab'),
        when: isKind('link'),
      },

      // -- media
      {
        key: 'src',
        label: 'Source',
        type: 'file',
        span: 2,
        accept: (node) => (node.kind === 'video' ? 'video/*' : 'image/*'),
        placeholder: 'https://…, or upload a file',
        read: read('src'),
        when: isKind('image', 'video'),
      },
      {
        key: 'data.poster',
        label: 'Poster',
        type: 'text',
        span: 2,
        placeholder: 'Still shown before playback',
        read: read('data.poster'),
        when: isKind('video'),
      },
      {
        key: 'data.controls',
        label: 'Show controls',
        type: 'toggle',
        span: 2,
        read: readFlag('data.controls', true),
        when: isKind('video'),
      },
      {
        key: 'data.autoplay',
        label: 'Autoplay (muted)',
        type: 'toggle',
        span: 2,
        read: readFlag('data.autoplay'),
        when: isKind('video'),
      },
      {
        key: 'data.loop',
        label: 'Loop',
        type: 'toggle',
        span: 2,
        read: readFlag('data.loop'),
        when: isKind('video'),
      },

      // -- form fields
      {
        key: 'placeholder',
        label: 'Placeholder',
        type: 'text',
        span: 2,
        read: read('placeholder'),
        when: isKind('input', 'textarea'),
      },
      {
        key: 'data.type',
        label: 'Field type',
        type: 'select',
        span: 2,
        read: read('data.type', 'text'),
        options: [
          { value: 'text', label: 'Text' },
          { value: 'email', label: 'Email' },
          { value: 'password', label: 'Password' },
          { value: 'number', label: 'Number' },
          { value: 'tel', label: 'Phone' },
          { value: 'url', label: 'URL' },
          { value: 'search', label: 'Search' },
          { value: 'date', label: 'Date' },
        ],
        when: isKind('input'),
      },
      {
        key: 'data.rows',
        label: 'Visible rows',
        type: 'number',
        min: 1,
        max: 40,
        step: 1,
        span: 2,
        read: read('data.rows', '4'),
        when: isKind('textarea'),
      },
      {
        key: 'data.required',
        label: 'Required',
        type: 'toggle',
        span: 2,
        read: readFlag('data.required'),
        when: isKind('input'),
      },
    ],
  },
]);

/**
 * Page-level fields, shown when nothing is selected.
 * @type {ReadonlyArray<any>}
 */
export const PAGE_FIELDS = Object.freeze([
  { key: 'title', label: 'Title', type: 'text', span: 2, read: read('title') },
  {
    key: 'description',
    label: 'Description',
    type: 'textarea',
    span: 2,
    placeholder: 'One sentence, shown in search results and link previews',
    read: read('description'),
  },
  { key: 'lang', label: 'Language', type: 'text', span: 2, read: read('lang', 'en') },
  {
    key: 'width',
    label: 'Width',
    type: 'number',
    min: 240,
    step: 10,
    unit: 'px',
    read: read('width'),
  },
  {
    key: 'minHeight',
    label: 'Min height',
    type: 'number',
    min: 240,
    step: 10,
    unit: 'px',
    read: read('minHeight'),
  },
  {
    key: 'background',
    label: 'Background',
    type: 'color',
    span: 2,
    live: true,
    read: readColor('background', '#ffffff'),
  },
  { key: 'fontFamily', label: 'Font stack', type: 'text', span: 2, read: read('fontFamily') },
]);

/**
 * Filters the schema down to the sections and fields that apply to a node
 * within one tab.
 *
 * @param {any} node a node read through `Engine.getElement`
 * @param {string} tab
 * @returns {Array<{section: any, fields: any[]}>}
 */
export function sectionsFor(node, tab) {
  const out = [];
  for (const section of INSPECTOR_SECTIONS) {
    if (section.tab !== tab) {
      continue;
    }
    if (typeof section.when === 'function' && !section.when(node)) {
      continue;
    }
    const fields = section.fields.filter(
      (field) => typeof field.when !== 'function' || field.when(node)
    );
    if (fields.length > 0) {
      out.push({ section, fields });
    }
  }
  return out;
}
