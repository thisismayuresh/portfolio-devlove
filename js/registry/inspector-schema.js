/**
 * Declarative schema for the property inspector.
 *
 * The inspector renders whatever this file describes — it contains no
 * knowledge of specific elements. Exposing a new engine property in the UI is
 * one object literal appended to the right section.
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
 *   key      dotted property path understood by `DesignerEngine.updateElement`
 *            (`"x"`, `"style.padding"`, `"custom.display"`, …)
 *   type     number | text | textarea | color | select | toggle | segmented | slider
 *   read     (node) => string  — pulls the current value out of the node JSON
 *   when     (node) => boolean — optional visibility predicate
 *   live     true when dragging the control should skip the undo stack
 *   span     1 = half width (default), 2 = full width
 *   unit     short suffix rendered inside the control
 *
 * @module registry/inspector-schema
 */

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
const read = (path, fallback = '') => (node) => asText(at(node, path), fallback);

/** Reader for colour inputs, which reject anything that is not `#rrggbb`. */
const readColor = (path, fallback) => (node) => {
  const raw = at(node, path);
  return typeof raw === 'string' && /^#[0-9a-f]{6}$/i.test(raw.trim()) ? raw.trim() : fallback;
};

const isText = (node) => ['heading', 'text', 'button', 'link'].includes(node.kind);
const isContainer = (node) => ['root', 'container', 'section', 'stack'].includes(node.kind);
const isBox = (node) => node.kind !== 'root';
const isFlow = (node) => node.layout === 'row' || node.layout === 'column';
const hasAttributes = (node) => ['link', 'image', 'input'].includes(node.kind);

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
      { key: 'width', label: 'W', type: 'number', step: 1, min: 4, unit: 'px', read: read('width', '0') },
      { key: 'height', label: 'H', type: 'number', step: 1, min: 4, unit: 'px', read: read('height', '0') },
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
        key: 'autoHeight',
        label: 'Hug content vertically',
        type: 'toggle',
        span: 2,
        read: (node) => (node.auto_height ? 'true' : 'false'),
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
        ],
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
        key: 'style.overflow',
        label: 'Overflow',
        type: 'select',
        read: read('style.overflow', ''),
        options: [
          { value: '', label: 'Default' },
          { value: 'hidden', label: 'Hidden' },
          { value: 'auto', label: 'Auto' },
          { value: 'visible', label: 'Visible' },
        ],
      },
    ],
  },
  {
    id: 'content',
    title: 'Content',
    icon: 'text',
    tab: 'visual',
    when: (node) => isText(node) || ['image', 'input'].includes(node.kind),
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
        placeholder: 'Describes the image',
        read: read('content'),
        when: (node) => node.kind === 'image',
      },
      {
        key: 'content',
        label: 'Default value',
        type: 'text',
        span: 2,
        read: read('content'),
        when: (node) => node.kind === 'input',
      },
    ],
  },
  {
    id: 'typography',
    title: 'Typography',
    icon: 'heading',
    tab: 'visual',
    when: (node) => isText(node) || ['input', 'root'].includes(node.kind),
    fields: [
      {
        key: 'style.fontSize',
        label: 'Size',
        type: 'number',
        min: 1,
        step: 1,
        unit: 'px',
        read: read('style.font_size', ''),
      },
      {
        key: 'style.lineHeight',
        label: 'Line',
        type: 'number',
        min: 0,
        step: 0.05,
        read: read('style.line_height', ''),
      },
      {
        key: 'style.fontWeight',
        label: 'Weight',
        type: 'select',
        read: read('style.font_weight', ''),
        options: [
          { value: '', label: 'Inherit' },
          { value: '300', label: 'Light' },
          { value: '400', label: 'Regular' },
          { value: '500', label: 'Medium' },
          { value: '600', label: 'Semibold' },
          { value: '700', label: 'Bold' },
          { value: '800', label: 'Extrabold' },
        ],
      },
      {
        key: 'style.letterSpacing',
        label: 'Track',
        type: 'number',
        step: 0.1,
        unit: 'px',
        read: read('style.letter_spacing', ''),
      },
      {
        key: 'style.textAlign',
        label: 'Align',
        type: 'segmented',
        span: 2,
        read: read('style.text_align', ''),
        options: [
          { value: 'left', label: 'Left' },
          { value: 'center', label: 'Center' },
          { value: 'right', label: 'Right' },
          { value: 'justify', label: 'Justify' },
        ],
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
        key: 'style.fontFamily',
        label: 'Font stack',
        type: 'text',
        span: 2,
        placeholder: 'Inherited from the page',
        read: read('style.font_family'),
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
        read: read('style.border_width', ''),
      },
      {
        key: 'style.borderColor',
        label: 'Stroke',
        type: 'color',
        span: 2,
        live: true,
        read: readColor('style.border_color', '#dfe4ec'),
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
        span: 2,
        read: read('style.padding', ''),
      },
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
        label: 'Box shadow',
        type: 'text',
        span: 2,
        placeholder: '0 10px 30px rgba(0,0,0,.18)',
        read: read('style.shadow'),
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
      { key: 'name', label: 'Name', type: 'text', span: 2, placeholder: 'Layer name', read: read('name') },
      {
        key: 'hidden',
        label: 'Hidden on the page',
        type: 'toggle',
        span: 2,
        read: (node) => (node.hidden ? 'true' : 'false'),
      },
      {
        key: 'locked',
        label: 'Locked against editing',
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
    when: hasAttributes,
    fields: [
      {
        key: 'href',
        label: 'Link URL',
        type: 'text',
        span: 2,
        placeholder: 'https://example.com',
        read: read('href'),
        when: (node) => node.kind === 'link',
      },
      {
        key: 'src',
        label: 'Image source',
        type: 'textarea',
        span: 2,
        placeholder: 'https://… or a data: URI',
        read: read('src'),
        when: (node) => node.kind === 'image',
      },
      {
        key: 'placeholder',
        label: 'Placeholder',
        type: 'text',
        span: 2,
        read: read('placeholder'),
        when: (node) => node.kind === 'input',
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
  { key: 'width', label: 'Width', type: 'number', min: 240, step: 10, unit: 'px', read: read('width') },
  {
    key: 'minHeight',
    label: 'Min height',
    type: 'number',
    min: 240,
    step: 10,
    unit: 'px',
    read: read('min_height'),
  },
  {
    key: 'background',
    label: 'Background',
    type: 'color',
    span: 2,
    live: true,
    read: readColor('background', '#ffffff'),
  },
  { key: 'fontFamily', label: 'Font stack', type: 'text', span: 2, read: read('font_family') },
]);

/**
 * Filters the schema down to the sections and fields that apply to a node
 * within one tab.
 *
 * @param {any} node parsed node JSON from `DesignerEngine.getElement`
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
