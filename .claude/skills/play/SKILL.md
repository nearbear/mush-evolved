---
name: play
disable-model-invocation: true
description: Manual only, run when the user asks (/play). Launch the game and look at it in a real (headless) browser, on desktop and on a phone. Use after any UI, renderer, layout, or asset change, or when asked to run, screenshot, or check the game visually (including on mobile). Starts the dev servers if needed, joins a match as a desktop and a phone player, inspects, examines, chats, takes items, walks through doors, and saves screenshots to read.
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

`tools/src/play/screenshot.ts` joins as "Playwright" on a 1600x1000 desktop and as "Playwright (phone)" on an emulated Galaxy S8 (touch, 360x740: **360px is the narrowest width we support**, so the phone pass tests it), at the same time so both land in one match (bots fill the other seats after about 15 s). The desktop pass runs first, then the phone pass. Saves to `.screenshots/` (gitignored). `-- --only desktop` or `-- --only mobile` runs one pass; `-- --phone "iPhone 13"` uses another Playwright device.

Desktop:

| File | State |
|---|---|
| `01-game.png` | In the starting room after joining |
| `02-inspect.png` | Inspect panel open on another crew member |
| `03-examine.png` | Room equipment selected and examined (private line in the room log) |
| `04-chat.png` | Global chat tab with a sent message |
| `05-take.png` | After taking an item from the room into the inventory |
| `06-moved.png` | After double-clicking a reachable door |

Phone (every phone step also fails if the page scrolls sideways):

| File | State |
|---|---|
| `m01-room.png` | Room panel after joining; bottom nav shown, ship map absent |
| `m02-peek-person.png` | Peek bar on another crew member (skipped if nobody else is in the room) |
| `m03-peek-examine.png` | Equipment examined from the peek bar, then the iTrackie room log |
| `m04-chat-focused.png` | Global chat sent with the input still focused; the nav must be hidden |
| `m05-inspect-inventory.png` | Inspect panel with the inventory after a take (or drop) |
| `m06-door-go.png` | After tapping a door and pressing Go in the peek bar |
| `m07-wide-room.png` | A room wider than the phone: scrolls sideways at 1x with you in view (walks up to 6 doors to find one; skipped if none) |
| `m08-landscape.png` | The phone rotated (740x360 by default); the top bar must be one row |

A failed step saves `<name>-FAILED.png` showing the page at the moment it failed. The script exits non-zero on any failed step **or any browser console error**, and prints the errors.

Options: `npm run screenshot -- --name Alice --out <dir> --url <web> --server <party>`.

## 3. Look at the screenshots

Read the PNGs with the Read tool. **Actually look** before reporting. Check what the change was supposed to affect, and also glance for regressions:

- Isometric room: walls, floor, and furniture in the right order; people standing on the floor, not inside machinery; name tags readable.
- Top bar: AP (pink `pa1`) and MP (cyan `pa2`) pips match the numbers next to them.
- Panels: inspect on the left, iTrackie tabs on the right, nothing overflowing or clipped.

Phone screenshots (mobile is first-class, see CLAUDE.md rule 7):

- Top bar visible in every shot: two rows in portrait (name, role, buttons; then AP/MP and HP/morale side by side), one row in landscape. Long names cut off with an ellipsis, not wrapping. The stats row is tuned to fit 360px (about 10px to spare): adding anything to it needs a 360px check.
- Bottom nav visible (except while typing), with the active panel highlighted; nothing hidden under it or the notch.
- Iso room never below 1x: pixels crisp, doors big enough to tap. Wide rooms scroll sideways, not squeezed.
- Peek bar shows the right name and only legal actions; Go appears only for reachable doors.
- Touch targets look about 32px tall or more; no hover-only information.

**What headless can't check:** the on-screen keyboard. iOS Safari doesn't shrink the page for it, so after a layout change near the chat input, ask the user to check it on a real phone (`npm run dev -w web -- --host`, then open the LAN address) and say it's unverified until they do.

Report what you saw, including anything that looks off even if it's unrelated to the change.

## Extending the script

To check a new interaction, add a `step(...)` in `desktopSteps` and, if it's something a phone player does, in `mobileSteps` (use `.tap()` and the bottom nav there; throw `Skip` when the game state can't support the step). Prefer role/label locators (`getByRole`, `getByLabel`) over CSS classes where the UI exposes them. Code passed to `page.waitForFunction` runs in the browser: pass it as a string, because the `tools` package has no DOM types.

## Setup (already done on this machine)

Playwright's Chromium is in `~/.cache/ms-playwright`. On a fresh WSL install it needs system libraries, which require sudo (the user must run this; Claude can't enter a password):

```bash
cd ~/mush2/tools && npx playwright install chromium && sudo npx playwright install-deps chromium
```

A launch error mentioning `libnspr4.so` (or another missing `.so`) means that second command hasn't been run.
