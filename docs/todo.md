# To-do

Recorded 2026-10-13. Not started. Items that change game rules need the `rule` skill and decisions from the user first.

## UI

- [ ] **User settings button.** A button that opens a user settings (game options) panel.
- [ ] **Private channel slots in the iTracky tab.** Show private channels as slots at the top of the tab, plus the total number of private slots. Each slot shows a plus button until its channel is created; clicking the plus starts (creates) the channel.
- [ ] **Inventory looks like a container.** Redo the inventory UI so it reads as a physical container, not a plain list.
- [ ] **Backgrounds for the AP, MP, HP, and morale bars.**
- [ ] **Restyle the Mush vs. human indicator.**
- [ ] **Remove location and status from the inspect panel.**
- [ ] **Vertically stacked actions that show their cost.** Redo the action UI so actions stack vertically and each one indicates its cost (e.g. AP). The client must keep using `view.legalActions` and not compute costs or legality itself, so the cost needs to come from the view. Must work in the phone layout.
- [ ] **Timestamps on logs.**
- [ ] **Log levels.** Each log entry gets a level (info, warn, danger) with distinct styling. The level should be set by the rules when the entry is created, not guessed by the client, and must not leak anything hidden.
- [ ] **Multi-line chat input with basic markdown.** Chat input becomes multi-line and renders basic markdown only (e.g. bold, italic, code, lists). Chat is untrusted input: render safely (no raw HTML), keep moderation and length limits working on the raw text, and keep it usable on phones.

## Rendering and cosmetics

- [ ] **Fix equipment z values.** Some equipment has incorrect z (draw order/height) values.
- [ ] **Fix isometric view pixelation at varying zooms.** Different zoom levels currently produce odd pixelated renders.
- [ ] **Walk around within a room (cosmetic only).** Players can move around inside a room, and other players see it on their end. It has no effect on the rules.
- [ ] **Sittable equipment.** Equipment gets a "can sit here" concept so players can sit at terminals and tables. Also cosmetic. Open question: how cosmetic position is sent to other clients without becoming rule state (and without leaking anything hidden).

## Rules

- [ ] **Days.** Introduce the concept of days to the game. A rule change, so the `rule` skill applies: what a day is, how it relates to the existing cycle, and what changes at day boundaries need to be decided first.
- [ ] **Ship resources and their UI.** Fuel, oxygen, shields, plasma shield, and alerts. This changes game rules, so the `rule` skill applies: the values, costs, and what drains or restores each resource need to be decided first.
- [ ] **Status effects, starting with the dirty status.** A rule change: what causes and clears dirty, and its effects, need to be decided first.
- [ ] **Lie down action for beds.** A rule change: cost and effects (e.g. any rest or recovery) need to be decided first.
- [ ] **Camera installation, uninstallation, and dismantling.** Rule change: costs, requirements (tools, items), and visibility need to be decided first.
- [ ] **Basic attack (punch) action.** Costs 1 AP and deals 2 damage. Punching someone is an aggressive action. Other rules (targeting, who sees it in the log, what happens at 0 HP) still need to be decided.
- [ ] **"Aggressive" as an action-level concept.** Actions carry an aggressive flag, and the punch is the first one that sets it. What aggressive actions trigger (log visibility, consequences) needs to be decided.
- [ ] **Secret and covert actions.** Design the concept first: what makes an action secret or covert, who can see or detect it, and how it appears in logs. Cameras factor in (e.g. whether a camera records or reveals it). Related to the "aggressive" action flag. This is a rule change and a hidden-information risk, so the `rule` and `leak-check` skills apply.
- [ ] **Skills (rules and UI).** Players have skills, visible to every player in the same room as them (not to players elsewhere, which `viewFor` must enforce). By default there are at most three skill slots, plus a separate book slot that holds a fourth skill gained from a book. Still to decide: the list of skills and their effects, how skills are gained, what books are and where they come from, and whether skills can be lost or swapped. The UI shows a player's slots and skills, including the book slot, and must work in the phone layout. A rule change, so the `rule` skill applies.

- [ ] **Infection.** Design and implement how players become Mush. A rule change and the biggest hidden-information risk in the game (roles must never reach the wrong seat), so the `rule` and `leak-check` skills apply. Still to decide: how many Mush start and how they are chosen, how infection spreads (or whether it does), what Mush can do that humans cannot, how Mush learn who else is Mush, what a player sees when they are infected, and whether infection can be cured.
- [ ] **Win conditions.** Design and implement how a game ends. A rule change. Still to decide: what each side must achieve to win, what happens when the Mush or the humans are eliminated, whether a game has a day or cycle limit (depends on Days), what players see at the end (e.g. whether roles are revealed), and what happens to bots and disconnected players at the end.

## Architecture

- [ ] **Cosmetic position sync.** Decide how in-room position and sitting reach other clients without becoming rule state, and without leaking anything hidden (e.g. a separate lightweight channel, filtered per viewer by room). Blocks walking around and sittable equipment.
- [ ] **Site notification storage and delivery.** Decide where site notifications live (they outlast a game, so not in a game room), how they are delivered to the player, and how moderation feeds them. Likely needs a global coordinator like the matchmaker, or persistent storage. Blocks the notification button.
- [ ] **Log level in the rules.** Decide where a log entry's level (info, warn, danger) is set: by the rules when the entry is created, carried through `viewFor`, with no client guessing. Blocks log levels.
- [ ] **Action costs in the view.** Decide how `view.legalActions` carries each action's cost, so the client displays costs without computing them. Blocks stacked actions with costs.
- [ ] **Accounts architecture.** The account button is a placeholder. Decide what accounts will eventually mean (guest vs. registered, identity across games, storage) so the notification and moderation work does not paint us into a corner.

## Site and accounts

- [ ] **Game logo.** Add the game logo to the site chrome.
- [ ] **Account button.** A button for the player's account. A placeholder for now: it does nothing yet.
- [ ] **Site notification button.** A button for site notifications, which are separate from in-game logs. They concern the player's standing on the site, e.g. a violation received for their behavior in a game. Still to decide: how notifications are stored and delivered, and how moderation feeds them.
- [ ] **Wiki link button.** A button that links to the wiki.

## Wiki

- [ ] **The wiki.** A large project in its own right: scope, hosting, and content need planning before starting. Likely draws on `docs/mush-assets.md` for art, so the asset licensing (CC BY-NC-SA 4.0) and attribution rules apply.

## Moderation

An important feature, and the public-internet basics need to be robust, not minimal. Violations feed the site notifications (see Architecture).

- [ ] **Moderation design.** Write down what is moderated (chat, player names, private channels, behavior in game such as griefing, leaving, and bot-like play), what the responses are (mask, block, warn, mute, temporary ban, permanent ban), and who decides (automatic, reports, an admin). Everything below follows from this.
- [ ] **Chat filtering, hardened.** Grow `moderateChat` beyond the basics: bypass tricks (spacing, leetspeak, look-alike characters, invisible characters, repeated letters), links and contact details, spam and flooding, and caps. Add a regression test per bypass found.
- [ ] **Per-language word lists.** The word list is English-only and `\b` ignores accented letters (a known gap, `it.fails` in `moderation.test.ts`). Add French and Spanish lists and fix the word-boundary handling. Linked to the i18n to-dos.
- [ ] **Moderate player names.** Names are trimmed and capped at 24 characters but not moderated, yet everyone sees them and they end up in bot prompts. Run them through the same filtering and decide what happens on a bad name (reject, or rename).
- [ ] **Private channel moderation.** Decide what is filtered or reportable in private channels, and how a report can include messages the moderator is otherwise not meant to see (a privacy question).
- [ ] **Report a player.** A way for a player to report another player or a message, with the report carrying enough context (recent chat and log) for a decision. Rate-limit reports and ignore abuse of reporting.
- [ ] **Mute, block, and ignore.** Player-side tools: hide a player's chat for yourself. Server-side: mute a seat for the rest of a game.
- [ ] **Violations and sanctions.** A record of violations per identity, escalating sanctions (warn, mute, timed ban, permanent ban), expiry, and an appeals path. Delivered to the player through site notifications. Depends on the accounts and notification architecture to-dos.
- [ ] **Admin and moderator tools.** A way to review reports, see an audit trail, apply or reverse sanctions, and ban an identity, with moderator actions logged. Decide whether this is a page, a CLI, or an API, and how it is protected.
- [ ] **Ban evasion and identity.** Decide what a ban attaches to when accounts do nothing yet (seat token, session, IP, device) and what is acceptable to store about players.
- [ ] **Rate limits and abuse limits, everywhere.** Per-connection and per-seat message limits that survive reconnecting, a cap on connections per client, queue and matchmaker abuse (joining and leaving repeatedly, flooding the lobby), maximum message sizes, and room creation limits. Applies to every entry point, not only game rooms.
- [ ] **Bot-farming and automation defense.** Decide whether to add a challenge (such as Cloudflare Turnstile) at join, and how to stop scripted clients from filling the queue.
- [ ] **Origin and transport hardening.** Check WebSocket origins, enforce TLS, set security headers (CSP, and so on), and confirm seat tokens are not logged or leaked in URLs.
- [ ] **Griefing and stalling.** Handle AFK and leaving players (hand the seat to a bot? mark it?), players who refuse to act, and deliberate game-ruining. Depends on the win conditions and cycle length decisions.
- [ ] **Bot-related abuse.** Chat to bots is untrusted input (prompt injection), and bot output also needs moderation before it reaches players. Part of the bot work, listed here so it is not forgotten.
- [ ] **Terms, privacy, and a code of conduct.** The text players agree to, what data is stored, retention, and how to ask for removal. Needed before a public launch. This is a legal matter, so get it reviewed by someone qualified.
- [ ] **Moderation tests.** See the Testing section. Every bypass fixed gets a regression test.

## Internationalization

The seam is in (`web/src/i18n/`, English, French, Spanish) but most of the game is still untranslated. `tools/src/i18n/baseline.json` lists what remains. See the `i18n` skill.

- [ ] **Translate the rest of the client UI.** Move every hardcoded string in `web/src` into the catalogs, starting with the files with the highest baseline counts. Only the bottom navigation and the lobby are done.
- [ ] **Structured log events.** The rules emit English sentences into the log. Change them to ids with params that the client turns into text, so logs translate and can carry levels and timestamps. Params are data a player sees, so run `leak-check`. Linked to log levels and timestamps.
- [ ] **Structured errors.** `shared` and `server` return English error messages. Replace them with error codes the client translates (while keeping them independent of hidden state).
- [ ] **Item, equipment, and room names.** Translate names, including the room labels generated into `Mush/derived/*.json` from the map. Decide whether the derived data keeps English as the source and the client maps ids to translated names.
- [ ] **Game-term glossary.** One translation per game term across the catalog. French can follow the original game's wording (`Mush/data/DataExt.ods`); Spanish has no source, so each new term needs your decision.
- [ ] **Native review of fr and es.** The French and Spanish strings are drafts. Have native speakers review them before launch.
- [ ] **Language switcher everywhere.** The switcher is only in the lobby and has not been checked visually. Put it where players can reach it in game (likely in user settings), and check it in the phone layout.
- [ ] **Layout with longer text.** French and Spanish run 20 to 30 percent longer. Remove fixed widths and `nowrap` on translated text, and check at 360px.
- [ ] **Pseudo-locale and fr/es screenshot passes.** Add a pseudo-locale (long, accented text) and extend `npm run screenshot` to run in each language, so overflow and untranslated text show up.
- [ ] **Number, date, and time formatting.** Go through `Intl` with the current language, including log timestamps and days. Linked to the timestamps and days to-dos.
- [ ] **Bot chat and prompts follow the ship's language.** Not the UI language. Decide how the ship's language is chosen, and how players who read a different UI language experience it.
- [ ] **Moderation word lists per language.** Listed under Moderation too: fr and es lists, and accent-aware word boundaries.
- [ ] **Translate site pages.** Notifications, the account placeholder, error pages, terms and privacy text, and the wiki. Decide whether the wiki is translated in full or only partly.
- [ ] **Fallback and detection behavior.** Decide what happens when the browser language is unsupported, a key is missing in production, or a saved language is removed.
- [ ] **Decide on more languages.** Out of scope for now, but record the process (the `i18n` skill covers adding one) and whether a right-to-left language is ever planned, since it changes the layout work.

## Testing

`docs/testing.md` has the reasoning and the current status. These are the gaps it lists as missing or partial, in priority order. Tests that need the Durable Object runtime would need `@cloudflare/vitest-pool-workers`, which is not installed. Ask before adding it.

- [ ] **Blunt serialization leak test.** Build a game, serialize each seat's view, and assert that no other seat's hidden values appear anywhere in the string. Catches leaks through fields nobody thought to check.
- [ ] **Leak tests for every new field.** Each new field on `GameState` or `PlayerView` gets a matching `viewFor` test. This includes skills (room-only visibility), Mush roles, secret and covert actions, camera footage, and private log entries.
- [ ] **Errors don't depend on hidden state.** Lock in that `applyAction` gives the same error whatever the hidden reason, before infection arrives.
- [ ] **Each connection gets its own seat's view.** Test `GameRoom.broadcastViews` (pull the decision into a pure function, or use the Durable Object test pool).
- [ ] **Seat tokens.** Missing or unknown token rejected (close code 4001), a valid token maps to exactly one seat, and the matchmaker sends each human only their own token.
- [ ] **Bots see only their own seat's view.** Later, when model bots exist, also test that the prompt for a seat contains nothing outside that seat's view.
- [ ] **Wire parser table.** A table of bad inputs for `parseGameMessage` and `parseMatchmakerMessage`: malformed JSON, wrong types, unknown action kinds, oversized strings, and extra fields. Move, ready, chat, and the matchmaker parser are not tested yet.
- [ ] **Legality for hostile actions.** `applyAction` rejects actions not in `legalActions`, including another player's item, a non-adjacent room, and a dead player.
- [ ] **Player name moderation test.** After names are moderated (see Moderation).
- [ ] **Rate limiter tests.** The per-connection message limit and a per-seat chat limit that survives reconnecting. `RateLimiter` takes `now`, so it is easy to test.
- [ ] **Model output fallback.** Garbage, an illegal action, or a prompt-injection attempt from a model must end up as a legal fallback action. Not started, depends on model bots.
- [ ] **Determinism replay.** Replay the same seed and actions twice and compare the states.
- [ ] **JSON round trip.** `JSON.parse(JSON.stringify(state))` deep-equals the original, so a stray `Map`, `Set`, `Date`, or `undefined` is caught.
- [ ] **Every legal action succeeds.** Anything in `legalActions` is accepted by `applyAction`.
- [ ] **Invariants under random play.** Run many seeded games with random legal actions and check after every step: each item is in exactly one container, AP and MP stay within caps, nobody is in a missing room, and someone always has a legal action. Extend the invariants as rules are added.
- [ ] **Persistence.** A restarted room restores the game, tokens, and bots, and a save with a different `STATE_VERSION` is discarded instead of half-loaded.
- [ ] **Bots never stall the game.** A bot is not scheduled twice, an illegal choice does not crash the room, and a `decideAction` that throws or hangs has a fallback. Today a rejected promise in `scheduleBots` is unhandled.
- [ ] **Matchmaker.** A full queue starts immediately, the fill alarm starts a partial game with bots, extra players roll into the next game, queueing twice does nothing, and leaving clears the alarm when the queue empties.
- [ ] **Tests for `targets.ts`.** Finding the selection in a view and `actionLabel`; pure and cheap.
- [ ] **Moderation regression tests.** One per bypass, plus the accented-letter gap (`it.fails` in `moderation.test.ts` should pass once fixed).
- [ ] **Rules tests for each new rule.** Infection, win conditions, days, ship resources, status effects, punch, skills, and covert actions each need their own tests, including hidden-information checks (see the `rule` skill).
- [ ] **End-to-end test.** Drive a full match through the real server and a browser (Playwright) in CI, as desktop and phone players.
- [ ] **i18n coverage gaps.** Tests for derived room labels, fr/es screenshots, and layout overflow (see Internationalization).
- [ ] **Load test.** Many concurrent rooms and connections against the Worker, to find limits before launch and to size rate limits.
- [ ] **Run tests in CI.** Typecheck, lint, and tests on every push (see DevOps).

## DevOps

Deploy is not yet configured or tested (`npm run deploy -w server`). Work is committed straight to `main` (no branches), so CI runs on pushes to `main` and deploys should be gated on it passing.

- [ ] **CI.** A GitHub Actions workflow running install, typecheck, lint, tests, and build on every push to `main`. Cache dependencies. Respect the npm 11 install-script approvals.
- [ ] **CD.** Deploy to Cloudflare automatically when CI passes on `main`, with a manual approval or tag for production if wanted.
- [ ] **Deployment configuration.** Get `wrangler` deploy working: `wrangler.jsonc`, Durable Object bindings and migrations, and regenerating `worker-configuration.d.ts` (`npm run types -w server`). Decide hosting for the web client (Cloudflare Pages or Workers assets).
- [ ] **Environments.** At least staging and production, with separate Durable Objects, secrets, and domains.
- [ ] **Secrets and config.** Bot model base URL, model name, and API key as secrets, never in the repo. Document each variable.
- [ ] **Domain and TLS.** Custom domain, DNS, and HTTPS only.
- [ ] **Durable Object migrations.** A process for changing the state shape (`STATE_VERSION`) and the Durable Object classes without wiping games.
- [ ] **Observability.** Structured server logs without secrets or hidden information, error tracking, and basic metrics (active rooms, queue length, errors).
- [ ] **Spend alerts.** Alerts for Cloudflare usage and the bot model API, in addition to the hard spend cap in the bot code.
- [ ] **Rollback.** A documented way to roll back a bad deploy.
- [ ] **Dependency and security upkeep.** Automated dependency updates, `npm audit`, and secret scanning.
- [ ] **Attribution and licensing on the live site.** Show the CC BY-NC-SA 4.0 attribution for the Motion Twin assets, and keep the non-commercial rule visible (no ads or payments).
- [ ] **Backups and data retention.** Decide what persistent data exists (games, violations, notifications) and how long it is kept.
- [ ] **README, demo GIF, and write-up.** The README with a demo GIF, and the write-up of the AI-assisted workflow, built from `docs/ai-workflow.md`.
