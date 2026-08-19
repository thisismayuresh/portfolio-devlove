/**
 * The single place that knows the WASM module exists.
 *
 * `wasm-pack build --target web` emits `pkg/designer_engine.js` (the ES module
 * glue) next to `pkg/designer_engine_bg.wasm`. Nothing else in the app imports
 * from `pkg/`, so moving or renaming the crate is a one-line change here.
 *
 * @module core/wasm-bridge
 */

/** Path of the generated glue module, relative to this file. */
const GLUE_MODULE = '../../pkg/designer_engine.js';

/** @type {Promise<any> | null} */
let modulePromise = null;

/**
 * Loads and instantiates the engine module exactly once per page.
 *
 * @returns {Promise<any>} the module namespace exported by wasm-bindgen
 */
export function loadEngineModule() {
  if (!modulePromise) {
    modulePromise = import(GLUE_MODULE)
      .then(async (namespace) => {
        // The default export is wasm-bindgen's async initialiser. It fetches
        // and compiles the .wasm binary; everything else throws until it
        // resolves.
        await namespace.default();
        return namespace;
      })
      .catch((error) => {
        modulePromise = null;
        throw new Error(buildLoadHint(error));
      });
  }
  return modulePromise;
}

/**
 * Creates a fresh engine instance.
 *
 * @returns {Promise<{engine: any, module: any}>}
 */
export async function createEngine() {
  const module = await loadEngineModule();
  if (typeof module.createEngine !== 'function') {
    throw new Error(
      'pkg/designer_engine.js loaded but exports no createEngine(). ' +
        'Rebuild with: wasm-pack build --target web'
    );
  }
  return { engine: module.createEngine(), module };
}

/**
 * Turns the raw loader failure into something actionable in the boot screen.
 *
 * @param {unknown} error
 * @returns {string}
 */
function buildLoadHint(error) {
  const detail = error instanceof Error ? error.message : String(error);
  const lines = [`Could not start the WebAssembly engine.`, ``, detail, ``];

  if (/Failed to fetch|dynamically imported module|404|not found/i.test(detail)) {
    lines.push(
      'Most likely the crate has not been built yet. From the project root run:',
      '',
      '    wasm-pack build --target web',
      '',
      'That creates ./pkg/designer_engine.js and ./pkg/designer_engine_bg.wasm.'
    );
  } else if (/MIME|application\/wasm|magic word/i.test(detail)) {
    lines.push(
      'The .wasm file was served with the wrong Content-Type.',
      'Start the bundled dev server instead:',
      '',
      '    python serve.py'
    );
  } else if (/file:\/\//.test(String(location.href))) {
    lines.push(
      'ES modules and WebAssembly cannot load from file:// URLs.',
      'Serve the folder over HTTP:',
      '',
      '    python serve.py'
    );
  }

  return lines.join('\n');
}
