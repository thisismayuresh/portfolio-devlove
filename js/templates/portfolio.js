/**
 * A MERN developer portfolio.
 *
 * The default document, and the one a first-time visitor lands on. It shows
 * every element the palette offers at least once — a table of projects, a
 * highlighted code block, a list of skills, a real contact form — so clicking
 * through it doubles as a tour of what the tool can do.
 *
 * Names and addresses are placeholders on `example.com`, which is reserved for
 * exactly this.
 *
 * @module templates/portfolio
 */

import { LIGHT, band, cardGrid, el, footer, heading, navbar } from './parts.js';

const T = LIGHT;
const GUTTER = 160;
const COLUMN = 960;

/** @returns {{page: Record<string, any>, nodes: any[]}} */
export function build() {
  return {
    page: {
      title: 'Jordan Ellis — MERN developer',
      description:
        'Freelance MERN developer. React front ends on Node, Express and MongoDB, with a bias for boring, fast and maintainable.',
      width: 1280,
      minHeight: 2760,
      background: T.surface,
      fontFamily: "'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif",
    },

    nodes: [
      /* ============================================================== nav === */
      band('nav', { y: 0, height: 76, name: 'Nav' }),
      ...navbar({
        parent: 'nav',
        brand: 'jordan ellis',
        links: [
          { label: 'Work', target: 'work' },
          { label: 'About', target: 'about' },
        ],
        cta: { label: 'Get in touch', target: 'contact' },
        theme: { ...T, accent: T.ink },
      }),
      el(
        'divider',
        { name: 'Nav rule', width: 1280, height: 1, background: T.line },
        { parent: 'root', x: 0, y: 76 }
      ),

      /* ============================================================= hero === */
      band('hero', { y: 77, height: 520, name: 'Hero' }),
      // One column stack holds the whole left-hand side, so the buttons sit
      // under the copy however long the headline wraps. Nothing here needs a
      // hand-computed `y`.
      el(
        'stack',
        { name: 'Hero column', width: 540, layout: 'column', gap: 30, padding: 0 },
        { ref: 'hero-col', parent: 'hero', x: GUTTER, y: 92 }
      ),
      ...heading({
        ref: 'hero-head',
        parent: 'hero-col',
        eyebrow: 'MERN stack developer · Pune, IN',
        title: 'I build web apps that\nload fast and stay simple.',
        body: 'Four years shipping React front ends on Node and MongoDB. I care about the boring parts — pagination that works, indexes that exist, and deploys that are not exciting.',
        width: 540,
        size: 50,
        theme: T,
      }),
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
        { ref: 'hero-cta', parent: 'hero-col' }
      ),
      el(
        'button',
        {
          name: 'Primary CTA',
          content: 'See my work',
          width: 152,
          height: 48,
          background: T.ink,
          color: '#ffffff',
          radius: 8,
          fontSize: 15,
          transition: 160,
          'data.action': 'scroll',
          'data.target': 'work',
        },
        { parent: 'hero-cta' }
      ),
      el(
        'button',
        {
          name: 'Copy email',
          content: 'Copy my email',
          width: 158,
          height: 48,
          background: T.surface,
          color: T.ink,
          radius: 8,
          fontSize: 15,
          fontWeight: '500',
          borderWidth: 1,
          borderColor: T.line,
          transition: 160,
          'data.action': 'copy',
          'data.target': 'jordan@example.com',
        },
        { parent: 'hero-cta' }
      ),
      el(
        'code',
        {
          name: 'Hero snippet',
          width: 400,
          fontSize: 12,
          lineHeight: 1.7,
          radius: 12,
          padding: 20,
          'data.language': 'typescript',
          // Kept narrow on purpose: a code block in a hero is a texture, and
          // one line that overflows undoes the whole effect.
          content: [
            "@Controller('projects')",
            'export class ProjectsController {',
            '  constructor(private projects: ProjectsService) {}',
            '',
            '  @Get()',
            '  @UseGuards(ThrottlerGuard)',
            '  async findAll(@Query() q: ListDto) {',
            '    const page = await this.projects.find(q);',
            '    return { items: page.items, total: page.total };',
            '  }',
            '}',
          ].join('\n'),
        },
        { parent: 'hero', x: 720, y: 130 }
      ),

      /* ========================================================== toolbox === */
      band('toolbox', { y: 597, height: 400, background: T.wash, name: 'Toolbox' }),
      ...heading({
        ref: 'toolbox-head',
        parent: 'toolbox',
        x: GUTTER,
        y: 64,
        title: 'What I work with',
        width: 420,
        theme: T,
      }),
      ...cardGrid({
        parent: 'toolbox',
        ref: 'toolbox-grid',
        x: GUTTER,
        y: 130,
        width: COLUMN,
        columns: 4,
        items: [
          {
            title: 'MongoDB',
            body: 'Schema design, aggregation pipelines, and indexes that earn their keep.',
          },
          {
            title: 'Express',
            body: 'REST APIs, auth middleware, and error handling that says what went wrong.',
          },
          {
            title: 'React',
            body: 'Hooks, React Query, and a hard rule against premature state libraries.',
          },
          {
            title: 'Node.js',
            body: 'Background jobs, streaming uploads, and a healthy fear of blocking the loop.',
          },
        ],
        theme: T,
      }),

      /* ============================================================= work === */
      band('work', { y: 997, height: 580, anchor: 'work', name: 'Work' }),
      ...heading({
        ref: 'work-head',
        parent: 'work',
        x: GUTTER,
        y: 72,
        title: 'Selected work',
        body: 'Everything below is live, and every repository is public.',
        width: 520,
        theme: T,
      }),
      el(
        'table',
        {
          name: 'Projects table',
          width: COLUMN,
          fontSize: 15,
          color: T.muted,
          'data.columns': 'Project | What it does | Stack | Shipped',
          'data.rows': [
            'Chatterbox | Group chat with read receipts and typing state | React, Socket.IO, Mongo | 2024',
            'Ledger | Invoicing for freelancers, with recurring billing | Next.js, Postgres, Stripe | 2023',
            'Shelf | Reading tracker that imports from Goodreads | React Native, Express | 2023',
            'Pulse | Uptime monitor with a status page per project | Node, Redis, Fastify | 2022',
          ].join('\n'),
        },
        { parent: 'work', x: GUTTER, y: 176 }
      ),
      el(
        'quote',
        {
          name: 'Testimonial',
          width: 620,
          fontSize: 17,
          color: T.ink,
          content:
            'Jordan rewrote our search in a week and it went from four seconds to under two hundred milliseconds. No drama, no rewrite of everything else.',
        },
        { parent: 'work', x: GUTTER, y: 446 }
      ),

      /* ============================================================ about === */
      band('about', { y: 1577, height: 400, background: T.wash, anchor: 'about', name: 'About' }),
      ...heading({
        ref: 'about-head',
        parent: 'about',
        x: GUTTER,
        y: 68,
        title: 'A bit about me',
        body: 'I started out fixing a broken WordPress site for a family business and never quite stopped. These days I work mostly on internal tools, where the users are three people who will tell you exactly what is wrong.',
        width: 440,
        theme: T,
      }),
      el(
        'text',
        {
          name: 'List heading',
          width: 300,
          content: 'Also comfortable with',
          fontSize: 13,
          fontWeight: '700',
          color: T.ink,
          textTransform: 'uppercase',
          letterSpacing: 0.6,
        },
        { parent: 'about', x: 660, y: 124 }
      ),
      el(
        'list',
        {
          name: 'Skills list',
          width: 300,
          fontSize: 15.5,
          lineHeight: 1.9,
          color: T.muted,
          'data.items': [
            'TypeScript, and knowing when not to',
            'NestJS, Docker, a little Kubernetes',
            'Postgres when documents are the wrong shape',
            'Playwright, Vitest, and testing the risky parts',
            'GitHub Actions, Fly.io, Cloudflare',
          ].join('\n'),
        },
        { parent: 'about', x: 660, y: 156 }
      ),

      /* ========================================================== contact === */
      band('contact', { y: 1977, height: 640, anchor: 'contact', name: 'Contact' }),
      ...heading({
        ref: 'contact-head',
        parent: 'contact',
        x: GUTTER,
        y: 76,
        title: 'Got something to build?',
        body: 'Freelance and contract work, part-time from June. Tell me roughly what you need and I will tell you honestly whether I am the right person.',
        width: 440,
        theme: T,
      }),
      el(
        'link',
        {
          name: 'Email link',
          width: 300,
          content: 'jordan@example.com',
          href: 'mailto:jordan@example.com',
          fontSize: 17,
          color: T.ink,
          fontWeight: '600',
          textDecoration: 'underline',
        },
        { parent: 'contact', x: GUTTER, y: 252 }
      ),
      el(
        'form',
        {
          name: 'Contact form',
          width: 460,
          gap: 8,
          padding: 28,
          background: T.wash,
          radius: 14,
          borderWidth: 1,
          borderColor: T.line,
          // A form-to-email service; the user swaps in their own endpoint.
          'data.endpoint': 'https://formspree.io/f/your-id',
        },
        { ref: 'form', parent: 'contact', x: 660, y: 72 }
      ),
      el('label', { name: 'Name label', content: 'Your name' }, { parent: 'form' }),
      el(
        'input',
        {
          name: 'Name field',
          height: 44,
          placeholder: 'Ada Lovelace',
          borderColor: T.line,
          'data.required': 'true',
        },
        { parent: 'form' }
      ),
      el('spacer', { name: 'Gap', height: 8 }, { parent: 'form' }),
      el('label', { name: 'Email label', content: 'Email' }, { parent: 'form' }),
      el(
        'input',
        {
          name: 'Email field',
          height: 44,
          placeholder: 'ada@example.com',
          borderColor: T.line,
          'data.type': 'email',
          'data.required': 'true',
        },
        { parent: 'form' }
      ),
      el('spacer', { name: 'Gap', height: 8 }, { parent: 'form' }),
      el('label', { name: 'Brief label', content: 'The short version' }, { parent: 'form' }),
      el(
        'textarea',
        {
          name: 'Brief field',
          height: 132,
          placeholder: 'What are you building, and what is in the way?',
          borderColor: T.line,
          'data.rows': '5',
        },
        { parent: 'form' }
      ),
      el('spacer', { name: 'Gap', height: 12 }, { parent: 'form' }),
      el(
        'button',
        {
          name: 'Send button',
          content: 'Send it over',
          height: 48,
          background: T.ink,
          color: '#ffffff',
          radius: 8,
          fontSize: 15,
          transition: 160,
          'data.action': 'submit',
        },
        { parent: 'form' }
      ),

      /* =========================================================== footer === */
      ...footer({
        y: 2617,
        gutter: GUTTER,
        width: COLUMN,
        note: 'Built with devlove. Everything on this page is editable — start anywhere.',
        theme: { ...T, muted: T.faint },
      }),
    ],
  };
}
