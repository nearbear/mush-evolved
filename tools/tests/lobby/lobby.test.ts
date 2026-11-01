// Layout checks for the lobby in a real (headless) browser, since Node can't compute layout.
// Starts Vite in-process on the web package and fakes the matchmaker websocket, so it
// needs no dev servers running.

import { resolve } from "node:path";
import { chromium, devices, type Browser, type Page } from "playwright";
import { createServer, type ViteDevServer } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const VIEWPORTS = {
  desktop: { viewport: { width: 1600, height: 1000 } },
  // 360px wide: the narrowest width we support.
  phone: devices["Galaxy S8"],
};
const LOCALES = ["en", "fr", "es"];

let vite: ViteDevServer;
let browser: Browser;
let url: string;

beforeAll(async () => {
  vite = await createServer({
    root: resolve(import.meta.dirname, "../../../web"),
    configFile: resolve(import.meta.dirname, "../../../web/vite.config.ts"),
    logLevel: "silent",
    server: { port: 0, hmr: false },
  });
  await vite.listen();
  url = vite.resolvedUrls!.local[0]!;
  browser = await chromium.launch();
}, 30_000);

afterAll(async () => {
  await browser?.close();
  await vite?.close();
});

/** Opens the lobby with the matchmaker answering "queued" to every queue request. */
async function openLobby(options: object, locale: string): Promise<Page> {
  const page = await (await browser.newContext(options)).newPage();
  await page.routeWebSocket(/\/parties\/matchmaker\//, (ws) => {
    ws.onMessage(() => ws.send(JSON.stringify({ type: "queued", waiting: 1, seats: 8 })));
  });
  await page.goto(url);
  await page.getByTestId("language-switcher").selectOption(locale);
  await page.locator(`html[lang="${locale}"] .pod-ship`).first().waitFor();
  return page;
}

/** Opens the lobby with an account already aboard a ship (#320). */
async function openAboardLobby(options: object, locale: string): Promise<Page> {
  const page = await (await browser.newContext(options)).newPage();
  await page.route("**/api/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "signed_in",
        account: {
          id: "acc_1",
          displayName: "Alice",
          providers: ["google"],
          renameAllowedAt: null,
          aboard: true,
        },
      }),
    }),
  );
  // Keep the matchmaker quiet: matching begins the fade into the game (SLEEP_MS) and unmounts
  // the lobby, so staying in "connecting" keeps the panel around to measure.
  await page.routeWebSocket(/\/parties\/matchmaker\//, () => {});
  await page.goto(url);
  await page.getByTestId("language-switcher").selectOption(locale);
  // Wait for /api/me to resolve and render the signed-in aboard state (Resume + Single Player).
  await page.locator(`html[lang="${locale}"] .account-button`).waitFor();
  await page.locator(`html[lang="${locale}"] .pod-ship`).first().waitFor();
  return page;
}

describe("lobby panel", () => {
  for (const [device, options] of Object.entries(VIEWPORTS)) {
    for (const locale of LOCALES) {
      it(`keeps its size through picking a ship and a character (${device}, ${locale})`, async () => {
        const page = await openLobby(options, locale);
        const panel = page.locator(".pod-panel");
        const before = await panel.boundingBox();

        await page.locator(".pod-ship").first().click();
        await page.locator(".pod-character").first().click();
        // Waiting: the queue count from the fake matchmaker is on screen.
        await page.locator(".pod-status", { hasText: "1/8" }).waitFor();

        expect(await panel.boundingBox()).toEqual(before);
        await page.context().close();
      }, 30_000);

      it(`keeps its size and shows resume when already aboard (${device}, ${locale})`, async () => {
        const page = await openAboardLobby(options, locale);
        const panel = page.locator(".pod-panel");
        const before = await panel.boundingBox();

        // Exactly two choices: Resume and Single Player
        const ships = page.locator(".pod-ship");
        expect(await ships.count()).toBe(2);

        // Clicking resume transitions straight to waiting
        await ships.first().click();
        await page.locator(".pod-status.loading").waitFor();

        expect(await panel.boundingBox()).toEqual(before);
        await page.context().close();
      }, 30_000);
    }
  }
});
