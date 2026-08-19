/**
 * Icon set — hand-drawn 16×16 stroke paths on a 16-unit grid.
 *
 * Every glyph inherits `currentColor` and a 1.4 stroke so icons stay legible
 * at UI scale without looking heavy. To add one, append a path string to
 * `GLYPHS`; nothing else needs to change.
 *
 * @module ui/icons
 */

/** @type {Readonly<Record<string, string>>} */
export const GLYPHS = Object.freeze({
  // --- primitives -----------------------------------------------------------
  section: '<rect x="1.8" y="3.2" width="12.4" height="9.6" rx="1.6"/><path d="M1.8 6.6h12.4"/>',
  container: '<rect x="2.2" y="2.6" width="11.6" height="10.8" rx="1.8"/>',
  stack:
    '<rect x="2.2" y="2.4" width="11.6" height="3.6" rx="1.1"/><rect x="2.2" y="7.6" width="11.6" height="3.6" rx="1.1"/><path d="M2.2 13.4h11.6"/>',
  heading: '<path d="M3.4 12.6V3.4M10.6 12.6V3.4M3.4 8h7.2"/><path d="M12.6 3.4h1.4"/>',
  text: '<path d="M2.6 3.8h10.8M2.6 7.2h10.8M2.6 10.6h7.4M2.6 13.2h4.6"/>',
  button:
    '<rect x="1.6" y="4.6" width="12.8" height="6.8" rx="3.4"/><path d="M5.4 8h5.2"/>',
  link:
    '<path d="M6.6 9.4a2.9 2.9 0 0 0 4.1 0l1.9-1.9a2.9 2.9 0 0 0-4.1-4.1l-.9.9"/><path d="M9.4 6.6a2.9 2.9 0 0 0-4.1 0L3.4 8.5a2.9 2.9 0 0 0 4.1 4.1l.9-.9"/>',
  image:
    '<rect x="1.8" y="3" width="12.4" height="10" rx="1.6"/><circle cx="5.6" cy="6.4" r="1.1"/><path d="M2.4 11.6 6 8.4l2.4 2.1 2.2-1.8 3 3"/>',
  input:
    '<rect x="1.6" y="4.4" width="12.8" height="7.2" rx="1.6"/><path d="M4.4 6.6v2.8"/>',
  divider: '<path d="M2 8h12"/><path d="M4.6 4.6h6.8M4.6 11.4h6.8" opacity=".4"/>',
  root: '<rect x="1.8" y="2.4" width="12.4" height="11.2" rx="1.8"/><path d="M1.8 5.6h12.4"/><circle cx="4" cy="4" r=".7" fill="currentColor" stroke="none"/>',

  // --- actions --------------------------------------------------------------
  undo: '<path d="M3 7.6h7a3.4 3.4 0 0 1 0 6.8H6.4"/><path d="M5.6 4.6 2.6 7.6l3 3"/>',
  redo: '<path d="M13 7.6H6a3.4 3.4 0 0 0 0 6.8h3.6"/><path d="M10.4 4.6l3 3-3 3"/>',
  trash:
    '<path d="M2.8 4.4h10.4"/><path d="M6.4 4.4V2.9h3.2v1.5"/><path d="M4.2 4.4l.7 8.3a1 1 0 0 0 1 .9h4.2a1 1 0 0 0 1-.9l.7-8.3"/><path d="M6.8 6.9v4M9.2 6.9v4"/>',
  duplicate:
    '<rect x="5.2" y="5.2" width="8.4" height="8.4" rx="1.5"/><path d="M10.8 5.2V3.9a1.5 1.5 0 0 0-1.5-1.5H3.9A1.5 1.5 0 0 0 2.4 3.9v5.4a1.5 1.5 0 0 0 1.5 1.5h1.3"/>',
  eye: '<path d="M1.6 8s2.4-4.3 6.4-4.3S14.4 8 14.4 8s-2.4 4.3-6.4 4.3S1.6 8 1.6 8Z"/><circle cx="8" cy="8" r="1.9"/>',
  eyeOff:
    '<path d="M6.3 3.9A6.8 6.8 0 0 1 8 3.7c4 0 6.4 4.3 6.4 4.3a12 12 0 0 1-2.2 2.7M4.2 5.2A11.8 11.8 0 0 0 1.6 8s2.4 4.3 6.4 4.3a6.7 6.7 0 0 0 2.3-.4"/><path d="M2.4 2.4l11.2 11.2"/>',
  lock:
    '<rect x="3.4" y="7" width="9.2" height="6.4" rx="1.5"/><path d="M5.6 7V5.2a2.4 2.4 0 0 1 4.8 0V7"/>',
  unlock:
    '<rect x="3.4" y="7" width="9.2" height="6.4" rx="1.5"/><path d="M5.6 7V5.2a2.4 2.4 0 0 1 4.6-.8"/>',
  chevronRight: '<path d="M6.2 3.6 10.6 8l-4.4 4.4"/>',
  chevronDown: '<path d="M3.6 6.2 8 10.6l4.4-4.4"/>',
  play: '<path d="M4.8 3.2 12.4 8l-7.6 4.8Z"/>',
  cursor: '<path d="M3.4 2.6 12.8 8l-4 1.1L6.6 13Z"/>',
  download: '<path d="M8 2.6v7.6"/><path d="M4.9 7.4 8 10.5l3.1-3.1"/><path d="M2.8 12.8h10.4"/>',
  upload: '<path d="M8 10.4V2.8"/><path d="M4.9 5.9 8 2.8l3.1 3.1"/><path d="M2.8 12.8h10.4"/>',
  save:
    '<path d="M3.4 2.6h7.1l2.5 2.5v8.3a.8.8 0 0 1-.8.8H3.4a.8.8 0 0 1-.8-.8V3.4a.8.8 0 0 1 .8-.8Z"/><path d="M5.4 2.6v3.6h5.2V2.6M5.4 13.4v-3.6h5.2v3.6"/>',
  plus: '<path d="M8 3.2v9.6M3.2 8h9.6"/>',
  minus: '<path d="M3.2 8h9.6"/>',
  layers:
    '<path d="M8 2.2 14 5.4 8 8.6 2 5.4Z"/><path d="m2 8.6 6 3.2 6-3.2"/><path d="m2 11.4 6 3.2 6-3.2" opacity=".5"/>',
  sliders:
    '<path d="M3.2 4.6h9.6M3.2 11.4h9.6"/><circle cx="6.4" cy="4.6" r="1.6"/><circle cx="10" cy="11.4" r="1.6"/>',
  grid:
    '<rect x="2.2" y="2.2" width="4.9" height="4.9" rx="1"/><rect x="8.9" y="2.2" width="4.9" height="4.9" rx="1"/><rect x="2.2" y="8.9" width="4.9" height="4.9" rx="1"/><rect x="8.9" y="8.9" width="4.9" height="4.9" rx="1"/>',
  code: '<path d="M5.6 4.4 2.2 8l3.4 3.6M10.4 4.4 13.8 8l-3.4 3.6M9.4 2.8l-2.8 10.4"/>',
  reset: '<path d="M13.2 8a5.2 5.2 0 1 1-1.6-3.7"/><path d="M13.4 2.8v3.4H10"/>',
  bringForward:
    '<rect x="2.4" y="2.4" width="7.6" height="7.6" rx="1.4"/><path d="M6 13.6h6.2a1.4 1.4 0 0 0 1.4-1.4V6"/>',
  sendBackward:
    '<rect x="6" y="6" width="7.6" height="7.6" rx="1.4"/><path d="M10 2.4H3.8A1.4 1.4 0 0 0 2.4 3.8V10"/>',
  frame:
    '<path d="M5 1.8v12.4M11 1.8v12.4M1.8 5h12.4M1.8 11h12.4"/>',
  info: '<circle cx="8" cy="8" r="6"/><path d="M8 7.4v3.6M8 5.2v.9"/>',
  warning: '<path d="M8 2.6 14.2 13H1.8Z"/><path d="M8 6.6v3M8 11.2v.7"/>',

  // --- device breakpoints ---------------------------------------------------
  phone: '<rect x="4.6" y="1.8" width="6.8" height="12.4" rx="1.6"/><path d="M7 12.4h2"/>',
  tablet: '<rect x="3" y="1.8" width="10" height="12.4" rx="1.6"/><path d="M7 12.3h2"/>',
  laptop:
    '<rect x="2.6" y="3.2" width="10.8" height="7.4" rx="1.2"/><path d="M1.4 12.8h13.2"/>',
  desktop:
    '<rect x="1.6" y="2.6" width="12.8" height="8.6" rx="1.3"/><path d="M6 13.6h4M8 11.2v2.4"/>',

  // --- panel / chrome -------------------------------------------------------
  settings:
    '<circle cx="8" cy="8" r="2.2"/><path d="M8 1.6v1.8M8 12.6v1.8M14.4 8h-1.8M3.4 8H1.6M12.5 3.5l-1.3 1.3M4.8 11.2l-1.3 1.3M12.5 12.5l-1.3-1.3M4.8 4.8 3.5 3.5"/>',
  share:
    '<circle cx="12.2" cy="3.8" r="1.9"/><circle cx="3.8" cy="8" r="1.9"/><circle cx="12.2" cy="12.2" r="1.9"/><path d="M5.5 7.1l5-2.4M5.5 8.9l5 2.4"/>',
  rocket:
    '<path d="M6.4 9.6 3.2 8.8l1.8-2.2a7.6 7.6 0 0 1 6.4-2.8l2.2.1.1 2.2a7.6 7.6 0 0 1-2.8 6.4l-2.2 1.8-.8-3.2Z"/><circle cx="10" cy="6" r="1.1"/><path d="M6.2 9.8 3.4 12.6"/>',
  html: '<path d="M5.6 4.4 2.2 8l3.4 3.6M10.4 4.4 13.8 8l-3.4 3.6"/>',
  ruler:
    '<rect x="1.6" y="5" width="12.8" height="6" rx="1.2"/><path d="M4.4 5v2M7 5v3M9.6 5v2M12.2 5v3"/>',
  spacing:
    '<rect x="3.4" y="3.4" width="9.2" height="9.2" rx="1.2"/><rect x="6" y="6" width="4" height="4" rx="0.8" opacity=".55"/>',
  droplet: '<path d="M8 2.2S3.6 7 3.6 9.6a4.4 4.4 0 0 0 8.8 0C12.4 7 8 2.2 8 2.2Z"/>',
  sparkle:
    '<path d="M8 2.2 9.3 6l3.8 1.3L9.3 8.6 8 12.4 6.7 8.6 2.9 7.3 6.7 6Z"/>',
  help: '<circle cx="8" cy="8" r="6"/><path d="M6.4 6.3a1.7 1.7 0 1 1 2 1.9v.9"/><path d="M8 11.4v.5"/>',
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
    console.warn(`[icons] unknown glyph "${name}"`);
    return '';
  }
  return (
    `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 16 16" ` +
    'fill="none" stroke="currentColor" stroke-width="1.4" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
    glyph +
    '</svg>'
  );
}

/** Shared CSS for icon sizing inside any shadow root. */
export const ICON_CSS = `
.icon { display:block; flex:0 0 auto; }
.icon--dim { color: var(--ink-dim); }
`;
