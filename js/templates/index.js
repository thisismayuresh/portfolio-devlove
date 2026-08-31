/**
 * The template gallery.
 *
 * A template is a function returning `{page, nodes}` — the same declarative
 * shape `DevloveApp.applyTemplate` replays through the engine, so anything
 * expressible in the editor is expressible in a template and nothing here
 * needs privileged access.
 *
 * **Adding a template is one file in this directory plus one row below.**
 * Build it out of `templates/parts.js` where you can; that is what keeps them
 * looking like one family rather than five unrelated pages.
 *
 * `build` is a function rather than a plain object on purpose: templates are
 * only ever needed when someone picks one, and a lazily-built document keeps
 * four unused page layouts out of the boot path.
 *
 * @module templates
 */

import * as portfolio from './portfolio.js';
import * as saas from './saas.js';
import * as docs from './docs.js';
import { LIGHT } from './parts.js';

/**
 * @typedef {object} Template
 * @property {string} id        stable key, used by the picker and in tests
 * @property {string} name
 * @property {string} summary   one line, shown under the name
 * @property {string[]} tags    what it is made of, shown as small print
 * @property {() => {page: Record<string, any>, nodes: any[]}} build
 */

/** @type {ReadonlyArray<Template>} */
export const TEMPLATES = Object.freeze([
  {
    id: 'portfolio',
    name: 'Developer portfolio',
    summary: 'Hero, stack, a table of projects, and a working contact form.',
    tags: ['Nav', 'Table', 'Code', 'Form'],
    build: portfolio.build,
  },
  {
    id: 'saas',
    name: 'SaaS landing page',
    summary: 'Dark product page: features, pricing comparison, FAQ and sign-up.',
    tags: ['Dark', 'Nav', 'Pricing', 'FAQ'],
    build: saas.build,
  },
  {
    id: 'docs',
    name: 'Documentation',
    summary: 'Sidebar of anchors beside a long article with code and a reference table.',
    tags: ['Sidebar', 'Code', 'Table'],
    build: docs.build,
  },
  {
    id: 'blank',
    name: 'Blank page',
    summary: 'An empty canvas with the page set up and nothing on it.',
    tags: ['Empty'],
    build: () => ({
      page: {
        title: 'Untitled page',
        width: 1280,
        minHeight: 900,
        background: LIGHT.surface,
      },
      nodes: [],
    }),
  },
]);

/** The template a first-time visitor lands on. */
export const DEFAULT_TEMPLATE_ID = 'portfolio';

/**
 * @param {string} id
 * @returns {Template | undefined}
 */
export function templateById(id) {
  return TEMPLATES.find((template) => template.id === id);
}

/**
 * Builds a template's document, falling back to the default when the id is
 * not one we know — a stale id in `localStorage` should not produce a blank
 * editor.
 *
 * @param {string} [id]
 * @returns {{page: Record<string, any>, nodes: any[]}}
 */
export function buildTemplate(id = DEFAULT_TEMPLATE_ID) {
  const template = templateById(id) || templateById(DEFAULT_TEMPLATE_ID);
  return template.build();
}
