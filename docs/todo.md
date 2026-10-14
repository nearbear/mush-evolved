# To-do

> **Bots (2026-10-13):** multiplayer will have no bots; bots exist only in single player (and as test tooling). Wherever these docs describe bots filling multiplayer seats, that is outdated.

> Draft staging of these items: `docs/mvp-plan.md` (not final).

> **GitHub Projects pilot (2026-10-13):** items ending in `(#N)` are also tracked as GitHub issues in the [mush2 project](https://github.com/users/nearbear/projects/1) (epics with sub-issues, milestones from the draft MVP plan). Until the project setup is approved, this file is still the source; update both.

Recorded 2026-10-13; staleness check against `docs/rules-design.md` and `docs/action-plans.md` done the same day. Nothing below is started unless it says so. Items that change game rules need the `rule` skill and decisions from the user first.

## Open rule decisions

Decisions only you can make; nothing here should be implemented until it is settled (the `rule` skill resolves ambiguity with you first). Ordered so earlier answers unblock later ones. Checked items are already answered, with the source; the rest are open. Answered decisions live in `docs/rules-design.md` and `docs/action-plans.md`.

**Game shape**
- [x] **Turn and cycle length.** Answered: real-time on a timer, 3-hour cycles, 8 per day, no "ready" action (`docs/rules-design.md`, `docs/action-plans.md`). Not yet implemented in the code.
- [ ] **Days.** A day is 8 cycles. Still open: what else changes at a day boundary beyond the daily spore cap reset. (#24)
- [x] **Number of players.** Answered: 16 seats (`docs/rules-design.md`). The code still has the placeholder of 8. Joining happens during the pre-selection phase, and multiplayer has no bots (2026-10-13; see "Lobby and matchmaking" below). Still open: whether late joiners can enter a running game.
- [ ] **Roles.** Which roles exist beyond human and Mush, if any, and how they are assigned. Linked to the skills decisions. (#38)
- [ ] **Game name.** Not a rule, but still open in `CLAUDE.md`. (#43)

**Infection**
- [x] **How many Mush.** Answered: 2, or 1 when 8 or fewer players are in the room when they are chosen (`docs/rules-design.md`).
- [x] **When Mush are chosen.** Answered (2026-10-13): a ship opens in a pre-selection phase where no one is Mush; the game starts when the ship fills or on day 3 cycle 8, whichever is first, with no minimum player count. No spore actions and no combat during pre-selection. Multiplayer has no bots (`docs/rules-design.md`). Single player: the human is always the only Mush, against 8 human bots.
- [ ] **How infection works.** What a spore does to a human: the action name, AP cost, whether it needs the same room, how many spores convert, whether the target notices, and whether infection can be cured. (#25)
- [ ] **Spore extraction.** Answered in part: `extract_spore` costs 1 AP, gives 1 spore, always applies dirty, and there is a fixed daily number. Still open: Mush-only or not, the daily number, and ship-wide or per Mush. (#26)
- [x] **Mush know each other and have a private chat channel** (`docs/rules-design.md`).
- [ ] **What a player sees when infected,** and what the Mush vs. human indicator shows to whom. (#25)

**Win conditions and death**
- [x] **What each side must achieve.** Answered: Mush win if all humans are dead, or if the ship returns to Sol while any Mush is alive. Humans win if the ship returns to Sol with no Mush alive (`docs/rules-design.md`).
- [ ] **Returning to Sol.** What action or condition triggers it, who can do it, and where. Without this humans can never win. (#27)
- [ ] **Game length limit,** if any (days are decided, so this depends on the Sol trip). (#27)
- [ ] **What happens at 0 HP:** death, incapacitation, or something else, whether a body is left and items drop, and what a dead player sees, can do, and can say in chat. (See also the spectator view to-do under Rules.) (#28)
- [ ] **End-of-game reveal:** whether roles are shown, and what happens to bots and disconnected players. (#27)

**Combat and covert actions**
- [x] **Punch damage.** 1 AP and 2 damage, a placeholder until combat is designed (decided 2026-10-13; `docs/rules-design.md` now agrees).
- [ ] **Design combat.** A real design pass: damage, targeting, misses, weapons, healing, death, and the aggressive flag. The punch's 2 damage is a placeholder until then. (#31)
- [ ] **Punch targeting:** who can be targeted (same room only?), whether it can miss, and any limits per cycle. (#29)
- [ ] **What aggressive actions trigger:** log visibility, consequences, and whether other players are alerted. (#30)
- [ ] **Secret and covert actions:** what makes an action secret or covert, who can see or detect it, how it appears in logs, and how cameras factor in. Partly decided for plans: a secret substitution is witnessed exactly as if done live (`docs/action-plans.md`). Room log visibility for secret actions "will change". (#36)
- [ ] **Who sees an attack in the log:** attacker, victim, and bystanders in the room, and whether cameras change that. (#29)

**Cameras**
- [ ] **Camera install, uninstall, and dismantle:** costs, required tools or items, and who can see that it happened. (#35)
- [ ] **What a camera records or reveals,** and to whom, and whether footage persists. (#35)

**Ship, status, and beds**
- [ ] **Ship resources** (fuel, oxygen, shields, plasma shield, alerts): the values, costs, and what drains or restores each, and what happens when one runs out. (#32)
- [ ] **Status effects, starting with dirty:** what causes and clears it, its effects, and whether it is visible to others. (spores already apply it.) (#33)
- [ ] **Lie down on beds:** cost and effects. Partly decided: +2 AP per cycle while lying in a bed (the `lying_down` modifier exists, but no action applies it yet). (#34)

**Items**
- [x] **Inventory and iTrackie.** Answered: 3 private slots, unlimited room storage, free take/drop logged publicly; everyone starts with an iTrackie, a normal item that is needed to read and post in global chat and the feature threads (`docs/rules-design.md`).
- [ ] **Stealing and finding iTrackies,** and other item rules beyond the placeholders. (#40)
- [ ] **Satiety.** Hunger does not exist yet. When it does, food gets a satiety value; coffee gives 2 AP and no satiety on purpose. (#41)

**Skills**
- [ ] **The list of skills** and what each does. (#37)
- [ ] **How skills are gained** (start, level, event, book) and whether they can be lost or swapped. (#37)
- [ ] **Books:** what they are, where they come from, and who can use them. The slot rules (three by default, plus a separate book slot) and room-only visibility are already decided. (#37)

**Communication**
- [x] **Private channels.** Answered: 3 per player by default (counting ones you were invited to; skills and research may raise it), any member can invite any living player, new members see the whole history, and the last member leaving deletes the channel (`docs/action-plans.md`).
- [ ] **Whether Mush have their own private channels** beyond the shared Mush channel. (#39)

**Players leaving**
- [ ] **AFK and disconnected players:** whether a bot takes the seat, whether the seat is skipped, or whether the game ends, and what the others are told. (#42)

## UI

- [ ] **User settings button.** A button that opens a user settings (game options) panel. (#5)
- [ ] **Private channel slots in the iTracky tab.** Show private channels as slots at the top of the tab, plus the total number of private slots. Each slot shows a plus button until its channel is created; clicking the plus starts (creates) the channel. (#6)
- [ ] **Inventory looks like a container.** Redo the inventory UI so it reads as a physical container, not a plain list. (#7)
- [ ] **Backgrounds for the AP, MP, HP, and morale bars.** (#8)
- [ ] **Restyle the Mush vs. human indicator.** (#9)
- [ ] **Remove location and status from the inspect panel.** (#10)
- [ ] **Vertically stacked actions that show their cost.** Redo the action UI so actions stack vertically and each one indicates its cost (e.g. AP). The client must keep using `view.legalActions` and not compute costs or legality itself, so the cost needs to come from the view. Must work in the phone layout. (#11)
- [ ] **Timestamps on logs.** (#12)
- [ ] **Log levels.** Each log entry gets a level (info, warn, danger) with distinct styling. The level should be set by the rules when the entry is created, not guessed by the client, and must not leak anything hidden. (#13)
- [ ] **Multi-line chat input with basic markdown.** Chat input becomes multi-line and renders basic markdown only (e.g. bold, italic, code, lists). Chat is untrusted input: render safely (no raw HTML), keep moderation and length limits working on the raw text, and keep it usable on phones. (#14)

## Rendering and cosmetics

- [ ] **Fix equipment z values.** Some equipment has incorrect z (draw order/height) values. (#15)
- [ ] **Fix isometric view pixelation at varying zooms.** Different zoom levels currently produce odd pixelated renders. (#16)
- [ ] **Walk around within a room (cosmetic only).** Players can move around inside a room, and other players see it on their end. It has no effect on the rules. (#17)
- [ ] **Sittable equipment.** Equipment gets a "can sit here" concept so players can sit at terminals and tables. Also cosmetic. Open question: how cosmetic position is sent to other clients without becoming rule state (and without leaking anything hidden). (#18)

## Rules

- [ ] **Days.** Introduce the concept of days to the game. A rule change, so the `rule` skill applies: a day is 8 three-hour cycles (decided); what changes at day boundaries beyond the daily spore cap still needs deciding. The cycle timer itself (replacing the ready action) is not built. (#24)
- [ ] **Ship resources and their UI.** Fuel, oxygen, shields, plasma shield, and alerts. This changes game rules, so the `rule` skill applies: the values, costs, and what drains or restores each resource need to be decided first. (#32)
- [ ] **Status effects, starting with the dirty status.** A rule change: what causes and clears dirty, and its effects, need to be decided first. (#33)
- [ ] **Lie down action for beds.** A rule change: cost and effects (e.g. any rest or recovery) need to be decided first. (#34)
- [ ] **Camera installation, uninstallation, and dismantling.** Rule change: costs, requirements (tools, items), and visibility need to be decided first. (#35)
- [ ] **Basic attack (punch) action.** Costs 1 AP and deals 2 damage (a placeholder until combat is designed). Punching someone is an aggressive action. Other rules (targeting, who sees it in the log, what happens at 0 HP) still need to be decided. (#29)
- [ ] **"Aggressive" as an action-level concept.** Actions carry an aggressive flag, and the punch is the first one that sets it. What aggressive actions trigger (log visibility, consequences) needs to be decided. (#30)
- [ ] **Secret and covert actions.** Design the concept first: what makes an action secret or covert, who can see or detect it, and how it appears in logs. Cameras factor in (e.g. whether a camera records or reveals it). Related to the "aggressive" action flag. This is a rule change and a hidden-information risk, so the `rule` and `leak-check` skills apply. (#36)
- [ ] **Skills (rules and UI).** Players have skills, visible to every player in the same room as them (not to players elsewhere, which `viewFor` must enforce). By default there are at most three skill slots, plus a separate book slot that holds a fourth skill gained from a book. Still to decide: the list of skills and their effects, how skills are gained, what books are and where they come from, and whether skills can be lost or swapped. The UI shows a player's slots and skills, including the book slot, and must work in the phone layout. A rule change, so the `rule` skill applies. (#37)

- [ ] **Infection.** Design and implement how players become Mush. A rule change and the biggest hidden-information risk in the game (roles must never reach the wrong seat), so the `rule` and `leak-check` skills apply. Decided in `docs/rules-design.md`: 2 Mush (1 with 8 or fewer players), spores via `extract_spore`, Mush know each other and share a private channel. Still to decide: when Mush are chosen, what a spore does to a human, what a player sees when infected, and whether infection can be cured (see Open rule decisions). (#25)
- [ ] **Win conditions.** Design and implement how a game ends. A rule change. Decided in `docs/rules-design.md`: Mush win if all humans die or the ship returns to Sol with a Mush alive; humans win if it returns with none. Still to decide: how the return to Sol is triggered, a game length limit, what players see at the end, and what happens to bots and disconnected players. (#27)

- [ ] **Scheduled action plans.** Players post a plan in a private channel: an ordered list of jobs that other members claim, run automatically at a set time. Designed in full in `docs/action-plans.md` (the action registry and private channels are built; the rest is not). Large; the design has its own phases and open questions. Rule changes, so the `rule` skill applies. (#44)
- [ ] **Spectator view for dead players.** A dead player gets everything public but nothing that depends on standing in a room. Decide what counts as public, whether their old private channels stay readable, and whether any of it can leak back to the living. Today a dead player's `chatChannels` is empty and `viewFor` still sends their own room's log; private-channel membership is kept so this can be decided later. (#45)
- [ ] **Fix `npm run screenshot` hanging.** The script hung past 120 s and 300 s in two runs while checking the drag-and-drop inventory; cause unknown. Until fixed, the inventory tiles (desktop drag between zones, 360px phone grid wrap, tap-to-select Take/Drop button) have had no visual check. Debug the script, then run both passes and look at `05-take.png` and `m05-inspect-inventory.png`. (#46)

## Architecture

- [ ] **Cosmetic position sync.** Decide how in-room position and sitting reach other clients without becoming rule state, and without leaking anything hidden (e.g. a separate lightweight channel, filtered per viewer by room). Blocks walking around and sittable equipment. (#21)
- [ ] **Site notification storage and delivery.** Decide where site notifications live (they outlast a game, so not in a game room), how they are delivered to the player, and how moderation feeds them. Likely needs a global coordinator like the matchmaker, or persistent storage. Blocks the notification button. (#22)
- [ ] **Log level in the rules.** Decide where a log entry's level (info, warn, danger) is set: by the rules when the entry is created, carried through `viewFor`, with no client guessing. Blocks log levels. (#20)
- [ ] **Action costs in the view.** Decide how `view.legalActions` carries each action's cost, so the client displays costs without computing them. Blocks stacked actions with costs. (#19)
- [ ] **Accounts architecture.** The account button is a placeholder. Decide what accounts will eventually mean (guest vs. registered, identity across games, storage) so the notification and moderation work does not paint us into a corner. (#23)

## Original game data

- [ ] **Extract the original rules from the Haxe files, then delete the Haxe files.** Read the rule information in the original Haxe sources under `Mush/` (for example `Mush/src/common/Gameplay.hx` and the data files) and write what they say into `Mush/derived/` as plain data (JSON or Markdown), inferred by AI. Then delete the Haxe files from the repo. Things to settle or watch for:
  - **Inferred means unverified.** Mark every derived file as AI-inferred, keep a pointer to the source file and line it came from, and treat values as proposals: per `CLAUDE.md`, a rule is not decided until you confirm it. Spot-check the extraction against the original sources before they are deleted.
  - **Deletion is hard to undo in practice.** The files stay in git history, and the upstream repo is `motion-twin/WebGamesArchives`, but record the upstream commit the extraction was made from, so it can be redone.
  - **Things still read the Haxe files.** `tools/src/shipLayout/shipPlan.ts` decodes the `s1Cache` string in `Mush/src/common/data/Map.hx` to build `ship-plan.json` (the minimap), and a test checks it. Either keep that file, or extract its data first and change the converter and test. Grep `Mush/src` and `tools/` for other dependencies before deleting anything.
  - **Licensing.** Derived rules are an adaptation of CC BY-NC-SA 4.0 material: keep the attribution file and license text next to the derived data, and keep it under the same license. Check that no Haxe file is under different third-party terms.
  - **Scope.** Decide which files count as "rule information" (gameplay constants, action costs and effects, item and equipment definitions, skills, statuses, the `.ods` data tables), and which Haxe files are not rules (rendering, server plumbing) and can be deleted without extraction.
  - **Housekeeping.** Run `npm run asset-index` afterwards, and update `docs/mush-assets.md` and the `asset` skill, which point at the Haxe files.
  - Feeds the rule decisions for skills, status effects, ship resources, and combat, which can then start from the original values instead of from nothing.

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

- [ ] **Translate the rest of the client UI.** About 74 strings remain (`ITrackie.tsx` alone has about 27); done when the `ui` section of `baseline.json` is empty. Move every hardcoded string in `web/src` into the catalogs, starting with the files with the highest baseline counts. Only the bottom navigation and the lobby are done.
- [ ] **Structured log events.** The rules emit English sentences into the log. Change them to ids with params that the client turns into text, so logs translate and can carry levels and timestamps. `LogEntry.text` is a finished English sentence built in `rules.ts`; store `{ key, params }` and render in the client. Params are data a player sees, so run `leak-check`, and bump `STATE_VERSION` in `server/src/GameRoom.ts` because the `GameState` shape changes. Linked to log levels and timestamps.
- [ ] **Structured errors.** `shared` and `server` return English error messages. Replace them with error codes the client translates (while keeping them independent of hidden state). The places: `ActionResult.error`, the protocol `{ type: "error", message }`, `moderateChat`'s `reason`, and the rate-limit, "No game", and "Malformed message" strings in `GameRoom.ts` and `Matchmaker.ts`.
- [ ] **Item, equipment, and room names.** Translate names, including the room labels generated into `Mush/derived/*.json` from the map. Decide whether the derived data keeps English as the source and the client maps ids to translated names. The plan: drop `name` from `ItemView`/`EquipmentView`, make `ITEM_TYPES`/`EQUIPMENT_TYPES` id-only, and move room labels out of the generated `Mush/derived/*.json` into the catalogs.
- [ ] **Game-term glossary.** One translation per game term across the catalog. French can follow the original game's wording (`Mush/data/DataExt.ods`); Spanish has no source, so each new term needs your decision.
- [ ] **Native review of fr and es.** The French and Spanish strings are drafts. Have native speakers review them before launch.
- [ ] **Language switcher everywhere.** The switcher is only in the lobby and has not been checked visually. Put it where players can reach it in game (likely in user settings; the top bar is tight at 360px), and check it in the phone layout.
- [ ] **Layout with longer text.** French and Spanish run 20 to 30 percent longer. Remove fixed widths and `nowrap` on translated text, and check at 360px.
- [ ] **Pseudo-locale and fr/es screenshot passes.** Add a pseudo-locale (long, accented text) and extend `npm run screenshot` to run in each language, so overflow and untranslated text show up.
- [ ] **Number, date, and time formatting.** Go through `Intl` with the current language, including log timestamps and days. Linked to the timestamps and days to-dos.
- [ ] **Bot chat and prompts follow the ship's language.** Not the UI language. Decide how the ship's language is chosen (the lobby's English/Français/Español ships are placeholders), and how players who read a different UI language experience it.
- [ ] **Moderation word lists per language.** Listed under Moderation too: fr and es lists, and accent-aware word boundaries.
- [ ] **Translate site pages.** Notifications, the account placeholder, error pages, terms and privacy text, and the wiki. Decide whether the wiki is translated in full or only partly.
- [ ] **Fallback and detection behavior.** Decide what happens when the browser language is unsupported, a key is missing in production, or a saved language is removed.
- [ ] **Bot and guest names.** `"Bot 2 (AI)"` and `"Guest N"` are stored as English in `Seat.name`. Store a number or id and format in the client (the AI badge already comes from `isBot`).
- [ ] **Re-run the i18n baseline.** The hardcoded-text baseline recorded the minimap's in-progress counts; re-run `UPDATE_I18N_BASELINE=1 npm test -w tools -- i18n` now that it has landed, then check the numbers went down.
- [ ] **Known translation doubts.** "Presque complet"/"Casi completa" (gender) and "Salle"/"Sala" for Room, to settle in the glossary.
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

## Project management

- [ ] **Set up GitHub Projects.** Use GitHub Projects for planning: epics as issues with sub-issues (one epic per section of this file), stories as child issues, and milestones for the four stages (MVP, private beta, public beta, release). Add labels for type (`rule-decision`, `ui`, `moderation`, and so on). Draft staging is in `docs/mvp-plan.md`. Show the plan before creating anything, since issues on the public repo are visible. Decide whether `docs/todo.md` stays as the source or is retired once issues exist.
- [ ] **Finalize the MVP plan.** Review `docs/mvp-plan.md` (a draft, not final) and settle what is in each stage.

## Sections still to add

Ideas for new sections of this to-do. Each one needs its items written out before it becomes a real section.

- [ ] **Bots.** Bots may be testing-only, not live play; decide first. Scripted bots, the hosted model API, the spend cap and rate limits, prompt-injection handling, labeling bots as AI, and choosing the API. Some of this is currently scattered across Moderation and Testing.
- [ ] **Onboarding and tutorial.** A first-time experience: tutorial, in-game rules reference, tooltips, and a practice game against bots. Links to the wiki.
- [ ] **Accessibility.** Keyboard navigation, screen-reader labels, color contrast (log levels and bars), reduced motion, text scaling, and colorblind-safe indicators.
- [ ] **Lobby and matchmaking.** MVP, not started (2026-10-13). One plain queue per language (en/fr/es), no advanced matchmaking. "Queueing" puts a player straight into the open ship for that language, which is in its pre-selection phase (no one is Mush yet). The game starts when the ship fills or on day 3 cycle 8, whichever is first, and the next player opens a new ship. No bots in multiplayer. This replaces the matchmaker's current fill-with-bots timer and "create a room when the queue fills" model. Also: rejoining after a disconnect, spectating or the end-of-game screen, and rematch.
- [ ] **Single-player mode.** Discussed 2026-10-13 as the easiest demo for visitors; stage not decided. The human is always the only Mush, against 8 bots who are all human (9 seats; decided 2026-10-13, `docs/rules-design.md`). So bots never need to lie; they investigate and accuse. Cycles advance when the player clicks "End cycle" (an exception to the timer, single player only), save slots stored server-side (one game room per slot). Needs model-backed bots to be fun, so it needs the spend controls: a token budget per game (bots fall back to scripted when it runs out), a budget per user per day, the global hard cap, and possibly a minimum time per cycle. Open: visitor identity for per-user budgets (anonymous token, Turnstile, or sign-in), and which model API.
- [ ] **Audio.** Sound effects, music, and a mute control. Needs a license check first, since sounds and music may fall under different terms (see the `asset` skill).
- [ ] **Game feel and animation.** Animated characters and whether to move beyond DOM rendering (three.js or a 2D renderer).
- [ ] **Analytics and balance.** Win rates per side, game length, and drop-off points. Conflicts with privacy, so follow the terms and privacy decision.
- [ ] **Documentation.** Keeping `docs/code-map.md` and `docs/testing.md` current, and a contributor guide.
- [ ] **Project and legal.** The asset license (CC BY-NC-SA) rules out monetization, the MIT license covers only the code, and decide a plan if Motion Twin or Eternaltwin objects and how to credit them.
