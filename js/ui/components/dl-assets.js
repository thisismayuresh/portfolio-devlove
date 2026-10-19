/**
 * Left dock: Assets.
 *
 * Every image and video in the document, with a thumbnail you can click to
 * select-and-reveal, a Duplicate action, and a way to push one image's source
 * onto another — the copy-paste that the inspector makes you re-upload for.
 *
 * Files are embedded as `data:` URIs, the same way the inspector's upload
 * does it: devlove has no server, and the export has to stay one file. The
 * size guard is shared (`MAX_EMBED_BYTES`) so both entry points refuse the
 * same way and explain themselves the same way.
 *
 * @module ui/components/dl-assets
 */

import { PanelElement, esc } from '../panel-element.js';
import { icon } from '../icons.js';
import { app } from '../../core/app.js';
import { listAssets } from '../../engine/insights.js';
import { blueprintFor } from '../../registry/elements.js';
import { MAX_EMBED_BYTES, formatSize, pickFile, readAsDataUrl } from '../../util/files.js';

export class DlAssets extends PanelElement {
  static styles = `
    .root {
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 0;
      background: var(--surface-panel);
    }

    .count {
      font-family: var(--font-mono);
      font-size: var(--text-xs);
      color: var(--ink-dim);
    }

    .actions {
      display: flex;
      align-items: center;
      gap: 6px;
      flex: 0 0 auto;
      padding: 6px 10px;
    }
    .actions .btn { flex: 1 1 auto; font-size: var(--text-xs); }

    .body { flex: 1 1 auto; min-height: 0; padding: 2px 0 16px; }
    .body[data-drop="true"] { outline: 1px dashed var(--accent); outline-offset: -4px; }

    .grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
      padding: 8px 10px;
    }

    .card {
      display: flex;
      flex-direction: column;
      border: 1px solid var(--line);
      background: var(--surface-raised);
      cursor: pointer;
      min-width: 0;
    }
    .card:hover { border-color: var(--line-strong); }
    .card:focus-visible { outline: 1px solid var(--accent); outline-offset: -1px; }
    .card[aria-current="true"] { border-color: var(--accent); }

    .thumb {
      aspect-ratio: 16 / 10;
      display: grid;
      place-items: center;
      background: var(--surface-active);
      color: var(--ink-faint);
      overflow: hidden;
      border-bottom: 1px solid var(--line);
    }
    .thumb img, .thumb video { width: 100%; height: 100%; object-fit: cover; display: block; }

    .card__name {
      padding: 5px 7px 1px;
      font-size: var(--text-xs);
      color: var(--ink);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .card__meta {
      padding: 0 7px 5px;
      font-size: var(--text-xs);
      color: var(--ink-faint);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .card__acts { display: flex; gap: 4px; padding: 0 6px 6px; }
    .act {
      flex: 1 1 auto;
      height: 20px;
      font-size: 10.5px;
      color: var(--ink-dim);
      background: var(--surface-panel);
      border: 1px solid var(--line);
    }
    .act:hover:not(:disabled) { color: var(--ink-strong); border-color: var(--line-strong); }
    .act:disabled { opacity: 0.4; cursor: default; }

    .empty {
      padding: 24px 14px;
      text-align: center;
      color: var(--ink-faint);
      font-size: var(--text-sm);
      line-height: 1.7;
    }
  `;

  template() {
    return `
      <div class="panel-head">
        <span class="panel-head__title">Assets</span>
        <span class="count" id="count"></span>
      </div>
      <div class="actions">
        <button class="btn" id="add" type="button" title="Embed an image or video file">
          ${icon('plus', 13)}<span>Add media</span>
        </button>
      </div>
      <div class="body scroll" id="body" data-drop="false"></div>
    `;
  }

  mounted() {
    const body = this.$('#body');
    const add = this.$('#add');

    this.bind(add, 'click', async () => {
      let file;
      try {
        file = await pickFile('image/*,video/*');
      } catch (error) {
        app.setStatus(`Could not open that file: ${error?.message || error}`, 'danger');
        return;
      }
      if (file) {
        await this._embed(file);
      }
    });

    this.bind(body, 'click', (event) => {
      const target = /** @type {HTMLElement} */ (event.target);
      const action = target.closest('[data-do]');
      const card = target.closest('[data-id]');
      if (action && card) {
        this._act(action.getAttribute('data-do'), card.getAttribute('data-id'));
        return;
      }
      if (card) {
        this._go(card.getAttribute('data-id'));
      }
    });

    // The whole panel is a drop target, which is the gesture people reach for
    // when a media library is open in front of them.
    this.bind(this.root, 'dragover', (event) => {
      const dragEvent = /** @type {DragEvent} */ (event);
      if (dragEvent.dataTransfer && [...dragEvent.dataTransfer.types].includes('Files')) {
        dragEvent.preventDefault();
        body.setAttribute('data-drop', 'true');
      }
    });
    this.bind(this.root, 'dragleave', () => body.setAttribute('data-drop', 'false'));
    this.bind(this.root, 'drop', async (event) => {
      const dragEvent = /** @type {DragEvent} */ (event);
      const file = dragEvent.dataTransfer && dragEvent.dataTransfer.files[0];
      if (!file) {
        return;
      }
      dragEvent.preventDefault();
      body.setAttribute('data-drop', 'false');
      await this._embed(file);
    });

    this.listen(['ready', 'document', 'node', 'selection'], () => this._render());
    this._render();
  }

  _render() {
    const body = this.$('#body');
    const count = this.$('#count');
    if (!body) {
      return;
    }

    const assets = app.engine ? listAssets(app.engine.snapshot()) : [];
    if (count) {
      count.textContent = assets.length > 0 ? String(assets.length) : '';
    }

    if (assets.length === 0) {
      body.innerHTML = `
        <p class="empty">No images or video yet.<br />Drop a file here, or use Add media.</p>`;
      return;
    }

    const selected = this._selectionId();
    const target = selected ? app.getNode(selected) : null;
    const canUse = target && target.kind === 'image';

    body.innerHTML = `<div class="grid">${assets
      .map((asset) => {
        const meta = blueprintFor(asset.kind);
        const thumb =
          asset.kind === 'video' && asset.src
            ? `<video src="${esc(asset.src)}" muted playsinline></video>`
            : asset.src
              ? `<img src="${esc(asset.src)}" alt="" loading="lazy" />`
              : icon(meta.icon, 26);
        return `
          <div class="card" data-id="${esc(asset.id)}" tabindex="0"
               aria-current="${selected === asset.id}">
            <div class="thumb">${thumb}</div>
            <span class="card__name">${esc(asset.name)}</span>
            <span class="card__meta">${esc(meta.label)}${asset.alt ? ` · ${esc(asset.alt)}` : ''}</span>
            <div class="card__acts">
              <button class="act" type="button" data-do="use"
                      ${canUse && selected !== asset.id ? '' : 'disabled'}
                      title="${canUse && selected !== asset.id ? 'Replace the selected image with this one' : 'Select an image on the canvas first'}">Use</button>
              <button class="act" type="button" data-do="dup" title="Duplicate this element">Duplicate</button>
            </div>
          </div>`;
      })
      .join('')}</div>`;
  }

  /**
   * @param {string | null} action
   * @param {string | null} id
   */
  _act(action, id) {
    if (!id) {
      return;
    }
    if (action === 'dup') {
      app.duplicateElement(id);
      return;
    }
    if (action === 'use') {
      const selected = this._selectionId();
      const target = selected ? app.getNode(selected) : null;
      const asset = app.engine ? listAssets(app.engine.snapshot()).find((a) => a.id === id) : null;
      if (!target || target.kind !== 'image' || !asset || selected === id) {
        app.setStatus('Select an image on the canvas first', 'muted');
        return;
      }
      app.setProperty(selected, 'src', asset.src);
      app.setStatus(`Replaced the source of ${target.name || 'image'}`);
    }
  }

  /** @returns {string | null} the primary selected node id */
  _selectionId() {
    const selection = app.state.selection;
    if (Array.isArray(selection)) {
      return selection[0] || null;
    }
    return selection || null;
  }

  /**
   * @param {string | null} id
   */
  _go(id) {
    if (!id) {
      return;
    }
    app.select(id);
    app.emit('reveal:request', id);
  }

  /**
   * @param {File} file
   * @returns {Promise<void>}
   */
  async _embed(file) {
    if (file.size > MAX_EMBED_BYTES) {
      app.setStatus(
        `${file.name} is ${formatSize(file.size)}. Files are embedded in the page, ` +
          `so keep them under ${formatSize(MAX_EMBED_BYTES)} — or paste a URL instead.`,
        'danger'
      );
      return;
    }
    let dataUri;
    try {
      dataUri = await readAsDataUrl(file);
    } catch (error) {
      app.setStatus(`Could not read ${file.name}: ${error?.message || error}`, 'danger');
      return;
    }
    const width = Number(app.getPage().width) || 1280;
    const kind = file.type.startsWith('video/') ? 'video' : 'image';
    const id = app.addElement(kind, 'root', Math.round(width / 2 - 140), 64);
    if (id) {
      app.setProperty(id, 'src', dataUri);
      app.setStatus(`Embedded ${file.name} (${formatSize(file.size)})`);
      app.emit('reveal:request', id);
    }
  }
}

customElements.define('dl-assets', DlAssets);
