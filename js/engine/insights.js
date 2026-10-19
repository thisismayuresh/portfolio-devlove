/**
 * Read-only analysis over a document snapshot.
 *
 * Four queries feed the dock panels — Problems, Find, Assets and Theme — and
 * every one of them is a pure function of the document: no engine instance, no
 * app, no DOM. That is what lets `tests/unit/insights.test.js` exercise the
 * rules in milliseconds, and what keeps a stale panel from ever lying: each
 * render simply recomputes from the current snapshot.
 *
 * The rules are deliberately conservative. A problem is reported only when the
 * document cannot do what it says it does — a link with nowhere to go, a
 * Scroll action addressing an anchor that does not exist — rather than when
 * the author has not finished writing yet. Empty text counts as an error
 * because an empty heading ships as an empty heading; there is no reading of
 * it that works.
 *
 * Nothing here writes. Callers hand the results to the engine or the app.
 *
 * @module engine/insights
 */

/**
 * Severities, worst first. The Problems panel sorts on this order, so the
 * array doubles as the ranking table.
 */
export const SEVERITIES = Object.freeze(['error', 'warning', 'info']);

/** Rank per severity; lower sorts first. */
const SEVERITY_RANK = Object.freeze({ error: 0, warning: 1, info: 2 });

/** Kinds whose entire job is to carry text — an empty one is a broken one. */
const TEXT_KINDS = new Set(['heading', 'text', 'button', 'link', 'quote', 'label']);

/** Kinds the Assets panel treats as media. */
const MEDIA_KINDS = new Set(['image', 'video']);

/**
 * Style fields that hold a colour, directly or as part of a larger value.
 * `shadow` and `textShadow` are included because they are where a colour
 * picker's output most often lands when it comes from a box-shadow editor.
 */
const COLOR_FIELDS = [
  'color',
  'background',
  'backgroundImage',
  'borderColor',
  'shadow',
  'textShadow',
];

/** One colour token anywhere in a string: hex, rgb()/rgba() or hsl()/hsla(). */
const COLOR_TOKEN = /#[0-9a-f]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/i;

/** The same token, global, for extraction. Built fresh to avoid lastIndex state. */
const COLOR_TOKENS = new RegExp(COLOR_TOKEN, 'gi');

/** Page settings that are themselves problems when blank. */
function pageTitle(doc) {
  return String((doc.page && doc.page.title) || '').trim();
}

/**
 * Depth-first walk over every node in document order, root excluded.
 *
 * Hidden nodes are visited: an invisible element with a broken link is still
 * a broken link, and hiding it is a way of forgetting about it, which is
 * exactly what this panel exists to prevent.
 *
 * @param {any} doc
 * @param {(node: any) => void} visit
 */
function eachNode(doc, visit) {
  /**
   * @param {string} id
   */
  const walk = (id) => {
    const node = doc.nodes[id];
    if (!node) {
      return;
    }
    if (id !== doc.root) {
      visit(node);
    }
    for (const child of node.children || []) {
      walk(child);
    }
  };
  walk(doc.root);
}

/**
 * Every actionable flaw in the document, worst first.
 *
 * Each problem carries the id of the node it belongs to — `'root'` for page
 * level problems — so the panel can select and reveal it in one click.
 *
 * @param {any} doc
 * @returns {Array<{id: string, severity: 'error'|'warning'|'info', code: string, message: string}>}
 */
export function listProblems(doc) {
  /** @type {Array<{id: string, severity: 'error'|'warning'|'info', code: string, message: string}>} */
  const problems = [];
  /**
   * @param {string} id
   * @param {'error'|'warning'|'info'} severity
   * @param {string} code stable machine name, useful in tests
   * @param {string} message human sentence, safe to render as text
   */
  const add = (id, severity, code, message) => problems.push({ id, severity, code, message });

  // Anchor values to their holders, so a Scroll action can be resolved in the
  // opposite direction and duplicates are visible from both ends.
  /** @type {Map<string, string[]>} */
  const anchors = new Map();
  eachNode(doc, (node) => {
    if (node.anchor) {
      anchors.set(node.anchor, [...(anchors.get(node.anchor) || []), node.id]);
    }
  });

  if (!pageTitle(doc)) {
    add(doc.root, 'error', 'page-title', 'The page has no title');
  }

  eachNode(doc, (node) => {
    const name = String(node.name || node.kind);

    // --- content that renders as nothing ----------------------------------
    if (TEXT_KINDS.has(node.kind) && !String(node.content ?? '').trim()) {
      add(node.id, 'error', 'empty-content', `"${name}" has no text`);
    }
    if (node.kind === 'table' && !String((node.data || {}).rows ?? '').trim()) {
      add(node.id, 'error', 'empty-rows', `"${name}" has no rows`);
    }
    if (node.kind === 'list' && !String((node.data || {}).items ?? '').trim()) {
      add(node.id, 'error', 'empty-items', `"${name}" has no items`);
    }

    // --- media that cannot render ------------------------------------------
    if (node.kind === 'image' && !String(node.content ?? '').trim()) {
      add(node.id, 'warning', 'image-no-alt', `"${name}" has no alt text`);
    }
    if (node.kind === 'video' && !String(node.src ?? '').trim()) {
      add(node.id, 'error', 'video-no-src', `"${name}" has no source file`);
    }

    // --- links --------------------------------------------------------------
    if (node.kind === 'link') {
      const href = String(node.href ?? '').trim();
      if (!href || href === '#' || href === 'mailto:' || href === 'tel:') {
        add(node.id, 'error', 'link-no-href', `"${name}" points nowhere`);
      }
    }

    // --- click actions ------------------------------------------------------
    const action = String((node.data || {}).action ?? '').trim();
    const target = String((node.data || {}).target ?? '').trim();

    if (action === 'scroll') {
      if (!target) {
        add(node.id, 'error', 'scroll-no-target', `"${name}" scrolls to nothing`);
      } else {
        const holders = anchors.get(target);
        if (!holders) {
          add(
            node.id,
            'error',
            'scroll-missing-anchor',
            `"${name}" scrolls to "${target}", which does not exist`
          );
        } else if (holders.some((holderId) => doc.nodes[holderId] && doc.nodes[holderId].hidden)) {
          add(
            node.id,
            'warning',
            'scroll-hidden-target',
            `"${name}" scrolls to "${target}", which is hidden`
          );
        }
      }
    }

    if (action === 'copy' && !target) {
      add(node.id, 'warning', 'copy-no-text', `"${name}" copies nothing`);
    }

    if (node.kind === 'button' && !action) {
      add(node.id, 'warning', 'button-no-action', `"${name}" does nothing when clicked`);
    }

    if (node.kind === 'form') {
      const endpoint = String((node.data || {}).endpoint ?? '').trim();
      if (!endpoint) {
        add(node.id, 'warning', 'form-no-endpoint', `"${name}" has no endpoint`);
      } else if (endpoint.includes('your-id')) {
        add(
          node.id,
          'warning',
          'form-placeholder',
          `"${name}" still uses the placeholder endpoint`
        );
      }
    }

    // --- anchors ------------------------------------------------------------
    if (node.anchor) {
      const holders = anchors.get(node.anchor) || [];
      if (holders[0] !== node.id) {
        add(node.id, 'error', 'duplicate-anchor', `"${name}" reuses the anchor "${node.anchor}"`);
      }
    }
  });

  // Stable sort: within one severity, document order survives.
  problems.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
  return problems;
}

/**
 * Nodes matching a free-text query, in document order.
 *
 * The haystack is the node's name, its content, its kind and its per-kind
 * content fields — typing "table" should find every table, and typing a word
 * from a paragraph should find that paragraph.
 *
 * @param {any} doc
 * @param {string} query
 * @param {number} [limit]
 * @returns {Array<{id: string, kind: string, name: string, snippet: string, hidden: boolean}>}
 */
export function findNodes(doc, query, limit = 100) {
  const needle = String(query ?? '')
    .trim()
    .toLowerCase();
  if (!needle) {
    return [];
  }

  /** @type {Array<{id: string, kind: string, name: string, snippet: string, hidden: boolean}>} */
  const results = [];
  eachNode(doc, (node) => {
    if (results.length >= limit) {
      return;
    }
    const name = String(node.name || node.kind);
    const content = String(node.content ?? '');
    const data = node.data || {};
    const fields = [name, content, node.kind, String(data.rows ?? ''), String(data.items ?? '')];
    if (!fields.some((field) => field.toLowerCase().includes(needle))) {
      return;
    }
    results.push({
      id: node.id,
      kind: node.kind,
      name,
      snippet: snippetOf(content || String(data.rows ?? '') || String(data.items ?? '')),
      hidden: Boolean(node.hidden),
    });
  });
  return results;
}

/**
 * Every image and video in the document, with the source it renders.
 *
 * @param {any} doc
 * @returns {Array<{id: string, kind: 'image'|'video', name: string, src: string, alt: string}>}
 */
export function listAssets(doc) {
  /** @type {Array<{id: string, kind: 'image'|'video', name: string, src: string, alt: string}>} */
  const assets = [];
  eachNode(doc, (node) => {
    if (!MEDIA_KINDS.has(node.kind)) {
      return;
    }
    assets.push({
      id: node.id,
      kind: node.kind,
      name: String(node.name || node.kind),
      src: String(node.src ?? ''),
      alt: String(node.content ?? ''),
    });
  });
  return assets;
}

/**
 * Every colour actually painted by the document, most-used first.
 *
 * Only real colour tokens count — hex, `rgb()`, `hsl()` — pulled from the
 * typed colour fields, the raw `custom` declarations, and the page
 * background. Keyword values such as `transparent` or `inherit` are not
 * colours anyone reuses, so they never appear.
 *
 * @param {any} doc
 * @returns {Array<{value: string, count: number, ids: string[]}>}
 */
export function listColors(doc) {
  /** @type {Map<string, {value: string, count: number, ids: Set<string>}>} */
  const found = new Map();

  /**
   * @param {string} raw any string that may contain colour tokens
   * @param {string} id the node the colour belongs to
   */
  const harvest = (raw, id) => {
    const text = String(raw ?? '');
    if (!text || !COLOR_TOKEN.test(text)) {
      return;
    }
    for (const match of text.matchAll(COLOR_TOKENS)) {
      const value = match[0].toLowerCase();
      let entry = found.get(value);
      if (!entry) {
        entry = { value, count: 0, ids: new Set() };
        found.set(value, entry);
      }
      entry.count += 1;
      entry.ids.add(id);
    }
  };

  if (doc.page && doc.page.background) {
    harvest(doc.page.background, doc.root);
  }

  eachNode(doc, (node) => {
    const style = node.style || {};
    for (const field of COLOR_FIELDS) {
      if (style[field]) {
        harvest(style[field], node.id);
      }
    }
    const custom = style.custom || {};
    for (const value of Object.values(custom)) {
      harvest(value, node.id);
    }
  });

  return [...found.values()]
    .map((entry) => ({ value: entry.value, count: entry.count, ids: [...entry.ids] }))
    .sort((a, b) => b.count - a.count || (a.value < b.value ? -1 : a.value > b.value ? 1 : 0));
}

/**
 * A one-line preview of a text field, collapsed to a single line.
 *
 * @param {string} text
 * @returns {string}
 */
function snippetOf(text) {
  const collapsed = String(text).replace(/\s+/g, ' ').trim();
  return collapsed.length > 90 ? `${collapsed.slice(0, 89)}…` : collapsed;
}
