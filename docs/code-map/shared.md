# Code map: shared

Other packages import from `@mush2/shared` (`shared/src/index.ts`, the barrel). Inside `shared`, import types from `types.ts`.

**Engine**

- `rules.ts`: `createGame`, `newPlayer` and `startInventory` (also used by `joinShip`), `applyAction` (at once, no timing), `performAction` (its mutating core), `legalActions`, `viewFor`, `affordable` and `legalIn` (read a view's `actions`), `dayOf`, `setCheat`, `setActopiCheat`; private `advanceCycle` and `grantCarePoints`. `viewFor` is the single place hidden info is stripped.
- `actions.ts`: the action registry (`ACTIONS`), `ActionDef` / `ActionCost`. A new action is a file in `actions/` registered here.
- `actions/action.ts`: the `Action` base class (`getCandidates`, `validate`, `getCost`, `apply`, optional `getSuccessChance` and `fail`; `check` is `validate` then the price, never overridden).
- `blueprints.ts`: `BLUEPRINTS` recipes (ingredients and resulting equipment) and the `blueprint` item type name.
- `actions/<type>.ts`: one class per action: `accommodate` (+ `accept_accommodation`, `stop_accommodation`), `access`, `bond`, `build`, `check_combustion`, `consume`, `cook`, `express_cook`, `water`, `treat`, `sow`, `dismantle`, `dispense`, `examine`, `extract_spore`, `heal`, `install`, `jettison`, `lie_down` (+ `get_up`), `uninstall`, `move`, `pick_skill`, `read_book`, `self_disease` (development-only Self Disease), `project`, `repair_pilgred`, `return_to_sol`, `contact_sol`, `decode_rebel`, `contact_xyloph`, `update_neron`, `set_bios`, `scan_planet`, `analyze_planet`, `delete_planet`, `turret_attack`, `repair_hull`, `turn_ship`, `travel`, `leave_orbit`, `take_fuel` (+ `load_fuel`, `unload_fuel`, `return_fuel`; also exports `equipmentHere`), `take_oxygen` (+ `return_oxygen`), `punch`, `attack` (weapons), `ready`, `research`, `share` (`dtt`, `stt`), `shower`, `spike`, `body_transfer` (the Mush skill Transfer), `transfer` (`take`, `drop`).
- `modifiers.ts`: the modifier registry and its hooks (numeric ones go through `fold`; `moveCost` is the one place a move's price is computed).
- `modifiers/<id>.ts`: one file per modifier: `antic_perfume`, `caffeinomaniac`, `cold_disease` (1-in-3 chance to lose MP each cycle), `computer`, `pilot` (clean patrol-ship manoeuvres), `gunner`, `gunman` (Shoot points), `persistent` (`failureStreakMultiplier`), `space_tactics` (`crewWaveShrinkChance`), `polymath` (channels, Computer points and cap), `designer` (Designer points), `sprint`, `physicist` (PILGRED points), `botanic` (garden points), `creative`, `first_aid`, `expert` (+20% success, dirt and injury chances), `logistics` (AP gifts each cycle), `lying_down`, `immunity`, `mankind_only_hope` (a crew-wide `crewMoraleLoss` effect), `medic`, `pacifist` (a room cost effect), `sturdy`, `wheelchair` (no hooks; marks who can be pushed); `careSkill.ts` is the factory behind `first_aid`.
- `replay.ts`: `Input`, `GameSetup`, `applyInput` (the only entry point for changing a game), `replayGame`; `RecordedInput` (an input with its server time), `stampEntries` (the server's timestamps on new log and chat entries), and `rebuildGame` (the exact stored state from `setup` and the record, stamps included; #167).
- `spot.ts`: where you stand in your room: the free `walk` input, `standUp` (a public action gets you off a chair), `arrive` (in front of the door you came in by).
- `actionTarget.ts`: what an action is done to (`actionTarget`, which the client walks you up to), and `endsAccommodation` (a public action on equipment or another person ends a wheelchair push).
- `queue.ts`: timed actions: `queueAction`, `clearQueue`, `tick`, `nextDue` (when the server's alarm should fire); cancels a queued action whose modifier adjustment changed (`repriced`).
- `mycoalarm.ts`: the `myco_alarm` item, `ringMycoAlarms` (called by `performAction` for `spore`-tagged actions) and `dropMycoAlarms` (research yield).
- `research.ts`: `RESEARCH_IDS` (the researches with card art) and `RESEARCH_COMPLETE`.
- `planets.ts`: the Astro terminal's planets: `PLANET_TAGS` (weights, seek, max from the original), `generatePlanet` (the original's `getPlanet`, seeded), `pickSeekSector` (what an analysis reveals), `planetsOf`, `astroTerminalsHere`. Actions `scan_planet`, `analyze_planet`, `delete_planet` (docs/astro-plan.md).
- `botany.ts`: plants in hydropots: `isBotanistRole` (who sees sickness), `isPlanted`/`isEmptyPot`/`isFruit`, `potRoom`, `paidWithGardenPoint`, `plantView` (strips `sick`), `botanyCycle` and `botanyDay` (called from `advanceCycle`). Actions `water`, `treat`, `sow`.
- `navigation.ts`: steering at the Command terminal: `turned` (a quarter turn), `canSteer` (the Commander, through `hasTitleAccess`), `planetAt`. Actions `turn_ship`, `travel`, `leave_orbit`; state `GameState.navigation` (heading, orbited planet id).
- `pilgred.ts`: PILGRED's repair: `PILGRED_COMPLETE`, `PILGRED_SKILLS`, `pilgredGainRange` (the original's formula with the relay penalty), `rollPilgredGain`, `isPilgredRepaired`, `pilgredTerminalsHere`, `commandTerminalsHere`, `canReturnToSol`. Actions `repair_pilgred`, `return_to_sol`.
- `comms.ts`: the communication center: `REBEL_BASES` (call order), `XYLOPH_ENTRIES` (weights), `newComms`, `callNextRebel` / `commsCycle` (daily rebel calls), `solChance` (Radio Expert), `loseLink`, `rollRebelGain`, `rebelReached`, `rationApBonus` (Sirius), `noITrackieNeeded` (Luyten-Ceti), `drawXyloph` / `applyXyloph`, `advanceNeron`, `commsTerminalView`. Actions `contact_sol`, `decode_rebel`, `contact_xyloph`, `update_neron`.
- `hunters.ts`: hunters and turrets: `newHunters`, `startHunters` (at the game's start), `huntersCycle` (called from `advanceCycle`: hunter turns, turret recharge, shield regeneration, the wave pool and roll, hull 0), `damageHunter`, `huntersFollow` (from `travel` and `leave_orbit`), `huntersPerCyclePoints`, `turretsHere`/`allTurrets`/`turretCharges`, `rollRange`. Actions `turret_attack`, `repair_hull`; `ship.ts` has `damageShip` and `shieldAbsorbPercent`.
- `patrol.ts`: patrol ships and the Pasiphae (data and lookups only, so `config.ts` can import it): `PATROL_SHIPS`, `interfaceId`/`commandId`, `patrolRooms`/`patrolEquipment` (their door-less rooms in the config), `newPatrolShips`, `canFly` (Pilots), `dockedHere`, `shipAboard`. Actions `takeoff` (also exports `board` and `manoeuvre`, the clean-or-rough roll through `cleanManoeuvreChance`) and `land`; `modifiers/pilot.ts` (docs/patrol-plan.md).
- `bios.ts`: NERON's BIOS switches: `BIOS_OPTIONS` (`actopi`, `death_announcements`, `plasma_shield`), `newBios`, `biosTerminalsHere`, `canChangeBios` (NERON Admin). Action `set_bios`.
- `singlePlayer.ts`: single player (#59): `singlePlayerGame` (seats, config, the human forced Mush), `NEVER_BOTS`, `SINGLE_PLAYER_SEATS`.
- `preselection.ts`: pre-selection (`config.preselection`, `GameState.preselection`): `joinShip` (the server's `join` input), `preselectionDeadline`, `preselectionCycle` (called as each cycle begins), and `selectMush` (Mush, titles, the first rebel call, and the under-3-players stopgap).
- `victory.ts`: the game end: `winnerOnArrival` (the decided win rule on reaching Sol or Eden), `mushWinOnDeath`, and `endGame` (`phase` "ended", `winner`, `ending`).
- `projects.ts`: `PROJECT_IDS` (the original's 41 live NERON projects), `PROJECT_COMPLETE` and `PROJECT_STATUS`.
- `mind.ts`: minds and bodies: `bodyOf` (the body a seat plays; the server resolves every token through it), `swapMinds` (a Transfer), `acknowledgeTransfer` (the victim's pop-up input).
- `rng.ts`: the seeded RNG (its state is part of `GameState`): pair functions `nextFloat`, `nextInt`, `rollRange`, `shuffle` return `[value, next]`; the `roll`, `rollInt`, `rollFloat` helpers advance a `HasRng` holder (a `GameState`) in place, so a draw can't drop the next state.
- `helpers.ts`: `ActionResult`, `fail`, `clone`, `findPlayer`.

**Rule areas**

- `chat.ts`: chat storage, channels (`chatChannels` to post, `readChannels` to read), `sendChat`, threads under global chat (`createThread`), private channels, limits.
- `death.ts`: `damage` (the one way HP goes down) and `killPlayer`.
- `infection.ts`: `contaminate` (the one way contamination rises), conversion, `contaminationSeenBy`.
- `items.ts`: item types, containers, capacity and reach helpers, `produceItem`.
- `itemIds.ts`: dependency-light IDs used by item definitions and the default config.
- `equipment.ts`: room equipment types.
- `log.ts`: room log helpers (`logPublic`, `logPrivate`, `logSecret`, `logCovert`, `hasCamera`).
- `history.ts`: each body's action history (`recordAction`, called from `performAction`) and `revealHistory`, the private reveal lines Interrogate and Chitchat write.
- `resources.ts`: per-player skill point pools.
- `skills.ts`: the human skills, each character's pickable list (`CHARACTER_SKILLS`), `SKILL_SLOTS`, the Mush skills (`MUSH_SKILLS`, `MUSH_SKILL_SLOTS`), and `skillsOf`/`hasSkill` (picked skills, the book slot, and Mush skills).
- `titles.ts`: `TITLE_IDS`, each title's line (`SUCCESSION`), `successor` (pure), `assignTitles` (at creation) and `refreshTitles` (after a death).
- `statuses.ts`: stored and derived statuses.
- `adjustStats.ts`: capped morale changes and disease application; `addDisease` updates both the modifier and private status.
- `cheats.ts`: development cheats (issue #148), gated by `ALLOW_CHEATS`. Flag-only cheats are read where they apply: `instantActions` in `queue.ts`, `noRelayPenalty` in `pilgred.ts`, `freeHacking` in `titles.ts` (`bypassesTitles`), `anySkill` in `actions/pick_skill.ts`.

**Types, config, and data**

- `types.ts`: the small shared vocabulary; re-exports `types/`.
- `types/config.ts`: `GameConfig`, `MovementRules`, `Equipment`. Tuning is nested by feature (`config.punch.cost.ap`, `config.punch.effect.damage`, a [min, max] range).
- `types/player.ts`: `PlayerState`, `ResourceId`.
- `types/chat.ts`: channel and message types.
- `types/state.ts`: `GameState` (server-only).
- `types/view.ts`: `PlayerView`, `OtherPlayerView`, `ItemView`: the only game data a client or bot receives.
- `config.ts`: `DEFAULT_CONFIG` and `SEAT_COUNT`. The map comes from `@mush2/assets/derived/ship-rooms.json`.
- `protocol.ts`: wire message types and `parse*` validators for untrusted client input.
- `moderation.ts`: `moderateChat`, called by the server, not the rules; `moderateName`, called by `viewFor` for the end screen's names.
- `characters.ts`: cosmetic crew identities, no rules effect.
- `shipLayout.ts`: types for `Mush/derived/ship-art.json` and `ship-map.json` (`ShipLayout` is the two together) and `placedEquipment`.
- `actions/speech.ts`: the Leader's Fiery speech and the Motivator's Boring speech (room-wide morale and MP gifts; `PlayerState.boringToday`).
- `actions/interrogate.ts`: the Torturer's Interrogate (1 damage, reveals the target's last actions, one per missing HP; `interrogatedToday`).
- `actions/chitchat.ts`: Chitchat with a Confident (+2 morale, the Confident learns your last actions, one per point of their morale; `chitchatToday`).
- `actions/anathema.ts`: the Persecutor's Anathema (the Outcast status, `PlayerState.outcastBy`).
