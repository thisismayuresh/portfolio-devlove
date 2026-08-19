# Forge

A drag-and-drop website builder with a **Rust + WebAssembly core** and a
**zero-dependency vanilla browser UI**.

The Rust crate owns the document: the node tree, every mutation, hit testing,
snapping and the HTML/CSS compiler. The browser layer owns pixels and pointer
events, and is built from nothing but standard Web Platform APIs — Custom
Elements, Shadow DOM, Pointer Events, the HTML Drag and Drop API, `<iframe
srcdoc>` and `postMessage`.

There is no React, no Vue, no Tailwind, no jQuery, no bundler, and no `npm
install`. The only build step in the whole project compiles the Rust crate.

---

## 1. Requirements

| Tool | Why | Check |
| --- | --- | --- |
| Rust (stable, 1.70+) | compiles the engine | `rustc --version` |
| `wasm32-unknown-unknown` target | the WASM build target | `rustup target list --installed` |
| `wasm-pack` 0.12+ | drives the build and emits the JS glue | `wasm-pack --version` |
| Python 3.8+ | the bundled static server | `python --version` |

Install them once:

```bash
# 1. Rust toolchain (https://rustup.rs)
#    Windows: download and run rustup-init.exe
#    macOS/Linux:
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# 2. The WebAssembly target
rustup target add wasm32-unknown-unknown

# 3. wasm-pack
cargo install wasm-pack
```

Any static file server works instead of Python — the requirement is only that
`.wasm` is served as `application/wasm` and the page is loaded over `http://`,
not `file://`.

---

## 2. Build and run

From the project root:

```bash
# Compile the engine to ./pkg (designer_engine.js + designer_engine_bg.wasm)
wasm-pack build --target web

# Serve the folder unbundled, with correct WASM MIME types
python serve.py
```

Then open <http://127.0.0.1:8080/>.

Useful variants:

```bash
wasm-pack build --target web --dev       # fast rebuild, unoptimised, keeps debug info
wasm-pack build --target web --release   # the default; optimised, LTO, stripped
python serve.py 3000                     # different port
python serve.py 3000 0.0.0.0             # expose on the LAN
```

`--target web` is required. It emits a plain ES module that the browser
imports directly, with no bundler in the loop. The UI never imports from
`pkg/` except through [`js/core/wasm-bridge.js`](js/core/wasm-bridge.js).

**Rebuild loop:** after changing anything in `src/`, re-run `wasm-pack build
--target web` and hard-refresh. After changing anything in `js/`, `css/` or
`index.html`, just refresh — `serve.py` sends `Cache-Control: no-store`.

---

## 3. What you can do in the editor

| Action | How |
| --- | --- |
| Add an element | Drag a tile from the left rail onto the canvas, or double-click the tile |
| Select | Click it on the canvas, or click its row in **Layers** |
| Move | Drag it. `Shift` constrains to one axis, `Ctrl`/`⌘` disables snapping |
| Duplicate while dragging | Hold `Alt` and start the drag |
| Resize | Drag any of the eight handles. `Shift` locks the aspect ratio on corners |
| Nest inside a container | Drag over it — the green outline shows the receiving container |
| Reorder / reparent precisely | Drag rows in the **Layers** tree (above / into / below zones) |
| Edit text | Double-click the element. `Enter` commits, `Escape` cancels |
| Style | Everything in the right rail, including a raw **Custom CSS** escape hatch |
| Change the page itself | Deselect (`Escape`) — the inspector switches to document settings |
| Preview for real | **Preview** in the top bar, or `Ctrl+P` |
| Ship it | **Export HTML** — one self-contained file, no runtime, no dependencies |
| Keep working later | **Save** writes a `.forge.json`; the editor also autosaves to `localStorage` |

### Keyboard

| Keys | Action |
| --- | --- |
| `Ctrl+Z` / `Ctrl+Shift+Z` | Undo / redo |
| `Delete` / `Backspace` | Delete selection |
| `Ctrl+D` | Duplicate |
| `Arrows` / `Shift+Arrows` | Nudge 1px / 10px |
| `Ctrl+[` / `Ctrl+]` | Send backward / bring forward |
| `Ctrl+P` | Toggle preview |
| `Ctrl+0`, `Ctrl+±`, `Ctrl+scroll` | Zoom |
| `Escape` | Deselect |

Bindings live in one table in [`js/core/shortcuts.js`](js/core/shortcuts.js).

---

## 4. Layout

```
project/
├── Cargo.toml                    crate manifest (3 Rust deps, 0 JS deps)
├── serve.py                      static server with correct WASM MIME types
├── index.html                    the shell; every panel is a custom element
│
├── src/                          ── the Rust engine ──
│   ├── lib.rs                    the wasm-bindgen boundary; the only pub API
│   ├── node.rs                   WebNode, NodeKind, LayoutMode, Style
│   ├── engine.rs                 tree ops, history, hit testing, geometry
│   └── compiler.rs               AST → HTML/CSS, plus the in-frame runtime
│
├── css/
│   ├── tokens.css                every colour and metric in the editor
│   └── shell.css                 the outer grid and the boot screen
│
├── js/                           ── the browser layer ──
│   ├── main.js                   entry point
│   ├── core/
│   │   ├── app.js                the only module that talks to WASM
│   │   ├── wasm-bridge.js        loads pkg/, with actionable failure messages
│   │   ├── emitter.js            30-line pub/sub — the whole "state layer"
│   │   ├── shortcuts.js          the keyboard table
│   │   └── starter-template.js   the document a first-time visitor sees
│   ├── registry/
│   │   ├── elements.js           palette metadata, keyed by engine kind
│   │   └── inspector-schema.js   declarative property panel
│   ├── ui/
│   │   ├── icons.js              16×16 inline SVG set
│   │   ├── shared-styles.js      shadow-DOM style primitives
│   │   ├── panel-element.js      base class for every panel
│   │   └── components/           toolbar, palette, layers, canvas, inspector, status
│   └── util/files.js             download / open, on Blob and <input type=file>
│
├── docs/ARCHITECTURE.md          how the two halves fit together
└── CONTRIBUTING.md               how to add an element, a property, a panel
```

---

## 5. How it works, briefly

1. **The engine holds the truth.** A `DesignerEngine` in WASM memory owns a
   flat arena of `WebNode`s linked by id. JavaScript holds one handle to it and
   never mirrors the document.
2. **The preview is a sandboxed frame.** The engine compiles the tree into one
   HTML string; the canvas assigns it to `iframe.srcdoc`. The frame runs with
   `sandbox="allow-scripts"`, so the page being designed has an opaque origin
   and cannot reach the editor.
3. **Gestures never recompile.** Dragging an element asks the engine for that
   one node's declaration block and `postMessage`s it into the frame, which
   assigns `element.style.cssText`. Full recompiles are reserved for
   structural changes.
4. **Geometry comes back from the frame.** The compiled runtime reports every
   node's measured box on a `requestAnimationFrame`-coalesced schedule. Those
   rects go straight back into the engine, which answers hit tests, drop-target
   queries and snap-guide queries against real measurements — including for
   flex-flowed children, whose positions no model could predict.

The details are in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

---

## 6. Troubleshooting

**Boot screen says the engine could not start**
`./pkg` is missing. Run `wasm-pack build --target web`.

**`incorrect response MIME type` / `magic word`**
The `.wasm` file is being served as `application/octet-stream`. Use
`python serve.py`, which sets `application/wasm`.

**Blank page, console mentions `file://`**
ES modules and WebAssembly cannot load from the filesystem. Serve over HTTP.

**`wasm-pack: command not found`**
`cargo install wasm-pack`, then make sure `~/.cargo/bin` is on your `PATH`.

**Changes to `src/` do nothing**
`wasm-pack build` must be re-run; the browser only ever sees the compiled
`pkg/` output.

---

## 7. Licence

MIT. See [LICENSE](LICENSE).
