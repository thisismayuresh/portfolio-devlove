/**
 * A small syntax highlighter for the `code` element.
 *
 * It returns a **fragment spec**, not HTML — the same structure a kind's
 * `body` hook returns — so the compiler escapes every piece of source text
 * while rendering it. A highlighter that built strings would be one typo away
 * from letting a `<script>` in someone's code sample execute on their page.
 *
 * ## Scope
 *
 * This is not a parser and does not try to be one. It is a scanner: at each
 * position it tries an ordered list of patterns and takes the first that
 * matches. That is enough to colour comments, strings, numbers, keywords and
 * calls correctly, which is what a code block on a landing page needs, and it
 * fails gracefully — an unmatched character is emitted as plain text.
 *
 * Adding a language is one entry in `GRAMMARS`.
 *
 * @module engine/highlight
 */

/** Token classes, kept short because they are emitted once per token. */
const COMMENT = 'tk-c';
const STRING = 'tk-s';
const NUMBER = 'tk-n';
const KEYWORD = 'tk-k';
const TYPE = 'tk-t';
const META = 'tk-m';
const CALL = 'tk-f';
const PUNCT = 'tk-p';

/**
 * @param {string} words space-separated
 * @returns {RegExp} a sticky pattern matching any of them as a whole word
 */
function wordsOf(words) {
  return new RegExp(`\\b(?:${words.trim().split(/\s+/).join('|')})\\b`, 'y');
}

const JS_KEYWORDS =
  'abstract as async await break case catch class const continue declare default delete do ' +
  'else enum export extends finally for from function get if implements import in instanceof ' +
  'interface let new of private protected public readonly return satisfies set static super ' +
  'switch this throw try type typeof var void while yield true false null undefined';

/**
 * Ordered scanning rules per language. Order is the whole design: `comment`
 * has to be tried before `punct`, or `//` becomes two slashes.
 *
 * @type {Readonly<Record<string, ReadonlyArray<[string, RegExp]>>>}
 */
const GRAMMARS = Object.freeze({
  javascript: [
    [COMMENT, /\/\/[^\n]*|\/\*[\s\S]*?\*\//y],
    [STRING, /`(?:\\.|[^`\\])*`|'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"/y],
    // Decorators, which is most of what makes NestJS code look like NestJS.
    [META, /@[A-Za-z_$][\w$]*/y],
    [NUMBER, /\b\d[\d_]*(?:\.\d+)?(?:[eE][+-]?\d+)?\b/y],
    [KEYWORD, wordsOf(JS_KEYWORDS)],
    // A name followed by `(` is a call; a Capitalised name is a type.
    [CALL, /\b[A-Za-z_$][\w$]*(?=\s*\()/y],
    [TYPE, /\b[A-Z][\w$]*\b/y],
    [PUNCT, /[{}()[\]<>;,.:?=+\-*/%&|^!~]+/y],
  ],

  json: [
    // A quoted run followed by a colon is a key, and reads better in its own
    // colour than as one more string.
    [TYPE, /"(?:\\.|[^"\\])*"(?=\s*:)/y],
    [STRING, /"(?:\\.|[^"\\])*"/y],
    [NUMBER, /-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/y],
    [KEYWORD, wordsOf('true false null')],
    [PUNCT, /[{}[\],:]+/y],
  ],

  css: [
    [COMMENT, /\/\*[\s\S]*?\*\//y],
    [STRING, /'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"/y],
    [META, /@[A-Za-z-]+|--[\w-]+/y],
    [NUMBER, /-?\b\d*\.?\d+(?:px|rem|em|%|vh|vw|s|ms|deg|fr)?\b|#[0-9a-fA-F]{3,8}\b/y],
    [KEYWORD, /[a-zA-Z-]+(?=\s*:)/y],
    [TYPE, /\.[\w-]+|#[\w-]+|:[:\w-]+/y],
    [PUNCT, /[{}();,>~+*]+/y],
  ],

  html: [
    [COMMENT, /<!--[\s\S]*?-->/y],
    [STRING, /'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"/y],
    [TYPE, /<\/?[A-Za-z][\w-]*/y],
    [META, /\b[a-zA-Z-]+(?==)/y],
    [PUNCT, /[/>=]+/y],
  ],

  bash: [
    [COMMENT, /#[^\n]*/y],
    [STRING, /'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"/y],
    [META, /\$\{?[\w-]+\}?|--?[\w-]+/y],
    [
      KEYWORD,
      wordsOf('cd echo export if then else fi for do done while sudo npm npx node git curl'),
    ],
    [PUNCT, /[|&;()<>]+/y],
  ],

  python: [
    [COMMENT, /#[^\n]*/y],
    [STRING, /'''[\s\S]*?'''|"""[\s\S]*?"""|'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"/y],
    [META, /@[A-Za-z_][\w.]*/y],
    [NUMBER, /\b\d[\d_]*(?:\.\d+)?\b/y],
    [
      KEYWORD,
      wordsOf(
        'and as assert async await break class continue def del elif else except finally for ' +
          'from global if import in is lambda None nonlocal not or pass raise return True False ' +
          'try while with yield'
      ),
    ],
    [CALL, /\b[A-Za-z_]\w*(?=\s*\()/y],
    [TYPE, /\b[A-Z]\w*\b/y],
    [PUNCT, /[{}()[\];,.:?=+\-*/%&|^!~<>]+/y],
  ],
});

/** Languages the Code element offers, in the order the inspector lists them. */
export const LANGUAGES = Object.freeze([
  'plain',
  'javascript',
  'typescript',
  'json',
  'html',
  'css',
  'bash',
  'python',
]);

/** TypeScript is scanned with the JavaScript rules; the keyword list covers both. */
const LANGUAGE_ALIASES = Object.freeze({
  typescript: 'javascript',
  ts: 'javascript',
  js: 'javascript',
});

/**
 * Splits source into coloured spans.
 *
 * @param {string} source
 * @param {string} [language] a member of `LANGUAGES`; anything unknown, and
 *   `plain`, returns the source as a single unstyled run
 * @returns {any} a fragment spec — see `engine/kinds.js`
 */
export function highlight(source, language = 'plain') {
  const key = LANGUAGE_ALIASES[language] || language;
  const rules = GRAMMARS[key];
  const text = String(source ?? '');
  if (!rules || text === '') {
    return text;
  }

  /** @type {any[]} */
  const out = [];
  /** Characters no rule matched, held back so they emit as one run. */
  let plain = '';

  const flush = () => {
    if (plain !== '') {
      out.push(plain);
      plain = '';
    }
  };

  let index = 0;
  while (index < text.length) {
    let matched = false;

    for (const [token, pattern] of rules) {
      pattern.lastIndex = index;
      const found = pattern.exec(text);
      // A sticky pattern can only match at `lastIndex`, but a zero-length
      // match would spin this loop forever — treat it as no match.
      if (found && found[0].length > 0) {
        flush();
        out.push({ tag: 'span', attrs: { class: token }, text: found[0] });
        index += found[0].length;
        matched = true;
        break;
      }
    }

    if (!matched) {
      plain += text[index];
      index += 1;
    }
  }

  flush();
  return out;
}

/**
 * Token colours for the compiled page.
 *
 * A restrained dark palette in the same family as a code editor's default —
 * enough hue to separate strings from keywords, not so much that a code block
 * becomes the loudest thing on the page.
 */
export const HIGHLIGHT_CSS =
  `& .${COMMENT}{color:#7c8798;font-style:italic}` +
  `& .${STRING}{color:#a8d08a}` +
  `& .${NUMBER}{color:#e0a45e}` +
  `& .${KEYWORD}{color:#c792ea}` +
  `& .${TYPE}{color:#7fd6c2}` +
  `& .${META}{color:#e5c07b}` +
  `& .${CALL}{color:#82aaff}` +
  `& .${PUNCT}{color:#93a1b5}`;
