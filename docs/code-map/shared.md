# Code map: shared

Other packages import from `@mush2/shared` (`shared/src/index.ts`, the barrel). Inside `shared`, import types from `types.ts`.

**Engine**

- `rules.ts`: `createGame`, `applyAction` (at once, no timing), `performAction` (its mutating core), `legalActions`, `viewFor`, `affordable` and `legalIn` (read a view's `actions`), `dayOf`, `setCheat`, `setActopiCheat`; private `advanceCycle` and `grantCarePoints`. `viewFor` is the single place hidden info is stripped.
- `actions.ts`: the action registry (`ACTIONS`), `visibleTargets`, `ActionDef` / `ActionCost`. A new action is a file in `actions/` registered here.
- `actions/action.ts`: the `Action` base class (`getCandidates`, `check`, `getCost`, `apply`, optional `getSuccessChance` and `fail`).
- `blueprints.ts`: `BLUEPRINTS` recipes (ingredients and resulting equipment) and the `blueprint` item type name.
- `actions/<type>.ts`: one class per action: `accommodate` (+ `accept_accommodation`, `stop_accommodation`), `access`, `bond`, `build`, `consume`, `cook`, `express_cook`, `dismantle`, `dispense`, `examine`, `extract_spore`, `heal`, `install`, `jettison`, `lie_down` (+ `get_up`), `uninstall`, `move`, `pick_skill`, `read_book`, `project`, `scan_planet`, `analyze_planet`, `delete_planet`, `punch`, `ready`, `research`, `share` (`dtt`, `stt`), `shower`, `spike`, `transfer` (`take`, `drop`).
- `modifiers.ts`: the modifier registry and its hooks (numeric ones go through `fold`; `moveCost` is the one place a move's price is computed).
- `modifiers/<id>.ts`: one file per modifier: `antic_perfume`, `caffeinomaniac`, `computer`, `creative`, `first_aid`, `lying_down`, `immunity`, `mankind_only_hope` (a crew-wide `crewMoraleLoss` effect), `medic`, `pacifist` (a room cost effect), `sturdy`, `wheelchair` (no hooks; marks who can be pushed); `careSkill.ts` is the factory behind `first_aid`.
- `replay.ts`: `Input`, `GameSetup`, `applyInput` (the only entry point for changing a game), `replayGame`.
- `spot.ts`: where you stand in your room: the free `walk` input, `standUp` (a public action gets you off a chair), `arrive` (in front of the door you came in by).
- `queue.ts`: timed actions: `queueAction`, `clearQueue`, `tick`, `nextDue` (when the server's alarm should fire); cancels a queued action whose modifier adjustment changed (`repriced`).
- `mycoalarm.ts`: the `myco_alarm` item, `ringMycoAlarms` (called by `performAction` for `spore`-tagged actions) and `dropMycoAlarms` (research yield).
- `research.ts`: `RESEARCH_IDS` (the researches with card art) and `RESEARCH_COMPLETE`.
- `planets.ts`: the Astro terminal's planets: `PLANET_TAGS` (weights, seek, max from the original), `generatePlanet` (the original's `getPlanet`, seeded), `pickSeekSector` (what an analysis reveals), `planetsOf`, `astroTerminalsHere`. Actions `scan_planet`, `analyze_planet`, `delete_planet` (docs/astro-plan.md).
- `projects.ts`: `PROJECT_IDS` (the original's 41 live NERON projects), `PROJECT_COMPLETE` and `PROJECT_STATUS`.
- `rng.ts`: the seeded RNG (its state is part of `GameState`).
- `helpers.ts`: `ActionResult`, `fail`, `clone`, `findPlayer`.

**Rule areas**

- `chat.ts`: chat storage, channels (`chatChannels` to post, `readChannels` to read), `sendChat`, threads under global chat (`createThread`), private channels, limits.
- `death.ts`: `damage` (the one way HP goes down) and `killPlayer`.
- `infection.ts`: `contaminate` (the one way contamination rises), conversion, `contaminationSeenBy`.
- `items.ts`: item types, containers, capacity and reach helpers, `produceItem`.
- `equipment.ts`: room equipment types.
- `log.ts`: room log helpers (`logPublic`, `logPrivate`, `logSecret`, `logCovert`, `hasCamera`).
- `resources.ts`: per-player skill point pools.
- `skills.ts`: the pickable human skills, `SKILL_SLOTS`, and `skillsOf`/`hasSkill` (picked skills plus the book slot).
- `titles.ts`: `TITLE_IDS`, each title's line (`SUCCESSION`), `successor` (pure), `assignTitles` (at creation) and `refreshTitles` (after a death).
- `statuses.ts`: stored and derived statuses.
- `cheats.ts`: development cheats (issue #148), gated by `ALLOW_CHEATS`.

**Types, config, and data**

- `types.ts`: the small shared vocabulary; re-exports `types/`.
- `types/config.ts`: `GameConfig`, `MovementRules`, `Equipment`. Tuning is nested by feature (`config.punch.cost.ap`, `config.punch.effect.damage`).
- `types/player.ts`: `PlayerState`, `ResourceId`.
- `types/chat.ts`: channel and message types.
- `types/state.ts`: `GameState` (server-only).
- `types/view.ts`: `PlayerView`, `OtherPlayerView`, `ItemView`: the only game data a client or bot receives.
- `config.ts`: `DEFAULT_CONFIG` and `SEAT_COUNT`. The map comes from `@mush2/assets/derived/ship-rooms.json`.
- `protocol.ts`: wire message types and `parse*` validators for untrusted client input.
- `moderation.ts`: `moderateChat`; called by the server, not the rules.
- `characters.ts`: cosmetic crew identities, no rules effect.
- `shipLayout.ts`: types for `Mush/derived/ship-layout.json` and `placedEquipment`.
