// Drives the real game in headless Chromium and saves screenshots, so UI
// changes can be checked visually. Expects `npm run dev` to be running.
//
//   npm run screenshot                  # desktop and phone passes, in the same match
//   npm run screenshot -- --only mobile  # just the phone pass
//   npm run screenshot -- --name Alice --out /tmp/shots
//   npm run screenshot -- --scale 3      # the phone at its real pixel ratio (slower)
//
// Prints each screenshot path and any browser console errors; exits non-zero
// if a step failed or the page logged errors.

import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { devPorts } from "../dev/ports.ts";
import { type Browser, type BrowserContextOptions, chromium, devices, type Locator, type Page } from "playwright";
import { devSignIn, runName } from "./devSignIn.ts";
import { otherPerson, pointOn, sceneSize, type Target, targets, waitForArt } from "./isoProbe.ts";

const ports = devPorts();

const { values: args } = parseArgs({
  options: {
    url: { type: "string", default: `http://localhost:${ports.web}` },
    server: { type: "string", default: `http://localhost:${ports.server}` },
    out: { type: "string", default: resolve(import.meta.dirname, "../../../.screenshots") },
    name: { type: "string", default: "Playwright" },
    only: { type: "string" }, // "desktop" or "mobile"
    phone: { type: "string", default: "Galaxy S8" }, // a Playwright device; 360px wide is the narrowest we support
    // The phone's devicePixelRatio. Headless Chromium draws WebGL on the CPU (SwiftShader), so the
    // phone pass takes about as long as its pixel count: the S8's own 3 is about twice as slow as 2.
    scale: { type: "string", default: "2" },
  },
});

/** Bots fill the queue after 5 s (Matchmaker FILL_DELAY_MS); allow for startup. */
const MATCH_TIMEOUT_MS = 45_000;

/** Thrown by a step that can't run in the current game state (e.g. nobody else in the room). */
class Skip extends Error {}

async function main(): Promise<number> {
  for (const url of [args.url!, args.server!]) {
    if (!(await reachable(url))) {
      console.error(`Not reachable: ${url}. Start the dev servers with \`npm run dev\`.`);
      return 2;
    }
  }
  if (args.only && args.only !== "desktop" && args.only !== "mobile") {
    console.error(`--only must be "desktop" or "mobile", not "${args.only}".`);
    return 2;
  }
  const scale = Number(args.scale);
  if (!(scale > 0)) {
    console.error(`--scale must be a positive number, not "${args.scale}".`);
    return 2;
  }
  mkdirSync(args.out!, { recursive: true });

  // One browser per pass: headless Chromium draws WebGL on the CPU in its GPU process, one per
  // browser, so two pages in one browser take turns, and the idle one keeps drawing (the
  // see-through outlines pulse every frame) while the other pass runs.
  const browsers: Browser[] = [];
  const consoleErrors: string[] = [];
  const failures: string[] = [];
  const open = async (options: BrowserContextOptions) => {
    const browser = await chromium.launch();
    browsers.push(browser);
    const page = await (await browser.newContext(options)).newPage();
    page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
    page.on("pageerror", (e) => consoleErrors.push(e.message));
    return page;
  };

  // Pages that have lost the game (a failed join, or the dev server reloading for an edit mid-run):
  // every later step needs it, and each would otherwise wait out its full timeout.
  const outOfGame = new Set<Page>();
  const stepOn = (page: Page, checks: (() => Promise<void>) | null) => async (name: string, run: () => Promise<void>) => {
    if (outOfGame.has(page)) {
      console.log(`skip  ${name}: not in a game`);
      return;
    }
    try {
      await run();
      await checks?.();
      const file = resolve(args.out!, `${name}.png`);
      await page.screenshot({ path: file, fullPage: true });
      console.log(`ok    ${name}: ${file}`);
    } catch (e) {
      if (e instanceof Skip) {
        console.log(`skip  ${name}: ${e.message}`);
        return;
      }
      failures.push(name);
      const file = resolve(args.out!, `${name}-FAILED.png`);
      await page.screenshot({ path: file, fullPage: true }).catch(() => {});
      const lines = (e as Error).message.split("\n");
      // Playwright's call log names the locator it was stuck on; the first line alone doesn't.
      const waiting = lines.find((l) => l.includes("waiting for"))?.trim();
      console.log(`FAIL  ${name}: ${lines[0]}${waiting ? ` [${waiting}]` : ""} (state: ${file})`);
      if (!(await page.locator(".three-panel").count().catch(() => 0))) {
        outOfGame.add(page);
        console.log("      the game is no longer on screen (did the dev server reload?); skipping the rest of this pass");
      }
    }
  };

  try {
    const desktop = args.only === "mobile" ? null : await open({ viewport: { width: 1600, height: 1000 } });
    const mobile = args.only === "desktop" ? null : await open({ ...devices[args.phone!], deviceScaleFactor: scale });

    // Both queue at once so they land in the same match and share the bot-fill wait.
    await Promise.all([
      desktop && stepOn(desktop, null)("01-game", () => join(desktop, args.name!, "00-picker", 0)),
      mobile && stepOn(mobile, () => noSideScroll(mobile))("m01-room", () => joinMobile(mobile, `${args.name!} (phone)`)),
    ]);
    if (desktop) await desktopSteps(desktop, stepOn(desktop, null));
    if (mobile) await mobileSteps(mobile, stepOn(mobile, () => noSideScroll(mobile)));
  } finally {
    await Promise.all(browsers.map((b) => b.close()));
  }

  if (consoleErrors.length) {
    console.log(`\nBrowser console errors (${consoleErrors.length}):`);
    for (const e of [...new Set(consoleErrors)]) console.log(`  ${e}`);
  }
  return failures.length || consoleErrors.length ? 1 : 0;
}

type Step = (name: string, run: () => Promise<void>) => Promise<void>;

/** Joins through the lobby, saving the character picker as `pickerShot` and picking the `character`-th crew member. */
async function join(page: Page, name: string, pickerShot: string, character: number): Promise<void> {
  // Each pass is its own dev account, named after `name` (with a suffix, so every run boards a new ship).
  await devSignIn(page, args.url!, runName(name));
  await page.getByRole("button", { name: /English/ }).click();
  // The two passes queue together, so each picks a different crew member.
  const tile = page.locator(".pod-character").nth(character);
  await tile.waitFor();
  await page.screenshot({ path: resolve(args.out!, `${pickerShot}.png`), fullPage: true });
  await tile.click();
  await page.locator(".pod-board").click();
  await page.locator(".three-panel").waitFor({ timeout: MATCH_TIMEOUT_MS });
  await waitForArt(page);
  // The cryo wake-up intro (up to 3 s) plays over the game on joining and would cover the early screenshots.
  await page.locator(".wake").waitFor({ state: "detached" });
  console.log(`      room: ${await page.locator(".room-title").innerText()}`);
}

async function desktopSteps(page: Page, step: Step): Promise<void> {
  await step("02-inspect", async () => {
    // Nothing is selected yet, so the Inspect panel shows you; wait for its name chip to change to someone else.
    const figureName = page.locator(".inspect .inspect-figure-name");
    const you = (await figureName.innerText()).trim();
    if (!(await targets(page, otherPerson)).length) throw new Skip("nobody else in the room");
    const at = await firstHit(page, otherPerson);
    await page.mouse.click(at.x, at.y);
    await page.locator(".inspect .inspect-figure-name", { hasNotText: you }).waitFor();
  });

  await step("03-examine", async () => {
    const at = await firstHit(page, isEquipment);
    const name = at.title;
    await page.mouse.click(at.x, at.y);
    await page.locator(".inspect-name", { hasText: name }).waitFor();
    await page.locator(".inspect").getByRole("button", { name: "Examine" }).click({ clickCount: 2 }); // actions take a double press
    await page.getByRole("tab", { name: "Room log" }).click();
    await page.getByText(`You examine the ${name}.`).waitFor();
    console.log(`      examined ${name}`);
  });

  await step("04-chat", async () => {
    const text = `screenshot check ${Date.now() % 10000}`;
    await page.getByRole("tab", { name: "Global chat" }).click();
    await page.getByLabel("Chat message", { exact: true }).filter({ visible: true }).fill(text);
    await page.getByLabel("Chat message", { exact: true }).filter({ visible: true }).press("Enter");
    await page.locator(".feed li", { hasText: text }).waitFor();
  });

  await step("04b-chat-preview", async () => {
    const max = page.getByRole("button", { name: "Preview markdown" }).filter({ visible: true });
    // The toggle is off while CHAT_PREVIEW is (ChatInput.tsx); don't wait out the timeout for it.
    if (!(await max.count())) throw new Skip("the markdown preview toggle is turned off");
    await max.click();
  });

  await step("04c-chat-edit", async () => {
    const hide = page.getByRole("button", { name: "Hide preview" }).filter({ visible: true });
    if (!(await hide.count())) throw new Skip("not previewing");
    await hide.click();
  });

  await step("05-take", async () => {
    // The item zones live in an overlay opened by the sack button in the room view's corner.
    await page.getByRole("button", { name: /^Inventory/ }).click();
    const inventory = page.locator(".item-zone");
    // Tiles are drag-and-drop; a selected tile's Take is on the Inspect panel.
    const mine = inventory.filter({ hasText: "Inventory" }).locator(".item-tile:not(.empty)");
    const before = await mine.count();
    await inventory.filter({ hasText: "In this room" }).locator(".item-tile").first().click();
    await page.locator(".inspect").getByRole("button", { name: "Take" }).click({ clickCount: 2 }); // actions take a double press
    if ((await mine.count()) <= before) await mine.nth(before).waitFor();
  });

  await step("06-moved", async () => {
    await page.keyboard.press("Escape"); // close the inventory overlay so it can't cover a door
    const before = await page.locator(".room-title").innerText();
    const at = await firstHit(page, isReachableDoor);
    await page.mouse.dblclick(at.x, at.y);
    await page.locator(".room-title", { hasNotText: before }).waitFor();
    await page.locator(".iso-room[data-leaving]").waitFor({ state: "detached" });
    await waitForArt(page);
    console.log(`      ${before} -> ${await page.locator(".room-title").innerText()}`);
  });

  await step("07-minimap", async () => {
    const map = page.locator(".minimap");
    await map.hover();
    await page.locator(".minimap.expanded").waitFor();
    const at = await pointOnShape(page, map.locator(".minimap-room.reachable").first());
    await page.mouse.move(at.x, at.y);
    await map.locator(".minimap-caption", { hasText: at.title }).waitFor(); // hover names the room
    console.log(`      minimap names ${at.title} on hover`);
  });
}

async function joinMobile(page: Page, name: string): Promise<void> {
  await join(page, name, "m00-picker", 1);
  await page.locator(".bottom-nav").waitFor();
  if (await page.locator(".minimap.expanded").count()) throw new Error("the minimap should start collapsed");
}

/** The phone pass: taps, the peek bar, panel switching, a wide room, and landscape. */
async function mobileSteps(page: Page, step: Step): Promise<void> {
  const nav = (name: string) => page.locator(".bottom-nav").getByRole("button", { name: new RegExp(`^${name}(,|$)`) }).tap();
  const peek = page.locator(".peek-bar");

  await step("m02-peek-person", async () => {
    if (!(await targets(page, otherPerson)).length) throw new Skip("nobody else in the room");
    const at = await firstHit(page, otherPerson);
    await page.touchscreen.tap(at.x, at.y);
    await peek.getByRole("button", { name: "More" }).waitFor();
    // The peek bar keeps one row of actions; the rest are clipped, inert, and reached through More.
    const inert = (await page.evaluate(`[...document.querySelectorAll(".peek-actions > *")].map((b) => b.inert)`)) as boolean[];
    console.log(`      peek actions: ${inert.filter((i) => !i).length} shown, ${inert.filter(Boolean).length} behind More`);
  });

  await step("m03-peek-examine", async () => {
    const at = await firstHit(page, isEquipment);
    await page.touchscreen.tap(at.x, at.y);
    // The bar shows no name; its label is "Selection: <name>".
    const name = ((await peek.getAttribute("aria-label")) ?? "").replace(/^Selection: /, "").trim();
    // Examine lives in the Inspect panel, behind the peek bar's More.
    await peek.getByRole("button", { name: "More" }).tap();
    await page.locator(".inspect").getByRole("button", { name: "Examine" }).tap();
    await nav("iTrackie");
    await page.getByRole("tab", { name: "Room log" }).tap();
    await page.getByText(`You examine the ${name}.`).waitFor();
    console.log(`      examined ${name}`);
  });

  await step("m04-chat-focused", async () => {
    const text = `phone check ${Date.now() % 10000}`;
    await page.getByRole("tab", { name: "Global chat" }).tap();
    const input = page.getByLabel("Chat message", { exact: true }).filter({ visible: true });
    await input.tap();
    await input.fill(text);
    await input.press("Enter");
    await page.locator(".feed li", { hasText: text }).waitFor();
    // The input keeps focus after sending: the nav should be out of the keyboard's way.
    if (await page.locator(".bottom-nav").isVisible()) throw new Error("bottom nav still visible while typing");
  });

  await step("m05-inventory", async () => {
    await page.getByLabel("Chat message", { exact: true }).filter({ visible: true }).blur();
    await nav("Room");
    await page.getByRole("button", { name: /^Inventory/ }).tap();
    const inventory = page.locator(".item-zone");
    const tiles = inventory.locator(".item-tile:not(.empty)");
    if (!(await tiles.count())) throw new Skip("nothing to take or drop");
    await tiles.first().tap();
    // The selected tile shows its tooltip on touch (no hover there).
    await page.locator(".tooltip").filter({ visible: true }).first().waitFor();
    // The peek bar's Take/Drop leaves the panel open (a press elsewhere in the room view closes it).
    const peekAction = page.locator(".peek-bar").locator('[data-action="take"], [data-action="drop"]').first();
    await peekAction.tap();
    await peekAction.tap(); // actions take a double tap
    if (!(await page.locator(".inventory-popup").isVisible())) throw new Error("the peek bar's Take/Drop closed the inventory");
  });

  await step("m05d-drag", async () => {
    // Touch drag (pointer events, not native drag and drop): a room item swiped onto the inventory is taken, or with
    // nothing on the floor, a carried one swiped onto the room is dropped.
    const room = page.locator(".item-zone[data-zone=room]");
    const carried = page.locator(".item-zone[data-zone=inventory]");
    const toTake = (await room.locator(".item-tile").count()) > 0;
    const [source, dest] = toTake ? [room, carried] : [carried, room];
    const tiles = source.locator(".item-tile:not(.empty)");
    const before = await tiles.count();
    if (!before) throw new Skip("no item to drag");
    const from = await tiles.first().boundingBox();
    const to = await dest.boundingBox();
    if (!from || !to) throw new Error("no tile or zone on screen");
    const cdp = await page.context().newCDPSession(page);
    const touch = (type: "touchStart" | "touchMove" | "touchEnd", x: number, y: number) =>
      cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y }] });
    const [x0, y0] = [from.x + from.width / 2, from.y + from.height / 2];
    const [x1, y1] = [to.x + to.width / 2, to.y + to.height / 2];
    const destTiles = dest.locator(".item-tile:not(.empty)");
    const had = await destTiles.count();
    await touch("touchStart", x0, y0);
    for (let i = 1; i <= 8; i++) await touch("touchMove", x0 + ((x1 - x0) * i) / 8, y0 + ((y1 - y0) * i) / 8);
    await page.locator(".item-drag-ghost").waitFor();
    await page.screenshot({ path: resolve(args.out!, "m05d-dragging.png") });
    await touch("touchEnd", x1, y1);
    await destTiles.nth(had).waitFor(); // one more there: inventory slots never stack, and the room was empty
  });

  await step("m05c-resources", async () => {
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: /^Other resources/ }).tap();
    await page.locator(".resource-rest .resource").first().waitFor();
  });

  await step("m05b-ship", async () => {
    await page.keyboard.press("Escape");
    await nav("Room");
    const toggle = page.getByRole("button", { name: /^Inventory/ });
    if ((await toggle.getAttribute("aria-expanded")) === "true") await toggle.tap();
    await page.getByRole("button", { name: "Ship", exact: true }).tap();
    await page.locator(".ship-popup .ship-title").first().waitFor();
  });

  await step("m06-door-go", async () => {
    await nav("Room");
    const ship = page.getByRole("button", { name: "Ship", exact: true });
    if ((await ship.getAttribute("aria-expanded")) === "true") await ship.tap();
    await walkThroughDoor(page);
  });

  await step("m07-wide-room", async () => {
    const scroller = page.locator(".iso-scroll");
    const wide = async () => (await sceneSize(page)).width > (await scroller.evaluate((el) => el.clientWidth)) + 1;
    for (let i = 0; i < 6 && !(await wide()); i++) await walkThroughDoor(page);
    if (!(await wide())) throw new Skip("didn't reach a room wider than the screen");
    const box = await scroller.boundingBox();
    const [you] = await targets(page, (t) => t.you);
    if (!you) throw new Error("your character isn't in the room");
    const cx = you.x + you.width / 2;
    if (cx < box!.x || cx > box!.x + box!.width) throw new Error("your character is scrolled out of view");
  });

  await step("m08-minimap", async () => {
    const map = page.locator(".minimap");
    const box = (await map.locator("svg").boundingBox())!;
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    await page.locator(".minimap.expanded").waitFor();
    await noSideScroll(page);
    const at = await pointOnShape(page, map.locator(".minimap-room.reachable").first());
    // Tap through Playwright's hit test (it retries while the map settles) rather than at fixed coordinates.
    await map.getByRole("button", { name: at.title, exact: true }).tap();
    await map.locator(".minimap-caption", { hasText: at.title }).waitFor(); // a tap names the room, like hover
  });

  await step("m09-landscape", async () => {
    const portrait = page.viewportSize()!;
    await page.setViewportSize({ width: portrait.height, height: portrait.width });
    await page.waitForTimeout(200); // let the room re-measure
    const bar = await page.locator(".top-bar").boundingBox();
    // One strip (clock, alerts, menu) is 34px; a wrapped one is 60px or more.
    if (bar!.height > 40) throw new Error(`top bar is ${bar!.height}px tall in landscape; expected one row`);
  });
}

/** Tap the first reachable door, then Go in the peek bar; waits for the new room. */
async function walkThroughDoor(page: Page): Promise<void> {
  const before = await page.locator(".room-title").innerText();
  const at = await firstHit(page, isReachableDoor);
  await page.touchscreen.tap(at.x, at.y);
  await page.locator(".peek-bar").getByRole("button", { name: "Go" }).tap();
  await page.locator(".room-title", { hasNotText: before }).waitFor();
  await page.locator(".iso-room[data-leaving]").waitFor({ state: "detached" });
  await waitForArt(page);
  console.log(`      ${before} -> ${await page.locator(".room-title").innerText()}`);
}

const isEquipment = (t: Target) => t.kind === "equipment";
const isReachableDoor = (t: Target) => t.kind === "door" && t.reachable;

/** The first target of this kind that some visible pixel of can be hit, with a point on it. */
async function firstHit(page: Page, which: (t: Target) => boolean): Promise<Target & { x: number; y: number }> {
  for (const t of await targets(page, which)) {
    const at = await pointOn(page, t);
    if (at) return { ...t, ...at };
  }
  return fail("no visible pixel of any such target is hit-testable");
}

/** A point inside an SVG shape (not just its bounding box) that takes the pointer, and the shape's name. */
async function pointOnShape(page: Page, shape: Locator): Promise<{ x: number; y: number; title: string }> {
  const box = (await shape.boundingBox()) ?? fail("shape is not visible");
  const steps = [0.5, 0.3, 0.7, 0.2, 0.8, 0.1, 0.9];
  for (const fy of steps) {
    for (const fx of steps) {
      const position = { x: fx * box.width, y: fy * box.height };
      try {
        await shape.click({ trial: true, position, timeout: 150 });
        return { x: box.x + position.x, y: box.y + position.y, title: (await shape.getAttribute("aria-label")) ?? "" };
      } catch {
        // Not on the shape here (or something covers it); try the next point.
      }
    }
  }
  return fail("no visible point on the shape");
}

function fail(message: string): never {
  throw new Error(message);
}

/** Phones must never scroll the whole page sideways. */
async function noSideScroll(page: Page): Promise<void> {
  const [scroll, width] = await page.evaluate("[document.documentElement.scrollWidth, window.innerWidth]") as [number, number];
  if (scroll > width) throw new Error(`page scrolls sideways (${scroll}px content in a ${width}px window)`);
}

async function reachable(url: string): Promise<boolean> {
  try {
    await fetch(url, { signal: AbortSignal.timeout(3000) });
    return true;
  } catch {
    return false;
  }
}

process.exitCode = await main();
