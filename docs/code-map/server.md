# Code map: server

All under `server/src/`.

- `index.ts`: the worker entry; routes requests and exports the Durable Object classes.
- `Matchmaker.ts`: one per lobby language (`matchmaker/en|fr|es`). Boards each joiner straight onto the language's open ship (`GameRoom.join`, one join at a time), launching a new one when there is none or it closed; remembers the open ship (`open` in storage) and forgets it when full or at its deadline (alarm). Sends watchers how many are aboard. No bots.
- `GameRoom.ts`: one per game (`game-room/<uuid>`). `join` (the matchmaker's RPC) launches an empty ship in pre-selection on the first call and boards each player with a `join` input, returning their token and when the ship closes; `setup` seats everyone at launch (tests, single player later). `?token=` maps a connection to a seat; tokens, connections and bots are keyed by seat (`PlayerState.mind`) and resolved to the seat's current body with `bodyOf` on each use, since a Transfer moves seats between bodies. Persists state and the replay record to DO storage (`STATE_VERSION`), sends each connection its own `viewFor` (with the server's `now`), stamps actions with `at` and fires `tick` inputs from a storage alarm at `nextDue` and `cycle` inputs at each clock boundary (`cycleClock.ts`), runs bots (only when idle), and handles chat (rate limit, moderation, `sendChat`).
- `cycleClock.ts`: the cycle clock (#24): 3-hour cycles aligned to midnight GMT, or `CYCLE_SECONDS` in dev; which cycle of the day a time falls in.
- `bots.ts`: the `Bot` interface, the scripted `WanderBot` and `LogParrotBot`, and `ModelBot` (asks a model to choose from its view's affordable actions; anything else, and the scripted fallback decides). Bots live here, not in `shared`, because model-backed bots need network calls, secrets, and a spend cap.
- `prompt.ts`: pure. `buildPrompt(view)` (the model bot's prompt, built only from its own view, chat quoted as data), `parseChoice`, and `describeLogEntry`.
- `model.ts`: the OpenAI-compatible `completeOpenAi` client and `ModelGate`, one per game: credentials, call budget (persisted as `modelCalls`), in-flight limit, timeout, and dropping a key the provider rejects. No hosted default: the only credentials are a dev key (`MODEL_*` in `server/.dev.vars`, with `ALLOW_CHEATS`); `MODEL_BOTS` there seated model bots, but multiplayer no longer seats bots, so nothing reads it now.
- `rateLimit.ts`: the per-seat `RateLimiter`.
- `testing/fakes.ts`: `FakeServer`, fake storage and sockets, so tests run without the Durable Object runtime.
