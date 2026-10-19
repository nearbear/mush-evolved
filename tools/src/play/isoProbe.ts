// Finding things in the iso room without depending on the renderer: the Pixi one draws on a canvas,
// so there is no element per sprite. Dev builds put a probe on `.iso-viewport` (IsoRoom.tsx) that
// lists this room's clickable things with their boxes and says what hit-testing has under the pointer.

import type { Page } from "playwright";

/** Something in the room that can be clicked, with its box in viewport pixels (IsoTarget in IsoRoom.tsx). */
export interface Target {
  key: string;
  kind: "door" | "equipment" | "person" | "item";
  title: string;
  you: boolean;
  reachable: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Probe {
  hover: string | null;
  size: { width: number; height: number };
  targets(): Target[];
}

type Probed = { isoProbe?: Probe };
/** The page's requestAnimationFrame, which this Node-only package has no DOM types for. */
type Frames = { requestAnimationFrame(cb: () => void): number };

const VIEWPORT = ".iso-viewport";

export async function targets(page: Page, which: (t: Target) => boolean = () => true): Promise<Target[]> {
  const all = await page.locator(VIEWPORT).evaluate((el) => (el as unknown as Probed).isoProbe?.targets() ?? []);
  return all.filter(which);
}

/** The size of the drawn room, in CSS pixels. */
export async function sceneSize(page: Page): Promise<{ width: number; height: number }> {
  return page.locator(VIEWPORT).evaluate((el) => (el as unknown as Probed).isoProbe?.size ?? { width: 0, height: 0 });
}

/** Someone else standing in your room: not you, not a corpse, not a faded person in a neighbouring room. */
export const otherPerson = (t: Target) => t.kind === "person" && !t.you;

/**
 * A point where the room's hit-testing lands on this target: box centres can be transparent or
 * covered. Scrolls it into view, then moves the mouse over a grid (centre first) until the probe
 * says the pointer is over it. Null if no visible pixel of it can be hit.
 */
export async function pointOn(page: Page, target: Target): Promise<{ x: number; y: number } | null> {
  // A wide room scrolls sideways on a phone; bring the target to the middle of the scroller.
  await page.locator(".iso-scroll").evaluate((el, t) => {
    const r = el.getBoundingClientRect();
    el.scrollLeft += t.x + t.width / 2 - (r.left + r.width / 2);
    el.scrollTop += t.y + t.height / 2 - (r.top + r.height / 2);
  }, target);
  const box = (await targets(page, (t) => t.key === target.key))[0];
  if (!box) return null;
  const steps = 8;
  const points: { x: number; y: number }[] = [];
  for (let i = 0; i <= steps; i++) {
    for (let j = 0; j <= steps; j++) points.push({ x: box.x + (box.width * i) / steps, y: box.y + (box.height * j) / steps });
  }
  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  points.sort((a, b) => Math.hypot(a.x - center.x, a.y - center.y) - Math.hypot(b.x - center.x, b.y - center.y));
  for (const p of points) {
    await page.mouse.move(p.x, p.y);
    // The hover key lands with React's next render; read it after a frame.
    const hover = await page.locator(VIEWPORT).evaluate(
      (el) => new Promise<string | null>((done) => (globalThis as unknown as Frames).requestAnimationFrame(() => done((el as unknown as Probed).isoProbe?.hover ?? null))),
    );
    if (hover === box.key) return p;
  }
  return null;
}

/**
 * Waits until the room is drawn: the Pixi renderer marks its host `data-art="ready"` once every
 * image is in and a frame is drawn; the DOM one draws crew sprites as CSS backgrounds set once
 * they are keyed.
 */
export async function waitForArt(page: Page): Promise<void> {
  await page.locator(VIEWPORT).waitFor();
  await page.waitForLoadState("networkidle");
  // Strings, so this Node-only package doesn't need DOM types; they run in the page.
  await page.waitForFunction(
    `document.querySelector(".iso-pixi[data-art], .iso-sprite") && [...document.querySelectorAll(".iso-pixi")].every((el) => el.dataset.art === "ready")`,
  );
  await page.waitForFunction(`[...document.querySelectorAll(".crew-sprite")].every((el) => el.style.backgroundImage)`);
}
