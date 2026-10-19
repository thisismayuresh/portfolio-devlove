/**
 * Hit testing, drop routing and snapping — all answered from *measured* boxes.
 *
 * The engine never predicts where an element ends up. The preview frame
 * measures every node with `getBoundingClientRect` and posts the results back;
 * these functions read that cache. It is the only approach that is correct
 * inside a flex-flowed container, where nothing short of a full CSS layout
 * implementation could work out a child's position.
 *
 * A measured box is a plain `[x, y, width, height]` array in frame-viewport
 * pixels — the exact shape the frame sends, so nothing has to be converted.
 *
 * @module engine/geometry
 */

import { collectSubtree } from './document.js';
import { acceptsChildren } from './kinds.js';

/** @typedef {[number, number, number, number]} Rect */

/**
 * @param {Rect} rect
 * @param {number} x
 * @param {number} y
 * @returns {boolean}
 */
export function rectContains(rect, x, y) {
  return x >= rect[0] && x <= rect[0] + rect[2] && y >= rect[1] && y <= rect[1] + rect[3];
}

/**
 * @param {Rect} rect
 * @returns {number}
 */
export function rectArea(rect) {
  return Math.abs(rect[2] * rect[3]);
}

/**
 * Deepest visible node under a point.
 *
 * Children are tested in reverse document order so the visually topmost
 * sibling wins, which is what a click on overlapping boxes should select.
 *
 * @param {any} doc
 * @param {Record<string, Rect>} rects
 * @param {number} x
 * @param {number} y
 * @returns {string | null}
 */
export function hitTest(doc, rects, x, y) {
  /** @type {string | null} */
  let best = null;

  /** @param {any} node */
  const descend = (node) => {
    if (!node || node.hidden) {
      return;
    }
    const rect = rects[node.id];
    const inside = rect ? rectContains(rect, x, y) : node.id === doc.root;
    if (!inside) {
      return;
    }
    if (node.id !== doc.root) {
      best = node.id;
    }
    for (let index = node.children.length - 1; index >= 0; index -= 1) {
      const before = best;
      descend(doc.nodes[node.children[index]]);
      if (best !== before) {
        return;
      }
    }
  };

  descend(doc.nodes[doc.root]);
  return best;
}

/**
 * The container that should receive a drop at a point: the smallest measured
 * one covering it, ignoring anything inside `exclude`'s own subtree (you
 * cannot drop a node into itself).
 *
 * Falls back to the root, which always accepts a drop.
 *
 * @param {any} doc
 * @param {Record<string, Rect>} rects
 * @param {number} x
 * @param {number} y
 * @param {string | null} [exclude]
 * @returns {string}
 */
export function dropTarget(doc, rects, x, y, exclude = null) {
  const banned = exclude ? new Set(collectSubtree(doc, exclude)) : new Set();

  let best = doc.root;
  let bestArea = Infinity;
  for (const node of Object.values(doc.nodes)) {
    const candidate = /** @type {any} */ (node);
    if (
      candidate.id === doc.root ||
      candidate.hidden ||
      banned.has(candidate.id) ||
      !acceptsChildren(candidate.kind)
    ) {
      continue;
    }
    const rect = rects[candidate.id];
    if (rect && rectContains(rect, x, y) && rectArea(rect) < bestArea) {
      bestArea = rectArea(rect);
      best = candidate.id;
    }
  }
  return best;
}

/**
 * Converts frame-viewport coordinates into coordinates local to a parent's
 * padding box, which is what a child's `left`/`top` are relative to.
 *
 * @param {any} doc
 * @param {Record<string, Rect>} rects
 * @param {string} parentId
 * @param {number} x
 * @param {number} y
 * @returns {[number, number]}
 */
export function toLocalPoint(doc, rects, parentId, x, y) {
  const rect = rects[parentId];
  if (!rect) {
    return [x, y];
  }
  const parent = doc.nodes[parentId];
  const border = (parent && parent.style.borderWidth) || 0;
  return [x - rect[0] - border, y - rect[1] - border];
}

/**
 * Snap candidates for a dragged node: the edges and centres of its visible
 * siblings, plus the parent's own leading edge, centre and trailing edge on
 * both axes — a horizontal guide that could only reach the parent's top edge
 * would leave the vertical ones able to do work the horizontal ones cannot.
 *
 * Returned in parent-local space, the same space the drag gesture works in.
 *
 * @param {any} doc
 * @param {string} id
 * @returns {{v: number[], h: number[]}} vertical and horizontal guide offsets
 */
export function snapGuides(doc, id) {
  /** @type {number[]} */
  const v = [];
  /** @type {number[]} */
  const h = [];

  const node = doc.nodes[id];
  const parent = node ? doc.nodes[node.parent || doc.root] : undefined;
  if (!parent) {
    return { v, h };
  }

  for (const siblingId of parent.children) {
    if (siblingId === id) {
      continue;
    }
    const sibling = doc.nodes[siblingId];
    if (!sibling || sibling.hidden) {
      continue;
    }
    v.push(sibling.x, sibling.x + sibling.width * 0.5, sibling.x + sibling.width);
    h.push(sibling.y, sibling.y + sibling.height * 0.5, sibling.y + sibling.height);
  }

  v.push(0, parent.width * 0.5, parent.width);
  h.push(0, parent.height * 0.5, parent.height);
  return { v, h };
}
