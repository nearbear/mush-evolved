// The iTrackie's gold outline (edge, gold, edge, 1px each) as one SVG path: the card's sides and cut bottom corners, its
// top rim, and the selected tab rising out of the rim. Drawing it as one shape is the point: separate elements round their
// 1px lines independently at a fractional zoom, so the tab's outline never met the card's rim flush. Purely decorative;
// it measures the DOM it sits in (the Tabs.Root) and redraws when anything there moves or resizes.

import { useLayoutEffect, useRef, useState } from "react";

/** Centre of the 3px band: the outline is drawn inside the shapes' edges, as the CSS borders were. */
const D = 1.5;
/** The selected tab's top corner radius (itrackie.css's .itrackie-tab border-radius). */
const TAB_RADIUS = 8;
const DIAG = D * Math.SQRT2 - D;

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * The outline's centreline, clockwise from the card's top-left corner. `cut` is the card's bottom corner cut and `radius`
 * its top-right corner radius (cut-card.css); `tab` is the selected tab, whose bottom overlaps the card's top.
 */
export function outlinePath(card: Box, tab: Box | null, cut: number, radius: number): string {
  const { left: l, top: t, right: r, bottom: b } = card;
  const f = (n: number) => +n.toFixed(2);
  const p: string[] = [`M${f(l + D)} ${f(t + D)}`];
  if (tab) {
    const tr = TAB_RADIUS - D;
    p.push(
      `L${f(tab.left + D)} ${f(t + D)}`,
      `L${f(tab.left + D)} ${f(tab.top + TAB_RADIUS)}`,
      `A${tr} ${tr} 0 0 1 ${f(tab.left + TAB_RADIUS)} ${f(tab.top + D)}`,
      `L${f(tab.right - TAB_RADIUS)} ${f(tab.top + D)}`,
      `A${tr} ${tr} 0 0 1 ${f(tab.right - D)} ${f(tab.top + TAB_RADIUS)}`,
      `L${f(tab.right - D)} ${f(t + D)}`,
    );
  }
  const cr = Math.max(radius - D, 0);
  p.push(
    `L${f(r - radius)} ${f(t + D)}`,
    cr > 0 ? `A${cr} ${cr} 0 0 1 ${f(r - D)} ${f(t + radius)}` : `L${f(r - D)} ${f(t + D)}`,
    `L${f(r - D)} ${f(b - cut + D - D * Math.SQRT2)}`,
    `L${f(r - cut - DIAG)} ${f(b - D)}`,
    `L${f(l + cut + DIAG)} ${f(b - D)}`,
    `L${f(l + D)} ${f(b - cut + D - D * Math.SQRT2)}`,
    "Z",
  );
  return p.join("");
}

/** Put it inside the Tabs.Root, after the card. */
export function TabOutline() {
  const ref = useRef<SVGSVGElement>(null);
  const [d, setD] = useState("");
  useLayoutEffect(() => {
    const root = ref.current?.parentElement;
    const card = root?.querySelector<HTMLElement>(".cut-card");
    if (!root || !card) return;
    const measure = () => {
      const o = root.getBoundingClientRect();
      if (o.width === 0) return; // hidden (another phone panel is showing)
      const rel = (e: Element): Box => {
        const b = e.getBoundingClientRect();
        return { left: b.left - o.left, top: b.top - o.top, right: b.right - o.left, bottom: b.bottom - o.top };
      };
      const tab = root.querySelector('[role="tab"][aria-selected="true"]');
      const panel = getComputedStyle(root.closest(".kit-panel") ?? root);
      // cut-card.css's --c: the panel's cut less the padding's share of it, to a whole pixel.
      const cut = Math.round(parseFloat(panel.getPropertyValue("--cut")) - parseFloat(panel.getPropertyValue("--pad")) * 0.5858);
      const radius = parseFloat(getComputedStyle(card).borderTopRightRadius) || 0;
      setD(outlinePath(rel(card), tab ? rel(tab) : null, cut, radius));
    };
    const resized = new ResizeObserver(measure);
    // Tabs come and go (Mush, graveyard) and change width (unread badges), so watch each one, and re-watch when the list changes.
    const watch = () => {
      resized.disconnect();
      resized.observe(root);
      resized.observe(card);
      for (const tab of root.querySelectorAll('[role="tab"]')) resized.observe(tab);
      measure();
    };
    const changed = new MutationObserver(watch);
    const list = root.querySelector('[role="tablist"]');
    if (list) changed.observe(list, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-selected"] });
    watch();
    return () => {
      resized.disconnect();
      changed.disconnect();
    };
  }, []);
  return (
    <svg ref={ref} className="tab-outline" aria-hidden="true">
      <path d={d} fill="none" stroke="var(--gold-edge)" strokeWidth={3} />
      <path d={d} fill="none" stroke="var(--gold-mid)" strokeWidth={1} />
    </svg>
  );
}
