// Multiplayer needs an account (#285), so tools sign in first with dev sign-in (#287): `/auth/dev` on a local dev
// server (`npm run dev`) makes or reuses a test account and sets the session cookie, then redirects to the lobby.
// An account is on one ship at a time and a dev ship keeps running, so each run gets a fresh name: reusing one would
// put the run back on the last run's ship.

import type { Page } from "playwright";

/** `name` plus a random suffix, within the 24-character name limit (MAX_NAME_LENGTH). */
export function runName(name: string): string {
  return `${name.slice(0, 18)} ${Math.random().toString(36).slice(2, 7)}`;
}

/** Signs the page's browser context in as a dev account and lands on the lobby at `url`. */
export async function devSignIn(page: Page, url: string, name: string): Promise<void> {
  const response = await page.goto(new URL(`/auth/dev?name=${encodeURIComponent(name)}`, url).href);
  if (!response?.ok()) {
    throw new Error(`dev sign-in failed (${response?.status()}): it needs \`npm run dev\` on localhost`);
  }
}
