# mush2

A turn-based, browser-based social deduction game inspired by Mush (Motion Twin) and eMush (Eternaltwin). Vertical-slice MVP: matchmaking, bot fill, hidden roles, action points.

## Run locally

Requires Node 24+ (inside WSL if you are on Windows).

```bash
npm install
npm run dev
```

This starts both halves:

- **Game server** (wrangler, local Durable Objects): http://localhost:8787
- **Web client** (Vite): http://localhost:5173. Open this in a browser.

Enter a name and click **Find game**. After 5 seconds, empty seats fill with bots (labeled "(AI)"). To test with several humans, open more tabs within that window: each tab is a separate player.

Run the halves separately with `npm run dev -w server` and `npm run dev -w web`. To point the client at another server, copy `web/.env.example` to `web/.env` and set `VITE_PARTY_HOST`.

## Other commands

```bash
npm test                 # rules unit tests (shared package)
npm run typecheck        # all packages
npm run build            # production build of the web client
```

## Layout

- `shared/`: pure game rules, types, wire protocol, bot interface. No I/O.
- `server/`: PartyKit/partyserver on Cloudflare Durable Objects (`Matchmaker`, `GameRoom`).
- `web/`: React client that renders the per-player view.
- `Mush/`: original Motion Twin Mush sources and art, CC BY-NC-SA 4.0. See `docs/mush-assets.md`.

## License

Code license not yet decided. Mush assets: CC BY-NC-SA 4.0, © Motion Twin, from [WebGamesArchives](https://github.com/motion-twin/WebGamesArchives).
