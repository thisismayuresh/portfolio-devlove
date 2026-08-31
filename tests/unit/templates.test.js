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
  buildTemplate,
  templateById,
} from '../../js/templates/index.js';
import { props } from '../../js/templates/parts.js';

/**
 * Replays a template through the engine, exactly as the app does.
 *
 * @param {{page?: Record<string, any>, nodes: any[]}} template
 * @returns {Engine}
 */
function apply(template) {
  const engine = new Engine();
  engine.resetProject();
  for (const [key, value] of Object.entries(template.page || {})) {
    engine.updatePage(key, String(value));
  }
  /** @type {Record<string, string>} */
  const aliases = Object.create(null);
  for (const spec of template.nodes) {
    const parent = spec.parent ? aliases[spec.parent] || spec.parent : 'root';
    const id = engine.addElementWith(
      spec.kind,
      parent,
      Number(spec.x) || 0,
      Number(spec.y) || 0,
      spec.props || {}
    );
    if (spec.ref) {
      aliases[spec.ref] = id;
    }
  }
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
