// Automated accessibility check: joins a match in headless Chromium, drives it by keyboard and
// reads the accessibility tree, and fails if a blind player would hit a known barrier.
// Expects `npm run dev` to be running.
//
//   npm run a11y
//   npm run a11y -- --url http://localhost:5173 --server http://localhost:8787
//
// Checks (each prints `ok` or `FAIL`; exits non-zero if any fail):
//   lobby/picker/game  no raw i18n keys (`word.word`) in the visible text or accessible names
//   game               the "Room" region lists the people, equipment, items and exits the room shows
//   game               every interactive element a mouse can reach is a Tab stop
//   picker/game        the license footer's links come last in the Tab order, never before other controls
//   game               a round by keyboard alone: pick from the room list, focus lands on Inspect's actions, act, focus stays
//   game               the room log is a role="log", and the polite and assertive announcer regions exist
//
// The page-side code is passed as strings: this Node-only package has no DOM types.

import { parseArgs } from "node:util";
import { chromium, type Page } from "playwright";
import { devPorts } from "../dev/ports.ts";
import { type Target, targets, waitForArt } from "../play/isoProbe.ts";

const ports = devPorts();

const { values: args } = parseArgs({
  options: {
    url: { type: "string", default: `http://localhost:${ports.web}` },
    server: { type: "string", default: `http://localhost:${ports.server}` },
  },
});

/** Bots fill the queue after 5 s (Matchmaker FILL_DELAY_MS); allow for startup. */
const MATCH_TIMEOUT_MS = 45_000;
/** More Tab stops than this means the walk is stuck in a trap or never wraps. */
const MAX_TAB_STOPS = 400;

const failures: string[] = [];

async function check(name: string, run: () => Promise<void>): Promise<void> {
  try {
    await run();
    console.log(`ok    ${name}`);
  } catch (e) {
    failures.push(name);
    console.log(`FAIL  ${name}`);
    for (const line of (e as Error).message.split("\n")) console.log(`      ${line}`);
  }
}

async function main(): Promise<number> {
  for (const url of [args.url!, args.server!]) {
    if (!(await reachable(url))) {
      console.error(`Not reachable: ${url}. Start the dev servers with \`npm run dev\`.`);
      return 2;
    }
  }
  const browser = await chromium.launch();
  const consoleErrors: string[] = [];
  try {
    const page = await (await browser.newContext({ viewport: { width: 1600, height: 1000 } })).newPage();
    page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
    page.on("pageerror", (e) => consoleErrors.push(e.message));

    await page.goto(args.url!);
    const english = page.getByRole("button", { name: /English/ });
    await english.waitFor();
    await check("lobby: no raw i18n keys", () => noRawKeys(page));

    await english.click();
    const tile = page.locator(".pod-character").first();
    await tile.waitFor();
    await check("picker: no raw i18n keys", () => noRawKeys(page));
    await check("picker: license footer is last in the Tab order", () => noFooterStops(page));

    await tile.click();
    await page.locator(".three-panel").waitFor({ timeout: MATCH_TIMEOUT_MS });
    await waitForArt(page);
    await page.locator(".wake").waitFor({ state: "detached" });

    await check("game: no raw i18n keys", () => noRawKeys(page));
    await check("game: room region lists people, equipment, items and exits", () => roomRegion(page));
    await check("game: look, select and act by keyboard alone", () => keyboardRound(page));
    await check("game: the room log is a live region", () => logIsLive(page));
    await check("game: license footer is last in the Tab order", () => noFooterStops(page));
    await check("game: every mouse-reachable control is a Tab stop", () => everyControlTabbable(page));
  } finally {
    await browser.close();
  }
  if (consoleErrors.length) {
    console.log(`\nBrowser console errors (${consoleErrors.length}):`);
    for (const e of [...new Set(consoleErrors)]) console.log(`  ${e}`);
  }
  return failures.length || consoleErrors.length ? 1 : 0;
}

/** Runs a JS expression in the page and returns its (JSON-able) value. */
function inPage<T>(page: Page, expression: string): Promise<T> {
  return page.evaluate(expression) as Promise<T>;
}

/** A dotted lowercase identifier like `lobby.singlePlayer`: what i18next shows for a missing key. */
const RAW_KEY = /^[a-z]{2,}(\.[a-zA-Z][a-zA-Z0-9]*)+$/;
/** Real words that look like keys. */
const NOT_KEYS = new Set(["github.com", "creativecommons.org"]);

async function noRawKeys(page: Page): Promise<void> {
  // The visible text, and the accessible names the tree carries (aria-labels never show on screen).
  const text = await inPage<string>(page, "document.body.innerText");
  const tree = await page.locator("body").ariaSnapshot();
  const found = new Set<string>();
  for (const token of `${text}\n${tree}`.split(/[\s"'`()[\]:,;]+/)) {
    const word = token.replace(/[.!?]+$/, "");
    if (RAW_KEY.test(word) && !NOT_KEYS.has(word)) found.add(word);
  }
  if (found.size) throw new Error(`raw translation keys on screen: ${[...found].join(", ")}`);
}

/** Which Room-region group each kind of probed target belongs in (the story's group names). */
const GROUP_FOR: Record<Target["kind"], RegExp> = {
  person: /People/i,
  equipment: /Equipment/i,
  item: /Items/i,
  door: /Exits/i,
};

async function roomRegion(page: Page): Promise<void> {
  const region = page.getByRole("region", { name: "Room", exact: true });
  if (!(await region.count())) throw new Error('no region named "Room" (the room is only a canvas to a screen reader)');
  const problems: string[] = [];
  const present = (await targets(page)).filter((t) => !t.you);
  for (const kind of Object.keys(GROUP_FOR) as Target["kind"][]) {
    const wanted = present.filter((t) => t.kind === kind);
    if (!wanted.length) continue;
    const group = region.getByRole("group", { name: GROUP_FOR[kind] });
    if (!(await group.count())) {
      problems.push(`no "${GROUP_FOR[kind].source}" group, but the room has ${wanted.length} ${kind}(s)`);
      continue;
    }
    const names = (await group.getByRole("button").allInnerTexts().then((t) => t.map((s) => s.trim().toLowerCase())))
      .concat(await group.getByRole("button").evaluateAll(labelsOf));
    for (const t of wanted) {
      if (!names.some((n) => n.includes(t.title.trim().toLowerCase()))) problems.push(`${kind} "${t.title}" is on the canvas but not in the list`);
    }
  }
  if (problems.length) throw new Error(problems.join("\n"));
}

/** The aria-labels of the elements (page side). */
function labelsOf(els: unknown[]): string[] {
  return (els as { getAttribute(n: string): string | null }[]).map((el) => (el.getAttribute("aria-label") ?? "").trim().toLowerCase());
}

async function logIsLive(page: Page): Promise<void> {
  // The log is a role="log" for structure; its entries are spoken by the announcer's two live regions
  // (so a hidden tab still announces and a burst is batched), which must exist before anything happens.
  const found = await inPage<{ feed: boolean; log: boolean; polite: boolean; assertive: boolean }>(
    page,
    `(() => { const feed = document.querySelector(".feed");
      const live = (u) => !!document.querySelector('[data-announcer="' + u + '"][aria-live="' + u + '"]');
      return { feed: !!feed, log: !!feed && !!feed.closest('[role="log"]'), polite: live("polite"), assertive: live("assertive") }; })()`,
  );
  if (!found.feed) throw new Error("no .feed (room log) on screen");
  const missing = [!found.log && 'the room log is not inside role="log"', !found.polite && "no polite announcer region", !found.assertive && "no assertive announcer region"].filter(Boolean);
  if (missing.length) throw new Error(missing.join("\n"));
}

/** Where keyboard focus is (page side): inside the Inspect panel, on a button, or lost on the page body. */
const FOCUS_NOW = `(() => { const el = document.activeElement;
  return { body: !el || el === document.body, inspect: !!el && !!el.closest(".inspect"), button: !!el && el.tagName === "BUTTON",
    name: el ? (el.getAttribute("aria-label") || (el.textContent || "").trim()).slice(0, 60) : "" }; })()`;

async function keyboardRound(page: Page): Promise<void> {
  const region = page.getByRole("region", { name: "Room", exact: true });
  // Equipment first (always harmless to examine), else whatever the room has.
  const entry = region.getByRole("group", { name: /Equipment|Items|People/i }).getByRole("button").first();
  if (!(await entry.count())) throw new Error("nothing in the Room list to select");
  await entry.focus();
  await page.keyboard.press("Enter");
  await page.waitForTimeout(300);
  let focus = await inPage<{ body: boolean; inspect: boolean; button: boolean; name: string }>(page, FOCUS_NOW);
  if (!focus.inspect) throw new Error(`after selecting from the list, focus is not in the Inspect panel (${focus.body ? "lost on the page" : focus.name})`);
  const examine = page.locator(".inspect-actions button").filter({ hasText: /examine/i }).first();
  if (!(await examine.count())) return; // nothing harmless to act with here; selection alone passed
  await examine.focus();
  await page.keyboard.press("Enter");
  await page.waitForTimeout(500);
  focus = await inPage(page, FOCUS_NOW);
  if (focus.body) throw new Error("after acting, keyboard focus fell back to the page body");
}

/** Tabs through the whole page, marking each stop `data-a11y-tab`; returns where it stopped. */
async function tabWalk(page: Page): Promise<{ stops: string[]; footerStops: string[]; footerFirst: boolean; trapped: boolean }> {
  await inPage(page, `document.querySelectorAll("[data-a11y-tab]").forEach((el) => el.removeAttribute("data-a11y-tab"))`);
  await inPage(page, `document.activeElement && document.activeElement.blur()`);
  const stops: string[] = [];
  const footerStops: string[] = [];
  let footerFirst = false; // a footer stop came before some other stop
  for (let i = 0; i < MAX_TAB_STOPS; i++) {
    await page.keyboard.press("Tab");
    const stop = await inPage<{ label: string; footer: boolean; seen: boolean; body: boolean } | null>(
      page,
      `(() => { const el = document.activeElement;
        if (!el) return null;
        const seen = el.hasAttribute("data-a11y-tab");
        el.setAttribute("data-a11y-tab", "1");
        const name = el.getAttribute("aria-label") || (el.textContent || "").trim().slice(0, 40);
        return { label: el.tagName.toLowerCase() + (name ? " " + JSON.stringify(name) : ""),
          footer: !!el.closest("footer, .credits"), seen, body: el === document.body }; })()`,
    );
    if (!stop || stop.body || stop.seen) return { stops, footerStops, footerFirst, trapped: false }; // wrapped around to the browser UI or the start
    stops.push(stop.label);
    if (stop.footer) footerStops.push(stop.label);
    else if (footerStops.length) footerFirst = true;
  }
  return { stops, footerStops, footerFirst, trapped: true };
}

async function noFooterStops(page: Page): Promise<void> {
  const { footerStops, footerFirst, trapped } = await tabWalk(page);
  if (trapped) throw new Error(`Tab never left the page in ${MAX_TAB_STOPS} presses (a focus trap?)`);
  if (footerFirst) throw new Error(`Tab reaches the license footer (${footerStops.join(", ")}) before other controls`);
}

/** Roles whose members share one Tab stop and move with the arrow keys. */
const ROVING = "tab, menuitem, menuitemradio, menuitemcheckbox, option, radio, treeitem, gridcell, row";

async function everyControlTabbable(page: Page): Promise<void> {
  const { stops, trapped } = await tabWalk(page);
  if (trapped) throw new Error(`Tab never left the page in ${MAX_TAB_STOPS} presses (a focus trap?)`);
  if (!stops.length) throw new Error("no Tab stops at all");
  // Arrow-key groups (tabs and the like) count when any member of the group was a stop.
  const missed = await inPage<string[]>(
    page,
    `(() => {
      const roving = ${JSON.stringify(ROVING.split(", "))};
      const visible = (el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden"
          && !el.closest('[inert], [aria-hidden="true"]') && !el.disabled && el.getAttribute("aria-disabled") !== "true";
      };
      const out = [];
      for (const el of document.querySelectorAll('button, a[href], input, select, textarea, summary, [role="button"], [role="link"], [tabindex]')) {
        if (el.hasAttribute("data-a11y-tab") || !visible(el)) continue;
        if (el.matches('[tabindex]') && !el.matches('button, a[href], input, select, textarea, summary, [role="button"], [role="link"]')) continue; // only a scroll or focus target
        const role = el.getAttribute("role");
        if (roving.includes(role)) {
          const group = el.closest('[role="tablist"], [role="menu"], [role="listbox"], [role="radiogroup"], [role="tree"], [role="grid"]');
          if (group && group.querySelector("[data-a11y-tab]")) continue;
        }
        const name = el.getAttribute("aria-label") || (el.textContent || "").trim().slice(0, 40);
        out.push(el.tagName.toLowerCase() + (el.className && typeof el.className === "string" ? "." + el.className.trim().split(/\\s+/)[0] : "") + (name ? " " + JSON.stringify(name) : ""));
      }
      return out;
    })()`,
  );
  if (missed.length) throw new Error(`visible controls that Tab never reaches (${missed.length}):\n${missed.slice(0, 20).join("\n")}`);
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
