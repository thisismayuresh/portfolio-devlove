/**
 * Style primitives shared by every panel's Shadow DOM.
 *
 * Shadow roots do not inherit document stylesheets, so each component injects
 * this string plus its own layout rules. Colours come exclusively from the
 * custom properties in `css/tokens.css`, which do cross the boundary.
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
.scroll::-webkit-scrollbar-thumb {
  background: var(--line-strong);
  border: 3px solid transparent;
  background-clip: content-box;
  border-radius: 999px;
}

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
  font-size: var(--text-sm);
  font-weight: 500;
  transition: color 90ms var(--ease), background 90ms var(--ease);
}
.tab:hover { color: var(--ink); background: var(--surface-hover); }
.tab[aria-selected="true"] { color: var(--ink-strong); }
.tab[aria-selected="true"]::after {
  content: "";
  position: absolute;
  left: 0; right: 0; bottom: -1px;
  height: 2px;
  background: var(--accent);
}

/* ----------------------------------------------------------- panel header */
.panel-head {
  display: flex;
  align-items: center;
  gap: 7px;
  height: 34px;
  flex: 0 0 auto;
  padding: 0 6px 0 10px;
  border-bottom: 1px solid var(--line);
  background: var(--surface-header);
  color: var(--ink-dim);
}
.panel-head__title {
  flex: 1 1 auto;
  min-width: 0;
  font-size: var(--text-sm);
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--ink-strong);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
  gap: 7px;
  width: 100%;
  height: 32px;
  padding: 0 8px 0 10px;
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
  font-size: var(--text-sm);
  font-weight: 500;
  letter-spacing: 0.01em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.section__count {
  font-size: var(--text-xs);
  color: var(--ink-faint);
  font-variant-numeric: tabular-nums;
}

.section__body { padding: 2px 10px 12px; }
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
.btn:hover:not(:disabled) { background: #272b32; border-color: var(--line-strong); }
.btn:active:not(:disabled) { background: #202329; }
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
.icon-btn[aria-pressed="true"] { background: var(--accent-wash); color: var(--accent); }
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
  box-shadow: 0 0 0 2px var(--accent-wash);
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
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  overflow: hidden;
  background-image:
    linear-gradient(45deg, #2a2d35 25%, transparent 25%, transparent 75%, #2a2d35 75%),
    linear-gradient(45deg, #2a2d35 25%, transparent 25%, transparent 75%, #2a2d35 75%);
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
  padding: 2px;
  gap: 2px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface-input);
}
.segmented button {
  flex: 1 1 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  height: 20px;
  border-radius: 3px;
  color: var(--ink-dim);
  font-size: var(--text-xs);
  transition: background 90ms var(--ease), color 90ms var(--ease);
}
.segmented button:hover { background: var(--surface-hover); color: var(--ink); }
.segmented button[aria-pressed="true"] { background: var(--accent); color: var(--accent-ink); }

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
  width: 28px;
  height: 16px;
  border-radius: 999px;
  background: var(--line-strong);
  transition: background 120ms var(--ease);
}
.switch__track::after {
  content: "";
  position: absolute;
  top: 2px;
  left: 2px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #d4d8e0;
  transition: transform 140ms var(--ease);
}
.switch[aria-checked="true"] .switch__track { background: var(--accent); }
.switch[aria-checked="true"] .switch__track::after { transform: translateX(12px); background: #fff; }

/* range */
.range { width: 100%; height: var(--control-h); appearance: none; background: none; cursor: pointer; }
.range::-webkit-slider-runnable-track { height: 3px; border-radius: 3px; background: var(--line-strong); }
.range::-moz-range-track { height: 3px; border-radius: 3px; background: var(--line-strong); }
.range::-webkit-slider-thumb {
  appearance: none;
  width: 12px;
  height: 12px;
  margin-top: -4.5px;
  border-radius: 50%;
  background: var(--ink);
  border: 2px solid var(--surface-panel);
}
.range::-moz-range-thumb {
  width: 12px; height: 12px; border-radius: 50%;
  background: var(--ink); border: 2px solid var(--surface-panel);
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
  border-radius: 3px;
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
