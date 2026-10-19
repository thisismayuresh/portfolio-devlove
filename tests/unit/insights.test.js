/**
 * Insights unit tests. No browser, no dependencies:
 *
 *     node --test tests/unit/
 *
 * Documents are built with the real engine, then handed to the pure query
 * functions exactly as the dock panels do — so a rule that only works on a
 * hand-made fixture would fail here and in the editor alike.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { Engine } from '../../js/engine/index.js';
import {
  SEVERITIES,
  findNodes,
  listAssets,
  listColors,
  listProblems,
} from '../../js/engine/insights.js';
import { applyTo, buildTemplate } from '../../js/templates/index.js';

/** Codes `listProblems` may emit. Anything else is a typo. */
const KNOWN_CODES = new Set([
  'page-title',
  'empty-content',
  'empty-rows',
  'empty-items',
  'image-no-alt',
  'video-no-src',
  'link-no-href',
  'scroll-no-target',
  'scroll-missing-anchor',
  'scroll-hidden-target',
  'copy-no-text',
  'button-no-action',
  'form-no-endpoint',
  'form-placeholder',
  'duplicate-anchor',
]);

/**
 * @param {any} engine
 * @param {string} code
 * @returns {any | undefined} the first problem with this code
 */
function problemOf(engine, code) {
  return listProblems(engine.snapshot()).find((problem) => problem.code === code);
}

/**
 * @param {any} engine
 * @returns {string[]} every code reported
 */
function codesOf(engine) {
  return listProblems(engine.snapshot()).map((problem) => problem.code);
}

describe('listProblems', () => {
  it('reports nothing on a fresh document', () => {
    const engine = new Engine();
    // Page defaults are valid and there are no nodes yet, so an untouched
    // document is clean — problems are introduced by content, not by birth.
    assert.deepEqual(codesOf(engine), []);
  });

  it('flags an empty page title, and only then', () => {
    const engine = new Engine();
    assert.equal(problemOf(engine, 'page-title'), undefined);
    engine.snapshot().page.title = '';
    const flagged = problemOf(engine, 'page-title');
    assert.equal(flagged && flagged.severity, 'error');
    assert.equal(flagged && flagged.id, 'root');
    engine.snapshot().page.title = 'Untitled page';
    assert.equal(problemOf(engine, 'page-title'), undefined);
  });

  it('flags text kinds whose content is blank', () => {
    const engine = new Engine();
    const heading = engine.addElement('heading', null, 0, 0);
    engine.snapshot().nodes[heading].content = '   ';
    const problem = problemOf(engine, 'empty-content');
    assert.ok(problem, 'the blank heading should be reported');
    assert.equal(problem.id, heading);
    assert.equal(problem.severity, 'error');
    assert.match(problem.message, /has no text$/);

    engine.snapshot().nodes[heading].content = 'Filled in';
    assert.equal(problemOf(engine, 'empty-content'), undefined);
  });

  it('flags a link with nowhere to go', () => {
    const engine = new Engine();
    const link = engine.addElement('link', null, 0, 0);
    assert.equal(engine.getElement(link).href, '#');
    assert.equal(problemOf(engine, 'link-no-href').id, link);

    engine.snapshot().nodes[link].href = 'https://example.com';
    assert.equal(problemOf(engine, 'link-no-href'), undefined);

    engine.snapshot().nodes[link].href = 'mailto:';
    assert.equal(problemOf(engine, 'link-no-href').id, link);
  });

  it('resolves a Scroll action against the anchors in the document', () => {
    const engine = new Engine();
    const button = engine.addElement('button', null, 0, 0);
    const node = engine.snapshot().nodes[button];
    node.data = { ...node.data, action: 'scroll' };

    // No target at all.
    assert.equal(problemOf(engine, 'scroll-no-target').id, button);

    // A target nothing answers to.
    node.data.target = 'nowhere';
    assert.ok(problemOf(engine, 'scroll-missing-anchor'));
    assert.equal(problemOf(engine, 'scroll-no-target'), undefined);

    // A visible anchor answers.
    const section = engine.addElement('section', null, 0, 0);
    engine.snapshot().nodes[section].anchor = 'contact';
    node.data.target = 'contact';
    assert.equal(problemOf(engine, 'scroll-missing-anchor'), undefined);
    assert.equal(problemOf(engine, 'scroll-hidden-target'), undefined);

    // Hiding it makes the action quietly broken.
    engine.snapshot().nodes[section].hidden = true;
    const hidden = problemOf(engine, 'scroll-hidden-target');
    assert.ok(hidden);
    assert.equal(hidden.severity, 'warning');
  });

  it('flags duplicate anchors on every holder after the first', () => {
    const engine = new Engine();
    const first = engine.addElement('section', null, 0, 0);
    const second = engine.addElement('section', null, 0, 0);
    engine.snapshot().nodes[first].anchor = 'about';
    engine.snapshot().nodes[second].anchor = 'about';

    const problems = listProblems(engine.snapshot()).filter(
      (problem) => problem.code === 'duplicate-anchor'
    );
    assert.deepEqual(
      problems.map((problem) => problem.id),
      [second]
    );
    assert.equal(problems[0].severity, 'error');
  });

  it('flags buttons that do nothing and forms without a real endpoint', () => {
    const engine = new Engine();
    const button = engine.addElement('button', null, 0, 0);
    const form = engine.addElement('form', null, 0, 0);
    assert.ok(problemOf(engine, 'button-no-action'));
    assert.equal(problemOf(engine, 'button-no-action').id, button);

    const formProblem = problemOf(engine, 'form-no-endpoint');
    assert.ok(formProblem, 'a fresh form has no endpoint');
    assert.equal(formProblem.id, form);

    const node = engine.snapshot().nodes[form];
    node.data.endpoint = 'https://formspree.io/f/your-id';
    assert.ok(problemOf(engine, 'form-placeholder'));

    node.data.endpoint = 'https://formspree.io/f/abc123';
    assert.equal(problemOf(engine, 'form-no-endpoint'), undefined);
    assert.equal(problemOf(engine, 'form-placeholder'), undefined);
  });

  it('flags a Copy action with nothing to copy', () => {
    const engine = new Engine();
    const button = engine.addElement('button', null, 0, 0);
    const node = engine.snapshot().nodes[button];
    node.data = { ...node.data, action: 'copy' };
    const problem = problemOf(engine, 'copy-no-text');
    assert.ok(problem);
    assert.equal(problem.severity, 'warning');
    node.data.target = 'hello@example.com';
    assert.equal(problemOf(engine, 'copy-no-text'), undefined);
  });

  it('flags media that cannot render', () => {
    const engine = new Engine();
    const image = engine.addElement('image', null, 0, 0);
    const video = engine.addElement('video', null, 0, 0);
    assert.equal(engine.getElement(video).src, null, 'a fresh video has no src');

    // A fresh image carries the placeholder but no alt text.
    const altProblem = problemOf(engine, 'image-no-alt');
    assert.ok(altProblem);
    assert.equal(altProblem.id, image);

    const videoProblem = problemOf(engine, 'video-no-src');
    assert.ok(videoProblem);
    assert.equal(videoProblem.id, video);
    assert.equal(videoProblem.severity, 'error');

    engine.snapshot().nodes[image].content = 'A portrait';
    engine.snapshot().nodes[video].src = 'https://example.com/clip.mp4';
    assert.equal(problemOf(engine, 'image-no-alt'), undefined);
    assert.equal(problemOf(engine, 'video-no-src'), undefined);
  });

  it('flags a table or list whose data was cleared', () => {
    const engine = new Engine();
    const table = engine.addElement('table', null, 0, 0);
    const list = engine.addElement('list', null, 0, 0);
    assert.equal(problemOf(engine, 'empty-rows'), undefined);
    assert.equal(problemOf(engine, 'empty-items'), undefined);

    delete engine.snapshot().nodes[table].data.rows;
    delete engine.snapshot().nodes[list].data.items;
    assert.equal(problemOf(engine, 'empty-rows').id, table);
    assert.equal(problemOf(engine, 'empty-items').id, list);
  });

  it('sorts errors before warnings and keeps document order within each', () => {
    const engine = new Engine();
    const early = engine.addElement('heading', null, 0, 0);
    const late = engine.addElement('image', null, 400, 0);
    engine.snapshot().nodes[early].content = '';
    // The fresh image is an alt-text warning; the blank heading is an error.

    const problems = listProblems(engine.snapshot());
    const severities = problems.map((problem) => problem.severity);
    const rank = { error: 0, warning: 1, info: 2 };
    for (let i = 1; i < severities.length; i += 1) {
      assert.ok(rank[severities[i - 1]] <= rank[severities[i]], 'sorted worst first');
    }
    assert.equal(problems.find((p) => p.code === 'empty-content').id, early);
    assert.equal(problems.find((p) => p.code === 'image-no-alt').id, late);
    for (const problem of problems) {
      assert.ok(KNOWN_CODES.has(problem.code), `unexpected problem code ${problem.code}`);
      assert.ok(SEVERITIES.includes(problem.severity));
      assert.equal(typeof problem.message, 'string');
      assert.ok(problem.message.length > 0);
    }
  });

  it('runs over the real portfolio template without inventing problems', () => {
    const engine = new Engine();
    applyTo(engine, buildTemplate('portfolio'));
    const problems = listProblems(engine.snapshot());
    assert.ok(Array.isArray(problems));
    for (const problem of problems) {
      assert.ok(KNOWN_CODES.has(problem.code), `unexpected problem code ${problem.code}`);
      // The id must be somewhere the panel can actually navigate to.
      assert.ok(problem.id === 'root' || engine.snapshot().nodes[problem.id]);
    }
  });
});

describe('findNodes', () => {
  it('matches names, content and kinds case-insensitively', () => {
    const engine = new Engine();
    const heading = engine.addElement('heading', null, 0, 0);
    engine.snapshot().nodes[heading].name = 'Hero Title';
    const table = engine.addElement('table', null, 0, 0);

    const byName = findNodes(engine.snapshot(), 'hero title');
    assert.deepEqual(
      byName.map((result) => result.id),
      [heading]
    );

    const byContent = findNodes(engine.snapshot(), 'headline goes');
    assert.ok(byContent.some((result) => result.id === heading));

    const byKind = findNodes(engine.snapshot(), 'TABLE');
    assert.ok(byKind.some((result) => result.id === table));
    assert.equal(byKind.find((result) => result.id === table).kind, 'table');
  });

  it('returns nothing for an empty query', () => {
    const engine = new Engine();
    engine.addElement('heading', null, 0, 0);
    assert.deepEqual(findNodes(engine.snapshot(), ''), []);
    assert.deepEqual(findNodes(engine.snapshot(), '   '), []);
  });

  it('honours the limit', () => {
    const engine = new Engine();
    for (let i = 0; i < 5; i += 1) {
      engine.addElement('heading', null, i * 10, 0);
    }
    assert.equal(findNodes(engine.snapshot(), 'heading', 3).length, 3);
  });

  it('reports hidden nodes as hidden rather than omitting them', () => {
    const engine = new Engine();
    const heading = engine.addElement('heading', null, 0, 0);
    engine.snapshot().nodes[heading].hidden = true;
    const results = findNodes(engine.snapshot(), 'headline');
    assert.ok(results.length >= 1);
    assert.equal(results.find((result) => result.id === heading).hidden, true);
  });
});

describe('listAssets', () => {
  it('lists images and videos with their sources', () => {
    const engine = new Engine();
    assert.deepEqual(listAssets(engine.snapshot()), []);

    const image = engine.addElement('image', null, 0, 0);
    const video = engine.addElement('video', null, 0, 0);
    engine.snapshot().nodes[image].src = 'data:image/png;base64,AAAA';
    engine.snapshot().nodes[image].content = 'Alt text';
    engine.snapshot().nodes[video].src = 'clip.mp4';

    const assets = listAssets(engine.snapshot());
    assert.equal(assets.length, 2);
    const assetFor = (id) => assets.find((asset) => asset.id === id);
    assert.equal(assetFor(image).kind, 'image');
    assert.equal(assetFor(image).src, 'data:image/png;base64,AAAA');
    assert.equal(assetFor(image).alt, 'Alt text');
    assert.equal(assetFor(video).kind, 'video');
    assert.equal(assetFor(video).src, 'clip.mp4');
  });
});

describe('listColors', () => {
  it('collects colour tokens from styles, custom declarations and the page', () => {
    const engine = new Engine();
    const heading = engine.addElement('heading', null, 0, 0);
    const node = engine.snapshot().nodes[heading];
    node.style.color = '#0F1729';
    node.style.custom = { 'text-shadow': '0 1px 2px rgba(0,0,0,0.4)' };

    const colors = listColors(engine.snapshot());
    const values = colors.map((color) => color.value);
    // Page background (#ffffff by default) is in play too.
    assert.ok(values.includes('#0f1729'), 'hex is normalised to lowercase');
    assert.ok(values.includes('rgba(0,0,0,0.4)'), 'rgb()/rgba() tokens are found');
    assert.ok(values.includes('#ffffff'), 'the page background counts');

    const headingColor = colors.find((color) => color.value === '#0f1729');
    assert.equal(headingColor.count, 1);
    assert.deepEqual(headingColor.ids, [heading]);
  });

  it('counts repeated colours and sorts by use count', () => {
    const engine = new Engine();
    const a = engine.addElement('heading', null, 0, 0);
    const b = engine.addElement('text', null, 0, 0);
    engine.snapshot().nodes[a].style.color = '#aa0000';
    engine.snapshot().nodes[b].style.color = '#aa0000';
    engine.snapshot().nodes[b].style.background = '#aa0000';

    const colors = listColors(engine.snapshot());
    const top = colors[0];
    assert.equal(top.value, '#aa0000');
    assert.equal(top.count, 3);
    assert.deepEqual([...top.ids].sort(), [a, b].sort());

    // Sorted descending.
    for (let i = 1; i < colors.length; i += 1) {
      assert.ok(colors[i - 1].count >= colors[i].count);
    }
  });

  it('extracts colours embedded in larger values and skips keywords', () => {
    const engine = new Engine();
    const box = engine.addElement('container', null, 0, 0);
    const node = engine.snapshot().nodes[box];
    node.style.backgroundImage = 'linear-gradient(90deg, #101828, rgb(16 24 40 / 0.5))';
    node.style.custom = { border: '1px solid transparent', color: 'inherit' };

    const values = listColors(engine.snapshot()).map((color) => color.value);
    assert.ok(values.includes('#101828'));
    assert.ok(values.includes('rgb(16 24 40 / 0.5)'));
    assert.ok(!values.includes('transparent'), 'keywords are not colours to reuse');
    assert.ok(!values.includes('inherit'));
  });
});
