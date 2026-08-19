# Architecture

Two halves, one rule: **the Rust engine owns the document, the browser owns the
pixels.** Nothing is mirrored across the boundary, so there is no state to keep
in sync and no class of bug where the UI and the model disagree.

```
┌──────────────────────── browser main thread ────────────────────────┐
│                                                                     │
│  Web Components (Shadow DOM)                                        │
│  ┌──────────┐ ┌──────────┐ ┌─────────────┐ ┌───────────┐            │
│  │ toolbar  │ │ palette  │ │   canvas    │ │ inspector │  layers …  │
│  └────┬─────┘ └────┬─────┘ └──────┬──────┘ └─────┬─────┘            │
│       │  commands  │              │              │                  │
│       └────────────┴──────┬───────┴──────────────┘                  │
│                           ▼                                         │
│                    core/app.js  ──── the only WASM caller           │
│                     │        ▲                                      │
│         calls       │        │  topics (ready/document/geometry/…)  │
│                     ▼        │                                      │
│              ┌──────────────────────┐                               │
│              │   DesignerEngine     │   ← Rust, in linear memory    │
│              │   nodes · history    │                               │
│              │   hit test · compile │                               │
│              └───────┬──────────────┘                               │
│                      │ compiled HTML/CSS string                     │
│                      ▼                                              │
│        ┌───────────────────────────────┐                            │
│        │ <iframe sandbox srcdoc="…">   │  opaque origin             │
│        │   the page being designed     │                            │
│        │   + measurement runtime       │                            │
│        └───────────────┬───────────────┘                            │
│                        │ postMessage: measured rects                │
│                        └──────────────► back into the engine        │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 1. The engine (`src/`)

### `node.rs` — the shape of a page

`WebNode` is one element: identity, geometry (`x`, `y`, `width`, `height`),
content, a typed `Style` bag with a `custom` map escape hatch, and `parent` /
`children` id links.

`NodeKind` is a single enum that carries *all* per-type behaviour as methods —
`tag()`, `is_void()`, `accepts_children()`, `default_size()`, `default_style()`.
Adding a primitive is a variant plus its match arms; the compiler then tells
you every place that needs a decision. Nothing else in the crate branches on
element type.

`LayoutMode` decides how a container places its children: `Absolute` (free
positioning, Figma style) or `Row` / `Column` (flexbox flow). A child reads its
*parent's* mode to know whether its `x`/`y` matter.

### `engine.rs` — the mutable document

Nodes live in a `HashMap<String, WebNode>` arena rather than an owned tree.
Reparenting, deleting and duplicating are pointer edits on `children` vectors
instead of subtree moves, and no operation needs a recursive `&mut` borrow.

* **History** is a `Vec<Document>` of whole-document clones. Snapshot/restore is
  simpler and less bug-prone than a command log, and a document of a few
  thousand nodes is a few hundred kilobytes. Capped at 200 steps.
* **Checkpoints are explicit.** Structural operations record one automatically.
  `move_to` and `resize` deliberately do *not* — a drag would otherwise push a
  snapshot per pixel — so the canvas calls `checkpoint()` once when a gesture
  begins.
* **Geometry is measured, not modelled.** `sync_rects` ingests real boxes from
  the preview frame; `hit_test`, `drop_target`, `to_local` and `snap_guides`
  all answer from those. This is what makes hit testing correct inside
  flex-flowed containers, where no model could predict positions.

### `compiler.rs` — AST to payload

One function, `declarations_for`, produces a node's CSS declaration block. Both
the stylesheet compiler and the live-patch path call it, so a dragged element
and a freshly recompiled document can never disagree.

`compile_document(engine, editor)` assembles the whole file. `editor = true`
adds the measurement runtime and editor-only affordances; `editor = false` is
the shippable export — identical markup, zero runtime.

Escaping is total: `escape_html` for bodies, `escape_attr` for attribute
values, `sanitize_value`/`sanitize_property` for anything reaching CSS.
Declaration order is stable (`BTreeMap` for custom properties), so an unchanged
document compiles to a byte-identical string.

### `lib.rs` — the boundary

The only public surface. Every method returns either a primitive or a JSON
`String`; nothing leaks a Rust type into JavaScript. Errors come back as
`Result<_, JsValue>` and surface in the status bar rather than as a trap.

Guarded mutations take a checkpoint, attempt the change, and call
`discard_checkpoint()` on failure — so a rejected action leaves no empty step
in the undo history.

---

## 2. The browser layer (`js/`)

### `core/app.js` — the single caller

Every panel talks to `app`; only `app` talks to WASM. It owns:

* **transient editor state** (mode, zoom, selection, hover, measured rects) —
  deliberately *not* document state, which lives in Rust;
* **the render pipeline** (below);
* **topics** — `ready`, `document`, `node`, `selection`, `geometry`, `mode`,
  `zoom`, `page`, `status`;
* **autosave** to `localStorage`, debounced.

Every engine call goes through `_safe(label, fn, fallback)`, which converts a
thrown `JsValue` into a status-bar message and a console entry. A malformed
input can never take the editor down.

### The two-speed render pipeline

This is the part that keeps dragging smooth.

| Change | Path | Cost |
| --- | --- | --- |
| Add, delete, reparent, undo, layout mode, page settings | recompile → `iframe.srcdoc` | frame reload |
| Move, resize, colour, padding, radius, typography | `nodeCss(id)` → `postMessage` → `style.cssText` | one declaration block |
| Text while typing | `postMessage` → `textContent` | one text node |

Both paths are coalesced into a single `requestAnimationFrame`, so a burst of
sixty pointer events produces one patch. Because the model is authoritative,
the next full recompile always reconciles whatever the fast path approximated.

### The preview frame

* `sandbox="allow-scripts allow-forms allow-popups allow-modals"` — no
  `allow-same-origin`, so the page under design gets an opaque origin and
  cannot touch the editor document, its storage, or its cookies.
* `srcdoc`, not `src` — no server round-trip, and no artefact on disk.
* Messages are tagged with a channel name in both directions, and the host
  additionally verifies `event.source === frame.contentWindow`, which is the
  meaningful identity check for an opaque origin.
* The runtime inside the frame does exactly three things: report rects, apply
  patches, and relay scroll. It is compiled in by `compiler.rs`, so the editor
  and the runtime can never drift apart in version.

### The canvas overlay

The iframe is `pointer-events: none` in design mode. A sibling overlay, inside
the same scaled wrapper, receives every pointer event. That means:

* one coordinate space for both the outlines and the pointer (page pixels;
  divide client deltas by zoom once, in `_toPagePoint`);
* the frame's own event handling can never interfere with a gesture;
* preview mode is just "hide the overlay" — the page becomes genuinely
  interactive, including its links, buttons and inputs.

Selection outlines, resize handles, drop highlights and snap guides are plain
absolutely-positioned `<div>`s. During a drag the canvas paints a *predicted*
rect immediately and lets the frame's next measurement correct it, so the
outline never lags the pointer.

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

Canvas-internal move and resize gestures do *not* go through the controller.
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
inspector, status bar. `forge-rail` owns which dock panel is visible by
toggling `hidden` on elements tagged with `data-panel` in `index.html`.

Three panels are pure renderers over data files:

* `forge-palette` renders `registry/elements.js`;
* `forge-inspector` renders `registry/inspector-schema.js`;
* `core/shortcuts.js` generates its single-letter element keys from the same
  element registry, so a palette hint and its key cannot drift apart.

None contains a branch on element type. That is the extension point.

---

## 3. Decisions worth knowing

**Why an iframe rather than rendering into the main document?**
Style isolation is absolute. A user can set `* { display: none }` on their page
and the editor is unaffected. It also means the export is exactly what was
previewed, and heavy reflow happens off the editor's layout tree.

**Why JSON strings across the boundary instead of `serde-wasm-bindgen`?**
Fewer moving parts, one obvious data format, and the crossings that matter for
frame rate (`moveElement`, `resizeElement`, `nodeCss`) pass primitives and
never touch JSON at all.

**Why does JavaScript send rects back to Rust?**
Because CSS layout is the only authority on where a flex-flowed child ends up.
Modelling it in Rust would mean reimplementing flexbox, and being subtly wrong.
Measuring is cheaper and always correct.

**Why whole-document snapshots for undo?**
A command log needs a correct inverse for every operation, which is where undo
bugs live. Snapshots are `#[derive(Clone)]` and cost a few hundred kilobytes at
realistic document sizes.

**Why no build step for the UI?**
Native ES modules load fine unbundled over HTTP/1.1 for a project this size,
and the constraint keeps every line inspectable in DevTools exactly as it was
written.

---

## 4. Known limits

Worth knowing before you build on this:

* **Single selection.** No marquee, no multi-select transforms.
* **One page per project.** The engine has one root; multi-page would mean a
  document collection above it.
* **No responsive breakpoints.** Styles are unconditional; media queries can
  only be reached through the Custom CSS field.
* **Flow containers ignore `x`/`y`.** Children of a `Row`/`Column` stack are
  ordered, not positioned — reorder them in the Layers tree.
* **Snapping is sibling-based.** No distance badges or equal-spacing detection.
* **Autosave is `localStorage`.** Per-browser, per-origin, and subject to quota.
