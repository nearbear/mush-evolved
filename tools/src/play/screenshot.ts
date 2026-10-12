// Drives the real game in headless Chromium and saves screenshots, so UI
// changes can be checked visually. Expects `npm run dev` to be running.
//
//   npm run screenshot                  # join, inspect, examine, chat, take, walk through a door
//   npm run screenshot -- --name Alice --out /tmp/shots
//
// Prints each screenshot path and any browser console errors; exits non-zero
// if a step failed or the page logged errors.

import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { chromium, type Page } from "playwright";

const { values: args } = parseArgs({
  options: {
    url: { type: "string", default: "http://localhost:5173" },
    server: { type: "string", default: "http://localhost:8787" },
    out: { type: "string", default: resolve(import.meta.dirname, "../../../.screenshots") },
    name: { type: "string", default: "Playwright" },
  },
});

/** Bots fill the queue after 15 s (Matchmaker FILL_DELAY_MS); allow for startup. */
const MATCH_TIMEOUT_MS = 45_000;

async function main(): Promise<number> {
  for (const url of [args.url!, args.server!]) {
    if (!(await reachable(url))) {
      console.error(`Not reachable: ${url}. Start the dev servers with \`npm run dev\`.`);
      return 2;
    }
  }
  mkdirSync(args.out!, { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const consoleErrors: string[] = [];
  page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
  page.on("pageerror", (e) => consoleErrors.push(e.message));
  const failures: string[] = [];

  const step = async (name: string, run: () => Promise<void>) => {
    try {
      await run();
      const file = resolve(args.out!, `${name}.png`);
      await page.screenshot({ path: file, fullPage: true });
      console.log(`ok    ${name}: ${file}`);
    } catch (e) {
      failures.push(name);
      const file = resolve(args.out!, `${name}-FAILED.png`);
      await page.screenshot({ path: file, fullPage: true }).catch(() => {});
      console.log(`FAIL  ${name}: ${(e as Error).message.split("\n")[0]} (state: ${file})`);
    }
  };

  try {
    await step("01-game", async () => {
      await page.goto(args.url!);
      await page.getByPlaceholder("Your name").fill(args.name!);
      await page.getByRole("button", { name: "Find game" }).click();
      await page.locator(".three-panel").waitFor({ timeout: MATCH_TIMEOUT_MS });
      await waitForArt(page);
      console.log(`      room: ${await page.locator(".room-title").innerText()}`);
    });

    await step("02-inspect", async () => {
      await page.locator(".iso-actor:not(.you)").first().click();
      await page.locator(".inspect .close").waitFor(); // only shown when inspecting someone else
    });

    await step("03-examine", async () => {
      const equipment = page.locator(".iso-sprite.equipment").first();
      const name = await equipment.getAttribute("title");
      await equipment.click();
      await page.locator(".inspect-name", { hasText: name ?? "" }).waitFor();
      await page.locator(".inspect").getByRole("button", { name: "Examine" }).click();
      await page.getByRole("tab", { name: "Room log" }).click();
      await page.getByText(`You examine the ${name}.`).waitFor();
      console.log(`      examined ${name}`);
    });

    await step("04-chat", async () => {
      const text = `screenshot check ${Date.now() % 10000}`;
      await page.getByRole("tab", { name: "Global chat" }).click();
      await page.getByLabel("Global chat message").fill(text);
      await page.getByLabel("Global chat message").press("Enter");
      await page.locator(".feed li", { hasText: text }).waitFor();
    });

    await step("05-take", async () => {
      const inventory = page.locator(".inventory");
      await inventory.getByRole("button", { name: "Take" }).first().click();
      await inventory.getByRole("button", { name: "Drop" }).first().waitFor();
    });

    await step("06-moved", async () => {
      const before = await page.locator(".room-title").innerText();
      await page.locator(".iso-sprite.door.reachable").first().dblclick({ force: true });
      await page.locator(".room-title", { hasNotText: before }).waitFor();
      await waitForArt(page);
      console.log(`      ${before} -> ${await page.locator(".room-title").innerText()}`);
    });
  } finally {
    await browser.close();
  }

  if (consoleErrors.length) {
    console.log(`\nBrowser console errors (${consoleErrors.length}):`);
    for (const e of [...new Set(consoleErrors)]) console.log(`  ${e}`);
  }
  return failures.length || consoleErrors.length ? 1 : 0;
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
