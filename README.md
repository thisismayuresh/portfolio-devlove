# devlove

A drag-and-drop website builder written in **plain JavaScript** — no framework,
no bundler, no build step, and no dependencies.

Clone it, serve the folder, open the page. That is the whole setup. Every line
that runs in the browser is a line you can read in this repository, unminified
and untransformed, exactly as it was written.

- **The engine** (`js/engine/`) owns the document: the node tree, every
  mutation, undo/redo, hit testing, snapping and the HTML/CSS compiler. It is
  nine small modules that never touch the DOM, so all of it is unit-testable in
  Node in milliseconds.
- **A Web Worker** (`js/workers/`) does the one expensive thing — turning the
  document into an HTML/CSS payload — so the main thread stays free while you
  drag.
- **The UI** is standard Web Platform: Custom Elements, Shadow DOM, Pointer
  Events, `<iframe srcdoc>` and `postMessage`.

---

## Quick start

```bash
git clone <this repo>
cd project
python serve.py
```

Then open <http://127.0.0.1:8080/>.

Any static file server works — the only requirement is `http://` rather than
`file://`, because ES modules and Web Workers cannot load from the filesystem.
If you have Node instead of Python: `npx serve` or `npx http-server` are fine.

There is nothing to install and nothing to build. Change a file under `js/`,
`css/` or `index.html` and refresh — `serve.py` sends `Cache-Control:
no-store`, so you never fight a stale copy.

### Or use the setup script

It checks your environment and starts the server:

```bash
./setup.sh --serve            # Linux / macOS
.\setup.ps1 -Serve            # Windows PowerShell
```

| Flag                         | Effect                                     |
| ---------------------------- | ------------------------------------------ |
| `--serve` / `-Serve`         | serve when the checks pass                 |
| `--port 3000` / `-Port 3000` | pick the port (default 8080)               |
| `--test` / `-Test`           | run the unit tests, then the browser tests |
| `--help` / `-?`              | usage                                      |

---

## Requirements

| Tool             | Needed for                | Optional?                          |
| ---------------- | ------------------------- | ---------------------------------- |
| A modern browser | running the editor        | no                                 |
| Python 3.8+      | the bundled static server | yes — any static server works      |
| Node 20+         | running the test suites   | yes — not needed to use the editor |
| npm packages     | ESLint and Prettier       | yes — nothing the editor needs     |

The editor itself has **zero** runtime dependencies.

---

## What you can do in the editor

| Action                       | How                                                                                                                              |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Add an element               | Drag a row from the left panel onto the canvas, double-click it, or press its letter — the palette shows each one                |
| Switch left panel            | The icon rail — Elements or Layers                                                                                               |
| Change canvas width          | The device buttons in the canvas toolbar, or type a width                                                                        |
| Select                       | Click it on the canvas, or click its row in **Layers**                                                                           |
| Select several               | `Ctrl`/`⌘`-click each one, on the canvas or in **Layers**. `Ctrl+A` selects every sibling. Edits, moves and deletes apply to all |
| Move                         | Drag it. `Shift` constrains to one axis, `Ctrl`/`⌘` disables snapping                                                            |
| Duplicate while dragging     | Hold `Alt` and start the drag                                                                                                    |
| Resize                       | Drag any of the eight handles. `Shift` locks the aspect ratio on corners                                                         |
| Nest inside a container      | Drag over it — the green outline shows the receiving container                                                                   |
| Reorder / reparent precisely | Drag rows in the **Layers** tree (above / into / below zones)                                                                    |
| Edit text                    | Double-click the element. `Enter` commits, `Escape` cancels                                                                      |
| Style                        | Everything in the right rail, including a raw **Custom CSS** escape hatch                                                        |
| Change the page itself       | Deselect (`Escape`) — the inspector switches to document settings                                                                |
| Preview for real             | **Preview** in the top bar, or `Ctrl+P`                                                                                          |
| Ship it                      | **Export HTML** — one self-contained file, no runtime, no dependencies                                                           |
| Keep working later           | **Save** writes a `.devlove.json`; the editor also autosaves to `localStorage`                                                   |

### What you can build with

Twenty primitives, grouped the way the palette groups them.

| Group   | Elements                                                     |
| ------- | ------------------------------------------------------------ |
| Layout  | Section, Box, Stack (flex row/column), Grid, Divider, Spacer |
| Content | Heading, Text, List, Table, Quote, Code                      |
| Media   | Image, Video                                                 |
| Forms   | Form, Button, Link, Label, Input, Textarea                   |

**Tables and lists are edited as text.** A table has a Columns field
(`Name | Role | Year`) and a Rows field, one row per line, cells separated by
`|`. A list has one item per line and a Numbered toggle. Modelling every cell
as its own draggable node would fill the Layers tree with hundreds of rows you
never want to select; a text field is both less code and faster to edit.

**Code blocks are highlighted.** Pick TypeScript, JavaScript, JSON, HTML, CSS,
Shell or Python and the block is tokenised at compile time — no highlighter
library ships with your page, just spans and a few colours.

**Buttons and links do things.** Set an action in the inspector: scroll to a
section, open a URL (optionally in a new tab), show/hide a section, copy text
to the clipboard, submit the form, or go back. Give the target section an
**anchor** and it becomes the element's `id`. A page that uses no actions
exports with no JavaScript at all; one that does gets a ~2KB script and nothing
else.

**Images and video can be uploaded.** Drag a file onto the canvas, or use the
Upload button beside any Source field. Files are embedded as `data:` URIs so
the export stays one self-contained file — which is also why anything over
1.5MB is refused with an explanation rather than quietly breaking autosave.

### Everything you can change

| Group           | Properties                                                                                               |
| --------------- | -------------------------------------------------------------------------------------------------------- |
| Size & position | width, height, x, y, min height, max width, aspect ratio, hug height                                     |
| Child layout    | Free / Row / Column / Grid, columns, gap, justify, align, wrap, overflow                                 |
| Typography      | size, line height, weight, tracking, alignment, italic, underline, case, colour, font stack, list marker |
| Fill & border   | colour, background image (upload or URL), fit, anchor, repeat, radius, border width / style / colour     |
| Spacing         | padding and margin, as a shorthand or per side                                                           |
| Effects         | opacity, box shadow, text shadow, filter, backdrop blur, rotate, scale, transition, cursor, stack order  |
| Media           | object fit and anchor, for images and video                                                              |
| On click        | the actions above, on any element                                                                        |
| Layer           | name, anchor, hidden, locked                                                                             |
| Page            | title, description, language, width, min height, background, font stack                                  |

Anything not in that list is one line in the **Custom CSS** field, which takes
any declaration and applies it to that element alone.

### Starting points

The **Templates** panel in the icon rail carries four documents, each built
from the same elements you have:

| Template            | What it is                                                             |
| ------------------- | ---------------------------------------------------------------------- |
| Developer portfolio | Hero, a skills reference, a projects table, and a working contact form |
| SaaS landing page   | Dark product page: features, pricing comparison, FAQ, sign-up          |
| Documentation       | Sidebar of anchors beside an article with code and a reference table   |
| Blank page          | An empty canvas with the page set up and nothing on it                 |

Every one has a working navigation bar whose links scroll to real anchors, so
hitting **Preview** shows you a page that behaves, not a picture of one.
Applying a template replaces the document in a single undo step.

Templates live in [`js/templates/`](js/templates/) and are plain data. Adding
one is a file and a row in [`js/templates/index.js`](js/templates/index.js).

### The interface

The editor is themed after VS Code's Dark Modern, on purpose. It sits beside
your editor, so it should read as part of the same furniture: square corners,
grey chrome, and colour used only where it carries information — focus rings,
the one primary button, and the canvas selection marker. Active states
elsewhere are drawn the way VS Code's activity bar draws them, with a white
icon and a border rather than a coloured pill.

Every colour and metric is a custom property in
[`css/tokens.css`](css/tokens.css). Because custom properties cross shadow
boundaries, editing that one file retints the entire tool.

### Keyboard

| Keys                              | Action                                                                |
| --------------------------------- | --------------------------------------------------------------------- |
| `Ctrl+Z` / `Ctrl+Shift+Z`         | Undo / redo                                                           |
| `Delete` / `Backspace`            | Delete selection                                                      |
| `Ctrl+D`                          | Duplicate                                                             |
| `Arrows` / `Shift+Arrows`         | Nudge 1px / 10px                                                      |
| `Ctrl+[` / `Ctrl+]`               | Send backward / bring forward                                         |
| `Ctrl+P`                          | Toggle preview                                                        |
| `Ctrl+0`, `Ctrl+±`, `Ctrl+scroll` | Zoom                                                                  |
| `Escape`                          | Deselect, or cancel a drag                                            |
| `Ctrl+A`                          | Select every sibling of the selection                                 |
| A single letter                   | Add that element — the letter is shown beside its name in the palette |

Bindings live in one table in [`js/core/shortcuts.js`](js/core/shortcuts.js).
The single-letter element keys are generated from
[`js/registry/elements.js`](js/registry/elements.js), so a tile's hint and its
key can never disagree.

---

## Layout

```
project/
├── index.html                    the shell; every panel is a custom element
├── serve.py                      static server, no dependencies
├── setup.sh / setup.ps1          environment check + serve
├── package.json                  optional: linting and test scripts only
│
├── js/
│   ├── main.js                   entry point
│   │
│   ├── engine/                   ── the document model, no DOM ──
│   │   ├── index.js              the Engine facade — all the UI imports
│   │   ├── kinds.js              THE ELEMENT TABLE — add a primitive here
│   │   ├── style.js              THE STYLE TABLE — add a CSS property here
│   │   ├── node.js               what a node is, and how one property is set
│   │   ├── document.js           the node arena: add/delete/move/reparent
│   │   ├── history.js            undo/redo as document snapshots
│   │   ├── geometry.js           hit testing, drop routing, snapping
│   │   ├── compiler.js           document → HTML/CSS
│   │   ├── preview-runtime.js    the script that runs inside the preview frame
│   │   └── values.js             formatting, parsing, escaping
│   │
│   ├── workers/
│   │   └── compile.worker.js     stateless: document in, HTML string out
│   │
│   ├── core/
│   │   ├── app.js                the only module that talks to the engine
│   │   ├── compile-service.js    the worker client, with an inline fallback
│   │   ├── emitter.js            30-line pub/sub — the whole "state layer"
│   │   ├── drag-controller.js    pointer-based cross-panel dragging
│   │   ├── shortcuts.js          the keyboard table
│   │   └── starter-template.js   the document a first-time visitor sees
│   │
│   ├── registry/
│   │   ├── elements.js           palette metadata, keyed by element kind
│   │   └── inspector-schema.js   declarative property panel
│   │
│   ├── ui/
│   │   ├── icons.js              16×16 inline SVG set
│   │   ├── shared-styles.js      shadow-DOM style primitives
│   │   ├── panel-element.js      base class for every panel
│   │   └── components/           dl-toolbar, dl-palette, dl-layers, dl-canvas,
│   │                             dl-inspector, dl-rail, dl-status
│   │
│   └── util/files.js             download / open, on Blob and <input type=file>
│
├── css/
│   ├── tokens.css                every colour and metric in the editor
│   └── shell.css                 the outer grid and the boot screen
│
├── tests/
│   ├── unit/engine.test.js       node:test — the whole engine, no browser
│   ├── run-browser-tests.mjs     zero-dependency CDP runner (Node 20+)
│   └── smoke.html                engine ↔ worker ↔ preview-frame contract
│
├── docs/ARCHITECTURE.md          how the parts fit together
└── CONTRIBUTING.md               how to add an element, a property, a panel
```

---

## Tests

```bash
node --test "tests/unit/*.test.js"   # the engine — fast, no browser
node tests/run-browser-tests.mjs     # real Chrome, real input events
node tests/run-browser-tests.mjs --headful   # watch it drive the editor
```

Neither needs `npm install`.

The unit suite covers the engine: tree operations, history, property
validation, geometry, the compiler's escaping, and project-file repair. It runs
in well under a second, because the engine never touches the DOM.

The browser suite covers what only a browser can answer — whether dragging,
dropping and the preview frame's measurement loop actually work. It starts
`serve.py`, launches Chrome/Chromium/Edge over the DevTools protocol, and
drives the canvas with genuine `Input.dispatchMouseEvent` events. Synthetic
`dispatchEvent` calls are untrusted and prove nothing about a real drag.

Set `CHROME_PATH` if your browser is somewhere unusual.

Two traps the runner exists to avoid, both of which produce convincing false
failures:

- `chrome --dump-dom` snapshots at the load event, long before the preview
  frame has reported its first measurements;
- `--virtual-time-budget` fixes that but then stops loading new frames once the
  clock jumps, so anything created after an async step never runs.

It also calls `Page.bringToFront` on every tab, because Chrome does not run
`requestAnimationFrame` in a background tab and the frame's measurement loop is
rAF-driven.

### Linting (optional)

```bash
npm install
npm run lint
npm run format
```

The rules catch mistakes, not style. Style is Prettier's job.

---

## How it works, briefly

1. **The engine holds the truth.** A plain-JavaScript `Engine` owns a flat map
   of nodes linked by id. The UI holds one reference to it and never mirrors
   the document.
2. **Compiling happens in a worker.** `core/app.js` hands the whole document to
   `workers/compile.worker.js`, which returns one HTML string. The worker is
   stateless — there is no second copy of anything to keep in sync — and it
   imports the _same_ compiler the main thread uses, so the two cannot drift.
   If a worker cannot be created, the identical function runs inline.
3. **The preview is a sandboxed frame.** The compiled string goes to
   `iframe.srcdoc`. The frame runs with `sandbox="allow-scripts"`, so the page
   being designed has an opaque origin and cannot reach the editor.
4. **Gestures never recompile.** Dragging an element asks the engine for that
   one node's declaration block — synchronously, on the main thread — and
   `postMessage`s it into the frame, which assigns `element.style.cssText`.
   Full recompiles are reserved for structural changes.
5. **Geometry comes back from the frame.** The runtime reports every node's
   measured box on a `requestAnimationFrame`-coalesced schedule. Those rects go
   into the engine, which answers hit tests, drop-target queries and snap-guide
   queries against real measurements — including for flex-flowed children,
   whose positions no model could predict.

The details are in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

---

## Contributing

Most additions are one table row.

- **A new element** is an entry in `ELEMENT_KINDS` in
  [`js/engine/kinds.js`](js/engine/kinds.js), plus a palette tile in
  [`js/registry/elements.js`](js/registry/elements.js).
- **A new CSS property** is an entry in `STYLE_FIELDS` in
  [`js/engine/style.js`](js/engine/style.js), plus a field in
  [`js/registry/inspector-schema.js`](js/registry/inspector-schema.js).

Neither requires touching the compiler, the canvas, the inspector or the drag
code — none of them branch on element type. Walkthroughs for both, and for
adding a panel, a shortcut or an engine method, are in
[CONTRIBUTING.md](CONTRIBUTING.md).

---

## Troubleshooting

**Blank page, console mentions `file://`**
ES modules cannot load from the filesystem. Serve over HTTP: `python serve.py`.

**Status bar says "Inline" rather than "Worker"**
The compile worker could not start, so compiling is happening on the main
thread. Everything still works, just less smoothly on a large document. The
console has the reason — usually a Content-Security-Policy, or a page opened
over `file://`.

**A change to `js/` does nothing**
Hard-refresh. `serve.py` sends `no-store`, but a different server may not.

**`SyntaxError: Unexpected token '<'` in the console**
Your server is returning `index.html` for a missing file. Check the path in the
failing import.

**The browser tests cannot find Chrome**
Set `CHROME_PATH` to the executable.

---

## Licence

MIT. See [LICENSE](LICENSE).
