/**
 * Zero-dependency headless browser test runner.
 *
 * Starts the static server, launches Chrome (or Edge/Chromium) with the
 * DevTools protocol enabled, drives each test page in *real* time, and reports
 * the results.
 *
 * This suite covers what only a real browser can answer: whether dragging,
 * dropping and the preview frame's measurement loop actually work. Engine
 * logic is covered far more cheaply by `node --test tests/unit/`.
 *
 * Why not `chrome --headless --dump-dom`?
 *   `--dump-dom` snapshots after the load event, long before the preview frame
 *   has reported its first measurements. `--virtual-time-budget` fixes the
 *   timing but introduces a worse problem: once the virtual clock jumps past
 *   the budget, Chrome stops loading new frames, so anything created after an
 *   async step never runs. Driving the page over CDP with a real clock avoids
 *   both traps.
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
  { name: 'aux panels + palette', path: '/', drive: driveAux },
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

  const candidates =
    {
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
      const text = result.exceptionDetails.exception?.description || result.exceptionDetails.text;
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
    () => session.evaluate('Boolean(window.__devlove && window.__devlove.state.ready)'),
    'the editor to boot'
  );
  check('editor boots', true);

  const rectCount = await until(async () => {
    const n = await session.evaluate('Object.keys(window.__devlove.state.rects).length');
    return n > 1 ? n : null;
  }, 'the preview frame to report geometry').catch(() => 0);
  check('preview frame reports geometry', rectCount > 1, `${rectCount} boxes`);
  if (!rectCount) {
    return lines;
  }

  // Pick a leaf element and work out where it sits on screen.
  const target = await session.evaluate(`(() => {
    const app = window.__devlove;
    const overlay = document.querySelector('dl-canvas').shadowRoot.querySelector('#overlay');
    const box = overlay.getBoundingClientRect();
    const entries = Object.entries(app.state.rects)
      .filter(([id, r]) => id !== 'root' && r[2] > 40 && r[3] > 20);
    if (!entries.length) return null;
    const [id, rect] = entries[0];
    return {
      id, rect, zoom: app.state.zoom,
      originX: box.left, originY: box.top,
      node: app.engine.getElement(id),
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
  const centre = toScreen(target.rect[0] + target.rect[2] / 2, target.rect[1] + target.rect[3] / 2);

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

  const selected = await session.evaluate('window.__devlove.state.selection');
  check('clicking the canvas selects an element', Boolean(selected), String(selected));
  if (!selected) {
    return lines;
  }

  // --- drag ---------------------------------------------------------------
  // Assert against whatever the click actually hit: pressing at the centre of
  // a section lands on the topmost child there, not on the section itself.
  const before = await session.evaluate(
    `window.__devlove.engine.getElement(${JSON.stringify(selected)})`
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
    `window.__devlove.engine.getElement(${JSON.stringify(selected)})`
  );
  const movedX = Math.abs(after.x - startX);
  const movedY = Math.abs(after.y - startY);
  check(
    'dragging moves the element',
    movedX > 20 || movedY > 20,
    `${selected} from (${startX},${startY}) to (${after.x},${after.y})`
  );

  // --- palette drop -------------------------------------------------------
  const countBefore = await session.evaluate('window.__devlove.engine.nodeCount()');
  const tile = await session.evaluate(`(() => {
    const palette = document.querySelector('dl-palette');
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

    const afterCount = await session.evaluate('window.__devlove.engine.nodeCount()');
    check(
      'dragging from the palette adds an element',
      afterCount === countBefore + 1,
      `${countBefore} → ${afterCount}`
    );
  }

  // --- inspector ----------------------------------------------------------
  // The inspector renders borderless label/value rows from a schema; this
  // guards the wiring between a rendered control and the engine.
  const inspected = await session.evaluate(`(() => {
    const app = window.__devlove;
    const panel = document.querySelector('dl-inspector');
    const field = panel.shadowRoot.querySelector('[data-key="width"]');
    if (!field) return { error: 'no width field rendered' };

    const id = app.state.selection;
    const before = app.engine.getElement(id).width;
    field.value = String(before + 55);
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new Event('change', { bubbles: true }));
    return { before, after: app.engine.getElement(id).width };
  })()`);
  check(
    'editing a value in the inspector reaches the engine',
    !inspected.error && inspected.after === inspected.before + 55,
    JSON.stringify(inspected)
  );

  const toggled = await session.evaluate(`(() => {
    const app = window.__devlove;
    const panel = document.querySelector('dl-inspector');
    const group = panel.shadowRoot.querySelector('.bool[data-key="autoHeight"]');
    if (!group) return { error: 'no autoHeight toggle rendered' };

    const id = app.state.selection;
    const before = app.engine.getElement(id).autoHeight;
    group.querySelector('[data-value="' + (before ? 'false' : 'true') + '"]').click();
    return { before, after: app.engine.getElement(id).autoHeight };
  })()`);
  check(
    'True/False toggles reach the engine',
    !toggled.error && toggled.after !== toggled.before,
    JSON.stringify(toggled)
  );

  // --- undo ---------------------------------------------------------------
  // Compares whole documents rather than the node count: by this point the
  // most recent change is a property edit, which leaves the count untouched.
  const undone = await session.evaluate(`(() => {
    const app = window.__devlove;
    // exportProject() is the synchronous engine call; app.serializeProject()
    // hands the same work to the compile worker and returns a promise.
    const before = app.engine.exportProject();
    const accepted = app.engine.undo();
    const after = app.engine.exportProject();
    return { accepted, changed: before !== after };
  })()`);
  check('undo reverses the last change', undone.accepted && undone.changed, JSON.stringify(undone));

  // --- context menu -------------------------------------------------------
  // Right-click where the selection actually sits now, not where it sat
  // before the drag above moved it.
  const ctxPoint = await session.evaluate(`(() => {
    const app = window.__devlove;
    const overlay = document.querySelector('dl-canvas').shadowRoot.querySelector('#overlay');
    const box = overlay.getBoundingClientRect();
    const rect = app.rectOf(app.state.selection);
    if (!rect) return null;
    return {
      x: box.left + (rect[0] + rect[2] / 2) * app.state.zoom,
      y: box.top + (rect[1] + rect[3] / 2) * app.state.zoom,
    };
  })()`);
  if (!ctxPoint) {
    check('context menu has a point to right-click', false);
    return lines;
  }

  const rightClick = async () => {
    await mouse('mousePressed', ctxPoint.x, ctxPoint.y, { button: 'right', buttons: 2 });
    await mouse('mouseReleased', ctxPoint.x, ctxPoint.y, { button: 'right', buttons: 0 });
  };
  const menuOpenState = () =>
    session.evaluate(
      `document.querySelector('dl-context-menu').getAttribute('data-open') === 'true'`
    );

  await rightClick();
  await sleep(200);
  check('right-click opens the context menu', await menuOpenState());

  const menuItems = await session.evaluate(`(() => {
    const menu = document.querySelector('dl-context-menu').shadowRoot.querySelector('#menu');
    return [...menu.querySelectorAll('.item')].map((b) => b.textContent.trim());
  })()`);
  check(
    'the menu offers element actions',
    menuItems.some((label) => label.startsWith('Duplicate')) &&
      menuItems.some((label) => label.startsWith('Delete')) &&
      menuItems.some((label) => label.startsWith('Copy')),
    `${menuItems.length} items`
  );

  // Escape dismisses without touching the document.
  await session.send('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: 'Escape',
    code: 'Escape',
    windowsVirtualKeyCode: 27,
  });
  await session.send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: 'Escape',
    code: 'Escape',
    windowsVirtualKeyCode: 27,
  });
  await sleep(150);
  check('Escape closes the context menu', !(await menuOpenState()));

  // Choose an item: Duplicate from the menu really copies.
  const menuCountBefore = await session.evaluate('window.__devlove.engine.nodeCount()');
  await rightClick();
  await sleep(200);
  const clicked = await session.evaluate(`(() => {
    const menu = document.querySelector('dl-context-menu').shadowRoot.querySelector('#menu');
    const duplicate = [...menu.querySelectorAll('.item')]
      .find((button) => button.textContent.includes('Duplicate'));
    if (!duplicate || duplicate.disabled) return false;
    duplicate.click();
    return true;
  })()`);
  await sleep(300);
  const menuCountAfter = await session.evaluate('window.__devlove.engine.nodeCount()');
  check(
    'choosing Duplicate from the menu copies the element',
    clicked && menuCountAfter > menuCountBefore,
    `${menuCountBefore} → ${menuCountAfter} nodes`
  );

  return lines;
}

// ------------------------------------------------------------ aux suite

/**
 * Drives the auxiliary dock panels and the command palette over CDP.
 *
 * Every assertion here targets behaviour the unit tests cannot reach: shadow
 * DOM wiring, rail switching, real keystrokes (Ctrl+F, Ctrl+K, the digit
 * shortcuts), the round trip from a panel row to the engine, the drag guides
 * painting during a live gesture, and `reveal:request` moving the viewport.
 *
 * The suite creates its own problem (a blank heading) rather than leaning on
 * the document's existing ones, so it passes whether or not the template's
 * deliberate blanks have been filled in yet.
 *
 * @param {DevToolsSession} session
 * @returns {Promise<string[]>} result lines, `FAIL` prefixed on failure
 */
async function driveAux(session) {
  const lines = [];
  const check = (name, ok, detail = '') =>
    lines.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);

  await until(
    () => session.evaluate('Boolean(window.__devlove && window.__devlove.state.ready)'),
    'the editor to boot'
  );
  check('editor boots', true);

  const rectCount = await until(async () => {
    const n = await session.evaluate('Object.keys(window.__devlove.state.rects).length');
    return n > 1 ? n : null;
  }, 'the preview frame to report geometry').catch(() => 0);
  check('preview frame reports geometry', rectCount > 1, `${rectCount} boxes`);
  if (!rectCount) {
    return lines;
  }

  /** Presses and releases one key the way a human would type it. */
  const tapKey = async ({ key, code, windowsVirtualKeyCode, modifiers = 0 }) => {
    await session.send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key,
      code,
      windowsVirtualKeyCode,
      modifiers,
    });
    await session.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key,
      code,
      windowsVirtualKeyCode,
      modifiers: 0,
    });
  };

  /** @param {string} panel @returns {Promise<boolean>} */
  const panelHidden = (panel) =>
    session.evaluate(`document.querySelector('#left-dock [data-panel="${panel}"]').hidden`);

  /** @param {string} panel clicks the rail slot and reports visibility */
  const showPanel = async (panel) => {
    await session.evaluate(`(() => {
      const rail = document.querySelector('dl-rail');
      const slot = rail.shadowRoot.querySelector('[data-panel="${panel}"]');
      if (slot) slot.click();
    })()`);
    return (await panelHidden(panel)) === false;
  };

  // --- the rail ---------------------------------------------------------
  const slots = await session.evaluate(`(() => {
    const rail = document.querySelector('dl-rail');
    return rail
      ? [...rail.shadowRoot.querySelectorAll('[data-panel]')].map((slot) => slot.getAttribute('data-panel'))
      : [];
  })()`);
  check(
    'the rail offers seven dock panels',
    slots.length === 7 && slots.includes('problems') && slots.includes('theme'),
    slots.join(', ')
  );

  // --- problems ---------------------------------------------------------
  const problemsShown = await showPanel('problems');
  const paletteHidden = await panelHidden('elements');
  check('the rail reveals Problems and hides the palette', problemsShown && paletteHidden);

  // Create a problem of our own so the assertion holds no matter what the
  // document's own state happens to be.
  const headingId = await session.evaluate(`(() => {
    const app = window.__devlove;
    const id = app.addElement('heading', 'root', 64, 40);
    if (!id) return null;
    app.setProperty(id, 'content', '');
    return id;
  })()`);
  check('a blank heading can be created', Boolean(headingId), String(headingId));

  const rowCount = await until(async () => {
    const n = await session.evaluate(`(() => {
      const panel = document.querySelector('dl-problems');
      return panel.shadowRoot.querySelectorAll('#body [data-id]').length;
    })()`);
    return n > 0 ? n : null;
  }, 'the problems list to render').catch(() => 0);
  check('Problems lists the document issues', rowCount > 0, `${rowCount} rows`);

  const ourRow = await session.evaluate(
    `document.querySelector('dl-problems').shadowRoot.querySelector('[data-id="${headingId}"]') !== null`
  );
  check('the blank heading appears in the list', ourRow);

  const badge = await session.evaluate(`(() => {
    const badge = document.querySelector('dl-rail').shadowRoot.querySelector('#problemsBadge');
    const count = document.querySelector('dl-problems').shadowRoot.querySelector('#count').textContent;
    return badge ? { hidden: badge.hidden, text: badge.textContent, count } : null;
  })()`);
  check(
    'the rail badge matches the problem count',
    Boolean(badge) && !badge.hidden && badge.text === badge.count && Number(badge.count) >= 1,
    JSON.stringify(badge)
  );

  await session.evaluate(`(() => {
    const row = document.querySelector('dl-problems').shadowRoot.querySelector('[data-id="${headingId}"]');
    if (row) row.click();
  })()`);
  await sleep(120);
  const problemSelection = await session.evaluate('window.__devlove.state.selection');
  check(
    'clicking a problem selects its element',
    problemSelection === headingId,
    `${problemSelection}`
  );

  // --- find (Ctrl+F) ----------------------------------------------------
  await tapKey({ key: 'f', code: 'KeyF', windowsVirtualKeyCode: 70, modifiers: 2 });
  const findShown = await until(
    async () => (await panelHidden('find')) === false,
    'the Find panel to open'
  ).catch(() => false);
  check('Ctrl+F opens the Find panel', findShown);

  const findFocused = await session.evaluate(`(() => {
    const root = document.querySelector('dl-find').shadowRoot;
    const input = root.querySelector('#query');
    return root.activeElement === input;
  })()`);
  check('the Find field takes focus', findFocused);

  await session.evaluate(`(() => {
    const input = document.querySelector('dl-find').shadowRoot.querySelector('#query');
    input.value = 'table';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  const findRows = await session.evaluate(
    `document.querySelector('dl-find').shadowRoot.querySelectorAll('#body [data-id]').length`
  );
  check('Find matches elements by type and text', findRows >= 1, `${findRows} rows`);

  const firstFindId = await session.evaluate(`(() => {
    const row = document.querySelector('dl-find').shadowRoot.querySelector('#body [data-id]');
    if (!row) return null;
    const id = row.getAttribute('data-id');
    row.click();
    return id;
  })()`);
  await sleep(120);
  const findSelection = await session.evaluate('window.__devlove.state.selection');
  check(
    'clicking a Find result selects it',
    Boolean(firstFindId) && findSelection === firstFindId,
    `${firstFindId} → ${findSelection}`
  );

  // --- assets -----------------------------------------------------------
  const assetsShown = await showPanel('assets');
  check('the rail reveals the Assets panel', assetsShown);

  const assetCards = await until(async () => {
    const n = await session.evaluate(
      `document.querySelector('dl-assets').shadowRoot.querySelectorAll('#body [data-id]').length`
    );
    return n > 0 ? n : null;
  }, 'the assets list to render').catch(() => 0);
  check('Assets lists the images in the document', assetCards > 0, `${assetCards} cards`);

  const assetSelection = await session.evaluate(`(() => {
    const card = document.querySelector('dl-assets').shadowRoot.querySelector('#body [data-id]');
    if (!card) return null;
    const id = card.getAttribute('data-id');
    card.click();
    return id;
  })()`);
  await sleep(120);
  const selectedAsset = await session.evaluate('window.__devlove.state.selection');
  check(
    'clicking an asset selects it',
    Boolean(assetSelection) && selectedAsset === assetSelection,
    `${assetSelection} → ${selectedAsset}`
  );

  // --- theme ------------------------------------------------------------
  const themeShown = await showPanel('theme');
  check('the rail reveals the Theme panel', themeShown);

  const themeColors = await session.evaluate(`(() => {
    const root = document.querySelector('dl-theme').shadowRoot;
    const rows = [...root.querySelectorAll('#body [data-value]')];
    return { count: rows.length, value: rows[0] ? rows[0].getAttribute('data-value') : null };
  })()`);
  check(
    'Theme collects the document colours',
    themeColors.count >= 3,
    `${themeColors.count} colours`
  );

  // The asset click above left an image selected, so Apply is enabled.
  const applied = await session.evaluate(`(() => {
    const root = document.querySelector('dl-theme').shadowRoot;
    const row = root.querySelector('#body [data-value]');
    const button = row.querySelector('[data-do="text"]');
    if (button.disabled) return { error: 'apply disabled' };
    const value = row.getAttribute('data-value');
    button.click();
    const app = window.__devlove;
    const id = Array.isArray(app.state.selected) ? app.state.selected[0] : app.state.selection;
    return { value, now: app.engine.getElement(id).style.color, id };
  })()`);
  check(
    'applying a theme colour reaches the engine',
    !applied.error && applied.now === applied.value,
    JSON.stringify(applied)
  );

  // --- digit shortcuts ---------------------------------------------------
  await session.evaluate(`(() => {
    for (const host of document.querySelectorAll('*')) {
      const active = host.shadowRoot && host.shadowRoot.activeElement;
      if (active && active.blur) active.blur();
    }
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  })()`);
  await tapKey({ key: '4', code: 'Digit4', windowsVirtualKeyCode: 52 });
  await sleep(150);
  const problemsByDigit = (await panelHidden('problems')) === false;
  await tapKey({ key: '6', code: 'Digit6', windowsVirtualKeyCode: 54 });
  await sleep(150);
  const assetsByDigit = (await panelHidden('assets')) === false && (await panelHidden('problems'));
  check('digit shortcuts switch dock panels', problemsByDigit && assetsByDigit);

  // --- command palette (Ctrl+K) ------------------------------------------
  await tapKey({ key: 'k', code: 'KeyK', windowsVirtualKeyCode: 75, modifiers: 2 });
  const paletteOpen = await until(
    async () =>
      session.evaluate(
        `document.querySelector('dl-commands').getAttribute('data-open') === 'true'`
      ),
    'the command palette to open'
  ).catch(() => false);
  check('Ctrl+K opens the command palette', paletteOpen);

  await session.evaluate(`(() => {
    const input = document.querySelector('dl-commands').shadowRoot.querySelector('#cmd');
    input.value = 'undo';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  const topLabel = await session.evaluate(`(() => {
    const row = document.querySelector('dl-commands').shadowRoot.querySelector('#list [data-index="0"]');
    return row ? row.querySelector('.row__label').textContent : '';
  })()`);
  check('the palette ranks the best match first', topLabel === 'Undo', topLabel);

  await tapKey({ key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await sleep(150);
  const paletteClosed = await session.evaluate(
    `document.querySelector('dl-commands').getAttribute('data-open') === 'false'`
  );
  check('Enter runs the active command and closes the palette', paletteClosed);

  // --- reveal:request ----------------------------------------------------
  await session.evaluate(`(() => {
    const viewport = document.querySelector('dl-canvas').shadowRoot.querySelector('#viewport');
    viewport.scrollTop = 0;
  })()`);
  await sleep(150);
  const deep = await session.evaluate(`(() => {
    const app = window.__devlove;
    const entries = Object.entries(app.state.rects)
      .filter(([id, rect]) => id !== 'root' && rect[1] + rect[3] > 1550)
      .sort((a, b) => b[1][1] - a[1][1]);
    if (!entries.length) return null;
    return { id: entries[0][0], before: 0 };
  })()`);
  if (!deep) {
    check('there is an element below the fold to reveal', false);
  } else {
    await session.evaluate(`window.__devlove.emit('reveal:request', ${JSON.stringify(deep.id)})`);
    const scrolled = await until(
      async () => {
        const top = await session.evaluate(
          `document.querySelector('dl-canvas').shadowRoot.querySelector('#viewport').scrollTop`
        );
        return top > 10 ? top : null;
      },
      'the canvas to scroll to the revealed element',
      5000
    ).catch(() => 0);
    check(
      'reveal:request scrolls the element into view',
      scrolled > deep.before,
      `scrollTop → ${scrolled}`
    );
  }

  // --- drag guides -------------------------------------------------------
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

  const candidates = await session.evaluate(`(() => {
    const app = window.__devlove;
    const overlay = document.querySelector('dl-canvas').shadowRoot.querySelector('#overlay');
    const box = overlay.getBoundingClientRect();
    const out = [];
    for (const [id, rect] of Object.entries(app.state.rects)) {
      if (id === 'root' || rect[2] < 40 || rect[3] < 24) continue;
      const node = app.engine.getElement(id);
      if (!node || node.hidden) continue;
      out.push({
        rect,
        cx: Math.round(box.left + (rect[0] + rect[2] / 2) * app.state.zoom),
        cy: Math.round(box.top + (rect[1] + rect[3] / 2) * app.state.zoom),
      });
    }
    out.sort((a, b) => a.rect[1] - b.rect[1]);
    return out.slice(0, 10);
  })()`);

  /** @type {any} */
  let guideInfo = null;
  for (const candidate of candidates) {
    await mouse('mouseMoved', candidate.cx, candidate.cy, { buttons: 0 });
    await mouse('mousePressed', candidate.cx, candidate.cy);
    // The press lands on the topmost node at that point, which may be the
    // candidate or one of its children. Only an absolutely positioned parent
    // paints guides; flow containers use the reorder line instead, so those
    // presses are released and the next candidate tried.
    const attempt = await session.evaluate(`(() => {
      const app = window.__devlove;
      const canvas = document.querySelector('dl-canvas');
      const gesture = canvas._gesture;
      if (!gesture || !gesture.id) return { error: 'no gesture' };
      const doc = app.engine.snapshot();
      const node = doc.nodes[gesture.id];
      if (!node) return { error: 'no node' };
      const parent = doc.nodes[node.parent || 'root'];
      if (!parent || parent.layout !== 'absolute') return { flow: true };
      const guides = app.engine.snapGuides(gesture.id).v.filter(
        (c) => c >= 0 && c <= parent.width - 1
      );
      if (guides.length === 0) return { error: 'no guides' };
      let best = guides[0];
      for (const c of guides) {
        if (Math.abs(c - node.x) < Math.abs(best - node.x)) best = c;
      }
      let dx = best - node.x;
      if (Math.abs(dx) < 4) dx = dx >= 0 ? 4 : -4;
      return { id: gesture.id, best, dx, zoom: app.state.zoom };
    })()`);

    if (attempt.error || attempt.flow) {
      await mouse('mouseReleased', candidate.cx, candidate.cy);
      await sleep(60);
      continue;
    }
    guideInfo = { ...attempt, pressX: candidate.cx, pressY: candidate.cy };
    break;
  }

  if (!guideInfo) {
    check('found an absolutely positioned element to drag', false);
    return lines;
  }

  const screenDx = Math.round(guideInfo.dx * guideInfo.zoom);
  for (let step = 1; step <= 4; step += 1) {
    await mouse(
      'mouseMoved',
      Math.round(guideInfo.pressX + (screenDx * step) / 4),
      guideInfo.pressY
    );
    await sleep(30);
  }
  await sleep(80);
  const guideOn = await session.evaluate(
    `document.querySelector('dl-canvas').shadowRoot.querySelector('#guideV').getAttribute('data-on')`
  );
  check('dragging near an edge shows the snap guide', guideOn === 'true', `data-on=${guideOn}`);

  await mouse('mouseReleased', Math.round(guideInfo.pressX + screenDx), guideInfo.pressY);
  await sleep(300);
  const settled = await session.evaluate(`(() => {
    const app = window.__devlove;
    const node = app.engine.getElement(${JSON.stringify(guideInfo.id)});
    const guide = document.querySelector('dl-canvas').shadowRoot.querySelector('#guideV');
    return { x: node.x, best: ${JSON.stringify(guideInfo.best)}, on: guide.getAttribute('data-on') };
  })()`);
  check(
    'the element settles on the guide and the guide hides',
    Math.abs(settled.x - settled.best) <= 6 && settled.on !== 'true',
    JSON.stringify(settled)
  );

  return lines;
}

// -------------------------------------------------------------------- main

async function main() {
  const browser = findBrowser();
  if (!browser) {
    console.error('No Chrome/Chromium/Edge found. Set CHROME_PATH to the executable and retry.');
    process.exit(2);
  }

  const profileDir = mkdtempSync(join(tmpdir(), 'devlove-cdp-'));
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
      env: { ...process.env, DEVLOVE_NO_BROWSER: '1' },
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
          .evaluate(
            "document.getElementById('out') ? document.getElementById('out').textContent : ''"
          )
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
