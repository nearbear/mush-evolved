// Opens the settings window (same frame as the terminals), the Laboratory's research terminal (its Active and Blocked tabs) and the Nexus's NERON
// core (the project list) on a desktop and a 360px phone, saving the dialogs to .screenshots/. Everyone starts in the Laboratory, five rooms from the Nexus.
// Expects `npm run dev` to be running.
//
//   node tools/src/play/terminalShots.ts

import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, devices, type Page } from "playwright";
import { devPorts } from "../dev/ports.ts";
import { devSignIn, runName } from "./devSignIn.ts";
import { pointOn, targets, waitForArt } from "./isoProbe.ts";

const ports = devPorts();
const url = `http://localhost:${ports.web}`;
const out = resolve(import.meta.dirname, "../../../.screenshots");
mkdirSync(out, { recursive: true });

async function hit(page: Page, kind: "door" | "equipment", title: string) {
  const target = (await targets(page, (t) => t.kind === kind && t.title === title))[0];
  const at = target && (await pointOn(page, target));
  if (!at) throw new Error(`no ${kind} "${title}"; have ${(await targets(page, (t) => t.kind === kind)).map((t) => t.title).join(", ")}`);
  return at;
}

async function openTerminal(page: Page, phone: boolean, name: string) {
  const at = await hit(page, "equipment", name);
  if (phone) {
    await page.touchscreen.tap(at.x, at.y);
    const peek = page.locator(".peek-bar");
    const access = peek.getByRole("button", { name: /^Access/ });
    if (await access.count()) await access.first().tap();
    else {
      await peek.getByRole("button", { name: "More" }).tap();
      await page.locator(".inspect").getByRole("button", { name: /^Access/ }).tap();
    }
  } else {
    await page.mouse.click(at.x, at.y);
    await page.locator(".inspect").getByRole("button", { name: /^Access/ }).click();
  }
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  await page.waitForTimeout(300);
  return dialog;
}

async function shoot(page: Page, file: string) {
  await page.screenshot({ path: resolve(out, `${file}.png`) });
  // Scrolled halfway, to see more rows: the body scrolls, or in a tabbed terminal the open panel.
  for (const el of await page.locator(".terminal-body:not(:has(> .settings-tabs)), .terminal-body [role=tabpanel]:not([hidden])").all()) {
    await el.evaluate((node) => void (node.scrollTop = node.scrollHeight / 2));
  }
  await page.waitForTimeout(200);
  await page.screenshot({ path: resolve(out, `${file}-mid.png`) });
  console.log(`  ${file}.png, ${file}-mid.png`);
}

async function run(phone: boolean, character: number) {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext(phone ? { ...devices["Galaxy S8"], deviceScaleFactor: 2 } : { viewport: { width: 1600, height: 1000 } });
    // Draw every room, so doors to rooms the fog would hide can be clicked.
    await context.addInitScript(() => localStorage.setItem("mush2.fogDepth", "all"));
    const page = await context.newPage();
    await devSignIn(page, url, runName(phone ? "Terminals (phone)" : "Terminals"));
    await page.getByRole("button", { name: /English/ }).click();
    await page.locator(".pod-character").nth(character).click();
    await page.locator(".pod-board").click();
    await page.locator(".three-panel").waitFor({ timeout: 45_000 });
    await waitForArt(page);
    const prefix = phone ? "m-term" : "term";

    // Phones open it from the top bar's menu.
    if (phone) {
      await page.locator(".menu-button").tap();
      await page.getByRole("menuitem", { name: "Settings" }).tap();
    } else await page.locator(".settings-button").first().click();
    const settings = page.getByRole("dialog");
    await settings.waitFor();
    await page.waitForTimeout(300);
    await shoot(page, `${prefix}-settings`);
    await page.keyboard.press("Escape");
    await settings.waitFor({ state: "hidden" });

    const lab = await openTerminal(page, phone, "Research lab");
    // Work once on the first offered research, so a row has progress.
    const work = lab.getByRole("button", { name: /^Work/ }).first();
    if (await work.count()) {
      await work.click();
      await page.waitForTimeout(800);
    }
    await shoot(page, `${prefix}-research`);
    // The Blocked tab: researches whose lab needs aren't met.
    const blocked = lab.getByRole("tab", { name: /^Blocked/ });
    if (await blocked.count()) {
      await blocked.click();
      await page.waitForTimeout(200);
      await shoot(page, `${prefix}-research-blocked`);
    }
    await page.keyboard.press("Escape");
    await lab.waitFor({ state: "hidden" });

    // Through the Room region's exit list (the screen-reader mirror of the doors), not the canvas.
    for (const room of ["Front Corridor", "Center Corridor", "Bravo Bay", "Rear Corridor", "Nexus"]) {
      const exits = page.getByRole("region", { name: "Room", exact: true }).getByRole("group", { name: /Exits/i });
      const exit = exits.getByRole("button", { name: new RegExp(room, "i") });
      if (!(await exit.count())) throw new Error(`no exit to ${room}; have ${(await exits.getByRole("button").allInnerTexts()).join(", ")}`);
      console.log(`  ${phone ? "phone" : "desktop"}: ${await exit.first().innerText()}`);
      await exit.first().dispatchEvent("click");
      await page.locator(".room-title", { hasText: room }).waitFor({ timeout: 60_000 });
      await page.locator(".iso-room[data-leaving]").waitFor({ state: "detached", timeout: 60_000 });
      await waitForArt(page);
    }
    await openTerminal(page, phone, "NERON core");
    await shoot(page, `${prefix}-projects`);
  } finally {
    await browser.close();
  }
}

await Promise.all(process.argv.includes("--phone") ? [run(true, 1)] : [run(false, 0), run(true, 1)]);
