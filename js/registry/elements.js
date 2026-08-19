/**
 * Element registry — the palette's single source of truth.
 *
 * Adding a new primitive to the editor takes two edits:
 *   1. add the variant (and its arms) to `NodeKind` in `src/node.rs`;
 *   2. append an entry here with a matching `kind` string and an icon name.
 *
 * Nothing else in the UI hard-codes an element type.
 *
 * @module registry/elements
 */

/**
 * @typedef {object} Blueprint
 * @property {string} kind      identifier understood by the Rust engine
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
    title: 'Structure',
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
        hint: 'Flex row or column that flows its children',
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
        kind: 'image',
        shortcut: 'I',
        label: 'Image',
        icon: 'image',
        hint: 'Picture from a URL or data URI',
        container: false,
      },
    ],
  },
  {
    title: 'Interactive',
    items: [
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
        kind: 'input',
        shortcut: 'N',
        label: 'Input',
        icon: 'input',
        hint: 'Single-line text field',
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
      console.error(`[elements] shortcut "${key}" is claimed by both ${map[key]} and ${item.kind}`);
      return map;
    }
    map[key] = item.kind;
    return map;
  }, /** @type {Record<string, string>} */ ({}))
);

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

