# Code map: server

All under `server/src/`.

- `index.ts`: the worker entry; routes requests and exports the Durable Object classes.
- `Matchmaker.ts`: single instance (`matchmaker/global`); queues players, creates a `GameRoom`, hands out seat tokens. Still the bot-filling model (see `CLAUDE.md`).
- `GameRoom.ts`: one per game (`game-room/<uuid>`). `?token=` maps a connection to a seat. Persists state and the replay record to DO storage (`STATE_VERSION`), sends each connection its own `viewFor` (with the server's `now`), stamps actions with `at` and fires `tick` inputs from a storage alarm at `nextDue` and `cycle` inputs at each clock boundary (`cycleClock.ts`), runs bots (only when idle), and handles chat (rate limit, moderation, `sendChat`).
- `cycleClock.ts`: the cycle clock (#24): 3-hour cycles aligned to midnight GMT, or `CYCLE_SECONDS` in dev; which cycle of the day a time falls in.
- `bots.ts`: the `Bot` interface, the scripted `WanderBot` and `LogParrotBot`, and `ModelBot` (asks a model to choose from its view's affordable actions; anything else, and the scripted fallback decides). Bots live here, not in `shared`, because model-backed bots need network calls, secrets, and a spend cap.
- `prompt.ts`: pure. `buildPrompt(view)` (the model bot's prompt, built only from its own view, chat quoted as data), `parseChoice`, and `describeLogEntry`.
- `model.ts`: the OpenAI-compatible `completeOpenAi` client and `ModelGate`, one per game: credentials, call budget (persisted as `modelCalls`), in-flight limit, timeout, and dropping a key the provider rejects. No hosted default: the only credentials are a dev key (`MODEL_*` in `server/.dev.vars`, with `ALLOW_CHEATS`); `MODEL_BOTS` there seats that many model bots.
- `rateLimit.ts`: the per-seat `RateLimiter`.
- `testing/fakes.ts`: `FakeServer`, fake storage and sockets, so tests run without the Durable Object runtime.
