/**
 * Icon set — hand-drawn 16×16 stroke paths on a 16-unit grid.
 *
 * Every glyph inherits `currentColor` and a 1.25 stroke so icons stay legible
 * at UI scale without looking heavy. To add one, append a path string to
 * `GLYPHS`; nothing else needs to change.
 *
 * **Corners are square.** Rectangles carry no `rx`, and the stroke joins are
 * mitred rather than rounded. That is not a stylistic whim: this set sits
 * beside VS Code's own Codicons in the same field of view, and a soft-cornered
 * icon in that company reads as decoration rather than as a control.
 *
 * @module ui/icons
 */

/** @type {Readonly<Record<string, string>>} */
export const GLYPHS = Object.freeze({
  // --- primitives -----------------------------------------------------------
  section: '<rect x="2" y="3" width="12" height="10"/><path d="M2 6.5h12"/>',
  container: '<rect x="2.5" y="2.5" width="11" height="11"/>',
  stack:
    '<rect x="2.5" y="2.5" width="11" height="3.5"/><rect x="2.5" y="7.5" width="11" height="3.5"/><path d="M2.5 13.5h11"/>',
  heading: '<path d="M3.4 12.6V3.4M10.6 12.6V3.4M3.4 8h7.2"/><path d="M12.6 3.4h1.4"/>',
  text: '<path d="M2.6 3.8h10.8M2.6 7.2h10.8M2.6 10.6h7.4M2.6 13.2h4.6"/>',
  button: '<rect x="1.5" y="4.5" width="13" height="7"/><path d="M5.5 8h5"/>',
  link: '<path d="M6.6 9.4a2.9 2.9 0 0 0 4.1 0l1.9-1.9a2.9 2.9 0 0 0-4.1-4.1l-.9.9"/><path d="M9.4 6.6a2.9 2.9 0 0 0-4.1 0L3.4 8.5a2.9 2.9 0 0 0 4.1 4.1l.9-.9"/>',
  image:
    '<rect x="2" y="3" width="12" height="10"/><circle cx="5.6" cy="6.4" r="1.1"/><path d="M2.4 11.6 6 8.4l2.4 2.1 2.2-1.8 3 3"/>',
  input: '<rect x="1.5" y="4.5" width="13" height="7"/><path d="M4.5 6.5v3"/>',
  divider: '<path d="M2 8h12"/><path d="M4.6 4.6h6.8M4.6 11.4h6.8" opacity=".4"/>',
  root: '<rect x="2" y="2.5" width="12" height="11"/><path d="M2 5.5h12"/><circle cx="4.2" cy="4" r=".7" fill="currentColor" stroke="none"/>',

  // Added with the second wave of primitives.
  list: '<path d="M6 4h8M6 8h8M6 12h8"/><path d="M2.6 4h.9M2.6 8h.9M2.6 12h.9"/>',
  table:
    '<rect x="2" y="3" width="12" height="10"/><path d="M2 6.4h12M2 9.7h12M6.4 6.4V13M10 6.4V13"/>',
  quote: '<path d="M3 5h4v4a3 3 0 0 1-3 3"/><path d="M9.5 5h4v4a3 3 0 0 1-3 3"/>',
  video: '<rect x="1.5" y="3.5" width="9" height="9"/><path d="M10.5 7.2 14.5 5v6l-4-2.2Z"/>',
  spacer:
    '<path d="M2 3h12M2 13h12"/><path d="M8 5.5v5"/><path d="M6.2 7 8 5.2 9.8 7M6.2 9 8 10.8 9.8 9"/>',
  textarea: '<rect x="1.5" y="2.5" width="13" height="11"/><path d="M4 5.5h8M4 8h8M4 10.5h4.5"/>',
  label: '<path d="M2.5 4h11"/><path d="M2.5 8h7"/><path d="M2.5 12h4"/>',
  // A page with a header band and a sidebar — a layout, not a grid of
  // squares. Deliberately unlike the `grid` glyph, which is an element.
  templates:
    '<rect x="1.5" y="2.5" width="13" height="11"/><path d="M1.5 5.8h13"/>' +
    '<path d="M6.2 5.8v7.7"/>',
  form:
    '<rect x="1.5" y="2.5" width="13" height="11"/><path d="M4 5.5h8M4 8h8"/>' +
    '<rect x="4" y="10" width="4.5" height="2"/>',

  // --- actions --------------------------------------------------------------
  undo: '<path d="M3 7.6h7a3.4 3.4 0 0 1 0 6.8H6.4"/><path d="M5.6 4.6 2.6 7.6l3 3"/>',
  redo: '<path d="M13 7.6H6a3.4 3.4 0 0 0 0 6.8h3.6"/><path d="M10.4 4.6l3 3-3 3"/>',
  trash:
    '<path d="M2.8 4.4h10.4"/><path d="M6.4 4.4V2.9h3.2v1.5"/><path d="M4.2 4.4l.7 8.3a1 1 0 0 0 1 .9h4.2a1 1 0 0 0 1-.9l.7-8.3"/><path d="M6.8 6.9v4M9.2 6.9v4"/>',
  duplicate: '<rect x="5.5" y="5.5" width="8" height="8"/><path d="M10.5 5.5v-3h-8v8h3"/>',
  eye: '<path d="M1.6 8s2.4-4.3 6.4-4.3S14.4 8 14.4 8s-2.4 4.3-6.4 4.3S1.6 8 1.6 8Z"/><circle cx="8" cy="8" r="1.9"/>',
  eyeOff:
    '<path d="M6.3 3.9A6.8 6.8 0 0 1 8 3.7c4 0 6.4 4.3 6.4 4.3a12 12 0 0 1-2.2 2.7M4.2 5.2A11.8 11.8 0 0 0 1.6 8s2.4 4.3 6.4 4.3a6.7 6.7 0 0 0 2.3-.4"/><path d="M2.4 2.4l11.2 11.2"/>',
  lock: '<rect x="3.5" y="7" width="9" height="6.5"/><path d="M5.6 7V5.2a2.4 2.4 0 0 1 4.8 0V7"/>',
  unlock: '<rect x="3.5" y="7" width="9" height="6.5"/><path d="M5.6 7V5.2a2.4 2.4 0 0 1 4.6-.8"/>',
  chevronRight: '<path d="M6.2 3.6 10.6 8l-4.4 4.4"/>',
  chevronDown: '<path d="M3.6 6.2 8 10.6l4.4-4.4"/>',
  play: '<path d="M4.8 3.2 12.4 8l-7.6 4.8Z"/>',
  cursor: '<path d="M3.4 2.6 12.8 8l-4 1.1L6.6 13Z"/>',
  download: '<path d="M8 2.6v7.6"/><path d="M4.9 7.4 8 10.5l3.1-3.1"/><path d="M2.8 12.8h10.4"/>',
  upload: '<path d="M8 10.4V2.8"/><path d="M4.9 5.9 8 2.8l3.1 3.1"/><path d="M2.8 12.8h10.4"/>',
  save: '<path d="M3.4 2.6h7.1l2.5 2.5v8.3a.8.8 0 0 1-.8.8H3.4a.8.8 0 0 1-.8-.8V3.4a.8.8 0 0 1 .8-.8Z"/><path d="M5.4 2.6v3.6h5.2V2.6M5.4 13.4v-3.6h5.2v3.6"/>',
  plus: '<path d="M8 3.2v9.6M3.2 8h9.6"/>',
  minus: '<path d="M3.2 8h9.6"/>',
  close: '<path d="m4 4 8 8M12 4l-8 8"/>',
  layers:
    '<path d="M8 2.2 14 5.4 8 8.6 2 5.4Z"/><path d="m2 8.6 6 3.2 6-3.2"/><path d="m2 11.4 6 3.2 6-3.2" opacity=".5"/>',
  sliders:
    '<path d="M3.2 4.6h9.6M3.2 11.4h9.6"/><circle cx="6.4" cy="4.6" r="1.6"/><circle cx="10" cy="11.4" r="1.6"/>',
  grid: '<rect x="2.5" y="2.5" width="4.5" height="4.5"/><rect x="9" y="2.5" width="4.5" height="4.5"/><rect x="2.5" y="9" width="4.5" height="4.5"/><rect x="9" y="9" width="4.5" height="4.5"/>',
  code: '<path d="M5.6 4.4 2.2 8l3.4 3.6M10.4 4.4 13.8 8l-3.4 3.6M9.4 2.8l-2.8 10.4"/>',
  reset: '<path d="M13.2 8a5.2 5.2 0 1 1-1.6-3.7"/><path d="M13.4 2.8v3.4H10"/>',
  bringForward: '<rect x="2.5" y="2.5" width="7.5" height="7.5"/><path d="M6 13.5h7.5V6"/>',
  sendBackward: '<rect x="6" y="6" width="7.5" height="7.5"/><path d="M10 2.5H2.5V10"/>',
  frame: '<path d="M5 1.8v12.4M11 1.8v12.4M1.8 5h12.4M1.8 11h12.4"/>',
  info: '<circle cx="8" cy="8" r="6"/><path d="M8 7.4v3.6M8 5.2v.9"/>',
  warning: '<path d="M8 2.6 14.2 13H1.8Z"/><path d="M8 6.6v3M8 11.2v.7"/>',

  // --- device breakpoints ---------------------------------------------------
  phone: '<rect x="4.5" y="2" width="7" height="12"/><path d="M7 12.2h2"/>',
  tablet: '<rect x="3" y="2" width="10" height="12"/><path d="M7 12.2h2"/>',
  laptop: '<rect x="2.5" y="3" width="11" height="7.5"/><path d="M1.4 12.8h13.2"/>',
  desktop: '<rect x="1.5" y="2.5" width="13" height="8.5"/><path d="M6 13.6h4M8 11v2.6"/>',

  // --- panel / chrome -------------------------------------------------------
  settings:
    '<circle cx="8" cy="8" r="2.2"/><path d="M8 1.6v1.8M8 12.6v1.8M14.4 8h-1.8M3.4 8H1.6M12.5 3.5l-1.3 1.3M4.8 11.2l-1.3 1.3M12.5 12.5l-1.3-1.3M4.8 4.8 3.5 3.5"/>',
  share:
    '<circle cx="12.2" cy="3.8" r="1.9"/><circle cx="3.8" cy="8" r="1.9"/><circle cx="12.2" cy="12.2" r="1.9"/><path d="M5.5 7.1l5-2.4M5.5 8.9l5 2.4"/>',
  rocket:
    '<path d="M6.4 9.6 3.2 8.8l1.8-2.2a7.6 7.6 0 0 1 6.4-2.8l2.2.1.1 2.2a7.6 7.6 0 0 1-2.8 6.4l-2.2 1.8-.8-3.2Z"/><circle cx="10" cy="6" r="1.1"/><path d="M6.2 9.8 3.4 12.6"/>',
  html: '<path d="M5.6 4.4 2.2 8l3.4 3.6M10.4 4.4 13.8 8l-3.4 3.6"/>',
  ruler: '<rect x="1.5" y="5" width="13" height="6"/><path d="M4.4 5v2M7 5v3M9.6 5v2M12.2 5v3"/>',
  spacing:
    '<rect x="3.5" y="3.5" width="9" height="9"/><rect x="6" y="6" width="4" height="4" opacity=".55"/>',
  droplet: '<path d="M8 2.2S3.6 7 3.6 9.6a4.4 4.4 0 0 0 8.8 0C12.4 7 8 2.2 8 2.2Z"/>',
  sparkle: '<path d="M8 2.2 9.3 6l3.8 1.3L9.3 8.6 8 12.4 6.7 8.6 2.9 7.3 6.7 6Z"/>',
  help: '<circle cx="8" cy="8" r="6"/><path d="M6.4 6.3a1.7 1.7 0 1 1 2 1.9v.9"/><path d="M8 11.4v.5"/>',

  // --- composite blocks -----------------------------------------------------
  // Each one is a miniature of the arrangement it drops in, so the tile shows
  // the shape you are about to get rather than a generic box.
  navbar:
    '<rect x="1.5" y="3.5" width="13" height="9" opacity=".35"/><path d="M1.5 3.5h13v3h-13Z"/><path d="M3.2 5h2M8.4 5h1.4M10.6 5h1.4M12.8 5h.8"/>',
  sidebar:
    '<rect x="1.5" y="2.5" width="13" height="11" opacity=".35"/><path d="M1.5 2.5h4.6v11H1.5Z"/><path d="M2.8 5h2M2.8 7.2h2M2.8 9.4h2"/>',
  footerBlock:
    '<rect x="1.5" y="3.5" width="13" height="9" opacity=".35"/><path d="M1.5 9.5h13v3h-13Z"/><path d="M3.2 11h2.2M7.4 11h2.2"/>',
  hero: '<rect x="1.5" y="2.5" width="13" height="11" opacity=".35"/><path d="M3.4 5.4h6M3.4 7.6h4.4"/><rect x="3.4" y="9.8" width="4" height="2.2"/>',
  card: '<rect x="2.5" y="2" width="11" height="12"/><path d="M2.5 8h11"/><path d="M4.4 10h5M4.4 12h3"/>',
  pricing:
    '<rect x="2.5" y="1.8" width="11" height="12.4"/><path d="M5 4.6h6"/><path d="M4.4 7.4h7.2M4.4 9.2h7.2M4.4 11h4.4"/>',
  stats: '<path d="M2 12.5V8.4M6.7 12.5V4.6M11.3 12.5V6.9M15 12.5V3"/>',
});

/**
 * Renders an icon as an SVG markup string.
 *
 * @param {string} name key of {@link GLYPHS}
 * @param {number} [size=16] pixel size of the square viewport
 * @returns {string} SVG markup, or an empty string for unknown names
 */
export function icon(name, size = 16) {
  const glyph = GLYPHS[name];
  if (!glyph) {
    console.warn(`[devlove:icons] unknown glyph "${name}"`);
    return '';
  }
  return (
    `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 16 16" ` +
    'fill="none" stroke="currentColor" stroke-width="1.25" ' +
    'stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true" focusable="false">' +
    glyph +
    '</svg>'
  );
}

/** Shared CSS for icon sizing inside any shadow root. */
export const ICON_CSS = `
.icon { display:block; flex:0 0 auto; }
.icon--dim { color: var(--ink-dim); }
`;
