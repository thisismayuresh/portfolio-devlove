# Architecture

Three parts, one rule: **the engine owns the document, the browser owns the
pixels, and a worker does the expensive string building.** Nothing is mirrored,
so there is no state to keep in sync and no class of bug where the UI and the
model disagree.

Everything is plain ES modules. There is no build step, no bundler, and no
dependency — what you read in `js/` is byte-for-byte what runs in the browser.

```
┌─────────────────────── browser main thread ────────────────────────┐
│                                                                    │
│  Web Components (Shadow DOM)                                       │
│  ┌──────────┐ ┌──────────┐ ┌─────────────┐ ┌───────────┐           │
│  │ toolbar  │ │ palette  │ │   canvas    │ │ inspector │  layers … │
│  └────┬─────┘ └────┬─────┘ └──────┬──────┘ └─────┬─────┘           │
│       │  commands  │              │              │                 │
│       └────────────┴──────┬───────┴──────────────┘                 │
│                           ▼                                        │
│                    core/app.js  ──── the only engine caller        │
│                     │        ▲                                     │
│         calls       │        │  topics (ready/document/geometry/…) │
│                     ▼        │                                     │
│              ┌──────────────────────┐                              │
│              │      Engine          │   js/engine/ — plain JS      │
│              │  document · history  │                              │
│              │  hit test · nodeCss  │                              │
│              └───────┬──────────────┘                              │
│                      │ snapshot (structured-cloned)                │
└──────────────────────┼─────────────────────────────────────────────┘
                       ▼
        ┌──────────────────────────────┐
        │  workers/compile.worker.js   │  stateless
        │  document → HTML/CSS string  │
        └──────────────┬───────────────┘
                       │ compiled payload
┌──────────────────────┼─────────────────────────────────────────────┐
│                      ▼                                             │
│        ┌───────────────────────────────┐                           │
│        │ <iframe sandbox srcdoc="…">   │  opaque origin            │
│        │   the page being designed     │                           │
│        │   + measurement runtime       │                           │
│        └───────────────┬───────────────┘                           │
│                        │ postMessage: measured rects               │
│                        └──────────────► back into the engine       │
└────────────────────────────────────────────────────────────────────┘
```

---

## 1. The engine (`js/engine/`)

Eleven small modules, none of which touches the DOM. That is what makes the whole
engine testable in Node in milliseconds — `node --test "tests/unit/*.test.js"`
covers every module below without a browser.

| Module               | Responsibility                                                                                |
| -------------------- | --------------------------------------------------------------------------------------------- |
| `values.js`          | number formatting, input parsing, HTML/CSS escaping                                           |
| `kinds.js`           | **the element catalogue** — one table row per primitive                                       |
| `style.js`           | **the style catalogue** — one table row per CSS property                                      |
| `node.js`            | what a node is; applying one property by dotted key                                           |
| `document.js`        | the node arena: add, delete, duplicate, reparent, reorder, page settings, project-file repair |
| `history.js`         | undo/redo as whole-document snapshots                                                         |
| `geometry.js`        | hit testing, drop routing, snapping — over measured boxes                                     |
| `highlight.js`       | source → coloured token spans, for the Code element                                           |
| `actions-runtime.js` | the click behaviour an exported page carries                                                  |
| `compiler.js`        | document → HTML/CSS                                                                           |
| `preview-runtime.js` | the script that runs inside the preview frame                                                 |
| `index.js`           | the `Engine` facade — the only thing the UI imports                                           |

### Two tables are the extension points

Almost every addition to this editor is a row in one of two tables.

**`kinds.js` — adding an element.** Each row declares a tag, a default size, a
default style, whether it can hold children, and optionally a couple of hooks:

```js
button: {
  label: 'Button',
  tag: 'button',
  text: true,
  size: [168, 46],
  content: 'Get started',
  attrs: () => ({ type: 'button' }),
  style: { background: '#3f5bff', color: '#ffffff', radius: 10 },
},
```

Nothing else in `js/engine/` branches on element type. The compiler asks the
table for a tag; the drop router asks it whether children are allowed.

Two hooks let a row describe more than a plain box:

- **`attrs(node)`** returns the HTML attributes to emit. A link's `target` and
  `rel`, a video's `controls`, an input's `type` all come from here.
- **`body(node)`** builds the element's inner markup for anything more
  structured than one run of text — a table's rows, a list's items. It returns
  a **fragment spec**, not a string:

  ```js
  body: (node) => splitLines(node.data.items).map((text) => ({ tag: 'li', text })),
  ```

  The compiler escapes every `text` and every attribute value while rendering
  that structure, so a `body` hook has no way to inject markup even if it
  tries. That is the entire reason it returns a structure rather than HTML.

Content that does not fit in one string lives in **`node.data`**, a flat
`{string: string}` bag whose keys a kind declares and its `body` hook reads.
A table keeps `columns` and `rows` there; a video keeps `autoplay` and `loop`.
The alternative — real child nodes for every table cell — would mean a Layers
tree full of unselectable rows, nesting rules for what may be dropped into a
`<tr>`, and a compiler that has to reject invalid trees. Set one with
`data.<key>`, exactly like `style.<key>`.

A kind may also carry **`descendantCss`**, static CSS for the descendants it
generates itself (`& th,& td{…}`), with `&` replaced by the node's class
selector. It is author-written and never contains user input, so unlike
everything else reaching the compiler it needs no escaping.

**`style.js` — adding a CSS property.** One row makes it settable, validated,
and emitted:

```js
{ key: 'letterSpacing', css: 'letter-spacing', input: 'number', format: asPx },
```

The order of that array is the order declarations are emitted, which is why an
unchanged document always compiles to a byte-identical string.

A few rows are not one-to-one with a CSS property. `borderWidth` owns an
`emit(style)` that folds width, style and colour into a single `border`
declaration; `gridColumns` formats an integer into
`repeat(n, minmax(0, 1fr))`. Both stay in the same table rather than becoming
special cases elsewhere.

### Where history lives

`document.js` mutates and never records. `Engine` decides where the undo
boundaries go, through a single helper:

```js
_guard(mutate) {
  this.checkpoint();
  try { return mutate(); }
  catch (error) { this.history.discard(); throw error; }
}
```

That is why a rejected action leaves no empty step in the history — and why
that logic exists in exactly one place instead of at every call site. The drag
fast paths (`moveElement`, `resizeElement`) deliberately bypass it; the canvas
takes one checkpoint when a gesture begins, or a drag would push a snapshot per
pixel.

### Why geometry is measured, not modelled

`syncRects` ingests real boxes from the preview frame, and `hitTest`,
`dropTarget`, `toLocalPoint` and `snapGuides` all answer from those. Modelling
positions instead would mean reimplementing flexbox, and being subtly wrong
inside every row and column container. Measuring is cheaper and always correct.

### Errors

Every method that can fail throws an `Error` whose message is written for the
status bar: ``no node with id `n7` ``, `` `width` expects a number, received
`wide` ``. `core/app.js` catches them in `_safe` and shows them. Malformed
input cannot take the editor down.

### What an exported page carries

A devlove export is one HTML file. Whether it contains any JavaScript at all
depends on what is on the page:

| The page has                     | The export ships                                             |
| -------------------------------- | ------------------------------------------------------------ |
| Only text, images, tables, forms | No `<script>` at all                                         |
| Any element with a click action  | `actions-runtime.js`, about 2KB                              |
| A highlighted code block         | Nothing extra — tokens are spans, coloured by the stylesheet |

`usesActions(doc)` in the compiler is what decides, and it is asked on every
compile rather than assumed. Actions are emitted as `data-dl-action` /
`data-dl-target` attributes and handled by one delegated listener, so there is
no inline `onclick` for a Content-Security-Policy to reject.

The runtime is written as a real function and stringified, the same way
`preview-runtime.js` is, and carries the same constraint: it must be
self-contained, because none of the module's imports exist on the exported
page.

### Highlighting

`highlight.js` is a scanner, not a parser: at each position it tries an ordered
list of patterns and takes the first that matches, falling back to plain text.
That is enough to colour comments, strings, numbers, keywords and calls, and it
degrades rather than breaking on input it does not understand.

It returns a **fragment spec**, not HTML — the same structure a kind's `body`
hook returns — so the compiler escapes every run of source while rendering it.
A highlighter that built strings would be one mistake away from executing a
`<script>` in somebody's code sample.

Adding a language is one entry in `GRAMMARS`.

---

## 2. The compile worker (`js/workers/`)

**The worker holds no state.** Every message carries the whole document; the
worker answers with a string. That is the entire protocol:

```
in   {id, job: 'compile',   doc, options}
in   {id, job: 'serialize', doc}
out  {id, ok: true, result} | {id, ok: false, error}
```

Two consequences worth stating plainly:

- There is no second copy of the document to invalidate, and no cache-coherence
  problem. The worker can be killed and recreated between any two messages
  without the editor noticing.
- It imports the _same_ `engine/compiler.js` the main thread does. There is one
  compiler, not two, so an off-thread compile and an inline one cannot drift.

### What is on the worker, and what deliberately is not

| Work                                    | Where       | Why                                                     |
| --------------------------------------- | ----------- | ------------------------------------------------------- |
| Full document compile                   | worker      | the expensive one; already async (rAF-driven)           |
| Project serialize                       | worker      | runs on a debounce after every edit                     |
| `nodeCss(id)` during a drag             | main thread | a round trip would put a frame of lag behind the cursor |
| `hitTest` / `dropTarget` / `snapGuides` | main thread | called inside `pointermove`; must answer now            |

Putting the whole engine in the worker was considered and rejected for exactly
that bottom half: the canvas asks the engine what is under the cursor on every
pointer move, and answering that asynchronously would mean keeping a mirrored
copy of the geometry on the main thread — reintroducing the mirrored-state bugs
this architecture exists to avoid.

### The fallback is not a second implementation

If a worker cannot be created — no `Worker`, a `file://` page, a restrictive
CSP — or if one dies mid-job, `core/compile-service.js` runs the same function
inline and resolves the same promise. Callers never see two shapes. The status
bar shows **Worker** or **Inline** so the difference is visible rather than a
mystery about why things got slower.

---

## 3. The browser layer (`js/`)

### Selection

The engine holds selection as an **ordered array**, not a single id. The last
entry is the _primary_: the one the inspector reads, the one that gets resize
handles, and the one a group drag takes its delta from. `selection()` returns
it, so every caller that only ever handled one element kept working when the
array arrived; the ones that mean "everything selected" ask for
`selectedIds()`.

Two rules keep it honest:

- **Only the engine decides what is selected.** `app._syncSelectionFromEngine`
  is the one place `state.selection` is assigned, because the engine drops ids
  whose nodes are gone and is therefore the only thing that knows what survived
  a delete or an undo.
- **A batch is one undo step.** `deleteElements` and `duplicateElements` exist
  precisely because looping over the single-element versions would take one
  checkpoint each, and putting four deleted elements back would need four
  presses of Ctrl+Z. Batching lives next to `_guard`, which is the only code
  that knows where an undo boundary goes.

### `core/app.js` — the single caller

Every panel talks to `app`; only `app` talks to the engine. It owns:

- **transient editor state** (mode, zoom, selection, hover, measured rects) —
  deliberately _not_ document state, which lives in the engine;
- **the render pipeline** (below);
- **topics** — `ready`, `document`, `node`, `selection`, `hover`, `geometry`,
  `mode`, `zoom`, `page`, `status`;
- **autosave** to `localStorage`, debounced.

### The two-speed render pipeline

This is the part that keeps dragging smooth.

| Change                                                  | Path                                            | Cost                  |
| ------------------------------------------------------- | ----------------------------------------------- | --------------------- |
| Add, delete, reparent, undo, layout mode, page settings | worker compile → `iframe.srcdoc`                | frame reload          |
| Move, resize, colour, padding, radius, typography       | `nodeCss(id)` → `postMessage` → `style.cssText` | one declaration block |
| Text while typing                                       | `postMessage` → `textContent`                   | one text node         |

Both paths are coalesced into a single `requestAnimationFrame`, so a burst of
sixty pointer events produces one patch. Because the model is authoritative,
the next full recompile always reconciles whatever the fast path approximated.

Compiles can overlap now that they are asynchronous, so each carries a token
and only the newest result is allowed to reach the frame — an older compile
finishing late is discarded rather than painting a stale document.

### The preview frame

- `sandbox="allow-scripts allow-forms allow-popups allow-modals"` — no
  `allow-same-origin`, so the page under design gets an opaque origin and
  cannot touch the editor document, its storage, or its cookies.
- `srcdoc`, not `src` — no server round-trip, and no artefact on disk.
- Messages are tagged with a channel name in both directions, and the host
  additionally verifies `event.source === frame.contentWindow`, which is the
  meaningful identity check for an opaque origin.
- The runtime inside the frame does exactly three things: report rects, apply
  patches, and relay scroll.

`preview-runtime.js` writes that runtime as a **real function** and stringifies
it with `Function.prototype.toString()`, instead of storing it as a blob of
text. It stays lintable, formattable and highlighted like any other code. The
rule that follows: it must be self-contained, because none of this module's
imports exist inside the frame.

### The canvas overlay

The iframe is `pointer-events: none` in design mode. A sibling overlay, inside
the same scaled wrapper, receives every pointer event. That means:

- one coordinate space for both the outlines and the pointer (page pixels;
  divide client deltas by zoom once, in `_toPagePoint`);
- the frame's own event handling can never interfere with a gesture;
- preview mode is just "hide the overlay" — the page becomes genuinely
  interactive, including its links, buttons and inputs.

Selection outlines, resize handles, drop highlights and snap guides are plain
absolutely-positioned `<div>`s. During a drag the canvas paints a _predicted_
rect immediately and lets the frame's next measurement correct it, so the
outline never lags the pointer.

### What a drag means depends on who does the layout

A drag on an absolutely-positioned element moves it: the canvas writes `x`/`y`
and paints a _predicted_ rect immediately, letting the frame's next measurement
correct it.

A drag on a child of a `row`, `column` or `grid` cannot do that. Its parent
places it, and its own `x`/`y` are never compiled — writing them moves nothing.
There, a drag means **reorder**: the canvas shows an insertion line between
siblings and commits a single `reparent` on release. Nothing is mutated during
the drag, so one gesture is one undo step and no frame pays for a recompile.

Getting this wrong is what a flicker looks like. Two bugs produced one:

- predicting a position for an element whose parent ignores it, so the outline
  jumped to a coordinate it would never occupy and snapped back on the next
  measurement; and
- `_drawMarkers` taking an "override the primary's rect" argument, when the
  element under the pointer is not necessarily the primary selection — pick
  three things, then grab the first.

Both are closed the same way: `_drawMarkers` takes no arguments, and every
rect comes from one id-keyed lookup — `_predicted` while a gesture runs,
`app.rectOf` otherwise. The cache has to outlive the frame that filled it,
because moving an element makes the preview frame re-measure and fire
`geometry`, which repaints markers that know nothing about the drag.

### Dragging is pointer-based, not HTML5 drag-and-drop

`core/drag-controller.js` owns every drag that crosses a panel boundary —
palette → canvas, and layers → canvas or another layer row. It arms on
`pointerdown`, starts once the pointer has travelled 4px, follows with a ghost
element in the top-level document, and emits `drag:start` / `drag:move` /
`drag:end` on the app bus. Whichever panel is under the cursor paints its own
drop affordance and acts on the drop.

The HTML5 Drag and Drop API was tried first and abandoned. It is unreliable
across shadow boundaries, `draggable` on a form control behaves differently per
browser, `dragover` does not give a usable position everywhere, it has no touch
story, and the drag image cannot be styled. Pointer Events have none of those
problems — and, importantly, they are testable: CDP can synthesise real input,
whereas a native drag cannot be started from script at all.

Canvas-internal move and resize gestures do _not_ go through the controller.
They never leave the canvas, so they take their own pointer capture directly.

### Panels

Each is a Custom Element extending `PanelElement`, which attaches the shadow
root, injects `SHARED_CSS` plus the component's own styles, and disposes every
subscription on disconnect. Panels are independent: deleting one from
`index.html` and its import from `main.js` removes it cleanly.

**Every shell slot is a grid container and every panel host is a stretched
grid item.** This is a load-bearing rule, not a style choice. A custom element
defaults to `display: block` with auto height; put one in a plain block
container and `:host` collapses to zero height while its absolutely-positioned
innards still paint. The result is a panel you can see but cannot click — the
iframe renders, `getBoundingClientRect` reports a sane box, and every pointer
event goes to the container behind it. `SHARED_CSS` sets `:host { height: 100% }`
and `css/shell.css` makes each slot a single-cell grid, which closes the hole
from both sides.

The shell is: top bar, icon rail, left dock (Elements or Layers), stage, right
inspector, status bar. `dl-rail` owns which dock panel is visible by
toggling `hidden` on elements tagged with `data-panel` in `index.html`.

Three panels are pure renderers over data files:

- `dl-palette` renders `registry/elements.js`;
- `dl-inspector` renders `registry/inspector-schema.js`;
- `core/shortcuts.js` generates its single-letter element keys from the same
  element registry, so a palette hint and its key cannot drift apart.

None contains a branch on element type. That is the extension point.

---

## 4. Decisions worth knowing

**Why an iframe rather than rendering into the main document?**
Style isolation is absolute. A user can set `* { display: none }` on their page
and the editor is unaffected. It also means the export is exactly what was
previewed, and heavy reflow happens off the editor's layout tree.

**Why does JavaScript send rects back to the engine?**
Because CSS layout is the only authority on where a flex-flowed child ends up.
Modelling it would mean reimplementing flexbox, and being subtly wrong.
Measuring is cheaper and always correct.

**Why whole-document snapshots for undo?**
A command log needs a correct inverse for every operation, which is where undo
bugs live — one operation forgets to restore one field and the document quietly
drifts. `structuredClone` cannot be wrong. The cost is memory: a few hundred
kilobytes at realistic document sizes, capped at 200 steps.

**Why are node reads copies?**
`getElement` returns a `structuredClone`, so a panel that scribbles on what it
read cannot corrupt the model. Reads happen on selection and render, not per
pointer-move, so the cost does not land on any hot path. `snapshot()` is the
one exception, and it exists only to feed the worker.

**Why no build step?**
Native ES modules load fine unbundled over HTTP for a project this size, and
the constraint keeps every line inspectable in DevTools exactly as it was
written. It also means a contributor's first run is `python serve.py` — no
toolchain, no install, no version skew.

**Why plain JavaScript rather than a compiled core?**
An earlier version of this engine was Rust compiled to WebAssembly. It was
fast, but every contribution needed a Rust toolchain, `wasm-pack`, and a
rebuild before the browser saw a change — and the JS/WASM boundary meant
passing JSON strings back and forth and parsing them on both sides. The
document is a few thousand small objects at most; JavaScript handles that
comfortably, and moving the one genuinely expensive step to a worker recovers
the main-thread responsiveness that mattered. What was lost in raw throughput
was bought back several times over in how easy the project is to read and
change.

---

## 5. Known limits

Worth knowing before you build on this:

- **No marquee selection, and no group resize.** Several elements can be
  selected with Ctrl-click and moved, deleted, duplicated or restyled as one,
  but there is no rubber-band select and no bounding box to scale a group by.
  Group resize needs rules about which edge scales what, and half of those
  rules would be worse than none.
- **One page per project.** The engine has one root; multi-page would mean a
  document collection above it.
- **No responsive breakpoints.** Styles are unconditional; media queries can
  only be reached through the Custom CSS field.
- **Flow containers ignore `x`/`y`.** Children of a `row`, `column` or `grid`
  container are ordered, not positioned — reorder them in the Layers tree. A
  grid child's width comes from its track, not from its authored width.
- **No sticky or fixed positioning.** The canvas positions elements
  absolutely inside their section, which a sticky nav would fight. A nav bar
  scrolls away with the page.
- **Tables and lists are text, not nodes.** You cannot select a single cell,
  merge cells, or style one row differently. Anything beyond that needs the
  Custom CSS field and a `& tr:nth-child(2)` selector.
- **Snapping is sibling-based.** No distance badges or equal-spacing detection.
- **Autosave is `localStorage`.** Per-browser, per-origin, and subject to quota.
- **Every compile ships the whole document to the worker.** Fine at the sizes
  this editor targets; a document of tens of thousands of nodes would want an
  incremental protocol instead.
