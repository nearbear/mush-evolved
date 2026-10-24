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
import { type Browser, type BrowserContextOptions, chromium, devices, type Page } from "playwright";
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
  await page.goto(args.url!);
  // The lobby lists one ship per language and names you "Guest N", so `name` only labels the log here.
  await page.getByRole("button", { name: /English/ }).click();
  // The two passes queue together, so each picks a different crew member.
  const tile = page.locator(".pod-character").nth(character);
  await tile.waitFor();
  await page.screenshot({ path: resolve(args.out!, `${pickerShot}.png`), fullPage: true });
  await tile.click();
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
    await page.locator(".inspect").getByRole("button", { name: "Examine" }).click();
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
    // Tiles are drag-and-drop; the Take button only appears once a tile is selected.
    const mine = inventory.filter({ hasText: "Inventory" }).locator(".item-tile:not(.empty)");
    const before = await mine.count();
    await inventory.filter({ hasText: "In this room" }).locator(".item-tile").first().click();
    await inventory.getByRole("button", { name: "Take" }).click();
    if ((await mine.count()) <= before) await mine.nth(before).waitFor();
  });

  await step("06-moved", async () => {
    await page.keyboard.press("Escape"); // close the inventory overlay so it can't cover a door
    const before = await page.locator(".room-title").innerText();
    const at = await firstHit(page, isReachableDoor);
    await page.mouse.dblclick(at.x, at.y);
    await page.locator(".room-title", { hasNotText: before }).waitFor();
    await waitForArt(page);
    console.log(`      ${before} -> ${await page.locator(".room-title").innerText()}`);
  });

  // TODO(minimap): the 07-minimap step is removed while the minimap is stubbed out.
}

async function joinMobile(page: Page, name: string): Promise<void> {
  await join(page, name, "m00-picker", 1);
  await page.locator(".bottom-nav").waitFor();
}

/** The phone pass: taps, the peek bar, panel switching, a wide room, and landscape. */
async function mobileSteps(page: Page, step: Step): Promise<void> {
  const nav = (name: string) => page.locator(".bottom-nav").getByRole("button", { name, exact: true }).tap();
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
    const name = (await peek.locator(".peek-name strong").innerText()).trim();
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
    // The Take/Drop button only shows on a selected tile.
    const tiles = inventory.locator(".item-tile:not(.empty)");
    if (!(await tiles.count())) throw new Skip("nothing to take or drop");
    await tiles.first().tap();
    await inventory.locator(".item-action").first().tap();
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

  // TODO(minimap): the m08-minimap step is removed while the minimap is stubbed out.

  await step("m09-landscape", async () => {
    const portrait = page.viewportSize()!;
    await page.setViewportSize({ width: portrait.height, height: portrait.width });
    await page.waitForTimeout(200); // let the room re-measure
    const bar = await page.locator(".top-bar").boundingBox();
    // The nameplate plus the stat chips hanging off its bottom edge is about 65px; a wrapped bar is 100px or more.
    if (bar!.height > 70) throw new Error(`top bar is ${bar!.height}px tall in landscape; expected one row`);
  });
}

/** Tap the first reachable door, then Go in the peek bar; waits for the new room. */
async function walkThroughDoor(page: Page): Promise<void> {
  const before = await page.locator(".room-title").innerText();
  const at = await firstHit(page, isReachableDoor);
  await page.touchscreen.tap(at.x, at.y);
  await page.locator(".peek-bar").getByRole("button", { name: "Go" }).tap();
  await page.locator(".room-title", { hasNotText: before }).waitFor();
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
