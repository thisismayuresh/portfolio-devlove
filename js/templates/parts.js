/**
 * Shared building blocks for the starter templates.
 *
 * A template is plain data — a page patch plus a flat list of nodes — which is
 * readable but repetitive: four feature cards are four copies of the same
 * twenty lines differing in two strings. These helpers take the repetition out
 * so a template file reads as a description of the page rather than as a wall
 * of property literals.
 *
 * Two conventions do most of the work:
 *
 *   1. **Bare style keys.** `props()` expands any key the style table knows
 *      into its `style.` path, so a template writes `fontSize: 30` instead of
 *      `'style.fontSize': 30`. Node properties (`width`, `content`, `anchor`)
 *      and `data.*` paths pass through untouched.
 *   2. **Anything whose height depends on text is a stack.** Sections sit at
 *      explicit `y` positions, because a page's bands are a layout decision.
 *      Everything inside them — a heading over its copy, a column of buttons,
 *      an article — is a flow container, because the height of a paragraph is
 *      not something a template author can know. Guessing it is how a template
 *      ends up with its call to action overlapping its headline.
 *
 * @module templates/parts
 */

import { STYLE_KEYS } from '../engine/style.js';

const STYLE_SET = new Set(STYLE_KEYS);

/**
 * Expands bare style keys into `style.*` paths.
 *
 * @param {Record<string, any>} input
 * @returns {Record<string, any>}
 */
export function props(input = {}) {
  /** @type {Record<string, any>} */
  const out = {};
  for (const [key, value] of Object.entries(input)) {
    out[STYLE_SET.has(key) ? `style.${key}` : key] = value;
  }
  return out;
}

/**
 * One template node.
 *
 * @param {string} kind
 * @param {Record<string, any>} [attrs] node properties and bare style keys
 * @param {{ref?: string, parent?: string, x?: number, y?: number}} [where]
 * @returns {any}
 */
export function el(kind, attrs = {}, where = {}) {
  return { kind, props: props(attrs), ...where };
}

/**
 * A full-bleed band at a given `y`, the unit every template is built from.
 *
 * Padding is zeroed: a section's children are positioned from the page's own
 * gutter, which keeps every section's content on the same left edge.
 *
 * @param {string} ref
 * @param {{y: number, height: number, width?: number, background?: string, anchor?: string, name?: string}} options
 * @returns {any}
 */
export function band(ref, { y, height, width = 1280, background = '#ffffff', anchor, name }) {
  return el(
    'section',
    { name: name || ref, width, height, background, padding: 0, anchor },
    { ref, parent: 'root', x: 0, y }
  );
}

/**
 * A horizontal navigation bar: a wordmark on the left, links on the right, and
 * an optional call to action.
 *
 * Links use the Scroll action rather than a bare `href`, so they glide to the
 * section instead of jumping — and so the anchors they point at are visibly
 * wired up when a new user clicks one in Preview.
 *
 * @param {object} options
 * @param {string} options.parent ref of the band to place it in
 * @param {string} options.brand
 * @param {Array<{label: string, target: string}>} options.links
 * @param {{label: string, target?: string}} [options.cta]
 * @param {{ink: string, muted: string, accent: string, accentInk?: string}} options.theme
 * @param {number} [options.gutter]
 * @param {number} [options.width]
 * @returns {any[]}
 */
export function navbar({ parent, brand, links, cta, theme, gutter = 160, width = 1280 }) {
  const railRef = `${parent}-links`;
  const railWidth = cta ? 520 : 420;

  return [
    el(
      'heading',
      {
        name: 'Wordmark',
        width: 300,
        content: brand,
        fontSize: 17,
        fontWeight: '700',
        color: theme.ink,
        letterSpacing: -0.2,
      },
      { parent, x: gutter, y: 27 }
    ),
    el(
      'stack',
      {
        name: 'Nav links',
        width: railWidth,
        layout: 'row',
        gap: 26,
        padding: 0,
        justifyContent: 'flex-end',
        alignItems: 'center',
      },
      { ref: railRef, parent, x: width - gutter - railWidth, y: 20 }
    ),
    ...links.map((link) =>
      el(
        'link',
        {
          name: `${link.label} link`,
          content: link.label,
          href: `#${link.target}`,
          width: Math.max(48, link.label.length * 9),
          fontSize: 15,
          color: theme.muted,
          cursor: 'pointer',
          'data.action': 'scroll',
          'data.target': link.target,
        },
        { parent: railRef }
      )
    ),
    ...(cta
      ? [
          el(
            'button',
            {
              name: 'Nav CTA',
              content: cta.label,
              width: 132,
              height: 38,
              background: theme.accent,
              color: theme.accentInk || '#ffffff',
              radius: 8,
              fontSize: 14.5,
              fontWeight: '600',
              borderWidth: 0,
              transition: 150,
              'data.action': cta.target ? 'scroll' : '',
              'data.target': cta.target || '',
            },
            { parent: railRef }
          ),
        ]
      : []),
  ];
}

/**
 * A titled block: an eyebrow, a heading and a line of supporting copy.
 *
 * Emitted as a **column stack**, not three absolutely-positioned siblings.
 * That is the whole point of the helper: a stack hugs its children, so the
 * copy sits under the title whether the title is one line or four. Working
 * out how tall a 50px headline wraps to is not something a template author
 * should have to do, and it is not something they can get right.
 *
 * @param {object} options
 * @param {string} options.ref unique alias for the stack
 * @param {string} [options.anchor] makes the block a scroll target
 * @param {string} options.parent
 * @param {number} options.x
 * @param {number} options.y
 * @param {string} [options.eyebrow]
 * @param {string} options.title
 * @param {string} [options.body]
 * @param {number} [options.width]
 * @param {number} [options.size] heading font size
 * @param {{ink: string, muted: string, accent: string}} options.theme
 * @param {boolean} [options.centred]
 * @returns {any[]}
 */
export function heading({
  ref,
  anchor,
  parent,
  x,
  y,
  eyebrow,
  title,
  body,
  width = 620,
  size = 34,
  theme,
  centred = false,
}) {
  const align = centred ? 'center' : 'left';

  return [
    el(
      'stack',
      {
        // The anchor sits on the block, not on the title: scrolling to a
        // section should land above its eyebrow, not halfway into it.
        name: 'Heading block',
        width,
        layout: 'column',
        gap: 14,
        padding: 0,
        anchor,
        alignItems: centred ? 'center' : 'stretch',
      },
      { ref, parent, x, y }
    ),

    eyebrow &&
      el(
        'text',
        {
          name: 'Eyebrow',
          width,
          content: eyebrow,
          fontSize: 13.5,
          fontWeight: '700',
          color: theme.accent,
          textTransform: 'uppercase',
          letterSpacing: 0.9,
          textAlign: align,
        },
        { parent: ref }
      ),

    el(
      'heading',
      {
        name: 'Section title',
        width,
        content: title,
        fontSize: size,
        fontWeight: '700',
        lineHeight: 1.18,
        letterSpacing: size > 40 ? -1.4 : -0.8,
        color: theme.ink,
        textAlign: align,
      },
      { parent: ref }
    ),

    body &&
      el(
        'text',
        {
          name: 'Section copy',
          width,
          content: body,
          fontSize: 17,
          lineHeight: 1.65,
          color: theme.muted,
          textAlign: align,
        },
        { parent: ref }
      ),
  ].filter(Boolean);
}

/**
 * A grid of bordered cards, each a title over a paragraph.
 *
 * @param {object} options
 * @param {string} options.parent
 * @param {string} options.ref
 * @param {number} options.x
 * @param {number} options.y
 * @param {number} [options.width]
 * @param {number} [options.columns]
 * @param {number} [options.height]
 * @param {Array<{title: string, body: string}>} options.items
 * @param {{ink: string, muted: string, line: string, surface: string}} options.theme
 * @returns {any[]}
 */
export function cardGrid({
  parent,
  ref,
  x,
  y,
  width = 960,
  columns = 3,
  height = 176,
  items,
  theme,
}) {
  const inner = Math.floor(width / columns) - 44;

  return [
    el(
      'grid',
      { name: 'Card grid', width, gridColumns: columns, gap: 20, padding: 0 },
      { ref, parent, x, y }
    ),
    ...items.flatMap((item, index) => {
      const cardRef = `${ref}-${index}`;
      return [
        el(
          'container',
          {
            // Not `autoHeight`: the children are absolutely positioned, so
            // they contribute nothing to an auto height and the card would
            // collapse to its own padding.
            name: item.title,
            height,
            background: theme.surface,
            radius: 12,
            padding: 22,
            borderWidth: 1,
            borderColor: theme.line,
            transition: 160,
          },
          { ref: cardRef, parent: ref }
        ),
        el(
          'heading',
          {
            name: `${item.title} title`,
            width: inner,
            content: item.title,
            fontSize: 17,
            fontWeight: '700',
            color: theme.ink,
          },
          { parent: cardRef, x: 0, y: 0 }
        ),
        el(
          'text',
          {
            name: `${item.title} copy`,
            width: inner,
            content: item.body,
            fontSize: 14.5,
            lineHeight: 1.6,
            color: theme.muted,
          },
          { parent: cardRef, x: 0, y: 32 }
        ),
      ];
    }),
  ];
}

/**
 * A footer rule with a line of small print and optional links.
 *
 * @param {object} options
 * @param {number} options.y
 * @param {string} options.note
 * @param {number} [options.gutter]
 * @param {number} [options.width]
 * @param {{muted: string, line: string}} options.theme
 * @returns {any[]}
 */
export function footer({ y, note, gutter = 160, width = 960, theme }) {
  return [
    el(
      'divider',
      { name: 'Footer rule', width, height: 1, background: theme.line },
      { parent: 'root', x: gutter, y }
    ),
    el(
      'text',
      { name: 'Footer note', width: 620, content: note, fontSize: 14, color: theme.muted },
      { parent: 'root', x: gutter, y: y + 28 }
    ),
  ];
}

/** A light theme used by most templates. */
export const LIGHT = Object.freeze({
  ink: '#0f1729',
  muted: '#55627a',
  faint: '#8a94a8',
  line: '#e4e8f0',
  surface: '#ffffff',
  wash: '#f6f8fb',
  accent: '#1f6feb',
  accentInk: '#ffffff',
});

/** A dark theme, for templates that want a night-mode landing page. */
export const DARK = Object.freeze({
  ink: '#f3f6fc',
  muted: '#98a3b8',
  faint: '#6a7488',
  line: '#232a38',
  surface: '#141a24',
  wash: '#0d121a',
  accent: '#5b8cff',
  accentInk: '#0b0f16',
});
