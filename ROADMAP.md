# Roadmap

Where devlove is going, and why.

This is a plan, not a promise. Nothing here has a date, the order is a judgement
call rather than a commitment, and anything can be argued out of its place by a
good reason. If you want something moved, open an issue and say what it would
let you build — that argument beats a vote.

Two rules govern everything below, and a proposal that breaks either one needs
to justify itself before it needs anything else:

1. **No build step, no runtime dependencies.** Clone, serve, open. Every line
   that runs in the browser is a line you can read in this repository. A feature
   that needs a bundler is not a feature we ship.
2. **Two extension tables, not a hundred branches.** `ELEMENT_KINDS` and
   `STYLE_FIELDS` describe what exists; the panels render those tables and
   nothing else. A feature that makes a panel branch on element type is a
   feature designed wrong.

---

## Where it stands today

Working and covered by tests: the node engine with undo, hit testing and
snapping; the HTML/CSS compiler in a Web Worker; twenty element kinds and
around forty-five style properties; twelve composite blocks; four starter
templates; multi-select, clipboard, grouping, align and distribute; click
actions; image upload; and single-file export.

---

## Next

The things whose absence is felt most often.

### Responsive layout

The largest gap by a distance. The canvas has phone, tablet, laptop and desktop
presets, but they only resize the frame — the document has exactly one width and
the compiler emits no `@media` at all, so a page built at 1280 is a page that
breaks at 390.

The shape this should take: per-breakpoint **overrides** rather than per-breakpoint
documents. One node, one set of base properties, and a sparse patch per
breakpoint holding only what actually differs. That keeps the node arena as the
single source of truth, keeps the inspector rendering the same `STYLE_FIELDS`
table it renders now, and means a page with no overrides compiles to exactly the
CSS it compiles to today.

The hard part is not the compiler, it is the interface: making it obvious which
breakpoint you are editing and which values are inherited rather than set.

### Hover, focus and active states

There is a `transition` field on every element, which rather implies you can
make something change — and then there is nothing to transition to. The compiler
emits declarations, never selectors, so `:hover` is currently impossible even
through the custom-CSS escape hatch.

Same shape as breakpoints: a sparse patch per state. Worth doing at the same
time, since both are "the same node, under a different condition" and solving
them twice differently would be the wrong answer.

### More than one page

A project is one document, which is one page. Nav links scroll to anchors
because that is all they can do. Multi-page needs a document list, a page
switcher, links that can target a page instead of an anchor, and an export that
writes a folder rather than a file — while keeping the single-file export for
people who want exactly that.

### Reusable blocks

Blocks today are a starting point you take apart, deliberately: once dropped, a
navbar is ordinary nodes and the editor has no memory that it was ever a block.
That is the right default and it should stay the default.

But a navbar repeated across eight pages wants to be edited once. A **linked**
block — one definition, many instances, overridable per instance — is worth
having as an opt-in on top, not as a replacement.

### Document-level design tokens

Colours are per-node hex strings. Changing a brand colour means finding every
node that used it. A page-level palette and type scale, referenced by name, with
the inspector offering the named values first and a raw value as the escape
hatch.

---

## Later

Worth doing, not yet urgent.

- **Accessibility checks in the editor.** Missing alt text, heading levels that
  skip, colour contrast below AA. The compiler already walks every node, so it
  already knows; it just says nothing. A panel that lists what is wrong with the
  page you have would make the exported page better with no new drawing tools.
- **Editor accessibility.** The canvas and the layers tree are pointer-first.
  Full keyboard navigation and sensible screen-reader semantics for the tree,
  the palette and the inspector.
- **Asset management.** Uploaded images become data URIs inside the autosaved
  document, which inflates every save and every export. An asset store with
  deduplication, and an export that can write files beside the HTML.
- **Fonts.** The font stack is a free-text string. A picker, plus self-hosting
  so an exported page still makes no network request.
- **More export targets.** A JSX or Astro component alongside the HTML file, for
  people using the tool to draft rather than to ship.
- **Scroll and reveal animation.** Only if it can be done without shipping a
  library — CSS scroll-driven animations may make this cheap enough.
- **A version history worth the name.** Undo is a stack that dies with the tab.
  Named snapshots you can return to.
- **Layers tree virtualisation.** Every node renders a row. That is fine at a
  hundred nodes and will not be fine at three thousand.
- **A documented plugin surface.** The registries are already the extension
  point; what is missing is a supported way to add to them from outside the
  repository without patching files.
- **More templates.** Particularly a documentation layout and a blog post
  layout, both of which the block set now nearly covers.

---

## Not planned

Saying no is part of a roadmap. These are not oversights:

- **A hosted backend, accounts, or a paid tier.** The tool is files on your
  machine and a page you own.
- **Telemetry or analytics of any kind**, in the editor or in exported pages.
- **A component framework.** Exported pages are HTML and CSS, plus a couple of
  kilobytes of script when the page actually uses an action. Not React output
  pretending to be a website.
- **A visual CSS grid editor.** Grid is available and it works; a full
  grid-areas editor is a large amount of interface for something the current
  columns-and-gap model covers for the pages people build here.
- **npm as a runtime dependency.** ESLint and Prettier are optional dev tools
  and stay that way.

---

## Helping

`CONTRIBUTING.md` has the how. The short version: the two registry tables are
where most features start, `tests/unit/` runs in milliseconds with no browser,
and a pull request that adds a feature without adding a row to the relevant
table is usually a sign the feature wants to be designed differently.
