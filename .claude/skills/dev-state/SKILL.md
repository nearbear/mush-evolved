---
name: dev-state
description: Read the local dev server's live game state (the one `npm run dev` is running) with `npm run dev-state`. Use when debugging what the game in the browser is doing - the player's seat, room, AP, cheats, titles, navigation, broken equipment, fires, or any field of GameState - instead of digging through server/.wrangler by hand.
---

# Read the dev game's state

`npm run dev-state` (`tools/src/dev/devState.ts`) reads wrangler's Durable Object storage for this checkout, read-only. It knows where the files are, which one is the newest game, and how to decode them, so don't reverse-engineer `server/.wrangler` yourself.

```bash
npm run -s dev-state                        # summary of the newest game: cycle, phase, human seats (in dev, you), crew, titles, ship, navigation, broken equipment, fires
npm run -s dev-state -- --path players.0    # any part of GameState as JSON (dot path; array indexes are numbers)
npm run -s dev-state -- --list              # recent rooms, newest first
npm run -s dev-state -- --room <prefix> ... # another game, by a prefix of its room name or file hash
npm run -s dev-state -- --key setup         # any stored key, e.g. setup, input:000000012, account:p0
```

- Start with the summary, then use a narrow `--path`. Don't print the whole state or the log (`--path log` can run to thousands of lines).
- "Newest" means the room file most recently written. If the user has several games open, check `--list` and pass `--room`.
- The state on disk is what the server last saved. A change made a moment ago may not be there yet.

## Hidden information

The output includes every seat's role and private stats. Use it only to debug. Never put it in a bot prompt, a player view, a GitHub issue, a commit or a doc. When telling the user what you found, quote only the fields that matter.
