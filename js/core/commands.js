/**
 * Command matching for the palette — pure scoring, no app, no DOM.
 *
 * The palette asks two questions: which commands match what the user typed,
 * and in what order. Both answers live here so they can be tested without a
 * browser, and so the ranking cannot drift between the palette and any other
 * surface that wants to search commands later.
 *
 * The scoring tiers are ordered by how confident a match is:
 *
 *   1.0  the whole text is the query          "undo" → "Undo"
 *   0.9  the text starts with the query       "und"  → "Undo"
 *   0.85 a word inside starts with it         "project" → "Save the project file"
 *   0.75 the query appears mid-word           "port" → "Report"
 *   0.4–0.6 the letters appear in order       a subsequence, last resort
 *
 * Anything else does not match. Ties resolve to the original list order, so
 * an empty query shows commands in their authored order and a typed prefix
 * never scrambles equal candidates.
 *
 * @module core/commands
 */

/**
 * @typedef {object} Command
 * @property {string} id    stable identity, unique in one palette
 * @property {string} label what the user reads
 * @property {string} group section it belongs to, e.g. `"Edit"`
 * @property {string} [keys]  shortcut, shown as a keycap
 * @property {string} [detail] extra text matched but not shown
 * @property {() => void} run
 */

/**
 * The only spelling of a query that scoring ever sees.
 *
 * @param {unknown} query
 * @returns {string}
 */
export function normalizeQuery(query) {
  return String(query ?? '')
    .trim()
    .toLowerCase();
}

/**
 * How well one text matches the query.
 *
 * An empty query matches everything with score 0 — present, ranked, and all
 * tied, which is what keeps the authored order.
 *
 * @param {string} query raw, any case
 * @param {string} text  a field of a command
 * @returns {number | null} 0…1, or `null` for no match
 */
export function scoreMatch(query, text) {
  const q = normalizeQuery(query);
  const t = String(text ?? '').toLowerCase();
  if (q === '') {
    return 0;
  }
  if (t === q) {
    return 1;
  }
  if (t.startsWith(q)) {
    return 0.9;
  }
  const at = t.indexOf(q);
  if (at >= 0) {
    // A hit at the start of a word ("project" in "Save the project file")
    // reads as a real match; the same letters buried inside a word do not.
    return at > 0 && /[\s:/\-—(]/.test(t[at - 1]) ? 0.85 : 0.75;
  }

  // Subsequence: every query letter appears in order somewhere. Weak, but it
  // is what makes "expt" find "Export".
  let index = 0;
  for (const character of t) {
    if (character === q[index]) {
      index += 1;
      if (index === q.length) {
        return 0.4 + 0.2 * (q.length / Math.max(t.length, 1));
      }
    }
  }
  return null;
}

/**
 * Filters and ranks commands against a query.
 *
 * A command matches when *any* of its visible or hidden fields matches; the
 * best field's score is the command's score. Empty queries keep the input
 * order entirely.
 *
 * @param {Command[]} commands
 * @param {string} query
 * @param {number} [limit] pass `Infinity` to keep everything
 * @returns {Command[]} the same objects, in ranking order
 */
export function filterCommands(commands, query, limit = Infinity) {
  const q = normalizeQuery(query);
  /** @type {Array<{command: Command, score: number, index: number}>} */
  const scored = [];

  commands.forEach((command, index) => {
    const fields = [command.label, command.group, command.keys, command.detail].filter(Boolean);
    let best = null;
    for (const field of fields) {
      const score = scoreMatch(q, field);
      if (score !== null && (best === null || score > best)) {
        best = score;
      }
    }
    if (best !== null) {
      scored.push({ command, score: best, index });
    }
  });

  if (q !== '') {
    scored.sort((a, b) => b.score - a.score || a.index - b.index);
  }
  return scored.slice(0, limit).map((entry) => entry.command);
}
