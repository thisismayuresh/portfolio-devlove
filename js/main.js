/**
 * Entry point.
 *
 * Registers the custom elements, starts the engine, and swaps the boot gate
 * for the editor. Any failure before the engine is live is surfaced in the
 * boot screen rather than as a blank page.
 *
 * @module main
 */

import { app } from './core/app.js';
import { installShortcuts } from './core/shortcuts.js';

// Registering a component is a side effect of importing it; each module calls
// `customElements.define` at the bottom. Adding a panel = one import here.
import './ui/components/dl-toolbar.js';
import './ui/components/dl-rail.js';
import './ui/components/dl-palette.js';
import './ui/components/dl-layers.js';
import './ui/components/dl-templates.js';
import './ui/components/dl-canvas.js';
import './ui/components/dl-inspector.js';
import './ui/components/dl-status.js';
import './ui/components/dl-help.js';

const boot = document.getElementById('boot');
const bootNote = document.getElementById('boot-note');
const bootError = document.getElementById('boot-error');
const shell = document.getElementById('shell');

/**
 * @param {string} text
 */
function setBootNote(text) {
  if (bootNote) {
    bootNote.textContent = text;
  }
}

/**
 * @param {unknown} error
 */
function failBoot(error) {
  const detail = error instanceof Error ? error.message : String(error);
  console.error('[devlove] boot failed', error);
  if (boot) {
    boot.classList.add('boot--failed');
  }
  setBootNote('The editor could not start.');
  if (bootError) {
    bootError.textContent = detail;
  }
}

function revealShell() {
  if (shell) {
    shell.hidden = false;
  }
  if (!boot) {
    return;
  }
  boot.classList.add('boot--fading');
  setTimeout(() => {
    boot.hidden = true;
  }, 240);
}

async function start() {
  try {
    setBootNote('Starting the engine…');
    await app.boot();

    // Keep the shell's grid in step with preview mode.
    app.on('mode', (mode) => {
      if (shell) {
        shell.setAttribute('data-mode', mode);
      }
    });

    installShortcuts();
    revealShell();
    app.setStatus('Engine ready', 'info');

    // Documented debug handle. Open the console and poke at `__devlove.engine`,
    // `__devlove.state`, or `__devlove.getTree()`. The browser test suite drives
    // the real editor through this rather than through a copy of it.
    window.__devlove = app;
  } catch (error) {
    failBoot(error);
  }
}

// Warn before losing unsaved work on a reload. The autosave in localStorage
// covers most cases, but an explicit prompt matches user expectations.
window.addEventListener('beforeunload', (event) => {
  if (!app.state.ready || app.engine.nodeCount() <= 1) {
    return;
  }
  event.preventDefault();
  // Required by the spec for the prompt to appear in some browsers.
  event.returnValue = '';
});

start();
