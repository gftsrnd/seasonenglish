/** Controls the round scroll-jump button must never sit on (owner 18/11, issues.md #2 and #5). */
const INTERACTIVE = "button, a[href], input:not([type=hidden]), select, textarea, summary, [role=button], [role=tab], .list-pager";

/**
 * The highest-allowed top edge for a `size`px button whose default top is
 * `top`, so that it covers no visible control in the column [left, left+size]
 * inside `scope`. Moves the button up past every control it would overlap;
 * returns null when no free spot is left above `minTop` (the caller hides it).
 */
export function dodgeTop(scope: ParentNode, left: number, top: number, size: number, minTop: number, ignore?: Element | null): number | null {
  const gap = 6;
  const boxes: DOMRect[] = [];
  for (const node of scope.querySelectorAll<HTMLElement>(INTERACTIVE)) {
    if (ignore && (ignore === node || ignore.contains(node))) continue;
    if (node.closest(".app-scroll-jump")) continue;
    const box = node.getBoundingClientRect();
    if (!box.width || !box.height || box.right <= left || box.left >= left + size) continue;
    if (box.bottom < minTop || box.top > top + size) continue;
    boxes.push(box);
  }
  let y = top;
  for (let pass = 0; pass < 24; pass += 1) {
    const hit = boxes.find((box) => box.top < y + size + gap && box.bottom + gap > y);
    if (!hit) return y >= minTop ? y : null;
    y = hit.top - gap - size;
  }
  return null;
}
