# Contributing

The codebase is organised so that the most common changes — a new element, a
new property, a new panel — are each a short, obvious edit in a known place. If
a change you want to make feels like it needs edits scattered across many
files, that is a design bug in this project, not in your patch; please open an
issue and say so.

You need nothing installed to work on this. Clone it, run `python serve.py`,
edit a file, refresh.

---

## Ground rules

1. **No dependencies.** No frameworks, no UI libraries, no state managers, no
   npm packages at runtime, no CDN links. Standard Web Platform APIs only. This
   is the project's defining constraint, not a preference. ESLint and Prettier
   are the only permitted devDependencies, and the project must work without
   them.
2. **No build step.** What is in the repository is what runs in the browser. A
   change that requires compiling, transpiling or bundling before the page
   works is out of scope.
3. **The engine owns the document.** If you find yourself caching node data in
   a panel, stop: read it from the engine instead.
4. **Validate at the boundary, throw a sentence.** Engine methods that can fail
   throw an `Error` whose message reads like something a person should see —
   `` `width` expects a number, received `wide` `` — because that message
   ends up in the status bar. Never return `undefined` to mean "it failed".
5. **Document the _why_.** Every module opens with a doc comment explaining
   what it is responsible for. Exported functions get JSDoc. Comments explain
   why something is the way it is, not what the next line does.
6. **Keep it readable.** 2-space indent, single quotes, semicolons;
   `kebab-case` files, `PascalCase` classes, `camelCase` members. `npm run
format` settles the rest.

Before opening a pull request:

```bash
node --test "tests/unit/*.test.js"   # must pass
node tests/run-browser-tests.mjs     # must pass
npm install && npm run lint          # optional, but CI runs it
```

### Three rules that exist because breaking them cost real debugging time

**1. A panel host must have a height.** Every shell slot in `css/shell.css` is
a grid container and `SHARED_CSS` sets `:host { height: 100% }`. If you add a
panel and lay its slot out as a plain block, `:host` collapses to zero height,
its absolutely-positioned contents still paint, and you get a panel you can see
but cannot click. Nothing throws; the editor just stops responding to the
mouse.

**2. Do not reach for the HTML5 Drag and Drop API.** Use
`core/drag-controller.js`. Native DnD misbehaves across shadow boundaries and
on form controls, and — decisively — it cannot be driven from a test, because a
native drag cannot be started by script.

**3. Nothing on a pointer path may become asynchronous.** `hitTest`,
`dropTarget`, `snapGuides` and `nodeCss` are called inside `pointermove`
handlers. They stay synchronous and on the main thread. If you need to move
work off-thread, it belongs in the compile worker, and it must not be something
a gesture waits for.

---

## Add a new element type

Say you want an **Accordion** primitive. Two edits, three if it needs its own
inspector fields.

### 1. Add a row to the element table — `js/engine/kinds.js`

```js
accordion: {
  label: 'Accordion',
  tag: 'details',
  size: [480, 64],
  hugHeight: true,
  content: 'What is your refund policy?',
  data: { body: 'Thirty days, no questions asked.' },
  attrs: (node) => ({ open: node.data?.open === 'true' ? '' : null }),
  body: (node) => [
    { tag: 'summary', text: node.content },
    { tag: 'div', text: node.data?.body },
  ],
  style: { padding: 16, borderWidth: 1, borderColor: '#dfe4ec', radius: 10 },
  descendantCss: '& summary{cursor:pointer;font-weight:600}& div{margin-top:10px}',
},
```

| Field           | Meaning                                                      |
| --------------- | ------------------------------------------------------------ |
| `label`         | human name, also the default layer name                      |
| `tag`           | the HTML tag, or `(node) => tag` when it depends on the node |
| `container`     | may hold children — the drop router only nests into these    |
| `layout`        | starting layout mode for its children, default `'absolute'`  |
| `void`          | no closing tag and no children (`<img>`, `<input>`, `<hr>`)  |
| `text`          | gives it a Content field and double-click-to-edit            |
| `size`          | `[width, height]` when first dropped                         |
| `hugHeight`     | start with `height:auto` and let content size the box        |
| `content`       | starting body text                                           |
| `attributes`    | starting values for `href` / `src` / `placeholder`           |
| `data`          | starting values for the `data` bag (below)                   |
| `custom`        | starting raw CSS declarations                                |
| `attrs`         | `(node) => ({name: value})` — the HTML attributes to emit    |
| `body`          | `(node) => Fragment` — the element's inner markup            |
| `descendantCss` | static CSS for the descendants `body` generates              |

Add an alias to `KIND_ALIASES` if a template or a hand-written project file
might spell it differently (`'faq'`, say).

**`attrs`** returns `null` or `undefined` for an attribute that should be
skipped, and `''` for one that should be emitted empty — `alt=""` on a
decorative image is meaningful and dropping it is an accessibility bug.

**`body`** returns a _fragment spec_, not an HTML string:

- a string → escaped text
- `{tag, attrs?, text?, children?}` → one element
- an array → several of those, in order
- `null` → nothing

The compiler escapes every `text` and every attribute value while rendering it,
so a `body` hook cannot emit unescaped user content even by mistake. **Never
change it to return a string.** That is the whole point of the structure.

A kind that defines `body` owns its inner markup completely — the ordinary
`content` path is skipped rather than added to.

**`descendantCss`** is author-written CSS with `&` standing in for the node's
class selector. It never contains user input, which is why it is the one thing
reaching the compiler that is not escaped. Do not interpolate anything from a
node into it.

### The `data` bag

Content that will not fit in one string — a table's rows, a video's autoplay
flag — lives in `node.data`, a flat `{string: string}` map. Declare the
starting values in your row's `data`, read them in `body` or `attrs`, and
expose them in the inspector as `data.<key>`.

Use it instead of adding a typed field to `WebNode` for something only your
element needs, and instead of modelling sub-parts as real child nodes: a table
whose cells were nodes would fill the Layers tree with hundreds of rows nobody
wants to select, and would need nesting rules for what may be dropped into a
`<tr>`.

Anything under `data.` triggers a full recompile rather than a CSS patch —
`isStructural` in `js/core/app.js` already handles that, so there is nothing
to add there.

### 2. Put it in the palette — `js/registry/elements.js`

```js
{
  kind: 'accordion',        // must match the key in ELEMENT_KINDS
  shortcut: 'O',            // must be unique across the whole palette
  label: 'Accordion',
  icon: 'accordion',        // a key in js/ui/icons.js
  hint: 'Collapsible question and answer',
  container: false,
}
```

Add the `accordion` glyph to `GLYPHS` in `js/ui/icons.js` — a 16×16 stroke
path on a 16-unit grid. **Square corners**: rectangles carry no `rx`, and the
set is stroked at 1.25 with mitred joins. See the note at the top of that file
for why.

The palette registry checks itself against `ELEMENT_KINDS` at load, so a typo
in `kind`, or a `container` flag that disagrees with the engine, shows up as a
console error the first time you open the editor rather than as a puzzle later.

### 3. Give it inspector fields — `js/registry/inspector-schema.js`

Extend an existing section's `when` predicate, or add a field:

```js
{
  key: 'src',
  label: 'Video URL',
  type: 'text',
  span: 2,
  read: read('src'),
  when: (node) => node.kind === 'video',
}
```

Reload. Drag, drop, select, nest, style, undo, export — all of it already
works, because nothing else in the engine or the UI branches on element type.

Add a test in `tests/unit/engine.test.js` while you are there; it takes three
lines and runs in a millisecond.

---

## Add a new CSS property

### 1. One row in `js/engine/style.js`

```js
{ key: 'blur', css: 'filter', input: 'number', format: (v) => `blur(${num(v)}px)` },
```

| Field    | Meaning                                                                                                             |
| -------- | ------------------------------------------------------------------------------------------------------------------- |
| `key`    | the name used in `style.<key>` paths, camelCase                                                                     |
| `css`    | the CSS property it emits, or `null` if another field emits it                                                      |
| `input`  | `'text'` or `'number'` — how a typed value is validated                                                             |
| `format` | turns the stored value into the CSS side of the declaration                                                         |
| `emit`   | optional override producing the whole declaration, for a property built from more than one field (see `emitBorder`) |

`format` is where a property earns its keep. `gridColumns` stores the integer
`3` and formats it as `repeat(3,minmax(0,1fr))`; `backgroundImage` wraps a bare
URL in `url("…")` but passes a `linear-gradient(…)` straight through. Put that
knowledge in the formatter, not in the inspector and not in the compiler.

**Position matters.** `STYLE_FIELDS` is emitted in array order, and that order
is what keeps an unchanged document compiling to a byte-identical string. Put
the row where it belongs semantically and leave the others alone.

### 2. One descriptor in `js/registry/inspector-schema.js`

```js
{
  key: 'style.blur',        // same path the engine uses
  label: 'Blur',
  type: 'number',
  min: 0,
  step: 1,
  live: true,               // slider/colour drags skip the undo stack
  read: read('style.blur', ''),
}
```

`key` and `read` name the same path — that is deliberate, and if you find
yourself writing two different spellings, something is wrong.

Field types available today: `number`, `text`, `textarea`, `color`, `select`,
`segmented`, `toggle`, `slider`. Adding a new one means one `case` in
`DlInspector._renderField` and, if it is interactive, a branch in
`_onInput` / `_onClick`.

If the property cannot be expressed as an inline style patch — it changes
markup, or affects how children are laid out — add its key to `STRUCTURAL_KEYS`
in `js/core/app.js` so it triggers a full recompile instead of a patch.

---

## Add a click action

`js/engine/actions-runtime.js` owns what a button or link does when clicked.
Adding one is two edits in that file:

1. A row in `ACTIONS`, which is what the inspector renders:

   ```js
   { value: 'reveal', label: 'Reveal a section', target: 'Anchor name of the target' },
   ```

   An empty `target` means the action needs no Target field; the inspector
   hides it automatically.

2. A `case` in the runtime's click handler.

The compiler emits actions as `data-dl-action` / `data-dl-target` attributes
and ships the runtime only when at least one element uses one — so a page of
text and images still exports with no `<script>`. Keep it that way: never
inline an `onclick`, and never make the runtime unconditional.

`submit` is the exception that proves the rule. It has no `case`, because the
compiler gives that button `type="submit"` and the browser does the rest.

## Add a language to the code block

One entry in `GRAMMARS` in `js/engine/highlight.js`:

```js
sql: [
  [COMMENT, /--[^
]*/y],
  [STRING, /'(?:\.|[^'\])*'/y],
  [KEYWORD, wordsOf('select from where join group by having limit')],
  [PUNCT, /[(),;*=<>]+/y],
],
```

Plus the id in `LANGUAGES` and a display name in `LANGUAGE_LABELS` in
`js/registry/inspector-schema.js`.

Three rules, all of which the existing grammars follow:

- **Every pattern is sticky (`/y`).** The scanner tries each at the current
  index; a non-sticky pattern would match anywhere ahead and produce nonsense.
- **Order is the design.** `comment` before `punct`, or `//` is two slashes.
- **The highlighter returns a fragment spec, never a string.** That is what
  makes the compiler escape the source. Do not "optimise" it into HTML.

## Add a template

One file in `js/templates/` and one row in `js/templates/index.js`:

```js
{
  id: 'agency',
  name: 'Agency site',
  summary: 'Services, case studies, and a booking form.',
  tags: ['Nav', 'Grid', 'Form'],
  build: agency.build,
}
```

A template is a function returning `{page, nodes}` — the same data
`applyTemplate` replays through the engine, so it has no privileged access and
cannot express anything you could not build by hand.

Build it out of `js/templates/parts.js`. The one rule that matters:

**Anything whose height depends on text must be a flow container.** Sections
sit at explicit `y` positions, because a page's bands are a layout decision.
Everything inside them — a heading over its copy, a column of buttons, an
article — is a `stack`, because you cannot know how tall a paragraph wraps to.
Every layout bug these templates have had came from guessing that number.

`tests/unit/templates.test.js` replays every template through the real engine,
so a property the engine would reject, a `ref` that never resolves, or a nav
link pointing at an anchor nothing carries all fail there rather than in
somebody's browser. Adding a template needs no new test.

## Add a panel

1. Create `js/ui/components/devlove-thing.js`, extend `PanelElement`, implement
   `static styles`, `template()` and `mounted()`, and call
   `customElements.define('devlove-thing', devloveThing)` at the bottom.
2. Subscribe with `this.listen(topic, handler)` and bind DOM events with
   `this.bind(target, type, handler)` — both are torn down automatically on
   disconnect.
3. Add `<devlove-thing>` to `index.html` and a slot for it in the `.shell` grid
   in `css/shell.css`. **Make the slot a grid container** (see rule 1 above).
4. Import it in `js/main.js`.

Read state from `app.state` and from the engine; never keep your own copy.

---

## Add a keyboard shortcut

One entry in `BINDINGS` in `js/core/shortcuts.js`:

```js
{ keys: 'ctrl+shift+d', description: 'Detach from parent', group: 'Arrange', run: () => … },
```

Modifier order in the signature is `ctrl`, `alt`, `shift`, then the lowercased
`event.key`. `ctrl` also matches `⌘`. Typing contexts are excluded
automatically, including inside shadow roots.

`group` is which section of the `?` overlay it appears under — `Edit`,
`Select`, `Arrange` or `View`. There is nothing else to update: `dl-help`
renders that table directly, so the shortcut is documented the moment it
exists. `description` is the line a user reads, so write it as one.

---

## Add an engine method

1. Put the real logic in the module that owns that concern —
   `engine/document.js` for tree changes, `engine/geometry.js` for anything
   answered from measured boxes. Those functions take `doc` as their first
   argument, mutate it, and **never record history**.
2. Expose it on `Engine` in `engine/index.js`. Decide the history policy there:

   - a structural change wraps its body in `this._guard(...)`, which takes a
     checkpoint and discards it if the mutation throws;
   - a gesture fast path (`moveElement`, `resizeElement`) records nothing — the
     canvas takes one checkpoint when the gesture begins. Say which in the doc
     comment.

3. If it returns node data, return a copy (`structuredClone`), not a live
   reference.
4. Wrap it in a command method on `DevloveApp` so panels never call the engine
   directly, and decide whether it needs `invalidate()` (full recompile) or
   `_queuePatch(id)` (one declaration block).
5. Add a unit test.

---

## Work on the compile worker

`js/workers/compile.worker.js` is stateless on purpose: every message carries
the whole document, and the answer is a string. Keep it that way. Adding a
cache, or a copy of the document held between messages, reintroduces exactly
the synchronisation bugs this design avoids.

Two things to hold on to:

- It imports the same `engine/compiler.js` the main thread does. Do not write a
  worker-only variant of anything — one compiler, or the preview and the export
  will eventually disagree.
- Every job needs an inline equivalent in `core/compile-service.js`, because
  the worker may not exist (no `Worker`, a `file://` page, a restrictive CSP)
  and may die mid-job. `_run(job, doc, options, inline)` takes that fallback as
  its last argument, and it is not optional.

---

## Retheme the editor

Every colour and metric is a custom property in `css/tokens.css`. Because
custom properties cross shadow boundaries, editing that one file restyles every
panel. Do not hard-code a colour inside a component.

---

## Testing

**The engine is testable without a browser.** It has no DOM access at all, so:

```js
import assert from 'node:assert/strict';
import { it } from 'node:test';
import { Engine } from '../../js/engine/index.js';

it('deleting a container removes its children', () => {
  const engine = new Engine();
  const parent = engine.addElement('container', null, 0, 0);
  const child = engine.addElement('text', parent, 0, 0);
  engine.deleteElement(parent);
  assert.throws(() => engine.getElement(child));
});
```

```bash
node --test "tests/unit/*.test.js"
```

No install, no config, no framework. If your change is to anything under
`js/engine/`, it should come with a test here.

**The browser suite is for interaction.** `tests/run-browser-tests.mjs` drives
the real editor over the DevTools protocol with genuine input events. Add to it
when your change affects a gesture, and to `tests/smoke.html` when it affects
the engine ↔ worker ↔ preview-frame contract.

For anything visual, exercise it by hand and say in the pull request what you
checked — at minimum: drag, resize, undo, preview and export.

---

## Reporting a bug

The status bar is where the engine reports refusals, so include what it said
alongside anything in the console. Documents are plain JSON — attaching a saved
`.devlove.json` usually turns a vague report into a one-line reproduction.
