// One screenshot of the isometric view with the fog set to "whole ship", in a viewport big
// enough to hold it, so wall and layout problems across many rooms show in one image.
// The ship is drawn around the room you're in (lit; the rest is fogged): the one you start in, or
// the last of `--walk`, a comma-separated list of rooms to walk into through doors, in order, by
// their door labels. Expects `npm run dev` to be running.
//
//   npm run ship-view                       # whole ship -> .screenshots/ship.png
//   npm run ship-view -- --clip 1300,900,1300,700   # just that part of the image
//   npm run ship-view -- --clip 1300,900,300,200 --scale 3  # magnified
//   npm run ship-view -- --walk "Front corridor,Bridge"
//   npm run ship-view -- --width 5000 --height 4000 --out /tmp/shots

import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { devPorts } from "../dev/ports.ts";
import { chromium, type Locator, type Page } from "playwright";

const ports = devPorts();
const { values: args } = parseArgs({
  options: {
    url: { type: "string", default: `http://localhost:${ports.web}` },
    out: { type: "string", default: resolve(import.meta.dirname, "../../../.screenshots") },
    width: { type: "string", default: "4200" },
    height: { type: "string", default: "3200" },
    walk: { type: "string" },
    clip: { type: "string" },
    scale: { type: "string", default: "1" }, // device pixels per CSS pixel: 2 or 3 magnifies a --clip (pixels stay crisp) // "x,y,width,height" in screenshot pixels, to zoom in on part of the ship
  },
});

mkdirSync(args.out!, { recursive: true });
const browser = await chromium.launch();
try {
  const context = await browser.newContext({ viewport: { width: Number(args.width), height: Number(args.height) }, deviceScaleFactor: Number(args.scale) });
  await context.addInitScript(() => localStorage.setItem("mush2.fogDepth", "all"));
  const page = await context.newPage();
  await page.goto(args.url!);
  await page.getByRole("button", { name: /English/ }).click();
  await page.locator(".three-panel").waitFor({ timeout: 45_000 });
  await page.locator(".iso-sprite").first().waitFor();
  await page.waitForLoadState("networkidle");
  for (const room of args.walk?.split(",").map((r) => r.trim()) ?? []) await walkInto(page, room);
  // The panel is only a part of the page; let it fill the window so the camera has room for the whole ship.
  await page.addStyleTag({ content: ".iso-viewport { position: fixed !important; inset: 0 !important; width: 100vw !important; height: 100vh !important; z-index: 9999 !important; } body * { visibility: hidden; } .iso-viewport, .iso-viewport * { visibility: visible; }" });
  await page.waitForTimeout(500);
  const file = resolve(args.out!, "ship.png");
  const [x, y, width, height] = (args.clip ?? "").split(",").map(Number);
  await page.screenshot({ path: file, ...(args.clip && { clip: { x: x!, y: y!, width: width!, height: height! } }) });
  console.log(`room: ${await page.locator(".room-title").innerText()}\n${file}`);
} finally {
  await browser.close();
}

/** Walks through the reachable door whose label is `room` (case-insensitive). */
async function walkInto(page: Page, room: string): Promise<void> {
  const title = page.locator(".room-title");
  const from = await title.innerText();
  const doors = page.locator(".iso-sprite.door.reachable");
  const seen: string[] = [];
  for (let i = 0; i < (await doors.count()); i++) {
    const at = await pointOn(page, doors.nth(i));
    if (!at) continue;
    seen.push(at.title);
    if (at.title.toLowerCase() !== room.toLowerCase()) continue;
    await page.mouse.dblclick(at.x, at.y);
    await title.filter({ hasNotText: from }).waitFor();
    await page.locator(".iso-sprite").first().waitFor();
    await page.waitForLoadState("networkidle");
    return;
  }
  throw new Error(`No reachable door to "${room}" from ${from}; doors: ${seen.join(", ")}`);
}

/** A point where hit-testing lands on this sprite (it gets `.hover`), and the view's title there. */
async function pointOn(page: Page, sprite: Locator): Promise<{ x: number; y: number; title: string } | null> {
  await sprite.scrollIntoViewIfNeeded();
  const box = await sprite.boundingBox();
  if (!box) return null;
  for (let i = 1; i < 8; i++) {
    for (let j = 1; j < 8; j++) {
      const p = { x: box.x + (box.width * i) / 8, y: box.y + (box.height * j) / 8 };
      await page.mouse.move(p.x, p.y);
      if (await sprite.evaluate((el) => el.classList.contains("hover"))) {
        return { ...p, title: (await page.locator(".iso-viewport").getAttribute("title")) ?? "" };
      }
    }
  }
  return null;
}
