/**
 * The document a first-time visitor lands on.
 *
 * Templates are plain data: a page patch plus a flat list of nodes with
 * optional `ref` aliases used as parents. `ForgeApp.applyTemplate` replays
 * them through the engine, so anything expressible in the editor is
 * expressible here — which makes this file the easiest place to contribute a
 * new starting point.
 *
 * @module core/starter-template
 */

/**
 * @typedef {object} TemplateNode
 * @property {string} kind    engine element kind
 * @property {string} [ref]   alias other nodes can use as `parent`
 * @property {string} [parent] `"root"` or another node's `ref`
 * @property {number} [x]
 * @property {number} [y]
 * @property {Record<string, string|number|boolean>} [props]
 */

/** @type {{page: Record<string, string|number>, nodes: TemplateNode[]}} */
export const STARTER_TEMPLATE = {
  page: {
    title: 'Forge — starter page',
    width: 1280,
    minHeight: 1080,
    background: '#f7f8fb',
  },
  nodes: [
    // ------------------------------------------------------------ hero band
    {
      kind: 'section',
      ref: 'hero',
      parent: 'root',
      x: 0,
      y: 0,
      props: {
        name: 'Hero',
        width: 1280,
        height: 480,
        'style.background': 'linear-gradient(135deg, #0f1729 0%, #1d2a52 60%, #2b1d52 100%)',
        'style.padding': 0,
      },
    },
    {
      kind: 'heading',
      parent: 'hero',
      x: 120,
      y: 132,
      props: {
        name: 'Hero title',
        width: 660,
        content: 'Design a website by dragging it into place.',
        'style.fontSize': 56,
        'style.lineHeight': 1.1,
        'style.fontWeight': '700',
        'style.color': '#ffffff',
        'style.letterSpacing': -1,
      },
    },
    {
      kind: 'text',
      parent: 'hero',
      x: 120,
      y: 292,
      props: {
        name: 'Hero copy',
        width: 560,
        content:
          'A Rust and WebAssembly core holds the document. The interface is plain HTML, CSS and JavaScript — no frameworks, no build step for the UI.',
        'style.fontSize': 18,
        'style.lineHeight': 1.65,
        'style.color': 'rgba(233,238,250,0.78)',
      },
    },
    {
      kind: 'button',
      parent: 'hero',
      x: 120,
      y: 384,
      props: {
        name: 'Primary CTA',
        width: 176,
        height: 50,
        content: 'Start building',
        'style.background': '#4a8cff',
        'style.radius': 10,
        'style.fontSize': 16,
      },
    },
    {
      kind: 'button',
      parent: 'hero',
      x: 316,
      y: 384,
      props: {
        name: 'Secondary CTA',
        width: 148,
        height: 50,
        content: 'View source',
        'style.background': 'rgba(255,255,255,0.08)',
        'style.color': '#e9eefa',
        'style.borderWidth': 1,
        'style.borderColor': 'rgba(255,255,255,0.22)',
        'style.radius': 10,
        'style.fontSize': 16,
      },
    },
    {
      kind: 'container',
      parent: 'hero',
      x: 800,
      y: 108,
      props: {
        name: 'Hero panel',
        width: 360,
        height: 264,
        'style.background': 'rgba(255,255,255,0.06)',
        'style.borderWidth': 1,
        'style.borderColor': 'rgba(255,255,255,0.14)',
        'style.radius': 18,
        'style.shadow': '0 24px 60px rgba(0,0,0,0.35)',
      },
    },

    // -------------------------------------------------------- feature strip
    {
      kind: 'heading',
      parent: 'root',
      x: 120,
      y: 568,
      props: {
        name: 'Features title',
        width: 520,
        content: 'Everything runs locally',
        'style.fontSize': 34,
        'style.color': '#0f1729',
      },
    },
    {
      kind: 'stack',
      ref: 'features',
      parent: 'root',
      x: 120,
      y: 648,
      props: {
        name: 'Feature row',
        width: 1040,
        height: 220,
        layout: 'row',
        'style.gap': 24,
        'style.padding': 0,
        'style.background': 'transparent',
      },
    },
    {
      kind: 'container',
      ref: 'card-a',
      parent: 'features',
      props: {
        name: 'Card — engine',
        width: 330,
        height: 220,
        'style.background': '#ffffff',
        'style.radius': 16,
        'style.padding': 26,
        'style.borderWidth': 1,
        'style.borderColor': '#e5e9f1',
        'style.shadow': '0 10px 28px rgba(15,23,41,0.06)',
      },
    },
    {
      kind: 'heading',
      parent: 'card-a',
      x: 26,
      y: 26,
      props: {
        width: 250,
        content: 'Rust core',
        'style.fontSize': 20,
        'style.color': '#0f1729',
      },
    },
    {
      kind: 'text',
      parent: 'card-a',
      x: 26,
      y: 66,
      props: {
        width: 268,
        content:
          'Every mutation, hit test and HTML/CSS compilation happens inside WebAssembly.',
        'style.fontSize': 15,
        'style.color': '#5a6580',
      },
    },
    {
      kind: 'container',
      ref: 'card-b',
      parent: 'features',
      props: {
        name: 'Card — UI',
        width: 330,
        height: 220,
        'style.background': '#ffffff',
        'style.radius': 16,
        'style.padding': 26,
        'style.borderWidth': 1,
        'style.borderColor': '#e5e9f1',
        'style.shadow': '0 10px 28px rgba(15,23,41,0.06)',
      },
    },
    {
      kind: 'heading',
      parent: 'card-b',
      x: 26,
      y: 26,
      props: {
        width: 250,
        content: 'Zero libraries',
        'style.fontSize': 20,
        'style.color': '#0f1729',
      },
    },
    {
      kind: 'text',
      parent: 'card-b',
      x: 26,
      y: 66,
      props: {
        width: 268,
        content:
          'The editor is Web Components, Shadow DOM and native pointer events. Nothing is installed.',
        'style.fontSize': 15,
        'style.color': '#5a6580',
      },
    },
    {
      kind: 'container',
      ref: 'card-c',
      parent: 'features',
      props: {
        name: 'Card — preview',
        width: 330,
        height: 220,
        'style.background': '#ffffff',
        'style.radius': 16,
        'style.padding': 26,
        'style.borderWidth': 1,
        'style.borderColor': '#e5e9f1',
        'style.shadow': '0 10px 28px rgba(15,23,41,0.06)',
      },
    },
    {
      kind: 'heading',
      parent: 'card-c',
      x: 26,
      y: 26,
      props: {
        width: 250,
        content: 'Isolated preview',
        'style.fontSize': 20,
        'style.color': '#0f1729',
      },
    },
    {
      kind: 'text',
      parent: 'card-c',
      x: 26,
      y: 66,
      props: {
        width: 268,
        content:
          'Your page renders inside a sandboxed iframe, so its styles can never leak into the editor.',
        'style.fontSize': 15,
        'style.color': '#5a6580',
      },
    },

    // ------------------------------------------------------------- closing
    {
      kind: 'divider',
      parent: 'root',
      x: 120,
      y: 928,
      props: { width: 1040, height: 1, 'style.background': '#e2e6ee' },
    },
    {
      kind: 'text',
      parent: 'root',
      x: 120,
      y: 964,
      props: {
        name: 'Footer note',
        width: 640,
        content: 'Select an element on the canvas, or drag a new one in from the left.',
        'style.fontSize': 14,
        'style.color': '#7a8499',
      },
    },
  ],
};
