/**
 * Element registry — the palette's single source of truth.
 *
 * Adding a new primitive to the editor takes two edits:
 *   1. add a row to `ELEMENT_KINDS` in `js/engine/kinds.js` — that defines how
 *      it behaves and how it compiles;
 *   2. append an entry here with a matching `kind` string and an icon name —
 *      that gives it a tile and a keyboard shortcut.
 *
 * Nothing else in the UI hard-codes an element type.
 *
 * The two files are checked against each other at load: a tile naming a kind
 * the engine does not have is a mistake worth hearing about immediately, not
 * one to discover when someone drags it onto the canvas.
 *
 * @module registry/elements
 */

import { ELEMENT_KINDS, PLACEABLE_KINDS, acceptsChildren } from '../engine/kinds.js';

/**
 * @typedef {object} Blueprint
 * @property {string} kind      a key of `ELEMENT_KINDS` in `engine/kinds.js`
 * @property {string} shortcut  single key that drops this element (must be unique)
 * @property {string} label     human name shown in the palette
 * @property {string} icon      key into {@link module:ui/icons.GLYPHS}
 * @property {string} hint      one-line tooltip
 * @property {boolean} container whether the engine allows nested children
 */

/**
 * @typedef {object} BlueprintGroup
 * @property {string} title
 * @property {Blueprint[]} items
 */

/** @type {ReadonlyArray<BlueprintGroup>} */
export const BLUEPRINT_GROUPS = Object.freeze([
  {
    title: 'Layout',
    items: [
      {
        kind: 'section',
        shortcut: 'S',
        label: 'Section',
        icon: 'section',
        hint: 'Full-width band for a page region',
        container: true,
      },
      {
        kind: 'container',
        shortcut: 'X',
        label: 'Box',
        icon: 'container',
        hint: 'Free-positioning card or panel',
        container: true,
      },
      {
        kind: 'stack',
        shortcut: 'K',
        label: 'Stack',
        icon: 'stack',
        hint: 'Flex column or row that flows its children',
        container: true,
      },
      {
        kind: 'grid',
        shortcut: 'G',
        label: 'Grid',
        icon: 'grid',
        hint: 'Equal-width columns',
        container: true,
      },
      {
        kind: 'divider',
        shortcut: 'D',
        label: 'Divider',
        icon: 'divider',
        hint: 'Horizontal rule',
        container: false,
      },
      {
        kind: 'spacer',
        shortcut: 'W',
        label: 'Spacer',
        icon: 'spacer',
        hint: 'Invisible gap inside a stack',
        container: false,
      },
    ],
  },
  {
    title: 'Content',
    items: [
      {
        kind: 'heading',
        shortcut: 'H',
        label: 'Heading',
        icon: 'heading',
        hint: 'Display title',
        container: false,
      },
      {
        kind: 'text',
        shortcut: 'T',
        label: 'Text',
        icon: 'text',
        hint: 'Paragraph copy',
        container: false,
      },
      {
        kind: 'list',
        shortcut: 'U',
        label: 'List',
        icon: 'list',
        hint: 'Bulleted or numbered list, one item per line',
        container: false,
      },
      {
        kind: 'table',
        shortcut: 'A',
        label: 'Table',
        icon: 'table',
        hint: 'Rows and columns, edited as text',
        container: false,
      },
      {
        kind: 'quote',
        shortcut: 'Q',
        label: 'Quote',
        icon: 'quote',
        hint: 'Pull quote with a rule down the side',
        container: false,
      },
      {
        kind: 'code',
        shortcut: 'C',
        label: 'Code',
        icon: 'code',
        hint: 'Preformatted code block',
        container: false,
      },
    ],
  },
  {
    title: 'Media',
    items: [
      {
        kind: 'image',
        shortcut: 'I',
        label: 'Image',
        icon: 'image',
        hint: 'Picture from a URL or data URI',
        container: false,
      },
      {
        kind: 'video',
        shortcut: 'V',
        label: 'Video',
        icon: 'video',
        hint: 'Self-hosted video with player controls',
        container: false,
      },
    ],
  },
  {
    title: 'Forms',
    items: [
      {
        kind: 'form',
        shortcut: 'M',
        label: 'Form',
        icon: 'form',
        hint: 'Container that submits its fields to a URL',
        container: true,
      },
      {
        kind: 'button',
        shortcut: 'B',
        label: 'Button',
        icon: 'button',
        hint: 'Call-to-action button',
        container: false,
      },
      {
        kind: 'link',
        shortcut: 'L',
        label: 'Link',
        icon: 'link',
        hint: 'Anchor to another page',
        container: false,
      },
      {
        kind: 'label',
        shortcut: 'F',
        label: 'Label',
        icon: 'label',
        hint: 'Caption above a form field',
        container: false,
      },
      {
        kind: 'input',
        shortcut: 'N',
        label: 'Input',
        icon: 'input',
        hint: 'Single-line field — text, email, password…',
        container: false,
      },
      {
        kind: 'textarea',
        shortcut: 'E',
        label: 'Textarea',
        icon: 'textarea',
        hint: 'Multi-line message field',
        container: false,
      },
    ],
  },
]);

/** Flat `kind -> Blueprint` lookup built once at module load. */
export const BLUEPRINTS = Object.freeze(
  BLUEPRINT_GROUPS.reduce((map, group) => {
    for (const item of group.items) {
      map[item.kind] = Object.freeze({ ...item });
    }
    return map;
  }, /** @type {Record<string, Blueprint>} */ ({}))
);

/** The root node never appears in the palette but still needs an icon. */
const ROOT_BLUEPRINT = Object.freeze({
  kind: 'root',
  shortcut: '',
  label: 'Page',
  icon: 'root',
  hint: 'The document body',
  container: true,
});

/**
 * `shortcut letter -> kind`, built once so the keyboard map and the palette
 * hints can never drift apart. A duplicate letter is a programming error and
 * is reported rather than silently shadowing the earlier entry.
 */
export const SHORTCUT_TO_KIND = Object.freeze(
  Object.values(BLUEPRINTS).reduce((map, item) => {
    const key = (item.shortcut || '').toLowerCase();
    if (!key) {
      return map;
    }
    if (map[key]) {
      console.error(
        `[devlove:elements] shortcut "${key}" is claimed by both ${map[key]} and ${item.kind}`
      );
      return map;
    }
    map[key] = item.kind;
    return map;
  }, /** @type {Record<string, string>} */ ({}))
);

// Two registries describing the same set of elements will drift apart unless
// something notices. This is the something, and it looks both ways: a tile
// with no engine kind cannot be dropped, and an engine kind with no tile can
// never be reached at all.
for (const item of Object.values(BLUEPRINTS)) {
  if (!Object.hasOwn(ELEMENT_KINDS, item.kind)) {
    console.error(`[devlove:elements] palette tile "${item.kind}" has no entry in ELEMENT_KINDS`);
  } else if (item.container !== acceptsChildren(item.kind)) {
    console.error(
      `[devlove:elements] "${item.kind}" is marked container: ${item.container} in the palette ` +
        `but ${acceptsChildren(item.kind)} in the engine`
    );
  }
}
for (const kind of PLACEABLE_KINDS) {
  if (!Object.hasOwn(BLUEPRINTS, kind)) {
    console.error(`[devlove:elements] "${kind}" has no palette tile, so nobody can add one`);
  }
}

/**
 * @param {string} kind
 * @returns {Blueprint}
 */
export function blueprintFor(kind) {
  if (kind === 'root') {
    return ROOT_BLUEPRINT;
  }
  return (
    BLUEPRINTS[kind] || {
      kind,
      label: kind,
      icon: 'container',
      hint: kind,
      container: false,
    }
  );
}
