# Code map: server

All under `server/src/`.

- `index.ts`: the worker entry; routes requests and exports the Durable Object classes.
- `Matchmaker.ts`: single instance (`matchmaker/global`); queues players, creates a `GameRoom`, hands out seat tokens. Still the bot-filling model (see `CLAUDE.md`).
- `GameRoom.ts`: one per game (`game-room/<uuid>`). `?token=` maps a connection to a seat. Persists state and the replay record to DO storage (`STATE_VERSION`), sends each connection its own `viewFor`, runs bots, and handles chat (rate limit, moderation, `sendChat`).
- `bots.ts`: the `Bot` interface and the scripted `WanderBot` and `LogParrotBot`. Bots live here, not in `shared`, because model-backed bots need network calls, secrets, and a spend cap.
- `rateLimit.ts`: the per-seat `RateLimiter`.
- `testing/fakes.ts`: `FakeServer`, fake storage and sockets, so tests run without the Durable Object runtime.
