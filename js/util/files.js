/**
 * File helpers built on nothing but Blob, URL, FileReader and
 * `<input type="file">`.
 *
 * @module util/files
 */

/**
 * Triggers a browser download for in-memory text.
 *
 * @param {string} filename
 * @param {string} text
 * @param {string} [mime]
 */
export function downloadText(filename, text, mime = 'text/plain') {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  // Give the browser a tick to start the transfer before revoking.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Opens the OS file picker and resolves with the chosen `File`.
 *
 * @param {string} accept `accept` attribute for the hidden input
 * @returns {Promise<File | null>} `null` when the user cancels
 */
export function pickFile(accept) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.position = 'fixed';
    input.style.left = '-9999px';

    let settled = false;
    const finish = (value) => {
      if (settled) {
        return;
      }
      settled = true;
      input.remove();
      resolve(value);
    };

    input.addEventListener('change', () => finish((input.files && input.files[0]) || null));

    // `cancel` is not universally supported; the focus fallback covers the rest.
    input.addEventListener('cancel', () => finish(null));
    window.addEventListener(
      'focus',
      () =>
        setTimeout(() => {
          if (!input.files || input.files.length === 0) {
            finish(null);
          }
        }, 400),
      { once: true }
    );

    document.body.append(input);
    input.click();
  });
}

/**
 * Opens the OS file picker and resolves with the chosen file's text.
 *
 * @param {string} accept `accept` attribute for the hidden input
 * @returns {Promise<string | null>} `null` when the user cancels
 */
export async function pickTextFile(accept) {
  const file = await pickFile(accept);
  return file === null ? null : readAsText(file);
}

/**
 * @param {File | Blob} file
 * @returns {Promise<string>}
 */
export function readAsText(file) {
  return readWith(file, (reader) => reader.readAsText(file));
}

/**
 * Reads a file as a `data:` URI, ready to embed in the document.
 *
 * @param {File | Blob} file
 * @returns {Promise<string>}
 */
export function readAsDataUrl(file) {
  return readWith(file, (reader) => reader.readAsDataURL(file));
}

/**
 * @param {File | Blob} file
 * @param {(reader: FileReader) => void} start
 * @returns {Promise<string>}
 */
function readWith(file, start) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error || new Error('could not read that file'));
    start(reader);
  });
}

/**
 * The largest file worth embedding as a `data:` URI.
 *
 * Uploads are embedded rather than hosted, because devlove has no server and
 * the export has to stay one self-contained file. The cost is that every byte
 * lands in the project JSON *and* in the `localStorage` autosave, which
 * browsers cap somewhere around 5MB in total. Refusing a large file with an
 * explanation is kinder than accepting it and breaking autosave silently.
 */
export const MAX_EMBED_BYTES = 1_500_000;

/**
 * @param {number} bytes
 * @returns {string} a short human-readable size, e.g. `"2.4MB"`
 */
export function formatSize(bytes) {
  if (bytes < 1024) {
    return `${bytes}B`;
  }
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)}KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

/**
 * Turns any title into a filesystem-safe file stem.
 *
 * Exported so the toolbar and the command palette name downloads the same
 * way — two spellings of "save" that disagree on the filename would be a
 * small, very confusing bug.
 *
 * @param {string} value
 * @returns {string} filesystem-safe file stem
 */
export function slug(value) {
  const cleaned = String(value || 'untitled')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned || 'untitled';
}
