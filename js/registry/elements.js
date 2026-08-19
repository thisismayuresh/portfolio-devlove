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
        label: 'Section',
        icon: 'section',
        hint: 'Full-width band for a page region',
        container: true,
      },
      {
        kind: 'container',
        label: 'Box',
        icon: 'container',
        hint: 'Free-positioning card or panel',
        container: true,
      },
      {
        kind: 'stack',
        label: 'Stack',
        icon: 'stack',
        hint: 'Flex row or column that flows its children',
        container: true,
      },
      {
        kind: 'divider',
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
        label: 'Heading',
        icon: 'heading',
        hint: 'Display title',
        container: false,
      },
      {
        kind: 'text',
        label: 'Text',
        icon: 'text',
        hint: 'Paragraph copy',
        container: false,
      },
      {
        kind: 'image',
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
        label: 'Button',
        icon: 'button',
        hint: 'Call-to-action button',
        container: false,
      },
      {
        kind: 'link',
        label: 'Link',
        icon: 'link',
        hint: 'Anchor to another page',
        container: false,
      },
      {
        kind: 'input',
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
  label: 'Page',
  icon: 'root',
  hint: 'The document body',
  container: true,
});

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

/** MIME-ish key used on `DataTransfer` when dragging a blueprint. */
export const DRAG_MIME = 'application/x-forge-blueprint';
