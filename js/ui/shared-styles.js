/**
 * Style primitives shared by every panel's Shadow DOM.
 *
 * Shadow roots do not inherit document stylesheets, so each component injects
 * this string plus its own layout rules. Colours come exclusively from the
 * custom properties in `css/tokens.css`, which do cross the boundary.
 *
 * Two conventions run through every primitive below, both from `tokens.css`:
 * corners are square, and "this one is selected" is drawn with `--ink-strong`
 * plus a border, not with a filled accent pill. Accent blue is reserved for
 * focus rings and the single primary button.
 *
 * @module ui/shared-styles
 */

import { ICON_CSS } from './icons.js';

export const SHARED_CSS = `
/*
 * Panel hosts fill their shell slot. Without an explicit height a custom
 * element is an auto-height block, which silently collapses any panel whose
 * inner layout is absolutely positioned.
 */
:host {
  display: block;
  height: 100%;
  min-height: 0;
  color: var(--ink);
  font-family: var(--font-ui);
  font-size: var(--text-md);
  -webkit-font-smoothing: antialiased;
}
:host([hidden]) { display: none; }

*, *::before, *::after { box-sizing: border-box; }

button { font: inherit; color: inherit; background: none; border: 0; padding: 0; cursor: pointer; }
input, select, textarea { font: inherit; color: inherit; }

${ICON_CSS}

/* ------------------------------------------------------------- scrollbars */
.scroll { overflow: auto; scrollbar-width: thin; scrollbar-color: var(--line-strong) transparent; }
.scroll::-webkit-scrollbar { width: 10px; height: 10px; }
.scroll::-webkit-scrollbar-track { background: transparent; }
.scroll::-webkit-scrollbar-thumb { background: rgba(121, 121, 121, 0.4); }
.scroll::-webkit-scrollbar-thumb:hover { background: rgba(100, 100, 100, 0.7); }

/* ------------------------------------------------------------------- tabs */
.tabs {
  display: flex;
  align-items: stretch;
  height: 32px;
  flex: 0 0 auto;
  border-bottom: 1px solid var(--line);
  background: var(--surface-panel);
}
.tab {
  position: relative;
  flex: 1 1 0;
  min-width: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--ink-dim);
  font-size: var(--text-md);
  font-weight: 500;
  transition: color 90ms var(--ease), background 90ms var(--ease);
}
.tab:hover { color: var(--ink); background: var(--surface-hover); }
.tab[aria-selected="true"] { color: var(--ink-strong); background: var(--surface-panel); }
.tab[aria-selected="true"]::after {
  content: "";
  position: absolute;
  left: 0; right: 0; top: 0;
  height: 1px;
  background: var(--ink-strong);
}

/* ----------------------------------------------------------- panel header */
.panel-head {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 32px;
  flex: 0 0 auto;
  padding: 0 6px 0 12px;
  border-bottom: 1px solid var(--line);
  background: var(--surface-panel);
  color: var(--ink-dim);
}
.panel-head__title {
  flex: 1 1 auto;
  min-width: 0;
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* -------------------------------------------------------- property rows --
 * The inspector reads as label + value, not as a stack of form controls.
 * A value looks like text until you hover or focus it, at which point it
 * reveals the affordances of the input it has always been.
 */
.prop {
  display: grid;
  grid-template-columns: var(--prop-label-w) minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  min-height: var(--prop-row-h);
}
.prop--stacked {
  grid-template-columns: minmax(0, 1fr);
  gap: 5px;
  padding: 5px 0;
}
.prop__label {
  font-size: var(--text-sm);
  color: var(--ink-dim);
  user-select: none;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.value {
  width: 100%;
  min-width: 0;
  height: var(--control-h);
  padding: 0 8px;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--ink-strong);
  font-size: var(--text-md);
  text-overflow: ellipsis;
  transition: background 90ms var(--ease), border-color 90ms var(--ease);
}
.value:hover { background: var(--surface-input); border-color: var(--line); }
.value:focus {
  outline: none;
  background: var(--surface-input);
  border-color: var(--accent);
}
.value::placeholder { color: var(--ink-faint); }
.value[type="number"] {
  font-variant-numeric: tabular-nums;
  -moz-appearance: textfield;
}
.value[type="number"]::-webkit-outer-spin-button,
.value[type="number"]::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }

select.value {
  appearance: none;
  padding-right: 20px;
  background-image: linear-gradient(45deg, transparent 50%, var(--ink-faint) 50%),
                    linear-gradient(135deg, var(--ink-faint) 50%, transparent 50%);
  background-position: calc(100% - 11px) 12px, calc(100% - 7px) 12px;
  background-size: 4px 4px, 4px 4px;
  background-repeat: no-repeat;
}
select.value option { background: var(--surface-raised); color: var(--ink); }

/* A pair of numeric values sharing one row, e.g. W and H. */
.pair {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.pair__cell {
  position: relative;
  display: grid;
  grid-template-columns: 16px minmax(0, 1fr);
  align-items: center;
  gap: 2px;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  transition: background 90ms var(--ease), border-color 90ms var(--ease);
}
.pair__cell:hover { background: var(--surface-input); border-color: var(--line); }
.pair__cell:focus-within {
  background: var(--surface-input);
  border-color: var(--accent);
}
.pair__cell--bare { grid-template-columns: minmax(0, 1fr); }
.pair__key {
  padding-left: 7px;
  color: var(--ink-faint);
  font-size: var(--text-sm);
  user-select: none;
}
.pair__cell .value { border: 0; background: none; padding-left: 2px; }
.pair__cell .value:hover,
.pair__cell .value:focus { background: none; box-shadow: none; border-color: transparent; }

/* True/False pair, the shape a boolean attribute takes in a builder. */
.bool {
  display: inline-grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1px;
  padding: 1px;
  border: 1px solid var(--line-strong);
  background: var(--surface-sunken);
}
.bool button {
  height: 20px;
  padding: 0 12px;
  color: var(--ink-dim);
  font-size: var(--text-sm);
  transition: background 90ms var(--ease), color 90ms var(--ease);
}
.bool button:hover { color: var(--ink); background: var(--surface-hover); }
.bool button[aria-pressed="true"] { background: var(--surface-raised); color: var(--ink-strong); }

/* Swatch + hex, borderless until touched. */
.swatch-row {
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
}
.swatch {
  position: relative;
  width: 20px;
  height: 20px;
  border: 1px solid var(--line-strong);
  overflow: hidden;
  background-image:
    linear-gradient(45deg, #3c3c3c 25%, transparent 25%, transparent 75%, #3c3c3c 75%),
    linear-gradient(45deg, #3c3c3c 25%, transparent 25%, transparent 75%, #3c3c3c 75%);
  background-size: 8px 8px;
  background-position: 0 0, 4px 4px;
  cursor: pointer;
}
.swatch input {
  position: absolute;
  inset: -25%;
  width: 150%;
  height: 150%;
  padding: 0;
  border: 0;
  background: none;
  cursor: pointer;
}

/* ---------------------------------------------------------------- section */
/*
 * A collapsible property group. The chevron sits on the trailing edge, the
 * way a properties inspector reads best: label first, state last.
 */
.section { border-bottom: 1px solid var(--line-soft); }
.section:last-child { border-bottom: 0; }

.section__head {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  height: 30px;
  padding: 0 10px 0 12px;
  color: var(--ink-dim);
  user-select: none;
  text-align: left;
}
.section__head:hover { background: var(--surface-hover); color: var(--ink); }
.section[data-open="true"] .section__head { color: var(--ink); }

.section__caret {
  display: grid;
  place-items: center;
  width: 14px;
  height: 14px;
  margin-left: auto;
  color: var(--ink-faint);
  transition: transform 130ms var(--ease);
}
.section[data-open="false"] .section__caret { transform: rotate(-90deg); }

.section__title {
  min-width: 0;
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.section__count {
  font-size: var(--text-xs);
  color: var(--ink-faint);
  font-variant-numeric: tabular-nums;
}

.section__body { padding: 0 12px 12px; }
.section[data-open="false"] .section__body { display: none; }

/* --------------------------------------------------------------- controls */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: var(--control-h);
  padding: 0 10px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface-raised);
  color: var(--ink);
  font-size: var(--text-sm);
  white-space: nowrap;
  transition: background 90ms var(--ease), border-color 90ms var(--ease), color 90ms var(--ease);
}
.btn:hover:not(:disabled) { background: #383838; border-color: var(--line-strong); }
.btn:active:not(:disabled) { background: #2a2a2a; }
.btn:disabled { opacity: 0.42; cursor: default; }
.btn:focus-visible { outline: none; box-shadow: var(--focus-ring); }

.btn--primary {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-ink);
  font-weight: 500;
}
.btn--primary:hover:not(:disabled) { background: var(--accent-hover); border-color: var(--accent-hover); }
.btn--primary:active:not(:disabled) { background: var(--accent-press); }

.btn--ghost { background: transparent; border-color: transparent; color: var(--ink-dim); }
.btn--ghost:hover:not(:disabled) { background: var(--surface-hover); color: var(--ink); border-color: transparent; }

.btn--danger:hover:not(:disabled) { background: var(--danger-wash); border-color: var(--danger); color: var(--danger); }

.icon-btn {
  display: inline-grid;
  place-items: center;
  width: var(--control-h);
  height: var(--control-h);
  border-radius: var(--radius-sm);
  color: var(--ink-dim);
  border: 1px solid transparent;
  transition: background 90ms var(--ease), color 90ms var(--ease);
}
.icon-btn:hover:not(:disabled) { background: var(--surface-hover); color: var(--ink); }
.icon-btn:active:not(:disabled) { background: var(--surface-active); }
.icon-btn:disabled { opacity: 0.35; cursor: default; }
.icon-btn[aria-pressed="true"] { background: var(--surface-active); color: var(--ink-strong); }
.icon-btn:focus-visible { outline: none; box-shadow: var(--focus-ring); }

/* ----------------------------------------------------------------- fields */
.field { display: grid; gap: 4px; min-width: 0; }
.field--wide { grid-column: 1 / -1; }

/*
 * Numeric rows put the label beside the control rather than above it. An
 * overlaid label inside the input only works for one- or two-character names;
 * anything longer collides with the value.
 */
.field--row {
  grid-template-columns: 42px minmax(0, 1fr);
  align-items: center;
  gap: 6px;
}

.field__label {
  font-size: var(--text-xs);
  color: var(--ink-faint);
  letter-spacing: 0.02em;
  user-select: none;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.input,
.select,
.textarea {
  width: 100%;
  min-width: 0;
  height: var(--control-h);
  padding: 0 7px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface-input);
  color: var(--ink);
  font-size: var(--text-sm);
  transition: border-color 90ms var(--ease), background 90ms var(--ease);
}
.input:hover, .select:hover, .textarea:hover { border-color: var(--line-strong); }
.input:focus, .select:focus, .textarea:focus {
  outline: none;
  border-color: var(--accent);
}
.input::placeholder, .textarea::placeholder { color: var(--ink-faint); }

.input[type="number"] { font-variant-numeric: tabular-nums; }
.input[type="number"]::-webkit-outer-spin-button,
.input[type="number"]::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
.input[type="number"] { -moz-appearance: textfield; }

.textarea {
  height: auto;
  min-height: 58px;
  padding: 6px 7px;
  line-height: 1.5;
  resize: vertical;
  font-family: inherit;
}

.select {
  appearance: none;
  padding-right: 22px;
  background-image: linear-gradient(45deg, transparent 50%, var(--ink-faint) 50%),
                    linear-gradient(135deg, var(--ink-faint) 50%, transparent 50%);
  background-position: calc(100% - 12px) 11px, calc(100% - 8px) 11px;
  background-size: 4px 4px, 4px 4px;
  background-repeat: no-repeat;
}
.select option { background: var(--surface-raised); color: var(--ink); }

/* colour field: swatch + hex text, Figma style */
.color { display: grid; grid-template-columns: var(--control-h) minmax(0, 1fr); gap: 6px; }
.color__well {
  position: relative;
  width: var(--control-h);
  height: var(--control-h);
  border: 1px solid var(--line-strong);
  overflow: hidden;
  background-image:
    linear-gradient(45deg, #3c3c3c 25%, transparent 25%, transparent 75%, #3c3c3c 75%),
    linear-gradient(45deg, #3c3c3c 25%, transparent 25%, transparent 75%, #3c3c3c 75%);
  background-size: 8px 8px;
  background-position: 0 0, 4px 4px;
}
.color__well input {
  position: absolute;
  inset: -25%;
  width: 150%;
  height: 150%;
  padding: 0;
  border: 0;
  background: none;
  cursor: pointer;
}

/* segmented control */
.segmented {
  display: flex;
  padding: 1px;
  gap: 1px;
  border: 1px solid var(--line-strong);
  background: var(--surface-sunken);
}
.segmented button {
  flex: 1 1 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  height: 20px;
  color: var(--ink-dim);
  font-size: var(--text-xs);
  transition: background 90ms var(--ease), color 90ms var(--ease);
}
.segmented button:hover { background: var(--surface-hover); color: var(--ink); }
.segmented button[aria-pressed="true"] { background: var(--surface-raised); color: var(--ink-strong); }

/* switch */
.switch {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  height: var(--control-h);
  cursor: pointer;
  user-select: none;
}
.switch__label { font-size: var(--text-sm); color: var(--ink-dim); }
.switch__track {
  position: relative;
  flex: 0 0 auto;
  width: 26px;
  height: 14px;
  border: 1px solid var(--line-strong);
  background: var(--surface-sunken);
  transition: background 120ms var(--ease), border-color 120ms var(--ease);
}
.switch__track::after {
  content: "";
  position: absolute;
  top: 2px;
  left: 2px;
  width: 8px;
  height: 8px;
  background: var(--ink-faint);
  transition: transform 140ms var(--ease), background 140ms var(--ease);
}
.switch[aria-checked="true"] .switch__track { border-color: var(--accent); background: var(--accent); }
.switch[aria-checked="true"] .switch__track::after { transform: translateX(12px); background: var(--accent-ink); }

/* range */
.range { width: 100%; height: var(--control-h); appearance: none; background: none; cursor: pointer; }
.range::-webkit-slider-runnable-track { height: 3px; background: var(--line-strong); }
.range::-moz-range-track { height: 3px; background: var(--line-strong); }
.range::-webkit-slider-thumb {
  appearance: none;
  width: 8px;
  height: 14px;
  margin-top: -5.5px;
  background: var(--ink);
  border: 0;
}
.range::-moz-range-thumb {
  width: 8px; height: 14px; border-radius: 0;
  background: var(--ink); border: 0;
}
.range:focus-visible { outline: none; }
.range:focus-visible::-webkit-slider-thumb { box-shadow: var(--focus-ring); }

/* --------------------------------------------------------------- misc bits */
.empty {
  display: grid;
  gap: 6px;
  justify-items: center;
  padding: 28px 16px;
  color: var(--ink-faint);
  font-size: var(--text-sm);
  text-align: center;
}

.kbd {
  display: inline-block;
  min-width: 16px;
  padding: 1px 4px;
  border: 1px solid var(--line-strong);
  border-bottom-width: 2px;
  background: var(--surface-raised);
  color: var(--ink-dim);
  font-family: var(--font-mono);
  font-size: 10px;
  line-height: 14px;
  text-align: center;
}

.sr-only {
  position: absolute;
  width: 1px; height: 1px;
  margin: -1px; padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

@media (prefers-reduced-motion: reduce) {
  * { transition-duration: 1ms !important; animation-duration: 1ms !important; }
}
`;
