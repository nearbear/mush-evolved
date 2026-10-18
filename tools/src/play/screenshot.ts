// Drives the real game in headless Chromium and saves screenshots, so UI
// changes can be checked visually. Expects `npm run dev` to be running.
//
//   npm run screenshot                  # desktop and phone passes, in the same match
//   npm run screenshot -- --only mobile  # just the phone pass
//   npm run screenshot -- --name Alice --out /tmp/shots
//
// Prints each screenshot path and any browser console errors; exits non-zero
// if a step failed or the page logged errors.

import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { devPorts } from "../dev/ports.ts";
import { chromium, devices, type Locator, type Page } from "playwright";

const ports = devPorts();

const { values: args } = parseArgs({
  options: {
    url: { type: "string", default: `http://localhost:${ports.web}` },
    server: { type: "string", default: `http://localhost:${ports.server}` },
    out: { type: "string", default: resolve(import.meta.dirname, "../../../.screenshots") },
    name: { type: "string", default: "Playwright" },
    only: { type: "string" }, // "desktop" or "mobile"
    phone: { type: "string", default: "Galaxy S8" }, // a Playwright device; 360px wide is the narrowest we support
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
  mkdirSync(args.out!, { recursive: true });

  const browser = await chromium.launch();
  const consoleErrors: string[] = [];
  const failures: string[] = [];
  const open = async (options: Parameters<typeof browser.newContext>[0]) => {
    const page = await (await browser.newContext(options)).newPage();
    page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
    page.on("pageerror", (e) => consoleErrors.push(e.message));
    return page;
  };

  const stepOn = (page: Page, checks: (() => Promise<void>) | null) => async (name: string, run: () => Promise<void>) => {
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
    }
  };

  try {
    const desktop = args.only === "mobile" ? null : await open({ viewport: { width: 1600, height: 1000 } });
    const mobile = args.only === "desktop" ? null : await open({ ...devices[args.phone!] });

    // Both queue at once so they land in the same match and share the bot-fill wait.
    await Promise.all([
      desktop && stepOn(desktop, null)("01-game", () => join(desktop, args.name!)),
      mobile && stepOn(mobile, () => noSideScroll(mobile))("m01-room", () => joinMobile(mobile, `${args.name!} (phone)`)),
    ]);
    if (desktop) await desktopSteps(desktop, stepOn(desktop, null));
    if (mobile) await mobileSteps(mobile, stepOn(mobile, () => noSideScroll(mobile)));
  } finally {
    await browser.close();
  }

  if (consoleErrors.length) {
    console.log(`\nBrowser console errors (${consoleErrors.length}):`);
    for (const e of [...new Set(consoleErrors)]) console.log(`  ${e}`);
  }
  return failures.length || consoleErrors.length ? 1 : 0;
}

type Step = (name: string, run: () => Promise<void>) => Promise<void>;

async function join(page: Page, name: string): Promise<void> {
  await page.goto(args.url!);
  // The lobby lists one ship per language and names you "Guest N", so `name` only labels the log here.
  await page.getByRole("button", { name: /English/ }).click();
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
    const other = page.locator(OTHER_PERSON_HERE);
    if (!(await other.count())) throw new Skip("nobody else in the room");
    const at = await pointOn(page, other.first());
    await page.mouse.click(at.x, at.y);
    await page.locator(".inspect .inspect-figure-name", { hasNotText: you }).waitFor();
  });

  await step("03-examine", async () => {
    const at = await pointOn(page, page.locator(".iso-sprite.equipment").first());
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
    await max.click();
  });

  await step("04c-chat-edit", async () => {
    await page.getByRole("button", { name: "Hide preview" }).filter({ visible: true }).click();
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
    const at = await pointOn(page, page.locator(".iso-sprite.door.reachable").first());
    await page.mouse.dblclick(at.x, at.y);
    await page.locator(".room-title", { hasNotText: before }).waitFor();
    await waitForArt(page);
    console.log(`      ${before} -> ${await page.locator(".room-title").innerText()}`);
  });

  // TODO(minimap): the 07-minimap step is removed while the minimap is stubbed out.
}

async function joinMobile(page: Page, name: string): Promise<void> {
  await join(page, name);
  await page.locator(".bottom-nav").waitFor();
}

/** The phone pass: taps, the peek bar, panel switching, a wide room, and landscape. */
async function mobileSteps(page: Page, step: Step): Promise<void> {
  const nav = (name: string) => page.locator(".bottom-nav").getByRole("button", { name, exact: true }).tap();
  const peek = page.locator(".peek-bar");

  await step("m02-peek-person", async () => {
    const other = page.locator(OTHER_PERSON_HERE);
    if (!(await other.count())) throw new Skip("nobody else in the room");
    const at = await pointOn(page, other.first());
    await page.touchscreen.tap(at.x, at.y);
    await peek.getByRole("button", { name: "More" }).waitFor();
  });

  await step("m03-peek-examine", async () => {
    const at = await pointOn(page, page.locator(".iso-sprite.equipment").first());
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

  await step("m06-door-go", async () => {
    await nav("Room");
    const toggle = page.getByRole("button", { name: /^Inventory/ });
    if ((await toggle.getAttribute("aria-expanded")) === "true") await toggle.tap();
    await walkThroughDoor(page);
  });

  await step("m07-wide-room", async () => {
    const scroller = page.locator(".iso-scroll");
    const world = page.locator(".iso-world");
    const wide = async () => (await world.evaluate((el) => el.offsetWidth)) > (await scroller.evaluate((el) => el.clientWidth)) + 1;
    for (let i = 0; i < 6 && !(await wide()); i++) await walkThroughDoor(page);
    if (!(await wide())) throw new Skip("didn't reach a room wider than the screen");
    const box = await scroller.boundingBox();
    const you = await page.locator(".iso-actor.you").boundingBox();
    const cx = you!.x + you!.width / 2;
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

/**
 * A point that is visibly on an SVG shape (rooms can be L-shaped), plus its
 * accessible name. Trial clicks check that the shape itself is hit there.
 */
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

/** Tap the first reachable door, then Go in the peek bar; waits for the new room. */
async function walkThroughDoor(page: Page): Promise<void> {
  const before = await page.locator(".room-title").innerText();
  const at = await pointOn(page, page.locator(".iso-sprite.door.reachable").first());
  await page.touchscreen.tap(at.x, at.y);
  await page.locator(".peek-bar").getByRole("button", { name: "Go" }).tap();
  await page.locator(".room-title", { hasNotText: before }).waitFor();
  await waitForArt(page);
  console.log(`      ${before} -> ${await page.locator(".room-title").innerText()}`);
}

/**
 * A point where the room's hit-testing lands on this sprite: sprites don't
 * take pointer events themselves, and their box centers can be transparent or
 * covered. Moves the mouse over a grid (center first) until the sprite gets
 * the `.hover` class, and returns the point plus the hover title (its name).
 */
/** Someone else standing in your room: not you, not a corpse, not a faded person in a neighbouring room (clicking those acts as its door). */
const OTHER_PERSON_HERE = ".iso-layer:not(.iso-esp) > .iso-actor:not(.you, .neighbor, .corpse)";

/** The iso view's mouse-only hover label, portaled straight into <body>. */
const HOVER_LABEL = "body > .tooltip";

async function pointOn(page: Page, sprite: Locator): Promise<{ x: number; y: number; title: string }> {
  await sprite.scrollIntoViewIfNeeded();
  const box = (await sprite.boundingBox()) ?? fail("sprite has no box");
  const steps = 8;
  const points: { x: number; y: number }[] = [];
  for (let i = 0; i <= steps; i++) {
    for (let j = 0; j <= steps; j++) points.push({ x: box.x + (box.width * i) / steps, y: box.y + (box.height * j) / steps });
  }
  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  points.sort((a, b) => Math.hypot(a.x - center.x, a.y - center.y) - Math.hypot(b.x - center.x, b.y - center.y));
  for (const p of points) {
    await page.mouse.move(p.x, p.y);
    if (await sprite.evaluate((el) => el.classList.contains("hover"))) {
      // Touch shows no hover tooltip; callers that need the name read it from the peek bar instead.
      const title = (await page.locator(HOVER_LABEL).innerText({ timeout: 500 }).catch(() => "")).trim();
      return { ...p, title };
    }
  }
  return fail("no visible pixel of the sprite is hit-testable");
}

function fail(message: string): never {
  throw new Error(message);
}

/** Phones must never scroll the whole page sideways. */
async function noSideScroll(page: Page): Promise<void> {
  const [scroll, width] = await page.evaluate("[document.documentElement.scrollWidth, window.innerWidth]") as [number, number];
  if (scroll > width) throw new Error(`page scrolls sideways (${scroll}px content in a ${width}px window)`);
}

/** Room sprites are CSS backgrounds and crew sprites are keyed on a canvas; wait for both. */
async function waitForArt(page: Page): Promise<void> {
  await page.locator(".iso-sprite").first().waitFor();
  await page.waitForLoadState("networkidle");
  // A string so this Node-only package doesn't need DOM types; it runs in the page.
  await page.waitForFunction(`[...document.querySelectorAll(".crew-sprite")].every((el) => el.style.backgroundImage)`);
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
