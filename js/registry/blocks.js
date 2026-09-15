/**
 * Block registry — whole pieces of interface, not single elements.
 *
 * A primitive is one node: a button, a heading, an input. Everything you
 * actually want on a page is a dozen of them arranged just so, and arranging
 * them is the boring half of building a site. A **block** is that arrangement,
 * pre-built: drop "Navbar" and you get a row with a wordmark, four links and a
 * call to action, already spaced and already sized.
 *
 * The blocks are ordinary nodes once dropped. Nothing is locked, nothing is a
 * special "component" the editor treats differently — a block is a starting
 * point you take apart, not a widget you configure. That is the whole design:
 * the editor has no concept of a block after the drop, so no other feature
 * ever has to grow a special case for one.
 *
 * ### Adding a block
 *
 * Append an entry to a group below with a `build()` that returns nodes in the
 * same format the templates use — see {@link module:templates/parts}. The
 * **first node is the block's root**: it takes the drop position, it is what
 * ends up selected, and every other node names its parent by `ref`.
 *
 * `tests/unit/blocks.test.js` replays every block through the real engine, so
 * a typo in a style key fails there rather than in someone's browser.
 *
 * @module registry/blocks
 */

import { el, LIGHT } from '../templates/parts.js';

/**
 * Blocks are drawn in near-black and grey rather than in an accent colour.
 *
 * A block lands on a page whose palette we know nothing about, and a saturated
 * blue button dropped onto someone else's design is one more thing to undo
 * before they can start. Neutral is the choice that is never wrong, and
 * recolouring one element is easier than recolouring nine.
 */
const T = Object.freeze({ ...LIGHT, accent: LIGHT.ink, accentInk: '#ffffff' });

/**
 * @typedef {object} Block
 * @property {string} block  unique id, used as the drag payload
 * @property {string} label  name shown on the tile
 * @property {string} icon   key into {@link module:ui/icons.GLYPHS}
 * @property {string} hint   one-line tooltip
 * @property {() => any[]} build returns the block's nodes, root first
 */

/**
 * @typedef {object} BlockGroup
 * @property {string} title
 * @property {Block[]} items
 */

/**
 * A row of navigation links, as children of `parent`.
 *
 * @param {string} parent ref of the row to fill
 * @param {string[]} labels
 * @returns {any[]}
 */
function navLinks(parent, labels) {
  return labels.map((label) =>
    el(
      'link',
      {
        name: `${label} link`,
        content: label,
        href: `#${label.toLowerCase().replace(/\s+/g, '-')}`,
        width: Math.max(48, label.length * 9),
        fontSize: 15,
        color: T.muted,
        cursor: 'pointer',
      },
      { parent }
    )
  );
}

/**
 * A labelled field: caption, control, then the gap before the next one.
 *
 * @param {string} parent ref of the form to add to
 * @param {{label: string, placeholder: string, type?: string, rows?: number}} field
 * @returns {any[]}
 */
function formField(parent, field) {
  const control = field.rows
    ? el(
        'textarea',
        {
          name: `${field.label} field`,
          height: 112,
          placeholder: field.placeholder,
          borderColor: T.line,
          'data.rows': String(field.rows),
        },
        { parent }
      )
    : el(
        'input',
        {
          name: `${field.label} field`,
          height: 44,
          placeholder: field.placeholder,
          borderColor: T.line,
          'data.type': field.type || 'text',
          'data.required': 'true',
        },
        { parent }
      );

  return [
    el('label', { name: `${field.label} label`, content: field.label }, { parent }),
    control,
    el('spacer', { name: 'Gap', height: 8 }, { parent }),
  ];
}

/**
 * The primary button every block uses, so they all look like one family.
 *
 * @param {string} parent
 * @param {{name: string, content: string, width?: number}} options
 * @returns {any}
 */
function primaryButton(parent, { name, content, width = 148 }) {
  return el(
    'button',
    {
      name,
      content,
      width,
      height: 46,
      background: T.ink,
      color: T.accentInk,
      radius: 8,
      fontSize: 15,
      fontWeight: '600',
      borderWidth: 0,
      transition: 150,
    },
    { parent }
  );
}

/** @type {ReadonlyArray<BlockGroup>} */
export const BLOCK_GROUPS = Object.freeze([
  {
    title: 'Navigation',
    items: [
      {
        block: 'navbar',
        label: 'Navbar',
        icon: 'navbar',
        hint: 'Wordmark, links and a call to action in one row',
        build: () => [
          el(
            'stack',
            {
              name: 'Navbar',
              width: 1080,
              layout: 'row',
              gap: 28,
              padding: 18,
              paddingLeft: 28,
              paddingRight: 28,
              alignItems: 'center',
              justifyContent: 'space-between',
              background: T.surface,
              borderWidth: 1,
              borderColor: T.line,
            },
            { ref: 'navbar' }
          ),
          el(
            'heading',
            {
              name: 'Wordmark',
              width: 160,
              content: 'Your name',
              fontSize: 17,
              fontWeight: '700',
              color: T.ink,
              letterSpacing: -0.2,
            },
            { parent: 'navbar' }
          ),
          el(
            'stack',
            {
              name: 'Nav links',
              width: 420,
              layout: 'row',
              gap: 26,
              padding: 0,
              alignItems: 'center',
              justifyContent: 'flex-end',
            },
            { ref: 'links', parent: 'navbar' }
          ),
          ...navLinks('links', ['Work', 'About', 'Writing', 'Contact']),
          primaryButton('navbar', { name: 'Nav CTA', content: 'Get in touch', width: 138 }),
        ],
      },
      {
        block: 'sidebar',
        label: 'Sidebar',
        icon: 'sidebar',
        hint: 'Vertical nav column with a heading and links',
        build: () => [
          el(
            'stack',
            {
              name: 'Sidebar',
              width: 248,
              layout: 'column',
              gap: 4,
              padding: 20,
              background: T.wash,
              borderWidth: 1,
              borderColor: T.line,
            },
            { ref: 'sidebar' }
          ),
          el(
            'text',
            {
              name: 'Sidebar title',
              width: 208,
              content: 'Documentation',
              fontSize: 12,
              fontWeight: '700',
              color: T.faint,
              textTransform: 'uppercase',
              letterSpacing: 0.7,
            },
            { parent: 'sidebar' }
          ),
          el('spacer', { name: 'Gap', height: 10 }, { parent: 'sidebar' }),
          ...['Getting started', 'Installation', 'Configuration', 'API reference'].map((label) =>
            el(
              'link',
              {
                name: `${label} link`,
                width: 208,
                content: label,
                href: `#${label.toLowerCase().replace(/\s+/g, '-')}`,
                fontSize: 15,
                lineHeight: 2.1,
                color: T.muted,
                cursor: 'pointer',
              },
              { parent: 'sidebar' }
            )
          ),
          el(
            'divider',
            { name: 'Sidebar rule', width: 208, height: 1, background: T.line },
            { parent: 'sidebar' }
          ),
          el('spacer', { name: 'Gap', height: 10 }, { parent: 'sidebar' }),
          el(
            'text',
            {
              name: 'Sidebar note',
              width: 208,
              content: 'Need help? Open an issue.',
              fontSize: 13,
              lineHeight: 1.6,
              color: T.faint,
            },
            { parent: 'sidebar' }
          ),
        ],
      },
      {
        block: 'footer',
        label: 'Footer',
        icon: 'footerBlock',
        hint: 'Closing rule, copyright and a row of links',
        build: () => [
          el(
            'stack',
            {
              name: 'Footer',
              width: 1080,
              layout: 'column',
              gap: 18,
              padding: 28,
              background: T.surface,
            },
            { ref: 'footer' }
          ),
          el(
            'divider',
            { name: 'Footer rule', width: 1024, height: 1, background: T.line },
            { parent: 'footer' }
          ),
          el(
            'stack',
            {
              name: 'Footer row',
              width: 1024,
              layout: 'row',
              gap: 24,
              padding: 0,
              alignItems: 'center',
              justifyContent: 'space-between',
            },
            { ref: 'footer-row', parent: 'footer' }
          ),
          el(
            'text',
            {
              name: 'Copyright',
              width: 420,
              content: '© 2026 Your name. All rights reserved.',
              fontSize: 14,
              color: T.faint,
            },
            { parent: 'footer-row' }
          ),
          el(
            'stack',
            {
              name: 'Footer links',
              width: 360,
              layout: 'row',
              gap: 22,
              padding: 0,
              alignItems: 'center',
              justifyContent: 'flex-end',
            },
            { ref: 'footer-links', parent: 'footer-row' }
          ),
          ...navLinks('footer-links', ['Privacy', 'Terms', 'GitHub']),
        ],
      },
    ],
  },
  {
    title: 'Blocks',
    items: [
      {
        block: 'hero',
        label: 'Hero',
        icon: 'hero',
        hint: 'Headline, supporting copy and two buttons',
        build: () => [
          el(
            'stack',
            {
              name: 'Hero',
              width: 620,
              layout: 'column',
              gap: 22,
              padding: 0,
            },
            { ref: 'hero' }
          ),
          el(
            'heading',
            {
              name: 'Hero title',
              width: 620,
              content: 'A headline that says what this is.',
              fontSize: 46,
              fontWeight: '700',
              lineHeight: 1.12,
              letterSpacing: -1,
              color: T.ink,
            },
            { parent: 'hero' }
          ),
          el(
            'text',
            {
              name: 'Hero copy',
              width: 520,
              content:
                'One or two sentences on who this is for and what it does. Specific beats clever.',
              fontSize: 17.5,
              lineHeight: 1.65,
              color: T.muted,
            },
            { parent: 'hero' }
          ),
          el(
            'stack',
            {
              name: 'Hero actions',
              width: 400,
              layout: 'row',
              gap: 12,
              padding: 0,
              alignItems: 'center',
            },
            { ref: 'hero-actions', parent: 'hero' }
          ),
          primaryButton('hero-actions', { name: 'Primary CTA', content: 'Get started' }),
          el(
            'button',
            {
              name: 'Secondary CTA',
              content: 'Read the docs',
              width: 150,
              height: 46,
              background: T.surface,
              color: T.ink,
              radius: 8,
              fontSize: 15,
              fontWeight: '500',
              borderWidth: 1,
              borderColor: T.line,
              transition: 150,
            },
            { parent: 'hero-actions' }
          ),
        ],
      },
      {
        block: 'features',
        label: 'Features',
        icon: 'grid',
        hint: 'Three-column grid of titled cards',
        build: () => {
          const cards = [
            ['Fast', 'No build step and no bundler, so what you write is what runs.'],
            ['Readable', 'Plain modules you can open, follow and change in one sitting.'],
            ['Yours', 'Export one self-contained file. Nothing phones home.'],
          ];
          return [
            el(
              'grid',
              {
                name: 'Feature grid',
                width: 1020,
                gridColumns: 3,
                gap: 20,
                padding: 0,
              },
              { ref: 'features' }
            ),
            ...cards.flatMap(([title, body], index) => {
              const ref = `feature-${index}`;
              return [
                el(
                  'stack',
                  {
                    name: `Feature ${index + 1}`,
                    width: 320,
                    layout: 'column',
                    gap: 10,
                    padding: 24,
                    background: T.surface,
                    borderWidth: 1,
                    borderColor: T.line,
                    radius: 12,
                  },
                  { ref, parent: 'features' }
                ),
                el(
                  'text',
                  {
                    name: 'Feature title',
                    width: 268,
                    content: title,
                    fontSize: 17,
                    fontWeight: '600',
                    color: T.ink,
                  },
                  { parent: ref }
                ),
                el(
                  'text',
                  {
                    name: 'Feature copy',
                    width: 268,
                    content: body,
                    fontSize: 14.5,
                    lineHeight: 1.65,
                    color: T.muted,
                  },
                  { parent: ref }
                ),
              ];
            }),
          ];
        },
      },
      {
        block: 'card',
        label: 'Card',
        icon: 'card',
        hint: 'Image, title, copy and a link',
        build: () => [
          el(
            'stack',
            {
              name: 'Card',
              width: 340,
              layout: 'column',
              gap: 12,
              padding: 20,
              background: T.surface,
              borderWidth: 1,
              borderColor: T.line,
              radius: 12,
            },
            { ref: 'card' }
          ),
          el(
            'image',
            {
              name: 'Card image',
              width: 300,
              height: 168,
              content: 'Card image',
              radius: 8,
              objectFit: 'cover',
            },
            { parent: 'card' }
          ),
          el(
            'text',
            {
              name: 'Card title',
              width: 300,
              content: 'Project name',
              fontSize: 17,
              fontWeight: '600',
              color: T.ink,
            },
            { parent: 'card' }
          ),
          el(
            'text',
            {
              name: 'Card copy',
              width: 300,
              content: 'One line on what it is and why it was worth building.',
              fontSize: 14.5,
              lineHeight: 1.65,
              color: T.muted,
            },
            { parent: 'card' }
          ),
          el(
            'link',
            {
              name: 'Card link',
              width: 140,
              content: 'Read more →',
              href: '#',
              fontSize: 14.5,
              fontWeight: '600',
              color: T.ink,
              cursor: 'pointer',
            },
            { parent: 'card' }
          ),
        ],
      },
      {
        block: 'contact-form',
        label: 'Contact form',
        icon: 'form',
        hint: 'Name, email and message, with a submit button',
        build: () => [
          el(
            'form',
            {
              name: 'Contact form',
              width: 460,
              gap: 8,
              padding: 28,
              background: T.surface,
              borderWidth: 1,
              borderColor: T.line,
              radius: 14,
              // Swap in your own form-to-email endpoint.
              'data.endpoint': 'https://formspree.io/f/your-id',
            },
            { ref: 'contact-form' }
          ),
          el(
            'heading',
            {
              name: 'Form title',
              width: 400,
              content: 'Get in touch',
              fontSize: 22,
              fontWeight: '700',
              color: T.ink,
            },
            { parent: 'contact-form' }
          ),
          el('spacer', { name: 'Gap', height: 14 }, { parent: 'contact-form' }),
          ...formField('contact-form', { label: 'Your name', placeholder: 'Ada Lovelace' }),
          ...formField('contact-form', {
            label: 'Email',
            placeholder: 'ada@example.com',
            type: 'email',
          }),
          ...formField('contact-form', {
            label: 'Message',
            placeholder: 'What are you building?',
            rows: 5,
          }),
          el('spacer', { name: 'Gap', height: 6 }, { parent: 'contact-form' }),
          el(
            'button',
            {
              name: 'Send button',
              content: 'Send message',
              width: 404,
              height: 46,
              background: T.ink,
              color: T.accentInk,
              radius: 8,
              fontSize: 15,
              fontWeight: '600',
              borderWidth: 0,
              transition: 150,
              'data.action': 'submit',
            },
            { parent: 'contact-form' }
          ),
        ],
      },
      {
        block: 'login-form',
        label: 'Sign in',
        icon: 'lock',
        hint: 'Email and password with a submit button',
        build: () => [
          el(
            'form',
            {
              name: 'Sign-in form',
              width: 380,
              gap: 8,
              padding: 28,
              background: T.surface,
              borderWidth: 1,
              borderColor: T.line,
              radius: 14,
              'data.endpoint': '/api/session',
            },
            { ref: 'login-form' }
          ),
          el(
            'heading',
            {
              name: 'Sign-in title',
              width: 324,
              content: 'Sign in',
              fontSize: 22,
              fontWeight: '700',
              color: T.ink,
            },
            { parent: 'login-form' }
          ),
          el('spacer', { name: 'Gap', height: 14 }, { parent: 'login-form' }),
          ...formField('login-form', {
            label: 'Email',
            placeholder: 'you@example.com',
            type: 'email',
          }),
          ...formField('login-form', {
            label: 'Password',
            placeholder: 'Your password',
            type: 'password',
          }),
          el(
            'button',
            {
              name: 'Sign-in button',
              content: 'Sign in',
              width: 324,
              height: 46,
              background: T.ink,
              color: T.accentInk,
              radius: 8,
              fontSize: 15,
              fontWeight: '600',
              borderWidth: 0,
              transition: 150,
              'data.action': 'submit',
            },
            { parent: 'login-form' }
          ),
          el('spacer', { name: 'Gap', height: 10 }, { parent: 'login-form' }),
          el(
            'link',
            {
              name: 'Forgot link',
              width: 324,
              content: 'Forgot your password?',
              href: '#',
              fontSize: 14,
              color: T.muted,
              textAlign: 'center',
              cursor: 'pointer',
            },
            { parent: 'login-form' }
          ),
        ],
      },
      {
        block: 'pricing',
        label: 'Pricing',
        icon: 'pricing',
        hint: 'A plan card: price, what is included, and a button',
        build: () => [
          el(
            'stack',
            {
              name: 'Pricing card',
              width: 340,
              layout: 'column',
              gap: 14,
              padding: 28,
              background: T.surface,
              borderWidth: 1,
              borderColor: T.line,
              radius: 14,
            },
            { ref: 'pricing' }
          ),
          el(
            'text',
            {
              name: 'Plan name',
              width: 284,
              content: 'Pro',
              fontSize: 13,
              fontWeight: '700',
              color: T.faint,
              textTransform: 'uppercase',
              letterSpacing: 0.7,
            },
            { parent: 'pricing' }
          ),
          el(
            'heading',
            {
              name: 'Price',
              width: 284,
              content: '$29 / month',
              fontSize: 34,
              fontWeight: '700',
              letterSpacing: -0.8,
              color: T.ink,
            },
            { parent: 'pricing' }
          ),
          el(
            'list',
            {
              name: 'Plan features',
              width: 284,
              fontSize: 15,
              lineHeight: 2,
              color: T.muted,
              'data.items': [
                'Unlimited projects',
                'Custom domains',
                'Priority support',
                'Everything in Free',
              ].join('\n'),
            },
            { parent: 'pricing' }
          ),
          primaryButton('pricing', { name: 'Plan CTA', content: 'Choose Pro', width: 284 }),
        ],
      },
      {
        block: 'stats',
        label: 'Stats',
        icon: 'stats',
        hint: 'A row of numbers with captions under them',
        build: () => {
          const figures = [
            ['12k', 'Monthly readers'],
            ['99.9%', 'Uptime last year'],
            ['180ms', 'Median response'],
          ];
          return [
            el(
              'stack',
              {
                name: 'Stats row',
                width: 780,
                layout: 'row',
                gap: 56,
                padding: 0,
                alignItems: 'flex-start',
              },
              { ref: 'stats' }
            ),
            ...figures.flatMap(([figure, caption], index) => {
              const ref = `stat-${index}`;
              return [
                el(
                  'stack',
                  { name: `Stat ${index + 1}`, width: 220, layout: 'column', gap: 6, padding: 0 },
                  { ref, parent: 'stats' }
                ),
                el(
                  'heading',
                  {
                    name: 'Figure',
                    width: 220,
                    content: figure,
                    fontSize: 38,
                    fontWeight: '700',
                    letterSpacing: -1,
                    color: T.ink,
                  },
                  { parent: ref }
                ),
                el(
                  'text',
                  {
                    name: 'Caption',
                    width: 220,
                    content: caption,
                    fontSize: 14.5,
                    color: T.muted,
                  },
                  { parent: ref }
                ),
              ];
            }),
          ];
        },
      },
      {
        block: 'cta',
        label: 'CTA banner',
        icon: 'rocket',
        hint: 'A closing prompt with one button',
        build: () => [
          el(
            'stack',
            {
              name: 'CTA banner',
              width: 900,
              layout: 'row',
              gap: 32,
              padding: 36,
              alignItems: 'center',
              justifyContent: 'space-between',
              background: T.ink,
              radius: 14,
            },
            { ref: 'cta' }
          ),
          el(
            'stack',
            { name: 'CTA copy', width: 560, layout: 'column', gap: 8, padding: 0 },
            { ref: 'cta-copy', parent: 'cta' }
          ),
          el(
            'heading',
            {
              name: 'CTA title',
              width: 520,
              content: 'Ready to start?',
              fontSize: 26,
              fontWeight: '700',
              letterSpacing: -0.5,
              color: '#ffffff',
            },
            { parent: 'cta-copy' }
          ),
          el(
            'text',
            {
              name: 'CTA copy line',
              width: 520,
              content: 'No account needed. Clone it and open the page.',
              fontSize: 15.5,
              lineHeight: 1.6,
              color: '#c9cfda',
            },
            { parent: 'cta-copy' }
          ),
          el(
            'button',
            {
              name: 'CTA button',
              content: 'Get started',
              width: 160,
              height: 48,
              background: '#ffffff',
              color: T.ink,
              radius: 8,
              fontSize: 15,
              fontWeight: '600',
              borderWidth: 0,
              transition: 150,
            },
            { parent: 'cta' }
          ),
        ],
      },
      {
        block: 'testimonial',
        label: 'Testimonial',
        icon: 'quote',
        hint: 'A quote with an attribution line',
        build: () => [
          el(
            'stack',
            {
              name: 'Testimonial',
              width: 620,
              layout: 'column',
              gap: 18,
              padding: 0,
            },
            { ref: 'testimonial' }
          ),
          el(
            'quote',
            {
              name: 'Quote',
              width: 620,
              content:
                'It replaced a workflow that took three tools and an afternoon. Now it is one file and ten minutes.',
              fontSize: 19,
              lineHeight: 1.6,
              color: T.ink,
            },
            { parent: 'testimonial' }
          ),
          el(
            'stack',
            {
              name: 'Attribution',
              width: 420,
              layout: 'row',
              gap: 12,
              padding: 0,
              alignItems: 'center',
            },
            { ref: 'attribution', parent: 'testimonial' }
          ),
          el(
            'image',
            {
              name: 'Avatar',
              width: 40,
              height: 40,
              content: 'Portrait',
              radius: 20,
              objectFit: 'cover',
            },
            { parent: 'attribution' }
          ),
          el(
            'text',
            {
              name: 'Attribution line',
              width: 320,
              content: 'Priya R — engineering lead',
              fontSize: 14.5,
              color: T.muted,
            },
            { parent: 'attribution' }
          ),
        ],
      },
    ],
  },
]);

/** Flat `id -> Block` lookup, built once at module load. */
export const BLOCKS = Object.freeze(
  BLOCK_GROUPS.reduce((map, group) => {
    for (const item of group.items) {
      if (map[item.block]) {
        console.error(`[devlove:blocks] two blocks share the id "${item.block}"`);
      }
      map[item.block] = Object.freeze({ ...item });
    }
    return map;
  }, /** @type {Record<string, Block>} */ ({}))
);

/**
 * @param {string} id
 * @returns {Block | null}
 */
export function blockById(id) {
  return BLOCKS[id] || null;
}
