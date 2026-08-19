/**
 * Zero-dependency headless browser test runner.
 *
 * Starts the static server, launches Chrome (or Edge/Chromium) with the
 * DevTools protocol enabled, drives each test page in *real* time, and reports
 * the results.
 *
 * Why not `chrome --headless --dump-dom`?
 *   `--dump-dom` snapshots after the load event, which is far too early for a
 *   page that must instantiate WebAssembly first. `--virtual-time-budget`
 *   fixes the timing but introduces a worse problem: once the virtual clock
 *   jumps past the budget, Chrome stops loading new frames, so anything
 *   created after an async fetch never runs. Driving the page over CDP with a
 *   real clock avoids both traps.
 *
 * Node 22+ is required (for the global `WebSocket`). No npm packages.
 *
 *   node tests/run-browser-tests.mjs
 *   node tests/run-browser-tests.mjs --headful     # watch it happen
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

/**
 * Suites run in order. A suite either points at a self-reporting page (which
 * sets `document.title` to `*-OK` / `*-FAIL`) or supplies a `drive` function
 * that asserts against the real editor over CDP.
 */
const SUITES = [
  { name: 'engine + preview frame', path: '/tests/smoke.html' },
  { name: 'editor interactions', path: '/', drive: driveEditor },
];

const HEADFUL = process.argv.includes('--headful');
const SERVER_PORT = 8123;
const DEBUG_PORT = 9333;
const OVERALL_TIMEOUT_MS = 60_000;

// ---------------------------------------------------------------- utilities

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

/**
 * Polls `probe` until it returns a truthy value or the deadline passes.
 *
 * @template T
 * @param {() => Promise<T>} probe
 * @param {string} what described in the timeout message
 * @param {number} timeoutMs
 * @returns {Promise<T>}
 */
async function until(probe, what, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const value = await probe();
      if (value) {
        return value;
      }
    } catch (error) {
      lastError = error;
    }
    await sleep(120);
  }
  throw new Error(`timed out waiting for ${what}${lastError ? ` (${lastError.message})` : ''}`);
}

/** Locates a Chromium-family browser on any platform. */
function findBrowser() {
  const fromEnv = process.env.CHROME_PATH || process.env.CHROME;
  if (fromEnv && existsSync(fromEnv)) {
    return fromEnv;
  }

  const candidates = {
    win32: [
      `${process.env['ProgramFiles']}\\Google\\Chrome\\Application\\chrome.exe`,
      `${process.env['ProgramFiles(x86)']}\\Google\\Chrome\\Application\\chrome.exe`,
      `${process.env['LOCALAPPDATA']}\\Google\\Chrome\\Application\\chrome.exe`,
      `${process.env['ProgramFiles(x86)']}\\Microsoft\\Edge\\Application\\msedge.exe`,
      `${process.env['ProgramFiles']}\\Microsoft\\Edge\\Application\\msedge.exe`,
    ],
    darwin: [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    ],
    linux: [
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/usr/bin/microsoft-edge',
      '/snap/bin/chromium',
    ],
  }[process.platform] || [];

  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

/** Finds the Python interpreter that can run serve.py. */
function findPython() {
  return process.platform === 'win32' ? 'python' : 'python3';
}

// ------------------------------------------------------------ CDP transport

/** Minimal DevTools Protocol client over the global WebSocket. */
class DevToolsSession {
  /** @param {string} url websocket debugger url */
  constructor(url) {
    this.url = url;
    this.nextId = 1;
    /** @type {Map<number, {resolve: Function, reject: Function}>} */
    this.pending = new Map();
  }

  open() {
    return new Promise((done, fail) => {
      this.socket = new WebSocket(this.url);
      this.socket.addEventListener('open', () => done(this));
      this.socket.addEventListener('error', () => fail(new Error(`cannot connect to ${this.url}`)));
      this.socket.addEventListener('message', (event) => {
        let message;
        try {
          message = JSON.parse(event.data);
        } catch {
          return;
        }
        const waiter = this.pending.get(message.id);
        if (!waiter) {
          return;
        }
        this.pending.delete(message.id);
        if (message.error) {
          waiter.reject(new Error(message.error.message));
        } else {
          waiter.resolve(message.result);
        }
      });
    });
  }

  /**
   * @param {string} method
   * @param {object} [params]
   * @returns {Promise<any>}
   */
  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  /**
   * Evaluates an expression in the page and returns its JSON value.
   *
   * @param {string} expression
   * @returns {Promise<any>}
   */
  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result.exceptionDetails) {
      const text = result.exceptionDetails.exception?.description
        || result.exceptionDetails.text;
      throw new Error(`page threw: ${text}`);
    }
    return result.result.value;
  }

  close() {
    try {
      this.socket.close();
    } catch {
      // already gone
    }
  }
}

// ------------------------------------------------------------ editor suite

/**
 * Drives the real editor with genuine input events.
 *
 * CDP `Input.*` events are indistinguishable from a human's, which is the only
 * way to test a drag honestly — synthetic `dispatchEvent` calls are untrusted
 * and cannot start a native drag.
 *
 * @param {DevToolsSession} session
 * @returns {Promise<string[]>} result lines, `FAIL` prefixed on failure
 */
async function driveEditor(session) {
  const lines = [];
  const check = (name, ok, detail = '') =>
    lines.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);

  await until(
    () => session.evaluate('Boolean(window.__forge && window.__forge.state.ready)'),
    'the editor to boot'
  );
  check('editor boots', true);

  const rectCount = await until(
    async () => {
      const n = await session.evaluate('Object.keys(window.__forge.state.rects).length');
      return n > 1 ? n : null;
    },
    'the preview frame to report geometry'
  ).catch(() => 0);
  check('preview frame reports geometry', rectCount > 1, `${rectCount} boxes`);
  if (!rectCount) {
    return lines;
  }

  // Pick a leaf element and work out where it sits on screen.
  const target = await session.evaluate(`(() => {
    const app = window.__forge;
    const overlay = document.querySelector('forge-canvas').shadowRoot.querySelector('#overlay');
    const box = overlay.getBoundingClientRect();
    const entries = Object.entries(app.state.rects)
      .filter(([id, r]) => id !== 'root' && r[2] > 40 && r[3] > 20);
    if (!entries.length) return null;
    const [id, rect] = entries[0];
    return {
      id, rect, zoom: app.state.zoom,
      originX: box.left, originY: box.top,
      node: JSON.parse(app.engine.getElement(id)),
    };
  })()`);

  if (!target) {
    check('found a draggable element', false);
    return lines;
  }
  check('found a draggable element', true, `${target.node.kind} ${target.id}`);

  const toScreen = (px, py) => ({
    x: Math.round(target.originX + px * target.zoom),
    y: Math.round(target.originY + py * target.zoom),
  });
  const centre = toScreen(
    target.rect[0] + target.rect[2] / 2,
    target.rect[1] + target.rect[3] / 2
  );

  const mouse = (type, x, y, extra = {}) =>
    session.send('Input.dispatchMouseEvent', {
      type,
      x,
      y,
      button: 'left',
      buttons: type === 'mouseReleased' ? 0 : 1,
      clickCount: 1,
      pointerType: 'mouse',
      ...extra,
    });

  // --- selection ----------------------------------------------------------
  await mouse('mouseMoved', centre.x, centre.y, { buttons: 0 });
  await mouse('mousePressed', centre.x, centre.y);
  await mouse('mouseReleased', centre.x, centre.y);
  await sleep(250);

  const selected = await session.evaluate('window.__forge.state.selection');
  check('clicking the canvas selects an element', Boolean(selected), String(selected));
  if (!selected) {
    return lines;
  }

  // --- drag ---------------------------------------------------------------
  // Assert against whatever the click actually hit: pressing at the centre of
  // a section lands on the topmost child there, not on the section itself.
  const before = await session.evaluate(
    `JSON.parse(window.__forge.engine.getElement(${JSON.stringify(selected)}))`
  );
  const startX = before.x;
  const startY = before.y;
  const drop = toScreen(
    target.rect[0] + target.rect[2] / 2 + 120,
    target.rect[1] + target.rect[3] / 2 + 70
  );

  await mouse('mousePressed', centre.x, centre.y);
  for (let step = 1; step <= 6; step++) {
    const x = Math.round(centre.x + ((drop.x - centre.x) * step) / 6);
    const y = Math.round(centre.y + ((drop.y - centre.y) * step) / 6);
    await mouse('mouseMoved', x, y);
    await sleep(24);
  }
  await mouse('mouseReleased', drop.x, drop.y);
  await sleep(350);

  const after = await session.evaluate(
    `JSON.parse(window.__forge.engine.getElement(${JSON.stringify(selected)}))`
  );
  const movedX = Math.abs(after.x - startX);
  const movedY = Math.abs(after.y - startY);
  check(
    'dragging moves the element',
    movedX > 20 || movedY > 20,
    `${selected} from (${startX},${startY}) to (${after.x},${after.y})`
  );

  // --- palette drop -------------------------------------------------------
  const countBefore = await session.evaluate('window.__forge.engine.nodeCount()');
  const tile = await session.evaluate(`(() => {
    const palette = document.querySelector('forge-palette');
    const el = palette.shadowRoot.querySelector('[data-kind="button"]');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
  })()`);

  if (!tile) {
    check('palette exposes a draggable tile', false);
  } else {
    const landing = toScreen(target.rect[0] + 40, target.rect[1] + 260);
    await mouse('mouseMoved', tile.x, tile.y, { buttons: 0 });
    await mouse('mousePressed', tile.x, tile.y);
    for (let step = 1; step <= 8; step++) {
      await mouse(
        'mouseMoved',
        Math.round(tile.x + ((landing.x - tile.x) * step) / 8),
        Math.round(tile.y + ((landing.y - tile.y) * step) / 8)
      );
      await sleep(24);
    }
    await mouse('mouseReleased', landing.x, landing.y);
    await sleep(400);

    const afterCount = await session.evaluate('window.__forge.engine.nodeCount()');
    check(
      'dragging from the palette adds an element',
      afterCount === countBefore + 1,
      `${countBefore} → ${afterCount}`
    );
  }

  // --- undo ---------------------------------------------------------------
  const undone = await session.evaluate(`(() => {
    const n = window.__forge.engine.nodeCount();
    window.__forge.undo();
    return { before: n, after: window.__forge.engine.nodeCount() };
  })()`);
  check('undo works from the editor', undone.after !== undone.before, JSON.stringify(undone));

  return lines;
}

// -------------------------------------------------------------------- main

async function main() {
  const browser = findBrowser();
  if (!browser) {
    console.error(
      'No Chrome/Chromium/Edge found. Set CHROME_PATH to the executable and retry.'
    );
    process.exit(2);
  }

  const profileDir = mkdtempSync(join(tmpdir(), 'forge-cdp-'));
  let server = null;
  let chrome = null;
  let failed = 0;

  const shutdown = () => {
    if (chrome && !chrome.killed) {
      chrome.kill();
    }
    if (server && !server.killed) {
      server.kill();
    }
    try {
      rmSync(profileDir, { recursive: true, force: true });
    } catch {
      // the profile is in the OS temp dir; leaving it behind is harmless
    }
  };
  process.on('exit', shutdown);
  process.on('SIGINT', () => {
    shutdown();
    process.exit(130);
  });

  try {
    // 1. static server -------------------------------------------------------
    console.log(`• serving ${ROOT} on :${SERVER_PORT}`);
    server = spawn(findPython(), ['serve.py', String(SERVER_PORT)], {
      cwd: ROOT,
      stdio: 'ignore',
      env: { ...process.env, FORGE_NO_BROWSER: '1' },
    });

    await until(
      async () => (await fetch(`http://127.0.0.1:${SERVER_PORT}/index.html`)).ok,
      'the static server'
    );

    // 2. browser -------------------------------------------------------------
    console.log(`• launching ${browser}${HEADFUL ? '' : ' (headless)'}`);
    const flags = [
      `--remote-debugging-port=${DEBUG_PORT}`,
      `--user-data-dir=${profileDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
      '--window-size=1600,1000',
      'about:blank',
    ];
    if (!HEADFUL) {
      flags.unshift('--headless=new', '--disable-gpu');
    }
    chrome = spawn(browser, flags, { stdio: 'ignore' });

    const version = await until(
      async () => (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`)).json(),
      'the DevTools endpoint'
    );
    console.log(`• ${version.Browser}\n`);

    // 3. run each suite ------------------------------------------------------
    for (const suite of SUITES) {
      const url = `http://127.0.0.1:${SERVER_PORT}${suite.path}`;
      const created = await (
        await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/new?${encodeURIComponent(url)}`, {
          method: 'PUT',
        })
      ).json();

      const session = new DevToolsSession(created.webSocketDebuggerUrl);
      await session.open();
      await session.send('Runtime.enable');
      await session.send('Page.enable');
      // Essential: Chrome does not run requestAnimationFrame in a background
      // tab, and the preview frame's measurement loop is rAF-driven. Without
      // this the editor never receives geometry and every test below fails for
      // a reason that has nothing to do with the code under test.
      await session.send('Page.bringToFront');

      /** @type {string[]} */
      let lines = [];
      let passed = false;

      if (suite.drive) {
        try {
          lines = await suite.drive(session);
          passed = lines.length > 0 && !lines.some((line) => line.startsWith('FAIL'));
        } catch (error) {
          lines.push(`FAIL  runner: ${error.message}`);
        }
      } else {
        let title = 'TIMEOUT';
        try {
          title = await until(
            async () => {
              const value = await session.evaluate('document.title');
              return /-(OK|FAIL)$/.test(value) ? value : null;
            },
            `${suite.name} to finish`,
            OVERALL_TIMEOUT_MS
          );
        } catch (error) {
          lines.push(`FAIL  ${error.message}`);
        }
        const report = await session
          .evaluate("document.getElementById('out') ? document.getElementById('out').textContent : ''")
          .catch(() => '');
        lines = String(report).split('\n').filter(Boolean).concat(lines);
        passed = title.endsWith('-OK');
      }

      console.log(`${passed ? 'PASS' : 'FAIL'}  ${suite.name}`);
      for (const line of lines) {
        console.log(`      ${line}`);
      }
      console.log('');
      if (!passed) {
        failed += 1;
      }

      session.close();
      await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/close/${created.id}`).catch(() => {});
    }
  } catch (error) {
    console.error(`runner error: ${error.message}`);
    failed += 1;
  } finally {
    shutdown();
  }

  console.log(failed === 0 ? 'All browser suites passed.' : `${failed} suite(s) failed.`);
  process.exit(failed === 0 ? 0 : 1);
}

main();
