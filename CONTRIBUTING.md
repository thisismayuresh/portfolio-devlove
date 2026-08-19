# Contributing

The codebase is organised so that the three most common changes — a new
element, a new property, a new panel — are each a short, obvious edit in a
known place. If a change you want to make feels like it needs edits scattered
across many files, that is a design bug; please open an issue.

---

## Ground rules

1. **No third-party JavaScript.** No frameworks, no UI libraries, no state
   managers, no npm packages, no CDN links. Standard Web Platform APIs only.
   This is the project's defining constraint, not a preference.
2. **Rust deps stay minimal.** `wasm-bindgen`, `serde`, `serde_json` — a new
   crate needs a justification in the PR description.
3. **The engine owns the document.** If you find yourself caching node data in
   JavaScript, stop: read it from the engine instead.
4. **No `unwrap()` on anything a user can influence.** Return
   `Result<_, String>` inside the crate and let `lib.rs` convert it.
5. **Document the *why*.** Every module opens with a doc comment explaining
   what it is responsible for. Public functions get JSDoc / rustdoc.
6. **Keep it readable.** 4-space indent in Rust, 2 in JS; single quotes in JS;
   `kebab-case` files, `PascalCase` classes, `camelCase` members.

Before opening a PR:

```bash
cargo fmt
cargo clippy --target wasm32-unknown-unknown -- -D warnings
cargo test
wasm-pack build --target web        # must succeed
```

There is no JS toolchain to run. Load the page and exercise the change.

---

## Add a new element type

Say you want a **Video** primitive. Three edits.

### 1. Teach the engine about it — `src/node.rs`

Add the variant and fill in its arms. The compiler will list every match that
needs one, so nothing can be forgotten:

```rust
pub enum NodeKind {
    // …
    Video,
}
```

| Method | What to return |
| --- | --- |
| `parse` | `"video" => Some(NodeKind::Video)` plus any aliases |
| `as_str` / `label` | `"video"` / `"Video"` |
| `tag` | `"video"` |
| `is_void` | `false` (it can carry `<source>` children later) |
| `accepts_children` | `false` |
| `has_text` | `false` |
| `default_size` | `(480.0, 270.0)` |
| `default_content` | `""` |
| `default_style` | a `Style` with whatever defaults look right |

If the element needs an attribute no other kind has, add an `Option<String>`
field to `WebNode`, a `set_prop` arm for it, and an arm in
`compiler::write_node` that emits it.

### 2. Put it in the palette — `js/registry/elements.js`

```js
{
  kind: 'video',            // must match NodeKind::parse
  label: 'Video',
  icon: 'video',            // a key in js/ui/icons.js
  hint: 'Embedded video player',
  container: false,
}
```

Add the `video` glyph to `GLYPHS` in `js/ui/icons.js` — a 16×16 stroke path.

### 3. Give it inspector fields — `js/registry/inspector-schema.js`

Extend the `when` predicate of an existing section, or add fields:

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

Rebuild the crate and reload. Drag, drop, select, style — everything else
already works, because no other code branches on element type.

---

## Add a new property to an existing element

**Engine-side**, add a typed field to `Style` in `src/node.rs`, a `set` arm for
it, and a line in `write_declarations`. Use `Option<T>` so an unset property
emits nothing.

**UI-side**, add one descriptor to the right section of
`js/registry/inspector-schema.js`:

```js
{
  key: 'style.blur',      // matches the `set` arm
  label: 'Blur',
  type: 'number',
  min: 0,
  step: 1,
  live: true,             // slider/colour drags skip the undo stack
  read: read('style.blur', ''),
}
```

Field types available today: `number`, `text`, `textarea`, `color`, `select`,
`segmented`, `toggle`, `slider`. Adding a new one means one `case` in
`ForgeInspector._renderField` and, if it is interactive, a branch in
`_onInput` / `_onClick`.

If the property cannot be expressed as an inline style patch (it changes
markup or affects children), add its key to `STRUCTURAL_KEYS` in
`js/core/app.js` so it triggers a full recompile.

---

## Add a new panel

1. Create `js/ui/components/forge-thing.js`, extend `PanelElement`, implement
   `static styles`, `template()` and `mounted()`, and call
   `customElements.define('forge-thing', ForgeThing)` at the bottom.
2. Subscribe with `this.listen(topic, handler)` and bind DOM events with
   `this.bind(target, type, handler)` — both are torn down automatically on
   disconnect.
3. Add `<forge-thing>` to `index.html` and a slot for it in the `.shell` grid
   in `css/shell.css`.
4. Import it in `js/main.js`.

Read state from `app.state` and the engine; never keep your own copy.

---

## Add a keyboard shortcut

One entry in `BINDINGS` in `js/core/shortcuts.js`:

```js
{ keys: 'ctrl+shift+d', description: 'Detach from parent', run: () => … },
```

Modifier order in the signature is `ctrl`, `alt`, `shift`, then the lowercased
`event.key`. `ctrl` also matches `⌘`. Typing contexts are excluded
automatically, including inside shadow roots.

---

## Add an engine method

1. Implement the real logic on `Engine` in `src/engine.rs`, returning
   `Result<T, String>`.
2. Expose it in `src/lib.rs` with `#[wasm_bindgen(js_name = camelCase)]`,
   mapping the error with `to_js_error`. Return primitives or JSON strings —
   never a Rust type.
3. Decide the history policy: automatic checkpoint for structural changes,
   none for gesture fast paths (document which in the doc comment).
4. Wrap it in a command method on `ForgeApp` so panels never call the engine
   directly.

---

## Retheme the editor

Every colour and metric is a custom property in `css/tokens.css`. Because
custom properties cross shadow boundaries, editing that one file restyles all
panels. Do not hard-code a colour inside a component.

---

## Testing

Rust logic is testable without a browser — the engine has no `web_sys`
dependency:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deleting_a_container_removes_its_children() {
        let mut engine = Engine::new();
        let parent = engine.add(NodeKind::Container, None, 0.0, 0.0).unwrap();
        let child = engine.add(NodeKind::Text, Some(&parent), 0.0, 0.0).unwrap();
        engine.delete(&parent).unwrap();
        assert!(engine.node(&child).is_none());
    }
}
```

Run with `cargo test` (host target — no WASM needed).

For the browser layer, exercise the change by hand and say in the PR what you
checked: at minimum drag, resize, undo, preview and export.
