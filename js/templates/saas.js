/**
 * A SaaS product landing page.
 *
 * The shape almost every product site converges on: sticky-feeling nav with a
 * call to action, a headline and sub-headline, a feature grid, a pricing
 * comparison, an FAQ, and a closing prompt. Built dark, because a product page
 * is where a template earns its keep by looking finished on the first load.
 *
 * @module templates/saas
 */

import { DARK, band, cardGrid, el, footer, heading, navbar } from './parts.js';

const T = DARK;
const GUTTER = 160;
const COLUMN = 960;

/** @returns {{page: Record<string, any>, nodes: any[]}} */
export function build() {
  return {
    page: {
      title: 'Cadence — release notes that write themselves',
      description:
        'Cadence turns merged pull requests into a changelog your customers actually read. Connect a repository and ship your first release note in ten minutes.',
      width: 1280,
      minHeight: 2940,
      background: T.wash,
      fontFamily: "'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif",
    },

    nodes: [
      /* ============================================================== nav === */
      band('nav', { y: 0, height: 76, background: T.wash, name: 'Nav' }),
      ...navbar({
        parent: 'nav',
        brand: 'cadence',
        links: [
          { label: 'Features', target: 'features' },
          { label: 'Pricing', target: 'pricing' },
          { label: 'FAQ', target: 'faq' },
        ],
        cta: { label: 'Start free', target: 'signup' },
        theme: T,
      }),

      /* ============================================================= hero === */
      band('hero', { y: 76, height: 600, background: T.wash, name: 'Hero' }),
      // The one piece of ornament on the page: a soft wash of the accent
      // bleeding down from behind the headline. It is a background image, not
      // an element, so it never gets in the way of anything you drag.
      el(
        'section',
        {
          name: 'Hero glow',
          width: 1280,
          height: 600,
          background: 'transparent',
          padding: 0,
          backgroundImage:
            'radial-gradient(58% 70% at 22% -10%, rgba(62,207,142,0.16), transparent 68%)',
        },
        { parent: 'hero', x: 0, y: 0 }
      ),
      // One column stack for the whole left-hand side, so the buttons and the
      // trust line follow the copy however long the headline wraps.
      el(
        'stack',
        { name: 'Hero column', width: 540, layout: 'column', gap: 28, padding: 0 },
        { ref: 'hero-col', parent: 'hero', x: GUTTER, y: 96 }
      ),
      ...heading({
        ref: 'hero-head',
        parent: 'hero-col',
        eyebrow: 'v2 — now with Slack delivery',
        title: 'Release notes that\nwrite themselves.',
        body: 'Cadence reads your merged pull requests and drafts a changelog in your own voice. You review, edit the two lines that matter, and publish.',
        width: 540,
        size: 46,
        theme: T,
      }),
      el(
        'stack',
        {
          name: 'Hero actions',
          width: 440,
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
          content: 'Start free',
          width: 148,
          height: 50,
          background: T.accent,
          color: T.accentInk,
          radius: 9,
          fontSize: 15.5,
          fontWeight: '600',
          borderWidth: 0,
          transition: 160,
          'data.action': 'scroll',
          'data.target': 'signup',
        },
        { parent: 'hero-cta' }
      ),
      el(
        'button',
        {
          name: 'Secondary CTA',
          content: 'See a live changelog',
          width: 208,
          height: 50,
          background: 'transparent',
          color: T.ink,
          radius: 9,
          fontSize: 15.5,
          fontWeight: '500',
          borderWidth: 1,
          borderColor: T.line,
          transition: 160,
          'data.action': 'openNew',
          'data.target': 'https://example.com/changelog',
        },
        { parent: 'hero-cta' }
      ),
      el(
        'text',
        {
          name: 'Trust line',
          width: 520,
          content: 'No card required · 14-day trial · Cancel from the dashboard',
          fontSize: 14,
          color: T.faint,
        },
        { parent: 'hero-col' }
      ),
      el(
        'divider',
        { name: 'Logo rule', width: 420, height: 1, background: T.line },
        { parent: 'hero-col' }
      ),
      el(
        'text',
        {
          name: 'Logo strip label',
          width: 420,
          content: 'Shipping changelogs at',
          fontSize: 12,
          fontWeight: '600',
          color: T.faint,
          textTransform: 'uppercase',
          letterSpacing: 0.9,
        },
        { parent: 'hero-col' }
      ),
      // A row of separate wordmarks rather than one string of them. Text, not
      // images, because a template that ships five logo files is a template
      // nobody can edit — and one element each means you can drop a real logo
      // in place of any of them without touching the others.
      el(
        'stack',
        {
          name: 'Logo strip',
          width: 540,
          layout: 'row',
          gap: 26,
          padding: 0,
          alignItems: 'center',
          flexWrap: 'wrap',
        },
        { ref: 'logos', parent: 'hero-col' }
      ),
      ...['Northwind', 'Basecamp', 'Hyperping', 'Loops'].map((brand) =>
        el(
          'text',
          {
            name: brand,
            width: Math.max(70, brand.length * 9),
            content: brand,
            fontSize: 15,
            fontWeight: '600',
            color: T.muted,
          },
          { parent: 'logos' }
        )
      ),
      el(
        'code',
        {
          name: 'Config sample',
          width: 400,
          fontSize: 12.5,
          radius: 14,
          padding: 22,
          background: T.surface,
          borderWidth: 1,
          borderColor: T.line,
          'data.language': 'json',
          content: [
            '{',
            '  "repository": "acme/storefront",',
            '  "branch": "main",',
            '  "voice": "plain",',
            '  "group": ["feature", "fix", "chore"],',
            '  "publish": {',
            '    "to": "https://acme.com/changelog",',
            '    "on": "release"',
            '  }',
            '}',
          ].join('\n'),
        },
        { parent: 'hero', x: 720, y: 132 }
      ),

      /* ========================================================= features === */
      band('features', {
        y: 676,
        height: 460,
        background: T.surface,
        anchor: 'features',
        name: 'Features',
      }),
      ...heading({
        ref: 'features-head',
        parent: 'features',
        x: GUTTER,
        y: 72,
        title: 'Everything the release takes',
        body: 'Four things, done properly, instead of forty half-finished ones.',
        width: COLUMN,
        theme: T,
        centred: true,
      }),
      ...cardGrid({
        parent: 'features',
        ref: 'feature-grid',
        x: GUTTER,
        y: 200,
        width: COLUMN,
        columns: 4,
        height: 188,
        items: [
          {
            title: 'Reads your PRs',
            body: 'Titles, labels and descriptions become grouped, readable entries — not a list of commit hashes.',
          },
          {
            title: 'Your voice',
            body: 'Three tone presets, or paste two of your old release notes and it matches them.',
          },
          {
            title: 'Publishes anywhere',
            body: 'A hosted page, your own site over webhook, or straight into Slack and email.',
          },
          {
            title: 'Nothing stored',
            body: 'Diffs are processed and discarded. We keep the changelog, never the code.',
          },
        ],
        theme: T,
      }),

      /* ========================================================== pricing === */
      band('pricing', {
        y: 1136,
        height: 620,
        background: T.wash,
        anchor: 'pricing',
        name: 'Pricing',
      }),
      ...heading({
        ref: 'pricing-head',
        parent: 'pricing',
        x: GUTTER,
        y: 76,
        title: 'Pricing',
        body: 'Per repository, per month. Annual billing takes two months off.',
        width: COLUMN,
        theme: T,
        centred: true,
      }),
      el(
        'table',
        {
          name: 'Plan comparison',
          width: COLUMN,
          fontSize: 15,
          color: T.muted,
          'data.columns': 'Plan | Repositories | History | Publishing | Price',
          'data.rows': [
            'Solo | 1 | 90 days | Hosted page | Free',
            'Team | 10 | 2 years | Page, webhook, Slack | $19 / mo',
            'Company | Unlimited | Unlimited | Everything, plus SSO | $79 / mo',
          ].join('\n'),
        },
        { parent: 'pricing', x: GUTTER, y: 212 }
      ),
      el(
        'text',
        {
          name: 'Pricing note',
          width: COLUMN,
          content:
            'Open-source repositories are free on every plan, including private forks of them.',
          fontSize: 14.5,
          color: T.faint,
          textAlign: 'center',
        },
        { parent: 'pricing', x: GUTTER, y: 400 }
      ),
      el(
        'button',
        {
          name: 'Pricing CTA',
          content: 'Start with Solo',
          width: 180,
          height: 50,
          background: T.accent,
          color: T.accentInk,
          radius: 9,
          fontSize: 15.5,
          fontWeight: '600',
          borderWidth: 0,
          transition: 160,
          'data.action': 'scroll',
          'data.target': 'signup',
        },
        { parent: 'pricing', x: 550, y: 450 }
      ),

      /* ============================================================== faq === */
      band('faq', { y: 1756, height: 520, background: T.surface, anchor: 'faq', name: 'FAQ' }),
      ...heading({
        ref: 'faq-head',
        parent: 'faq',
        x: GUTTER,
        y: 72,
        title: 'Questions people actually ask',
        width: 520,
        theme: T,
      }),
      el(
        'list',
        {
          name: 'FAQ list',
          width: COLUMN,
          fontSize: 16,
          lineHeight: 2,
          color: T.muted,
          listStyle: 'none',
          paddingLeft: 0,
          'data.items': [
            'Does it need write access? — No. Read-only on pull requests is enough.',
            'What about private repositories? — Supported on every paid plan.',
            'Can I edit before publishing? — Every draft waits for you. Nothing auto-publishes unless you turn that on.',
            'Do you train on our code? — No. Diffs are processed in memory and dropped.',
            'Can I export and leave? — Markdown and JSON, any time, no support ticket.',
          ].join('\n'),
        },
        { parent: 'faq', x: GUTTER, y: 168 }
      ),

      /* =========================================================== signup === */
      band('signup', {
        y: 2276,
        height: 460,
        background: T.wash,
        anchor: 'signup',
        name: 'Sign up',
      }),
      ...heading({
        ref: 'signup-head',
        parent: 'signup',
        x: GUTTER,
        y: 84,
        title: 'Ship your first release note today',
        body: 'Connect a repository, pick a voice, and review the draft. About ten minutes.',
        width: COLUMN,
        theme: T,
        centred: true,
      }),
      el(
        'form',
        {
          name: 'Signup form',
          width: 480,
          layout: 'row',
          gap: 10,
          padding: 0,
          alignItems: 'center',
          'data.endpoint': 'https://formspree.io/f/your-id',
        },
        { ref: 'signup-form', parent: 'signup', x: 400, y: 250 }
      ),
      el(
        'input',
        {
          name: 'Email field',
          width: 300,
          height: 50,
          placeholder: 'you@company.com',
          background: T.surface,
          color: T.ink,
          borderColor: T.line,
          radius: 9,
          'data.type': 'email',
          'data.required': 'true',
        },
        { parent: 'signup-form' }
      ),
      el(
        'button',
        {
          name: 'Signup button',
          content: 'Start free',
          width: 140,
          height: 50,
          background: T.accent,
          color: T.accentInk,
          radius: 9,
          fontSize: 15.5,
          fontWeight: '600',
          borderWidth: 0,
          transition: 160,
          'data.action': 'submit',
        },
        { parent: 'signup-form' }
      ),

      /* =========================================================== footer === */
      ...footer({
        y: 2776,
        gutter: GUTTER,
        width: COLUMN,
        note: '© Cadence. Built with devlove — replace this copy and ship it.',
        theme: { ...T, muted: T.faint },
      }),
    ],
  };
}
