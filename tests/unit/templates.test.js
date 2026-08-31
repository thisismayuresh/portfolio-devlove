/**
 * Template tests.
 *
 * A template is data, and data goes stale quietly: rename a style key and a
 * template keeps "working" while silently dropping half its styling. These
 * replay every template through the real engine — the same path
 * `DevloveApp.applyTemplate` uses — so anything the engine would reject fails
 * here instead of in someone's browser.
 *
 *     node --test tests/unit/
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { Engine } from '../../js/engine/index.js';
import { compileDocument } from '../../js/engine/compiler.js';
import {
  DEFAULT_TEMPLATE_ID,
  TEMPLATES,
  applyTo,
  buildTemplate,
  templateById,
} from '../../js/templates/index.js';
import { props } from '../../js/templates/parts.js';
import { BLUEPRINTS } from '../../js/registry/elements.js';
import { INSPECTOR_SECTIONS, PAGE_FIELDS } from '../../js/registry/inspector-schema.js';
import { PLACEABLE_KINDS } from '../../js/engine/kinds.js';

/**
 * Replays a template through the engine.
 *
 * Uses the shipped `applyTo` rather than a copy of it, so these tests exercise
 * the same replay the editor and the template previews use — a test with its
 * own version would keep passing after the real one broke.
 *
 * @param {{page?: Record<string, any>, nodes: any[]}} template
 * @returns {Engine}
 */
function apply(template) {
  const engine = new Engine();
  applyTo(engine, template);
  return engine;
}

describe('template registry', () => {
  it('has a default that exists', () => {
    assert.ok(templateById(DEFAULT_TEMPLATE_ID));
  });

  it('gives every template a unique id', () => {
    const ids = TEMPLATES.map((template) => template.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  it('falls back to the default for an unknown id', () => {
    assert.deepEqual(buildTemplate('no-such-template'), buildTemplate(DEFAULT_TEMPLATE_ID));
  });

  it('describes every template for the picker', () => {
    for (const template of TEMPLATES) {
      assert.ok(template.name, `${template.id} has no name`);
      assert.ok(template.summary, `${template.id} has no summary`);
      assert.ok(template.tags.length > 0, `${template.id} has no tags`);
    }
  });
});

describe('templates build', () => {
  for (const template of TEMPLATES) {
    describe(template.id, () => {
      it('replays through the engine without a rejected property', () => {
        // `addElementWith` throws on an unknown key or a bad value, so simply
        // getting here means every property in the template is one the engine
        // actually accepts.
        const engine = apply(template.build());
        assert.ok(engine.nodeCount() >= 1);
      });

      it('compiles to a document', () => {
        const html = compileDocument(apply(template.build()).snapshot(), { editor: false });
        assert.ok(html.startsWith('<!doctype html>'));
        assert.ok(html.includes('</html>'));
      });

      it('leaves every parent ref resolved', () => {
        // An unresolved `ref` silently becomes a literal id, and the engine
        // then falls back to the root — the element appears, in the wrong
        // place. Every node should sit under the root or under a real node.
        const engine = apply(template.build());
        const doc = engine.snapshot();
        for (const node of Object.values(doc.nodes)) {
          const parent = /** @type {any} */ (node).parent;
          assert.ok(
            parent === null || doc.nodes[parent],
            `${/** @type {any} */ (node).name} has a dangling parent`
          );
        }
      });
    });
  }
});

describe('template content', () => {
  it('wires nav links to anchors that exist', () => {
    for (const template of TEMPLATES) {
      const doc = apply(template.build()).snapshot();
      const anchors = new Set(
        Object.values(doc.nodes)
          .map((node) => /** @type {any} */ (node).anchor)
          .filter(Boolean)
      );

      for (const node of Object.values(doc.nodes)) {
        const { data, name } = /** @type {any} */ (node);
        if (data?.action === 'scroll' && data.target) {
          assert.ok(
            anchors.has(data.target),
            `${template.id}: "${name}" scrolls to "${data.target}", which no element anchors`
          );
        }
      }
    }
  });

  it('ships the click runtime only where something clicks', () => {
    const withActions = compileDocument(apply(buildTemplate('portfolio')).snapshot(), {
      editor: false,
    });
    const blank = compileDocument(apply(buildTemplate('blank')).snapshot(), { editor: false });

    assert.ok(withActions.includes('data-dl-action'));
    assert.ok(withActions.includes('<script>'));
    assert.ok(!blank.includes('<script>'));
  });

  it('gives the portfolio a table, a highlighted code block and a form', () => {
    const html = compileDocument(apply(buildTemplate('portfolio')).snapshot(), { editor: false });
    assert.ok(html.includes('<table'));
    assert.ok(html.includes('<span class="tk-k">'));
    assert.ok(html.includes('<form'));
  });

  it('starts blank as an empty page', () => {
    assert.equal(apply(buildTemplate('blank')).nodeCount(), 1);
  });
});

describe('the props helper', () => {
  it('expands bare style keys and leaves node keys alone', () => {
    assert.deepEqual(props({ fontSize: 16, width: 200, content: 'hi' }), {
      'style.fontSize': 16,
      width: 200,
      content: 'hi',
    });
  });

  it('passes dotted paths straight through', () => {
    assert.deepEqual(props({ 'data.rows': 'a | b', 'custom.filter': 'blur(2px)' }), {
      'data.rows': 'a | b',
      'custom.filter': 'blur(2px)',
    });
  });
});

describe('templates stay buildable by hand', () => {
  // A template that used a property the inspector never shows would be
  // advertising a page nobody can actually make. These keep the claim honest.

  /** Every `key` the inspector renders a control for. */
  const inspectorKeys = new Set([
    ...PAGE_FIELDS.map((field) => field.key),
    ...INSPECTOR_SECTIONS.flatMap((section) => section.fields.map((field) => field.key)),
  ]);

  it('sets no property the inspector does not expose', () => {
    /** @type {string[]} */
    const unreachable = [];

    for (const template of TEMPLATES) {
      const { page, nodes } = template.build();
      const keys = [
        ...Object.keys(page || {}),
        ...nodes.flatMap((node) => Object.keys(node.props || {})),
      ];
      for (const key of keys) {
        // `custom.*` is the Custom CSS field, which takes anything.
        if (inspectorKeys.has(key) || key.startsWith('custom.')) {
          continue;
        }
        unreachable.push(`${template.id}: ${key}`);
      }
    }

    assert.deepEqual(
      [...new Set(unreachable)],
      [],
      'a template sets something no inspector field can set'
    );
  });

  it('uses no element without a palette tile', () => {
    for (const template of TEMPLATES) {
      for (const node of template.build().nodes) {
        assert.ok(
          BLUEPRINTS[node.kind],
          `${template.id} uses "${node.kind}", which has no palette tile`
        );
      }
    }
  });

  it('between them, shows off all but one of the elements', () => {
    const used = new Set(
      TEMPLATES.flatMap((template) => template.build().nodes.map((node) => node.kind))
    );
    const unused = PLACEABLE_KINDS.filter((kind) => !used.has(kind));
    // Video is the exception: it has nothing to play without an asset, and a
    // template that shipped a video file would not be a template any more.
    assert.deepEqual(unused, ['video']);
  });
});

describe('exports are self-contained', () => {
  for (const template of TEMPLATES) {
    it(`${template.id} needs nothing from the network`, () => {
      const html = compileDocument(apply(template.build()).snapshot(), { editor: false });

      // One file, or it is not really an export. No stylesheet links, no
      // script sources, no font or image hosts to go down on someone else.
      assert.ok(!/<link\b/i.test(html), 'links to an external stylesheet');
      assert.ok(!/<script[^>]+\bsrc=/i.test(html), 'loads a script from elsewhere');
      assert.ok(!/\b(?:src|href)="https?:\/\//i.test(html), 'fetches a remote asset');
    });
  }

  it('carries no script at all when nothing on the page clicks', () => {
    const html = compileDocument(apply(buildTemplate('blank')).snapshot(), { editor: false });
    assert.ok(!html.includes('<script'));
  });
});
