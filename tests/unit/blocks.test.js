/**
 * Block tests.
 *
 * A block is data, and data goes stale quietly: rename a style key and a block
 * keeps "working" while silently dropping half its styling. These replay every
 * block through the real engine — the same path a drop from the palette uses —
 * so anything the engine would reject fails here rather than in someone's
 * browser.
 *
 *     node --test tests/unit/
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { Engine } from '../../js/engine/index.js';
import { compileDocument } from '../../js/engine/compiler.js';
import { BLOCKS, BLOCK_GROUPS, blockById } from '../../js/registry/blocks.js';
import { GLYPHS } from '../../js/ui/icons.js';
import { ELEMENT_KINDS, PLACEABLE_KINDS } from '../../js/engine/kinds.js';
import { STYLE_KEYS } from '../../js/engine/style.js';
import { INSPECTOR_SECTIONS } from '../../js/registry/inspector-schema.js';

const ALL = Object.values(BLOCKS);

/**
 * Drops one block onto an empty page, the way the palette does.
 *
 * @param {string} id
 * @returns {{engine: Engine, rootId: string}}
 */
function drop(id) {
  const engine = new Engine();
  const rootId = engine.addBlock(blockById(id).build(), 'root', 40, 80);
  return { engine, rootId };
}

describe('block registry', () => {
  it('has blocks to offer', () => {
    assert.ok(ALL.length >= 10, `only ${ALL.length} blocks`);
  });

  it('gives every block a unique id', () => {
    const ids = BLOCK_GROUPS.flatMap((group) => group.items).map((item) => item.block);
    assert.equal(new Set(ids).size, ids.length);
  });

  it('gives every block a label, a hint and a real icon', () => {
    for (const block of ALL) {
      assert.ok(block.label, `${block.block} has no label`);
      assert.ok(block.hint, `${block.block} has no hint`);
      assert.ok(Object.hasOwn(GLYPHS, block.icon), `${block.block} names icon "${block.icon}"`);
    }
  });

  it('returns null for an id nobody registered', () => {
    assert.equal(blockById('no-such-block'), null);
  });
});

describe('every block', () => {
  for (const block of ALL) {
    describe(block.label, () => {
      it('builds without throwing', () => {
        assert.ok(Array.isArray(block.build()));
      });

      it('uses only kinds the engine can place', () => {
        for (const node of block.build()) {
          assert.ok(Object.hasOwn(ELEMENT_KINDS, node.kind), `unknown kind "${node.kind}"`);
          assert.ok(PLACEABLE_KINDS.includes(node.kind), `"${node.kind}" cannot be placed`);
        }
      });

      it('names only parents it has already created', () => {
        const seen = new Set();
        for (const [index, node] of block.build().entries()) {
          if (index > 0 && node.parent) {
            assert.ok(seen.has(node.parent), `"${node.parent}" is used before it is defined`);
          }
          if (node.ref) {
            seen.add(node.ref);
          }
        }
      });

      it('drops through the engine cleanly', () => {
        const { engine, rootId } = drop(block.block);
        assert.ok(engine.getElement(rootId));
        // Root first, and it lands where it was dropped.
        assert.equal(engine.getElement(rootId).parent, 'root');
        assert.equal(engine.getElement(rootId).x, 40);
        assert.equal(engine.getElement(rootId).y, 80);
      });

      it('adds every node it declared', () => {
        const { engine } = drop(block.block);
        // The page root is there before anything is dropped.
        assert.equal(engine.nodeCount(), block.build().length + 1);
      });

      it('leaves nothing stranded on the page root', () => {
        const { engine, rootId } = drop(block.block);
        // Everything except the block's own root hangs off the block.
        const stray = engine.getElement('root').children.filter((id) => id !== rootId);
        assert.deepEqual(stray, []);
      });

      it('undoes in one step', () => {
        const { engine } = drop(block.block);
        engine.undo();
        assert.equal(engine.nodeCount(), 1);
      });

      it('selects its root after the drop', () => {
        const { engine, rootId } = drop(block.block);
        assert.deepEqual(engine.selectedIds(), [rootId]);
      });

      it('compiles to HTML with no leftover placeholders', () => {
        const { engine } = drop(block.block);
        const html = compileDocument(engine.snapshot(), { editor: false });
        assert.ok(html.includes('<body'), 'no body');
        assert.ok(!html.includes('undefined'), 'compiled the word "undefined"');
        assert.ok(!html.includes('[object Object]'), 'compiled an object');
      });

      it('sets only properties a person could set by hand', () => {
        // The point of the check: a block must be reproducible in the editor.
        // If it sets something with no inspector field, the block can be
        // dropped but never rebuilt, and that is a hole in the tool.
        const fields = new Set(
          INSPECTOR_SECTIONS.flatMap((section) => section.fields).map((field) => field.key)
        );
        const styles = new Set(STYLE_KEYS.map((key) => `style.${key}`));
        for (const node of block.build()) {
          for (const key of Object.keys(node.props || {})) {
            const reachable =
              fields.has(key) ||
              styles.has(key) ||
              key.startsWith('custom.') ||
              key.startsWith('data.') ||
              key === 'name';
            assert.ok(reachable, `${block.block} sets "${key}", which has no inspector field`);
          }
        }
      });
    });
  }
});

describe('addBlock', () => {
  it('drops into the container it is given', () => {
    const engine = new Engine();
    const box = engine.addElement('container', 'root', 0, 0);
    const rootId = engine.addBlock(blockById('card').build(), box, 10, 10);
    assert.equal(engine.getElement(rootId).parent, box);
  });

  it('refuses an empty block', () => {
    const engine = new Engine();
    assert.throws(() => engine.addBlock([], 'root', 0, 0), /at least one node/);
  });

  it('refuses a kind the engine does not have', () => {
    const engine = new Engine();
    assert.throws(
      () => engine.addBlock([{ kind: 'hologram', props: {} }], 'root', 0, 0),
      /unknown element kind/
    );
  });

  it('leaves the document untouched when a block is bad', () => {
    const engine = new Engine();
    const before = engine.nodeCount();
    assert.throws(() =>
      engine.addBlock(
        [
          { kind: 'stack', props: {}, ref: 'a' },
          { kind: 'text', props: { 'style.notAThing': '4' }, parent: 'a' },
        ],
        'root',
        0,
        0
      )
    );
    assert.equal(engine.nodeCount(), before);
  });

  it('attaches an orphan to the block root rather than dropping it', () => {
    const engine = new Engine();
    const rootId = engine.addBlock(
      [
        { kind: 'stack', props: {}, ref: 'a' },
        { kind: 'text', props: {}, parent: 'typo' },
      ],
      'root',
      0,
      0
    );
    assert.equal(engine.getElement(rootId).children.length, 1);
  });
});
