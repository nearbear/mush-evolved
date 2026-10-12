---
name: play
description: Launch the game and look at it in a real (headless) browser. Use after any UI, renderer, layout, or asset change, or when asked to run, screenshot, or check the game visually. Starts the dev servers if needed, joins a match, inspects a crew member, sends a chat message, walks through a door, and saves screenshots to read.
---

# Play the game and look at it

Typecheck and unit tests don't show whether the UI looks right. This does.

## 1. Make sure the dev servers are up

```bash
source ~/.nvm/nvm.sh
curl -sf http://localhost:5173 >/dev/null && curl -s http://localhost:8787 >/dev/null && echo up || echo down
```

If down, start them **as a background task** (Bash `run_in_background: true`), logging to the session's scratchpad directory (named in the system prompt; there is no environment variable for it):

```bash
cd /home/near/mush2 && source ~/.nvm/nvm.sh && npm run dev > <scratchpad>/dev.log 2>&1
```

Then poll until both ports answer (don't `sleep` a fixed time):

```bash
timeout 60 bash -c 'until curl -sf http://localhost:5173 >/dev/null && curl -s http://localhost:8787 >/dev/null; do sleep 1; done'
```

If a background `npm run dev` exits immediately, the ports are probably already taken by servers that are still running. Check with the `curl` above before assuming failure.

## 2. Drive it

```bash
cd /home/near/mush2 && source ~/.nvm/nvm.sh && npm run screenshot
```

`tools/src/play/screenshot.ts` joins as "Playwright" (bots fill the other seats after about 15 s), then saves to `.screenshots/` (gitignored):

| File | State |
|---|---|
| `01-game.png` | In the starting room after joining |
| `02-inspect.png` | Inspect panel open on another crew member |
| `03-chat.png` | Global chat tab with a sent message |
| `04-moved.png` | After double-clicking a reachable door |

A failed step saves `<name>-FAILED.png` showing the page at the moment it failed. The script exits non-zero on any failed step **or any browser console error**, and prints the errors.

Options: `npm run screenshot -- --name Alice --out <dir> --url <web> --server <party>`.

## 3. Look at the screenshots

Read the PNGs with the Read tool. **Actually look** before reporting. Check what the change was supposed to affect, and also glance for regressions:

- Isometric room: walls, floor, and furniture in the right order; people standing on the floor, not inside machinery; name tags readable.
- Top bar: AP (pink `pa1`) and MP (cyan `pa2`) pips match the numbers next to them.
- Panels: inspect on the left, iTrackie tabs on the right, nothing overflowing or clipped.

Report what you saw, including anything that looks off even if it's unrelated to the change.

## Extending the script

To check a new interaction, add a `step("05-name", async () => { ... })` in `tools/src/play/screenshot.ts`. Prefer role/label locators (`getByRole`, `getByLabel`) over CSS classes where the UI exposes them. Code passed to `page.waitForFunction` runs in the browser: pass it as a string, because the `tools` package has no DOM types.

## Setup (already done on this machine)

Playwright's Chromium is in `~/.cache/ms-playwright`. On a fresh WSL install it needs system libraries, which require sudo (the user must run this; Claude can't enter a password):

```bash
cd ~/mush2/tools && npx playwright install chromium && sudo npx playwright install-deps chromium
```

A launch error mentioning `libnspr4.so` (or another missing `.so`) means that second command hasn't been run.
