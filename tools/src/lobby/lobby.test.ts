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

describe("lobby panel", () => {
  for (const [device, options] of Object.entries(VIEWPORTS)) {
    for (const locale of LOCALES) {
      it(`keeps its size when joining a ship (${device}, ${locale})`, async () => {
        const page = await openLobby(options, locale);
        const panel = page.locator(".pod-panel");
        const before = await panel.boundingBox();

        await page.locator(".pod-ship").first().click();
        // Waiting: the queue count from the fake matchmaker is on screen.
        await page.locator(".pod-status", { hasText: "1/8" }).waitFor();

        expect(await panel.boundingBox()).toEqual(before);
        await page.context().close();
      }, 30_000);
    }
  }
});
