/**
 * A computer-science graduate's developer portfolio.
 *
 * The default document, and the one a first-time visitor lands on. Between
 * them the templates use every element in the palette except Video, so
 * clicking through this one is most of a tour of what the tool can do: two
 * reference tables, a highlighted code block, a list, a quote, an image, and a
 * contact form that really submits.
 *
 * Nothing here needs anything the editor cannot do. `tests/unit/templates.test.js`
 * checks that: every property these files set is one the inspector exposes, so
 * the page can be rebuilt, or taken apart, by hand.
 *
 * Skills are listed, not scored. A percentage next to "React — 87%" is a
 * number nobody can source and nobody believes, and it is the first thing a
 * reader discounts.
 *
 * Names and addresses are placeholders on `example.com`, which is reserved for
 * exactly this.
 *
 * @module templates/portfolio
 */

import { LIGHT, band, el, footer, heading, navbar } from './parts.js';

const T = LIGHT;
const GUTTER = 160;
const COLUMN = 960;

/**
 * The roles in the experience timeline, newest first.
 *
 * Kept as data rather than written out as nodes: the section below builds a row
 * per entry, so adding a job is one object and no layout arithmetic.
 */
const ROLES = [
  {
    dates: '2023 — now',
    title: 'Full-stack engineer',
    company: 'Northwind Labs',
    summary:
      'Billing and reporting for a B2B dashboard — React and NestJS over Postgres. Took the slowest report from four seconds to under two hundred milliseconds by removing an N+1 and adding the index it had been missing since launch.',
  },
  {
    dates: '2022 — 2023',
    title: 'Backend developer',
    company: 'Tidepool Systems',
    summary:
      'Moved an order pipeline off overnight cron jobs and onto Kafka, with idempotent consumers so a retry could never charge someone twice. Wrote the load tests that showed it held at ten times the traffic.',
  },
  {
    dates: '2021 — 2022',
    title: 'Frontend developer, contract',
    company: 'Two agencies',
    summary:
      'Design-system components in Storybook for three product teams, with Jest and Vitest coverage on the ones everyone else built on top of.',
  },
];

/** @returns {{page: Record<string, any>, nodes: any[]}} */
export function build() {
  return {
    page: {
      title: 'Mayur K — full-stack engineer',
      description:
        'Full-stack developer with a computer science background. React and Next.js on Node and NestJS, with the fundamentals underneath — data structures, databases, networks and system design.',
      width: 1280,
      minHeight: 4074,
      background: T.surface,
      fontFamily: "'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif",
    },

    nodes: [
      /* ============================================================== nav === */
      band('nav', { y: 0, height: 76, name: 'Nav' }),
      ...navbar({
        parent: 'nav',
        brand: 'Mayur K',
        links: [
          { label: 'Skills', target: 'skills' },
          { label: 'Work', target: 'work' },
          { label: 'Experience', target: 'experience' },
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
      band('hero', { y: 77, height: 686, name: 'Hero' }),
      // One column stack holds the whole left-hand side, so the buttons sit
      // under the copy however long the headline wraps. Nothing here needs a
      // hand-computed `y`.
      el(
        'stack',
        { name: 'Hero column', width: 540, layout: 'column', gap: 30, padding: 0 },
        { ref: 'hero-col', parent: 'hero', x: GUTTER, y: 92 }
      ),
      // Uses the built-in placeholder, so the template pulls in no asset and
      // makes no network request. Drop a real photo on it, or use Upload in
      // the inspector.
      el(
        'image',
        {
          name: 'Avatar',
          width: 68,
          height: 68,
          content: 'A photo of Mayur',
          radius: 34,
          objectFit: 'cover',
          borderWidth: 1,
          borderColor: T.line,
        },
        { parent: 'hero-col' }
      ),
      // A greeting, then the headline. Its own element rather than the heading
      // block's eyebrow: an eyebrow is small uppercase label text, and a
      // greeting should read like someone talking.
      el(
        'text',
        {
          name: 'Greeting',
          width: 540,
          content: "Hi, I'm Mayur!",
          // Ink, not the accent. A greeting is the first line someone reads,
          // and colouring it turns it into a label for the headline instead of
          // a sentence in its own right. Sized to lead into the headline
          // rather than compete with it.
          fontSize: 30,
          fontWeight: '600',
          lineHeight: 1.2,
          letterSpacing: -0.4,
          color: T.ink,
        },
        { parent: 'hero-col' }
      ),
      ...heading({
        ref: 'hero-head',
        parent: 'hero-col',
        title: 'I build web apps\nwith computer science at their core.',
        body: 'A computer science degree and three years shipping production React on Node, from Pune. I like the parts underneath as much as the parts you can see: how the data is modelled, why a query is slow, where a system gives way when it is asked for ten times as much.',
        width: 540,
        size: 46,
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
          'data.target': 'mayur@example.com',
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

      /* =========================================================== skills === */
      band('skills', {
        y: 763,
        height: 740,
        background: T.wash,
        anchor: 'skills',
        name: 'Skills',
      }),
      ...heading({
        ref: 'skills-head',
        parent: 'skills',
        x: GUTTER,
        y: 68,
        title: 'What I work with',
        body: 'Grouped by where it sits in the stack, not ranked out of ten — a bar chart of my own opinion of myself is not evidence of anything.',
        width: 620,
        theme: T,
      }),
      el(
        'table',
        {
          // Same shape as the projects table below: two columns, read as a
          // reference rather than as decoration.
          name: 'Skills table',
          width: COLUMN,
          fontSize: 15,
          lineHeight: 1.65,
          color: T.muted,
          // `auto` rather than the kind's default `fixed`: the left column
          // holds two words and the right one holds twelve, and an even split
          // would waste half the row.
          'custom.table-layout': 'auto',
          'data.columns': 'Area | Technologies',
          'data.rows': [
            'Frontend | React.js, Next.js, HTML5, CSS3, TailwindCSS, Mantine UI, Material UI, Storybook, Redux, React Query, Jest, Vitest',
            'Backend | Node.js, NestJS, Express.js, REST APIs, GraphQL, WebSockets, JWT authentication, Webhooks, Apache Kafka, RabbitMQ',
            'AI integration | LLM APIs (OpenAI, Anthropic), LangChain, RAG pipelines, Embeddings, Vector databases (Pinecone)',
            'Databases | MongoDB, PostgreSQL, MySQL, Redis',
            'Cloud & tools | AWS (S3, SES, EC2, RDS), Docker, Kubernetes, CI/CD, Git, GitHub, Stripe, Paystack, Postman',
            'Languages | JavaScript, TypeScript, Python',
            'Core computer science | Data structures & algorithms, OOP, DBMS, Operating systems, Computer networks, System design',
            'Practices | Agile/Scrum, Code reviews, Performance optimisation, API design',
          ].join('\n'),
        },
        { parent: 'skills', x: GUTTER, y: 216 }
      ),

      /* ============================================================= work === */
      band('work', { y: 1503, height: 580, anchor: 'work', name: 'Work' }),
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
            'Mayur rewrote our search in a week and it went from four seconds to under two hundred milliseconds. No drama, no rewrite of everything else.',
        },
        { parent: 'work', x: GUTTER, y: 446 }
      ),

      /* ======================================================= experience === */
      band('experience', {
        y: 2083,
        height: 676,
        background: T.wash,
        anchor: 'experience',
        name: 'Experience',
      }),
      ...heading({
        ref: 'exp-head',
        parent: 'experience',
        x: GUTTER,
        y: 68,
        title: 'Where I have worked',
        body: 'Three years, three teams, and a reasonable amount of on-call.',
        width: 560,
        theme: T,
      }),
      // A column stack holding one row per role, with a rule between them.
      // Nothing here has a hand-computed `y`: add or remove a role and the
      // rest of the timeline moves itself.
      el(
        'stack',
        { name: 'Timeline', width: COLUMN, layout: 'column', gap: 0, padding: 0 },
        { ref: 'timeline', parent: 'experience', x: GUTTER, y: 188 }
      ),
      ...ROLES.flatMap((role, index) => {
        const rowRef = `role-${index}`;
        return [
          // The rule goes above every row but the first, so the group reads as
          // one table rather than a set of boxed cards.
          ...(index === 0
            ? []
            : [
                el(
                  'divider',
                  { name: 'Role rule', width: COLUMN, height: 1, background: T.line },
                  { parent: 'timeline' }
                ),
              ]),
          el(
            'stack',
            {
              name: `${role.company} row`,
              width: COLUMN,
              layout: 'row',
              gap: 36,
              padding: 0,
              paddingTop: 22,
              paddingBottom: 22,
            },
            { ref: rowRef, parent: 'timeline' }
          ),
          el(
            'text',
            {
              name: 'Dates',
              width: 132,
              content: role.dates,
              fontSize: 14,
              lineHeight: 1.5,
              color: T.faint,
              // Tabular figures so the year columns line up down the page.
              'custom.font-variant-numeric': 'tabular-nums',
            },
            { parent: rowRef }
          ),
          el(
            'stack',
            { name: 'Role detail', width: 620, layout: 'column', gap: 6, padding: 0 },
            { ref: `${rowRef}-detail`, parent: rowRef }
          ),
          el(
            'text',
            {
              name: 'Role title',
              width: 620,
              content: `${role.title} · ${role.company}`,
              fontSize: 16.5,
              fontWeight: '600',
              lineHeight: 1.4,
              color: T.ink,
            },
            { parent: `${rowRef}-detail` }
          ),
          el(
            'text',
            {
              name: 'Role summary',
              width: 620,
              content: role.summary,
              fontSize: 15,
              lineHeight: 1.65,
              color: T.muted,
            },
            { parent: `${rowRef}-detail` }
          ),
        ];
      }),

      /* ============================================================ about === */
      band('about', { y: 2759, height: 560, anchor: 'about', name: 'About' }),
      ...heading({
        ref: 'about-head',
        parent: 'about',
        x: GUTTER,
        y: 68,
        title: 'A bit about me',
        body: 'I started out fixing a broken WordPress site for a family business and never quite stopped. A CS degree gave me the vocabulary for what I had been doing by feel — and the habit of reaching for a profiler before a rewrite.',
        width: 440,
        theme: T,
      }),
      el(
        'text',
        {
          name: 'List heading',
          width: 300,
          content: 'Fundamentals I lean on',
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
            'Algorithms — and knowing when the naive one is fine',
            'Databases — indexes, query plans, transactions',
            'Operating systems — processes, memory, why the container died',
            'Networks — TCP, HTTP/2, TLS, reading a waterfall',
            'System design — queues and caches, and how each fails',
          ].join('\n'),
        },
        { parent: 'about', x: 660, y: 156 }
      ),
      el(
        'text',
        {
          name: 'Education',
          width: 440,
          content: 'B.E. Computer Science, 2022. Still the best four years of reading I have done.',
          fontSize: 14.5,
          lineHeight: 1.7,
          color: T.faint,
        },
        { parent: 'about', x: GUTTER, y: 288 }
      ),

      /* ========================================================== contact === */
      el(
        'divider',
        { name: 'Contact rule', width: COLUMN, height: 1, background: T.line },
        { parent: 'root', x: GUTTER, y: 3319 }
      ),
      band('contact', { y: 3319, height: 612, anchor: 'contact', name: 'Contact' }),
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
      // Email and the profiles that back it up, stacked so the column grows
      // with however many you keep.
      el(
        'stack',
        { name: 'Contact details', width: 440, layout: 'column', gap: 14, padding: 0 },
        { ref: 'contact-details', parent: 'contact', x: GUTTER, y: 244 }
      ),
      el(
        'link',
        {
          name: 'Email link',
          width: 300,
          content: 'mayur@example.com',
          href: 'mailto:mayur@example.com',
          fontSize: 18,
          color: T.ink,
          fontWeight: '600',
          textDecoration: 'underline',
        },
        { parent: 'contact-details' }
      ),
      el(
        'stack',
        {
          name: 'Profiles',
          width: 440,
          layout: 'row',
          gap: 20,
          padding: 0,
          alignItems: 'center',
        },
        { ref: 'profiles', parent: 'contact-details' }
      ),
      ...[
        { label: 'LinkedIn', href: 'https://www.linkedin.com/in/your-handle' },
        { label: 'GitHub', href: 'https://github.com/your-handle' },
        { label: 'Read.cv', href: 'https://read.cv/your-handle' },
      ].map((profile) =>
        el(
          'link',
          {
            name: `${profile.label} link`,
            width: Math.max(72, profile.label.length * 10),
            content: `${profile.label} ↗`,
            href: profile.href,
            fontSize: 15.5,
            color: T.muted,
            fontWeight: '500',
            cursor: 'pointer',
            'data.newTab': 'true',
          },
          { parent: 'profiles' }
        )
      ),
      el(
        'text',
        {
          name: 'Availability',
          width: 420,
          content: 'Usually replies within a day. Based in Pune, working across IST and CET.',
          fontSize: 14.5,
          lineHeight: 1.6,
          color: T.faint,
        },
        { parent: 'contact-details' }
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
        y: 3931,
        gutter: GUTTER,
        width: COLUMN,
        note: 'Built 💖 with devlove. Everything on this page is editable — start anywhere.',
        theme: { ...T, muted: T.faint },
      }),
    ],
  };
}
