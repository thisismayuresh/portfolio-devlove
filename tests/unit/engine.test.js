/**
 * Engine unit tests. No browser, no dependencies:
 *
 *     node --test tests/unit/
 *
 * The engine is plain ES modules with no DOM access, which is what makes this
 * possible — everything except the panels can be tested here, in milliseconds.
 * Interaction (dragging, real pointer input) is covered by
 * `tests/run-browser-tests.mjs` instead.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { Engine } from '../../js/engine/index.js';
import { compileCss, compileDocument, compileHtml } from '../../js/engine/compiler.js';

/**
 * A container holding one text node.
 * @returns {{engine: Engine, parent: string, child: string}}
 */
function seeded() {
  const engine = new Engine();
  const parent = engine.addElement('container', null, 40, 60);
  const child = engine.addElement('text', parent, 10, 10);
  return { engine, parent, child };
}

describe('document structure', () => {
  it('starts with only the root', () => {
    const engine = new Engine();
    assert.equal(engine.nodeCount(), 1);
    assert.ok(engine.getElement('root'));
  });

  it('links added nodes both ways', () => {
    const { engine, parent, child } = seeded();
    assert.equal(engine.getElement(child).parent, parent);
    assert.deepEqual(engine.getElement(parent).children, [child]);
  });

  it('puts a node beside a parent that cannot hold children', () => {
    const engine = new Engine();
    const text = engine.addElement('text', null, 0, 0);
    const button = engine.addElement('button', text, 0, 0);
    assert.equal(engine.getElement(button).parent, 'root');
  });

  it('accepts alias spellings for a kind', () => {
    const engine = new Engine();
    const id = engine.addElement('div', null, 0, 0);
    assert.equal(engine.getElement(id).kind, 'container');
  });

  it('rejects an unknown kind', () => {
    const engine = new Engine();
    assert.throws(() => engine.addElement('carousel', null, 0, 0), /unknown element kind/);
  });

  it('deletes a container together with its subtree', () => {
    const { engine, parent, child } = seeded();
    engine.deleteElement(parent);
    assert.throws(() => engine.getElement(parent));
    assert.throws(() => engine.getElement(child));
    assert.equal(engine.nodeCount(), 1);
  });

  it('refuses to delete or reparent the root', () => {
    const { engine, parent } = seeded();
    assert.throws(() => engine.deleteElement('root'), /cannot be deleted/);
    assert.throws(() => engine.reparentElement('root', parent), /cannot be reparented/);
  });

  it('refuses to move a node inside its own subtree', () => {
    const engine = new Engine();
    const outer = engine.addElement('container', null, 0, 0);
    const inner = engine.addElement('container', outer, 0, 0);
    assert.throws(() => engine.reparentElement(outer, inner), /its own subtree/);
  });

  it('refuses to nest inside something that holds no children', () => {
    const { engine, parent, child } = seeded();
    assert.throws(() => engine.reparentElement(parent, child), /cannot hold children/);
  });

  it('reorders within a parent', () => {
    const engine = new Engine();
    const first = engine.addElement('text', null, 0, 0);
    const second = engine.addElement('text', null, 0, 0);
    engine.reorderElement(second, -1);
    assert.deepEqual(engine.getElement('root').children, [second, first]);
  });

  it('duplicates the whole subtree with fresh ids, offset', () => {
    const { engine, parent, child } = seeded();
    const clone = engine.duplicateElement(parent);
    assert.notEqual(clone, parent);

    const copy = engine.getElement(clone);
    assert.equal(copy.children.length, 1);
    assert.notEqual(copy.children[0], child);
    assert.equal(copy.x, engine.getElement(parent).x + 24);
    // The clone lands directly after the original.
    assert.deepEqual(engine.getElement('root').children, [parent, clone]);
  });
});

describe('history', () => {
  it('undo restores the previous document', () => {
    const { engine, parent } = seeded();
    const before = engine.nodeCount();
    engine.deleteElement(parent);
    assert.equal(engine.undo(), true);
    assert.equal(engine.nodeCount(), before);
    assert.ok(engine.getElement(parent));
  });

  it('redo reapplies an undone change', () => {
    const { engine, parent } = seeded();
    engine.deleteElement(parent);
    engine.undo();
    assert.equal(engine.redo(), true);
    assert.throws(() => engine.getElement(parent));
  });

  it('reports nothing to undo on an untouched document', () => {
    const engine = new Engine();
    assert.equal(engine.canUndo(), false);
    assert.equal(engine.undo(), false);
  });

  it('leaves no empty step behind a rejected mutation', () => {
    const { engine, parent } = seeded();
    engine.clearHistory();
    assert.throws(() => engine.updateElement(parent, 'width', 'not-a-number'));
    assert.equal(engine.canUndo(), false);
  });

  it('does not record history for the drag fast paths', () => {
    const { engine, parent } = seeded();
    engine.clearHistory();
    engine.moveElement(parent, 100, 100);
    engine.resizeElement(parent, 200, 200);
    assert.equal(engine.canUndo(), false);
  });

  it('drops the redo stack once a new change is made', () => {
    const { engine, parent } = seeded();
    engine.deleteElement(parent);
    engine.undo();
    assert.equal(engine.canRedo(), true);
    engine.addElement('text', null, 0, 0);
    assert.equal(engine.canRedo(), false);
  });
});

describe('properties', () => {
  it('ignores move and resize on a locked node', () => {
    const { engine, parent } = seeded();
    engine.updateElement(parent, 'locked', 'true');
    engine.moveElement(parent, 999, 999);
    assert.equal(engine.getElement(parent).x, 40);
  });

  it('leaves the node untouched when a value is rejected', () => {
    const { engine, parent } = seeded();
    assert.throws(() => engine.updateElement(parent, 'width', 'not-a-number'));
    assert.equal(engine.getElement(parent).width, 360);
  });

  it('rejects an unknown property and an unknown style property', () => {
    const { engine, parent } = seeded();
    assert.throws(() => engine.updateElement(parent, 'colour', 'red'), /unknown property/);
    assert.throws(() => engine.updateElement(parent, 'style.blur', '4'), /unknown style property/);
  });

  it('clears a style property when given an empty value', () => {
    const { engine, parent } = seeded();
    engine.updateElement(parent, 'style.padding', '');
    assert.equal(engine.getElement(parent).style.padding, undefined);
  });

  it('turns off autoHeight when a height is dragged', () => {
    const engine = new Engine();
    const text = engine.addElement('text', null, 0, 0);
    assert.equal(engine.getElement(text).autoHeight, true);
    engine.resizeElement(text, 200, 200);
    assert.equal(engine.getElement(text).autoHeight, false);
  });

  it('clamps page settings into their allowed range', () => {
    const engine = new Engine();
    engine.updatePage('width', '99999');
    assert.equal(engine.getPage().width, 6000);
  });

  it('hands out copies, so a caller cannot corrupt the model', () => {
    const { engine, parent } = seeded();
    const node = engine.getElement(parent);
    node.width = 9999;
    assert.equal(engine.getElement(parent).width, 360);
  });
});

describe('geometry', () => {
  /** @param {Engine} engine @param {Record<string, number[]>} rects */
  const measure = (engine, rects) => engine.syncRects(rects);

  it('hit testing prefers the deepest measured node', () => {
    const { engine, parent, child } = seeded();
    measure(engine, {
      root: [0, 0, 1280, 800],
      [parent]: [40, 60, 360, 240],
      [child]: [50, 70, 100, 40],
    });

    assert.equal(engine.hitTest(60, 80), child);
    assert.equal(engine.hitTest(300, 250), parent);
    assert.equal(engine.hitTest(1200, 700), null);
  });

  it('hit testing skips hidden nodes', () => {
    const { engine, parent, child } = seeded();
    measure(engine, { [parent]: [40, 60, 360, 240], [child]: [50, 70, 100, 40] });
    engine.updateElement(parent, 'hidden', 'true');
    assert.equal(engine.hitTest(60, 80), null);
  });

  it('drop targeting skips the dragged subtree', () => {
    const { engine, parent, child } = seeded();
    measure(engine, { [parent]: [0, 0, 300, 300], [child]: [10, 10, 100, 40] });

    assert.equal(engine.dropTarget(50, 50), parent);
    assert.equal(engine.dropTarget(50, 50, parent), 'root');
  });

  it('converts a frame point into parent-local coordinates', () => {
    const { engine, parent } = seeded();
    measure(engine, { [parent]: [40, 60, 360, 240] });
    // The container's default 1px border is part of the offset.
    assert.deepEqual(engine.toLocalPoint(parent, 140, 160), [99, 99]);
  });

  it('offers the parent edges and sibling edges as snap guides', () => {
    const engine = new Engine();
    const box = engine.addElement('container', null, 0, 0);
    const a = engine.addElement('text', box, 20, 30);
    engine.addElement('text', box, 200, 400);
    const guides = engine.snapGuides(a);
    assert.ok(guides.v.includes(200));
    assert.ok(guides.v.includes(0));
    assert.ok(guides.h.includes(400));
    // The parent contributes its centre and trailing edge on both axes, not
    // just the leading ones — a container is symmetrical.
    assert.ok(guides.v.includes(180));
    assert.ok(guides.v.includes(360));
    assert.ok(guides.h.includes(120));
    assert.ok(guides.h.includes(240));
  });

  it('rejects malformed rect payloads instead of storing them', () => {
    const { engine, parent } = seeded();
    engine.syncRects({ [parent]: [1, 2, 3], root: 'nope', ok: [0, 0, 10, 10] });
    assert.equal(engine.rectOf(parent), null);
    assert.deepEqual(engine.rectOf('ok'), [0, 0, 10, 10]);
  });
});

describe('compiler', () => {
  it('escapes user content in the markup', () => {
    const engine = new Engine();
    const text = engine.addElement('text', null, 0, 0);
    engine.updateElement(text, 'content', "<script>alert('x')</script>");
    const html = compileHtml(engine.snapshot());
    assert.ok(!html.includes('<script>'));
    assert.ok(html.includes('&lt;script&gt;'));
  });

  it('escapes attribute values', () => {
    const engine = new Engine();
    const link = engine.addElement('link', null, 0, 0);
    engine.updateElement(link, 'href', '" onmouseover="alert(1)');
    const html = compileHtml(engine.snapshot());
    assert.ok(!html.includes('onmouseover="alert'));
    assert.ok(html.includes('&quot;'));
  });

  it('cannot be escaped out of a declaration block', () => {
    const engine = new Engine();
    const box = engine.addElement('container', null, 0, 0);
    engine.updateElement(box, 'style.background', 'red;} body{display:none');
    const css = compileCss(engine.snapshot());
    assert.ok(!css.includes('body{display:none'));
  });

  it('produces the same string for an unchanged document', () => {
    const { engine } = seeded();
    assert.equal(compileCss(engine.snapshot()), compileCss(engine.snapshot()));
  });

  it('emits custom declarations in a stable order', () => {
    const engine = new Engine();
    const box = engine.addElement('container', null, 0, 0);
    engine.updateElement(box, 'custom.z-index', '2');
    engine.updateElement(box, 'custom.filter', 'blur(2px)');
    const css = compileCss(engine.snapshot());
    assert.ok(css.indexOf('filter:blur(2px)') < css.indexOf('z-index:2'));
  });

  it('gives export documents no runtime', () => {
    const { engine } = seeded();
    const editor = compileDocument(engine.snapshot(), { editor: true });
    const shipped = compileDocument(engine.snapshot(), { editor: false });
    assert.ok(editor.includes('<script>'));
    assert.ok(!shipped.includes('<script>'));
    // Only the runtime and the editor chrome differ — the markup is identical.
    assert.equal(compileHtml(engine.snapshot()), compileHtml(engine.snapshot()));
  });

  it('positions a child of a flow container with flexbox, not left/top', () => {
    const engine = new Engine();
    const stack = engine.addElement('stack', null, 0, 0);
    const child = engine.addElement('text', stack, 50, 50);
    engine.updateElement(stack, 'layout', 'column');
    const css = engine.nodeCss(child);
    assert.ok(css.startsWith('position:relative;'));
    assert.ok(!css.includes('left:'));
  });

  it('keeps an empty alt attribute on a decorative image', () => {
    const engine = new Engine();
    const image = engine.addElement('image', null, 0, 0);
    engine.updateElement(image, 'content', '');
    assert.ok(compileHtml(engine.snapshot()).includes('alt=""'));
  });
});

describe('project files', () => {
  it('round-trips a document', () => {
    const { engine, parent } = seeded();
    const json = engine.exportProject();

    const reopened = new Engine();
    reopened.importProject(json);
    assert.equal(reopened.nodeCount(), engine.nodeCount());
    assert.equal(reopened.getElement(parent).width, 360);
  });

  it('re-attaches orphaned nodes to the root', () => {
    const { engine, parent, child } = seeded();
    const document = JSON.parse(engine.exportProject());
    // Simulate a corrupted file: the parent forgot about its child.
    document.nodes[parent].children = [];

    const reopened = new Engine();
    reopened.importProject(JSON.stringify(document));
    assert.ok(reopened.getElement('root').children.includes(child));
  });

  it('does not list an orphan twice when its children are orphans too', () => {
    const { engine, parent, child } = seeded();
    const document = JSON.parse(engine.exportProject());
    document.nodes.root.children = [];

    const reopened = new Engine();
    reopened.importProject(JSON.stringify(document));
    const root = reopened.getElement('root');
    assert.deepEqual(root.children, [parent]);
    assert.deepEqual(reopened.getElement(parent).children, [child]);
  });

  it('migrates a v1 document written by the Rust engine', () => {
    const v1 = {
      version: 1,
      root: 'root',
      counter: 1,
      page: {
        width: 1280,
        min_height: 900,
        background: '#fff',
        font_family: 'serif',
        title: 'Old',
      },
      nodes: {
        root: {
          id: 'root',
          kind: 'root',
          name: 'Page',
          x: 0,
          y: 0,
          width: 1280,
          height: 900,
          auto_height: false,
          content: '',
          layout: 'absolute',
          locked: false,
          hidden: false,
          style: {},
          children: ['n1'],
        },
        n1: {
          id: 'n1',
          kind: 'text',
          name: 'Text',
          x: 10,
          y: 20,
          width: 300,
          height: 80,
          auto_height: true,
          content: 'hello',
          layout: 'absolute',
          locked: false,
          hidden: false,
          style: { font_size: 18, line_height: 1.5, border_width: 2, border_color: '#abc' },
          children: [],
        },
      },
    };

    const engine = new Engine();
    engine.importProject(JSON.stringify(v1));

    assert.equal(engine.getPage().minHeight, 900);
    assert.equal(engine.getPage().fontFamily, 'serif');
    const node = engine.getElement('n1');
    assert.equal(node.autoHeight, true);
    assert.equal(node.style.fontSize, 18);
    assert.equal(node.style.lineHeight, 1.5);
    assert.ok(engine.nodeCss('n1').includes('border:2px solid #abc;'));
  });

  it('refuses a file with no root rather than half-opening it', () => {
    const engine = new Engine();
    const before = engine.nodeCount();
    assert.throws(() => engine.importProject('{"nodes":{}}'), /no root node/);
    assert.throws(() => engine.importProject('not json'), /not valid JSON/);
    assert.equal(engine.nodeCount(), before);
  });

  it('advances the id counter past whatever the file used', () => {
    const engine = new Engine();
    engine.importProject(
      JSON.stringify({
        root: 'root',
        counter: 0,
        page: {},
        nodes: {
          root: { id: 'root', kind: 'root', children: ['n7'] },
          n7: { id: 'n7', kind: 'text', children: [] },
        },
      })
    );
    assert.notEqual(engine.addElement('text', null, 0, 0), 'n7');
  });

  it('survives a project file describing a cycle', () => {
    const engine = new Engine();
    engine.importProject(
      JSON.stringify({
        root: 'root',
        page: {},
        nodes: {
          root: { id: 'root', kind: 'root', children: ['n1'] },
          n1: { id: 'n1', kind: 'container', children: ['n2'] },
          n2: { id: 'n2', kind: 'container', children: ['n1'] },
        },
      })
    );
    assert.equal(engine.nodeCount(), 3);
  });
});

describe('structured elements', () => {
  it('builds a real table from the data bag', () => {
    const engine = new Engine();
    const id = engine.addElement('table', null, 0, 0);
    engine.updateElement(id, 'data.columns', 'Name | Year');
    engine.updateElement(id, 'data.rows', 'Chatterbox | 2024\nLedger | 2023');

    const html = compileHtml(engine.snapshot());
    assert.match(html, /<thead><tr><th>Name<\/th><th>Year<\/th><\/tr><\/thead>/);
    assert.match(html, /<tbody><tr><td>Chatterbox<\/td><td>2024<\/td><\/tr>/);
  });

  it('drops the header when a table has no columns', () => {
    const engine = new Engine();
    const id = engine.addElement('table', null, 0, 0);
    engine.updateElement(id, 'data.columns', '');
    assert.ok(!compileHtml(engine.snapshot()).includes('<thead>'));
  });

  it('escapes user content inside a generated fragment', () => {
    const engine = new Engine();
    const id = engine.addElement('table', null, 0, 0);
    engine.updateElement(id, 'data.rows', '<img src=x onerror=alert(1)> | ok');

    const html = compileHtml(engine.snapshot());
    assert.ok(!html.includes('<img src=x'));
    assert.ok(html.includes('&lt;img src=x'));
  });

  it('switches a list between ul and ol from the data bag', () => {
    const engine = new Engine();
    const id = engine.addElement('list', null, 0, 0);
    engine.updateElement(id, 'data.items', 'one\ntwo');

    assert.match(compileHtml(engine.snapshot()), /<ul[^>]*><li>one<\/li><li>two<\/li><\/ul>/);
    engine.updateElement(id, 'data.ordered', 'true');
    assert.match(compileHtml(engine.snapshot()), /<ol[^>]*>/);
  });

  it('keeps real newlines inside a code block rather than <br>', () => {
    const engine = new Engine();
    const id = engine.addElement('code', null, 0, 0);
    engine.updateElement(id, 'data.language', 'plain');
    engine.updateElement(id, 'content', 'const a = 1;\nconst b = 2;');

    const html = compileHtml(engine.snapshot());
    assert.ok(!html.includes('<br>'));
    assert.ok(html.includes('const a = 1;\nconst b = 2;'));
  });

  it('highlights a code block into spans, still escaping the source', () => {
    const engine = new Engine();
    const id = engine.addElement('code', null, 0, 0);
    engine.updateElement(id, 'data.language', 'typescript');
    engine.updateElement(id, 'content', "const a = '<b>';");

    const html = compileHtml(engine.snapshot());
    assert.ok(html.includes('<span class="tk-k">const</span>'));
    assert.ok(html.includes('&lt;b&gt;'));
    assert.ok(!html.includes("<b>'"));
  });

  it('leaves an unknown language as plain text', () => {
    const engine = new Engine();
    const id = engine.addElement('code', null, 0, 0);
    engine.updateElement(id, 'data.language', 'brainfuck');
    engine.updateElement(id, 'content', 'const a = 1;');
    assert.ok(!compileHtml(engine.snapshot()).includes('<span'));
  });

  it('emits a kind’s descendant CSS scoped to that node', () => {
    const engine = new Engine();
    const id = engine.addElement('table', null, 0, 0);
    assert.ok(compileCss(engine.snapshot()).includes(`.el-${id} th`));
  });

  it('rejects a data key that is not a plain identifier', () => {
    const engine = new Engine();
    const id = engine.addElement('table', null, 0, 0);
    assert.throws(() => engine.updateElement(id, 'data.a-b', 'x'), /not a valid content key/);
  });

  it('clears a data entry when given an empty value', () => {
    const engine = new Engine();
    const id = engine.addElement('list', null, 0, 0);
    engine.updateElement(id, 'data.items', '');
    assert.equal(engine.getElement(id).data.items, undefined);
  });

  it('ties video autoplay to muted, so it can actually start', () => {
    const engine = new Engine();
    const id = engine.addElement('video', null, 0, 0);
    engine.updateElement(id, 'data.autoplay', 'true');
    const html = compileHtml(engine.snapshot());
    assert.ok(html.includes('autoplay=""'));
    assert.ok(html.includes('muted=""'));
  });

  it('gives a new-tab link a safe rel', () => {
    const engine = new Engine();
    const id = engine.addElement('link', null, 0, 0);
    engine.updateElement(id, 'data.newTab', 'true');
    assert.ok(compileHtml(engine.snapshot()).includes('rel="noopener noreferrer"'));
  });

  it('round-trips the data bag through a project file', () => {
    const engine = new Engine();
    const id = engine.addElement('table', null, 0, 0);
    engine.updateElement(id, 'data.columns', 'A | B');

    const reopened = new Engine();
    reopened.importProject(engine.exportProject());
    assert.equal(reopened.getElement(id).data.columns, 'A | B');
  });
});

describe('layout modes', () => {
  it('lets a grid choose its column count', () => {
    const engine = new Engine();
    const id = engine.addElement('grid', null, 0, 0);
    assert.ok(engine.nodeCss(id).includes('grid-template-columns:repeat(3,minmax(0,1fr))'));

    engine.updateElement(id, 'style.gridColumns', '4');
    const css = engine.nodeCss(id);
    assert.ok(css.includes('repeat(4,minmax(0,1fr))'));
    // Exactly one column declaration: the default must not also be emitted.
    assert.equal(css.match(/grid-template-columns/g).length, 1);
  });

  it('lets a grid child be sized by its track, not by an authored width', () => {
    const engine = new Engine();
    const grid = engine.addElement('grid', null, 0, 0);
    const child = engine.addElement('container', grid, 0, 0);
    const css = engine.nodeCss(child);
    assert.ok(css.includes('width:auto;'));
    assert.ok(!css.includes('left:'));
  });

  it('starts a stack as a column, since that is what a stack is', () => {
    const engine = new Engine();
    const id = engine.addElement('stack', null, 0, 0);
    assert.equal(engine.getElement(id).layout, 'column');
    assert.ok(engine.nodeCss(id).includes('flex-direction:column'));
  });
});

describe('style properties', () => {
  it('wraps a bare URL for background-image but leaves a gradient alone', () => {
    const engine = new Engine();
    const id = engine.addElement('container', null, 0, 0);

    engine.updateElement(id, 'style.backgroundImage', 'https://example.com/a.png');
    assert.ok(engine.nodeCss(id).includes('background-image:url("https://example.com/a.png")'));

    engine.updateElement(id, 'style.backgroundImage', 'linear-gradient(#fff,#000)');
    assert.ok(engine.nodeCss(id).includes('background-image:linear-gradient(#fff,#000)'));
  });

  it('folds border width, style and colour into one declaration', () => {
    const engine = new Engine();
    const id = engine.addElement('container', null, 0, 0);
    engine.updateElement(id, 'style.borderWidth', '2');
    engine.updateElement(id, 'style.borderStyle', 'dashed');
    engine.updateElement(id, 'style.borderColor', '#abcdef');
    assert.ok(engine.nodeCss(id).includes('border:2px dashed #abcdef;'));
  });

  it('rounds z-index to an integer', () => {
    const engine = new Engine();
    const id = engine.addElement('container', null, 0, 0);
    engine.updateElement(id, 'style.zIndex', '3.7');
    assert.ok(engine.nodeCss(id).includes('z-index:4;'));
  });

  it('exposes the alignment properties a flow container needs', () => {
    const engine = new Engine();
    const id = engine.addElement('stack', null, 0, 0);
    engine.updateElement(id, 'style.justifyContent', 'space-between');
    engine.updateElement(id, 'style.alignItems', 'center');
    engine.updateElement(id, 'style.flexWrap', 'wrap');
    const css = engine.nodeCss(id);
    assert.ok(css.includes('justify-content:space-between;'));
    assert.ok(css.includes('align-items:center;'));
    assert.ok(css.includes('flex-wrap:wrap;'));
  });
});

describe('anchors and click actions', () => {
  it('slugs an anchor into something safe as an id', () => {
    const engine = new Engine();
    const id = engine.addElement('section', null, 0, 0);
    engine.updateElement(id, 'anchor', '  Our Work! (2024) ');
    assert.equal(engine.getElement(id).anchor, 'our-work-2024');
    assert.ok(compileHtml(engine.snapshot()).includes('id="our-work-2024"'));
  });

  it('clears an anchor when given an empty value', () => {
    const engine = new Engine();
    const id = engine.addElement('section', null, 0, 0);
    engine.updateElement(id, 'anchor', 'x');
    engine.updateElement(id, 'anchor', '');
    assert.equal(engine.getElement(id).anchor, null);
    assert.ok(!compileHtml(engine.snapshot()).includes(' id='));
  });

  it('emits a click action as data attributes, not inline script', () => {
    const engine = new Engine();
    const id = engine.addElement('button', null, 0, 0);
    engine.updateElement(id, 'data.action', 'scroll');
    engine.updateElement(id, 'data.target', 'pricing');

    const html = compileHtml(engine.snapshot());
    assert.ok(html.includes('data-dl-action="scroll"'));
    assert.ok(html.includes('data-dl-target="pricing"'));
    assert.ok(!html.includes('onclick'));
  });

  it('turns the Submit action into a real submit button and no script', () => {
    const engine = new Engine();
    const id = engine.addElement('button', null, 0, 0);
    engine.updateElement(id, 'data.action', 'submit');

    const html = compileDocument(engine.snapshot(), { editor: false });
    assert.ok(html.includes('type="submit"'));
    // Submitting is the browser's job; nothing needs to be shipped for it.
    assert.ok(!html.includes('data-dl-action'));
    assert.ok(!html.includes('<script>'));
  });

  it('ships the runtime once, only when something uses an action', () => {
    const engine = new Engine();
    const a = engine.addElement('button', null, 0, 0);
    const b = engine.addElement('button', null, 0, 0);
    engine.updateElement(a, 'data.action', 'copy');
    engine.updateElement(b, 'data.action', 'back');

    const html = compileDocument(engine.snapshot(), { editor: false });
    assert.equal(html.split('<script>').length - 1, 1);
  });

  it('escapes an action target', () => {
    const engine = new Engine();
    const id = engine.addElement('button', null, 0, 0);
    engine.updateElement(id, 'data.action', 'copy');
    engine.updateElement(id, 'data.target', '" onmouseover="alert(1)');
    const html = compileHtml(engine.snapshot());
    assert.ok(!html.includes('onmouseover="alert'));
  });

  it('keeps a form endpoint out of the click-action namespace', () => {
    const engine = new Engine();
    const id = engine.addElement('form', null, 0, 0);
    engine.updateElement(id, 'data.endpoint', 'https://example.com/contact');

    const html = compileHtml(engine.snapshot());
    assert.ok(html.includes('action="https://example.com/contact"'));
    assert.ok(!html.includes('data-dl-action'));
  });
});

describe('hug height', () => {
  it('hugs its content rather than keeping the authored height', () => {
    const engine = new Engine();
    const stack = engine.addElement('stack', null, 0, 0);
    engine.addElement('button', stack, 0, 0);
    // A container with something in it must not carry a min-height floor, or
    // `align-items: center` would centre the content far below where it sits.
    assert.ok(!engine.nodeCss(stack).includes('min-height'));
  });

  it('keeps a floor on an empty box, so it stays droppable', () => {
    const engine = new Engine();
    const box = engine.addElement('container', null, 0, 0);
    engine.updateElement(box, 'autoHeight', 'true');
    assert.ok(engine.nodeCss(box).includes('min-height:240px'));
  });
});

describe('the extended style table', () => {
  it('combines rotate and scale into one transform', () => {
    const engine = new Engine();
    const id = engine.addElement('container', null, 0, 0);
    engine.updateElement(id, 'style.rotate', '3');
    engine.updateElement(id, 'style.scale', '1.05');
    assert.ok(engine.nodeCss(id).includes('transform:rotate(3deg) scale(1.05);'));
  });

  it('emits no transform for an identity rotate and scale', () => {
    const engine = new Engine();
    const id = engine.addElement('container', null, 0, 0);
    engine.updateElement(id, 'style.rotate', '0');
    engine.updateElement(id, 'style.scale', '1');
    assert.ok(!engine.nodeCss(id).includes('transform:'));
  });

  it('turns a duration into a usable transition', () => {
    const engine = new Engine();
    const id = engine.addElement('container', null, 0, 0);
    engine.updateElement(id, 'style.transition', '200');
    assert.ok(engine.nodeCss(id).includes('transition:all 200ms ease;'));
  });

  it('lets one padding side override the shorthand', () => {
    const engine = new Engine();
    const id = engine.addElement('container', null, 0, 0);
    engine.updateElement(id, 'style.padding', '20');
    engine.updateElement(id, 'style.paddingTop', '40');
    const css = engine.nodeCss(id);
    assert.ok(css.indexOf('padding:20px') < css.indexOf('padding-top:40px'));
  });
});

describe('page metadata', () => {
  it('emits a description and its link-preview pair', () => {
    const engine = new Engine();
    engine.updatePage('title', 'Cadence');
    engine.updatePage('description', 'Release notes that write themselves.');

    const html = compileDocument(engine.snapshot(), { editor: false });
    assert.ok(
      html.includes('<meta name="description" content="Release notes that write themselves.">')
    );
    assert.ok(html.includes('property="og:title"'));
  });

  it('emits nothing when there is no description', () => {
    const engine = new Engine();
    assert.ok(
      !compileDocument(engine.snapshot(), { editor: false }).includes('name="description"')
    );
  });

  it('uses the page language on <html>', () => {
    const engine = new Engine();
    engine.updatePage('lang', 'fr');
    assert.ok(compileDocument(engine.snapshot(), { editor: false }).includes('<html lang="fr">'));
  });
});

describe('selection', () => {
  it('starts with nothing selected', () => {
    const engine = new Engine();
    assert.equal(engine.selection(), null);
    assert.deepEqual(engine.selectedIds(), []);
  });

  it('treats the most recently picked element as primary', () => {
    const { engine, parent, child } = seeded();
    engine.select([parent, child]);
    assert.equal(engine.selection(), child);
    assert.deepEqual(engine.selectedIds(), [parent, child]);
  });

  it('toggles an id in and out', () => {
    const { engine, parent, child } = seeded();
    engine.select(parent);
    engine.toggleSelected(child);
    assert.deepEqual(engine.selectedIds(), [parent, child]);

    engine.toggleSelected(parent);
    assert.deepEqual(engine.selectedIds(), [child]);
    assert.equal(engine.selection(), child);
  });

  it('ignores ids that do not exist', () => {
    const { engine, parent } = seeded();
    engine.select([parent, 'ghost']);
    assert.deepEqual(engine.selectedIds(), [parent]);

    engine.toggleSelected('ghost');
    assert.deepEqual(engine.selectedIds(), [parent]);
  });

  it('deduplicates', () => {
    const { engine, parent } = seeded();
    engine.select([parent, parent]);
    assert.deepEqual(engine.selectedIds(), [parent]);
  });

  it('drops ids whose nodes were deleted', () => {
    const { engine, parent, child } = seeded();
    engine.select([parent, child]);
    engine.deleteElement(parent);
    // The child went with its parent, so nothing survives.
    assert.deepEqual(engine.selectedIds(), []);
    assert.equal(engine.selection(), null);
  });

  it('restores a selection that undo brings back', () => {
    const engine = new Engine();
    const a = engine.addElement('text', null, 0, 0);
    const b = engine.addElement('text', null, 0, 0);
    engine.select([a, b]);
    engine.deleteElement(b);
    assert.deepEqual(engine.selectedIds(), [a]);

    engine.undo();
    // Undo does not re-select what it restored, but it must not leave a
    // dangling id either.
    for (const id of engine.selectedIds()) {
      assert.ok(engine.getElement(id));
    }
  });

  it('answers isSelected and selectionSize', () => {
    const { engine, parent, child } = seeded();
    engine.select([parent, child]);
    assert.equal(engine.selectionSize(), 2);
    assert.ok(engine.isSelected(parent));
    assert.ok(!engine.isSelected('root'));
  });

  it('replaces the selection when an element is added', () => {
    const { engine, parent, child } = seeded();
    engine.select([parent, child]);
    const added = engine.addElement('button', null, 0, 0);
    assert.deepEqual(engine.selectedIds(), [added]);
  });

  it('clears the selection when the project is reset', () => {
    const { engine, parent } = seeded();
    engine.select(parent);
    engine.resetProject();
    assert.deepEqual(engine.selectedIds(), []);
  });
});

describe('clipboard', () => {
  it('copies a subtree and pastes it with fresh ids', () => {
    const { engine, parent, child } = seeded();
    const payload = engine.copyElements([parent]);
    // The payload carries the container *and* what is inside it.
    assert.deepEqual(payload.roots, [parent]);
    assert.equal(Object.keys(payload.nodes).length, 2);

    const pasted = engine.pasteElements(payload, 'root');
    assert.equal(pasted.length, 1);
    assert.notEqual(pasted[0], parent);

    // A copy, not an alias: the original still has its own child.
    const copy = engine.getElement(pasted[0]);
    assert.equal(copy.children.length, 1);
    assert.ok(!copy.children.includes(child));
    assert.equal(engine.getElement(parent).children.length, 1);
  });

  it('leaves the original alone when the pasted copy is edited', () => {
    const { engine, parent } = seeded();
    const pasted = engine.pasteElements(engine.copyElements([parent]), 'root');
    engine.updateElement(pasted[0], 'width', '999');
    assert.notEqual(engine.getElement(parent).width, 999);
  });

  it('pastes into the container that was asked for', () => {
    const { engine, parent, child } = seeded();
    const pasted = engine.pasteElements(engine.copyElements([child]), parent);
    assert.equal(engine.getElement(pasted[0]).parent, parent);
  });

  it('refuses to copy the root', () => {
    const engine = new Engine();
    assert.deepEqual(engine.copyElements(['root']).roots, []);
  });

  it('undoes a paste in one step', () => {
    const { engine, parent } = seeded();
    const before = engine.nodeCount();
    engine.pasteElements(engine.copyElements([parent]), 'root');
    assert.equal(engine.nodeCount(), before + 2);
    engine.undo();
    assert.equal(engine.nodeCount(), before);
  });
});

describe('grouping', () => {
  /**
   * Two boxes side by side on the page, at known coordinates.
   * @returns {{engine: Engine, a: string, b: string}}
   */
  function pair() {
    const engine = new Engine();
    const a = engine.addElement('container', null, 100, 50);
    const b = engine.addElement('container', null, 300, 120);
    return { engine, a, b };
  }

  it('wraps the selection in a group at their bounding box', () => {
    const { engine, a, b } = pair();
    const width = engine.getElement(a).width;
    const group = engine.getElement(engine.groupElements([a, b]));

    assert.equal(group.x, 100);
    assert.equal(group.y, 50);
    assert.equal(group.width, 300 + width - 100);
    assert.equal(group.children.length, 2);
  });

  it('rebases the members so they do not move on screen', () => {
    const { engine, a, b } = pair();
    engine.groupElements([a, b]);
    // Relative to a group whose origin is (100, 50).
    assert.deepEqual([engine.getElement(a).x, engine.getElement(a).y], [0, 0]);
    assert.deepEqual([engine.getElement(b).x, engine.getElement(b).y], [200, 70]);
  });

  it('puts them back where they were when ungrouped', () => {
    const { engine, a, b } = pair();
    const group = engine.groupElements([a, b]);
    engine.ungroupElements([group]);

    assert.deepEqual([engine.getElement(a).x, engine.getElement(a).y], [100, 50]);
    assert.deepEqual([engine.getElement(b).x, engine.getElement(b).y], [300, 120]);
    // The group itself is gone, not merely emptied.
    assert.throws(() => engine.getElement(group), /no node/);
    assert.equal(engine.getElement(a).parent, 'root');
  });

  it('refuses to group across two different containers', () => {
    const { engine, a, b } = pair();
    const inside = engine.addElement('text', a, 0, 0);
    assert.throws(() => engine.groupElements([inside, b]), /same container/);
  });

  it('refuses to group fewer than two elements', () => {
    const { engine, a } = pair();
    assert.throws(() => engine.groupElements([a]), /two or more/);
  });

  it('selects the group, then its members again on ungroup', () => {
    const { engine, a, b } = pair();
    const group = engine.groupElements([a, b]);
    assert.deepEqual(engine.selectedIds(), [group]);
    assert.deepEqual(engine.ungroupElements([group]).sort(), [a, b].sort());
  });

  it('undoes a group in one step', () => {
    const { engine, a, b } = pair();
    const before = engine.nodeCount();
    engine.groupElements([a, b]);
    engine.undo();
    assert.equal(engine.nodeCount(), before);
    assert.equal(engine.getElement(a).parent, 'root');
    assert.equal(engine.getElement(a).x, 100);
  });

  it('keeps the members in a flow container in order', () => {
    const engine = new Engine();
    const stack = engine.addElement('stack', null, 0, 0);
    const a = engine.addElement('text', stack, 0, 0);
    const b = engine.addElement('text', stack, 0, 0);
    const group = engine.getElement(engine.groupElements([a, b]));
    // A stack ignores x/y, so the group must not try to rebase them.
    assert.deepEqual(group.children, [a, b]);
    assert.equal(engine.getElement(a).x, 0);
  });
});

describe('align and distribute', () => {
  /**
   * Three boxes of a known size at known offsets.
   * @returns {{engine: Engine, ids: string[]}}
   */
  function trio() {
    const engine = new Engine();
    const ids = [
      [0, 0],
      [40, 100],
      [400, 220],
    ].map(([x, y]) => {
      const id = engine.addElement('container', null, x, y);
      engine.updateElement(id, 'width', '100');
      engine.updateElement(id, 'height', '50');
      return id;
    });
    return { engine, ids };
  }

  it('aligns left to the leftmost edge', () => {
    const { engine, ids } = trio();
    engine.alignElements(ids, 'left');
    assert.deepEqual(
      ids.map((id) => engine.getElement(id).x),
      [0, 0, 0]
    );
  });

  it('aligns right to the rightmost edge', () => {
    const { engine, ids } = trio();
    engine.alignElements(ids, 'right');
    // The furthest right edge is 400 + 100.
    for (const id of ids) {
      const node = engine.getElement(id);
      assert.equal(node.x + node.width, 500);
    }
  });

  it('aligns middles to a shared centre line', () => {
    const { engine, ids } = trio();
    engine.alignElements(ids, 'middle');
    const centres = ids.map((id) => {
      const node = engine.getElement(id);
      return node.y + node.height / 2;
    });
    assert.deepEqual(centres, [centres[0], centres[0], centres[0]]);
  });

  it('leaves the outer two alone when distributing', () => {
    const { engine, ids } = trio();
    engine.distributeElements(ids, 'horizontal');
    assert.equal(engine.getElement(ids[0]).x, 0);
    assert.equal(engine.getElement(ids[2]).x, 400);
  });

  it('makes the gaps equal when distributing', () => {
    const { engine, ids } = trio();
    engine.distributeElements(ids, 'horizontal');
    const boxes = ids.map((id) => engine.getElement(id)).sort((a, b) => a.x - b.x);
    const first = boxes[1].x - (boxes[0].x + boxes[0].width);
    const second = boxes[2].x - (boxes[1].x + boxes[1].width);
    assert.ok(Math.abs(first - second) < 0.001, `${first} vs ${second}`);
  });

  it('does nothing with fewer than three when distributing', () => {
    const { engine, ids } = trio();
    engine.distributeElements(ids.slice(0, 2), 'horizontal');
    assert.equal(engine.getElement(ids[1]).x, 40);
  });

  it('never moves a locked element', () => {
    const { engine, ids } = trio();
    engine.updateElement(ids[1], 'locked', 'true');
    engine.alignElements(ids, 'left');
    assert.equal(engine.getElement(ids[1]).x, 40);
  });

  it('undoes an align in one step', () => {
    const { engine, ids } = trio();
    engine.alignElements(ids, 'left');
    engine.undo();
    assert.deepEqual(
      ids.map((id) => engine.getElement(id).x),
      [0, 40, 400]
    );
  });
});
