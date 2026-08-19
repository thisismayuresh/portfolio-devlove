/**
 * File helpers built on nothing but Blob, URL and `<input type="file">`.
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
 * Opens the OS file picker and resolves with the chosen file's text.
 *
 * @param {string} accept `accept` attribute for the hidden input
 * @returns {Promise<string | null>} `null` when the user cancels
 */
export function pickTextFile(accept) {
  return new Promise((resolve, reject) => {
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

    input.addEventListener('change', () => {
      const file = input.files && input.files[0];
      if (!file) {
        finish(null);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => finish(String(reader.result ?? ''));
      reader.onerror = () => {
        input.remove();
        reject(reader.error || new Error('read failed'));
      };
      reader.readAsText(file);
    });

    // `cancel` is not universally supported; the focus fallback covers the rest.
    input.addEventListener('cancel', () => finish(null));
    window.addEventListener(
      'focus',
      () => setTimeout(() => {
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
