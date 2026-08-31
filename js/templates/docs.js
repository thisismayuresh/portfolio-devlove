/**
 * A documentation page.
 *
 * A narrow sidebar of section links beside a long single-column article. It is
 * the layout most developer docs converge on, and it is the one that shows off
 * anchors, scroll actions and highlighted code together — the sidebar links
 * are wired to the headings, so it works the moment you hit Preview.
 *
 * @module templates/docs
 */

import { LIGHT, el, footer, heading } from './parts.js';

const T = LIGHT;
const SIDEBAR_X = 80;
const ARTICLE_X = 340;
const ARTICLE_W = 720;

/**
 * One sidebar link, wired to scroll to its section.
 *
 * @param {string} label
 * @param {string} target anchor name
 * @param {boolean} [current]
 * @returns {any}
 */
const navLink = (label, target, current = false) =>
  el(
    'link',
    {
      name: `${label} link`,
      width: 200,
      height: 22,
      content: label,
      href: `#${target}`,
      fontSize: 14.5,
      color: current ? T.ink : T.muted,
      fontWeight: current ? '600' : '400',
      cursor: 'pointer',
      'data.action': 'scroll',
      'data.target': target,
    },
    { parent: 'sidebar-nav' }
  );

/**
 * A heading plus a paragraph, the unit an article is made of.
 *
 * Emitted as a small column stack nested inside the article column, which is
 * why nothing in this file carries a hand-computed `y`: a code block that
 * grows by two lines pushes everything below it down on its own. Absolute
 * offsets in a document of prose are a promise you cannot keep.
 *
 * @param {object} options
 * @param {string} options.anchor
 * @param {string} options.title
 * @param {string} options.body
 * @returns {any[]}
 */
function article({ anchor, title, body }) {
  const ref = `art-${anchor}`;
  return [
    el(
      'stack',
      { name: title, width: ARTICLE_W, layout: 'column', gap: 12, padding: 0 },
      { ref, parent: 'article-col' }
    ),
    el(
      'heading',
      {
        name: `${title} title`,
        width: ARTICLE_W,
        content: title,
        anchor,
        fontSize: 26,
        fontWeight: '700',
        color: T.ink,
        letterSpacing: -0.5,
      },
      { parent: ref }
    ),
    el(
      'text',
      {
        name: `${title} copy`,
        width: ARTICLE_W,
        content: body,
        fontSize: 16.5,
        lineHeight: 1.75,
        color: T.muted,
      },
      { parent: ref }
    ),
  ];
}

/** @returns {{page: Record<string, any>, nodes: any[]}} */
export function build() {
  return {
    page: {
      title: 'Cadence docs — Getting started',
      description: 'Install Cadence, connect a repository, and publish your first release note.',
      width: 1200,
      minHeight: 2100,
      background: T.surface,
      fontFamily: "'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif",
    },

    nodes: [
      /* =========================================================== topbar === */
      el(
        'section',
        { name: 'Topbar', width: 1200, height: 60, background: T.surface, padding: 0 },
        { ref: 'topbar', parent: 'root', x: 0, y: 0 }
      ),
      el(
        'heading',
        {
          name: 'Wordmark',
          width: 240,
          content: 'cadence / docs',
          fontSize: 16,
          fontWeight: '700',
          color: T.ink,
        },
        { parent: 'topbar', x: SIDEBAR_X, y: 20 }
      ),
      el(
        'input',
        {
          name: 'Search',
          width: 260,
          height: 34,
          placeholder: 'Search the docs…',
          background: T.wash,
          borderColor: T.line,
          radius: 8,
          fontSize: 14,
          'data.type': 'search',
        },
        { parent: 'topbar', x: 860, y: 13 }
      ),
      el(
        'divider',
        { name: 'Topbar rule', width: 1200, height: 1, background: T.line },
        { parent: 'root', x: 0, y: 60 }
      ),

      /* ========================================================== sidebar === */
      el(
        'text',
        {
          name: 'Sidebar heading',
          width: 200,
          content: 'Getting started',
          fontSize: 12,
          fontWeight: '700',
          color: T.faint,
          textTransform: 'uppercase',
          letterSpacing: 0.8,
        },
        { parent: 'root', x: SIDEBAR_X, y: 104 }
      ),
      el(
        'stack',
        { name: 'Sidebar links', width: 200, layout: 'column', gap: 10, padding: 0 },
        { ref: 'sidebar-nav', parent: 'root', x: SIDEBAR_X, y: 134 }
      ),
      navLink('Install', 'install', true),
      navLink('Connect a repository', 'connect'),
      navLink('Configuration', 'configuration'),
      navLink('Publishing', 'publishing'),
      navLink('Troubleshooting', 'troubleshooting'),
      el(
        'divider',
        { name: 'Sidebar rule', width: 1, height: 1760, background: T.line },
        { parent: 'root', x: 300, y: 90 }
      ),

      /* ========================================================== article ===
       * One column stack from here down. Prose sets its own height, so the
       * moment a paragraph gains a line every absolute offset below it is
       * wrong — flow layout is the only honest way to lay this out.
       */
      el(
        'stack',
        { name: 'Article', width: ARTICLE_W, layout: 'column', gap: 30, padding: 0 },
        { ref: 'article-col', parent: 'root', x: ARTICLE_X, y: 104 }
      ),
      ...heading({
        ref: 'article-head',
        anchor: 'install',
        parent: 'article-col',
        eyebrow: 'Getting started',
        title: 'Install Cadence',
        body: 'Cadence runs as a GitHub App. Installing it takes one authorisation and no configuration file — the file below is optional, and only if you want to override the defaults.',
        width: ARTICLE_W,
        size: 32,
        theme: T,
      }),
      el(
        'code',
        {
          name: 'Install commands',
          width: ARTICLE_W,
          fontSize: 13.5,
          radius: 10,
          padding: 18,
          'data.language': 'bash',
          content: [
            '# install the CLI',
            'npm install -g @cadence/cli',
            '',
            '# authorise, then link the repository you are standing in',
            'cadence login',
            'cadence link --repo acme/storefront',
          ].join('\n'),
        },
        { parent: 'article-col' }
      ),

      ...article({
        anchor: 'connect',
        title: 'Connect a repository',
        body: 'Run `cadence link` inside the repository, or pick it from the dashboard. Cadence asks for read access to pull requests and nothing else — it never needs write access, and it never needs your source.',
      }),

      ...article({
        anchor: 'configuration',
        title: 'Configuration',
        body: 'Everything has a working default. Add a `cadence.json` at the repository root only when you want to change one of them.',
      }),
      el(
        'code',
        {
          name: 'Config file',
          width: ARTICLE_W,
          fontSize: 13.5,
          radius: 10,
          padding: 18,
          'data.language': 'json',
          content: [
            '{',
            '  "voice": "plain",',
            '  "group": ["feature", "fix", "chore"],',
            '  "ignore": ["dependabot[bot]"],',
            '  "publish": { "on": "release" }',
            '}',
          ].join('\n'),
        },
        { parent: 'article-col' }
      ),
      el(
        'table',
        {
          name: 'Options table',
          width: ARTICLE_W,
          fontSize: 15,
          color: T.muted,
          'data.columns': 'Key | Type | Default | What it does',
          'data.rows': [
            'voice | string | "plain" | Tone preset: plain, warm or terse',
            'group | string[] | all labels | Which labels become sections, in order',
            'ignore | string[] | [] | Authors whose pull requests are skipped',
            'publish.on | string | "manual" | "manual", "merge" or "release"',
          ].join('\n'),
        },
        { parent: 'article-col' }
      ),

      ...article({
        anchor: 'publishing',
        title: 'Publishing',
        body: 'A draft waits in the dashboard until you approve it. Approve from the web, from the CLI with `cadence publish`, or automatically on release by setting `publish.on`.',
      }),
      el(
        'quote',
        {
          name: 'Callout',
          width: ARTICLE_W,
          fontSize: 16,
          color: T.ink,
          borderColor: T.accent,
          content:
            'Automatic publishing is off by default, and we would rather you left it that way until you have read a few drafts.',
        },
        { parent: 'article-col' }
      ),

      ...article({
        anchor: 'troubleshooting',
        title: 'Troubleshooting',
        body: 'If a draft is empty, the most likely cause is that every pull request in the range carried a label that is not in `group`. Run `cadence draft --explain` to see which entries were dropped and why.',
      }),

      /* =========================================================== footer === */
      ...footer({
        y: 1900,
        gutter: ARTICLE_X,
        width: ARTICLE_W,
        note: 'Was this page useful? Edit it — this is a devlove template, not a real product.',
        theme: { ...T, muted: T.faint },
      }),
    ],
  };
}
