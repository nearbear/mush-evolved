# Communication center (plan)

Status: **built 2026-10-21** (see `docs/implemented-rules.md`, "Communication center"). The 2026-10-21 answers below settle the open questions and supersede decisions 2, 4 and 5 where they differ.

## What the original gives us

The snapshot has the data but no server logic for these actions.

- **Actions** (`Mush/derived/data/DataAction/actions.json`, sector `Comm`), all 3 AP in the original:
  - `ESTABLISH_COM`: establish contact with Sol. Anyone can attempt it.
  - `DECODE_REBEL_SIGNAL`: target a rebel base. Gated on `HasTitle( COM_MANAGER )`.
  - `CONTACT_XYLOPH`: contact the Daedalus's home port. Gated on the comms officer title.
  - `NERON_UPDATE`: upgrade NERON; "once complete, lets a Project finish". Gated on the comms officer title.
  - Also `DAILY_ORDER` (the comms officer's general announcement, 0 AP) and `CLOSE_DEAL` (merchant trades, #143). Both are out of scope here.
- **Rebel bases** (`Data/rebel_center.json`, 6 live, each with `diff` 0 to 3): Wolf, Sirius (rations give +1 AP), Centauri (each blaster gives +1 power on expeditions), Kaladaan (+6 morale to the crew), Luyten-Ceti (no iTrackie needed for comms), Cygni (patrol ship damage +1, +3 morale to the crew; see #173 for a proposed blaster blueprint instead).
- **Xyloph database** (`Data/xyloph_database.json`, 12 live, drawn by `weight`): NOTHING (4), SNOW_CRASH (4, link lost), WIREFLESS_INFIDELITY (4, link lost and signal quality −20), MUSH_GENOME_DATA (8, spawns the Mush genome disk in the bridge), LOST_ANALYSIS (1, prints the crew's infection levels), NILS_CARLSSON_CONTACT (2), NERON_BOOST (12, NERON update +25%), KIVANC_TERZI_CONTACT (4, +100% on rebel decoding), COOK_BIBLE (4, cook apprentron), ZONG_CHUN_SAMPLE (8), SCHOOL_MANUALS (4, 2 random apprentrons), WORKSHOP_MANUALS (4, 3 random blueprints).
- **Skills already in `shared/src/skills.ts`** (no effects yet): `radio_expert` (double efficiency on Sol contact, +50% for crewmates in the same room) and `rebel` (doubled chance to contact the rebel bases).
- **Where:** the `COM_CENTER` terminal (`shared/src/equipment.ts`), which today only has the blank `access` window.

## Decisions (owner, 2026-10-19)

1. **Scope of this pass:** establish link with Sol, decode rebel signals, contact Xyloph, update NERON. Not the general announcement or merchant trades (#143).
2. **No title gate for now.** Every comms action is open to anyone; the comms officer gate is added when titles (#144) land.
3. **Sol link:** 2 AP, 4% chance, +4% per failed attempt (additive: 4, 8, 12, ...). The chance never goes down, even after a success.
4. **Visibility:** the link status is public. Everything else (decoding, Xyloph, NERON updates) is private: only the actor learns it, through a private log entry, and no one else gets a log line. A crew-wide effect (such as +6 morale) still happens, unexplained.
5. **Rebel decoding:** pick a base; each action adds 25% to that base; the reward fires at 100%. The cost wasn't restated (the option offered was 3 AP, with the Rebel skill giving +50% per action).
6. **Rewards:** implement only the effects that can be built today. The rest are recorded as reached with no effect yet, the way NERON projects are.

## Answers (owner, 2026-10-21)

- The link can be lost, and signal quality is the ship-wide Sol chance: Wireless infidelity takes 20 points off it, never below 4%. A plain loss keeps the chance.
- Titles exist now: only the Comms Officer decodes, contacts Xyloph and updates NERON. Anyone can try the Sol link. All three need the link. Like every Com center action, they need the actor clean; Mush can act.
- "Private" (decision 4) meant the room log. Anyone at the terminal sees its screen read-only.
- Rebel bases follow the eMush wiki: one base calls at Mush selection, then one a day in the same cycle, in data file order. Each call's window is rolled per base, 8 to 16 cycles. NERON announces a call in crew chat only while the link is up; a call that arrives during an outage stays decodable until it expires. A decode costs 2 AP or a Computer point and gains the average of two 1..40 draws. Rebel and Kivanç give +100% each, additive (x3 with both), replacing the earlier +50%. Progress is ship-wide and shown at the terminal.
- Xyloph: 2 AP, always succeeds, entries never repeat, and it is done once the table runs out. Every entry is built: the genome disk, Nils's Mush test strain, the cookbook and school manuals as skill books (random skills), the workshop manuals as blueprints, and Zong Chun's ghost recorded in state. Lost analysis is recorded only.
- NERON update: 2 AP, 25% per action, and it repeats. At 100% the version goes up and a random unfinished NERON project completes.
- Only the buildable rebel effects are built. Radio Expert is built.

## Open questions (all answered above)

1. **Can the link be lost?** Decision 3 says the chance never decreases, but not whether the link itself can drop. If it can, SNOW_CRASH and WIREFLESS_INFIDELITY drop it, and WIREFLESS's "signal quality −20" clashes with decision 3.
2. **Is the chance tracked per player or ship-wide?** And does "never decreases" mean it keeps growing after a success, or stays where it was?
3. **Rebel decoding cost**, and whether the Rebel skill's +50% is built now or only gets a modifier hook.
4. **Is rebel progress private?** Decision 4 makes decoding private, but progress on a base accumulates. Can another player see (or add to) a base someone else started? If progress is shared but hidden, players can advance a base without knowing it.
5. **Xyloph:** cost, whether it always succeeds, whether entries can repeat or are drawn without replacement, and what happens when the table runs out.
6. **NERON update:** cost, progress per action (25%, like research?), whether it repeats (versions), and what "lets a project finish" means here, since projects have no completion effects yet.
7. **Do the actions require the link?** In the original, decode, Xyloph and NERON update need an established link with Sol.
8. **Which rewards count as buildable.** A proposal to confirm, not a decision:
   - Rebels: Sirius (+1 AP from rations), Kaladaan (+6 morale to everyone), Luyten-Ceti (chat without an iTrackie), Cygni's +3 morale part. Wolf, Centauri and Cygni's patrol ship part are recorded only.
   - Xyloph: NOTHING, NERON_BOOST, WORKSHOP_MANUALS (blueprints exist), KIVANC_TERZI_CONTACT (affects decoding), and the link loss entries if the answer to 1 allows it. LOST_ANALYSIS reveals infection levels, so it needs its own visibility decision and a leak check. Genome disk, apprentrons, Nils and Zong Chun are recorded only.
9. **Who can act:** living and not dirty, Mush included (as for research and scanning)?
10. **Radio Expert:** build the skill's effect now, or only add the modifier hook (as was done for the Astro terminal)?

## Planned implementation (draft, pending the open questions)

- `shared/src/comms.ts`: rebel base and Xyloph tables (ids, weights, difficulty), copied into typed tables as `planets.ts` does, plus reward application for the buildable effects.
- State, in `GameState.comms` (not `PlayerState`, so `viewFor` can't copy private parts into views by accident): link established, Sol contact chance, per-base rebel progress, Xyloph entries unlocked, NERON update progress. Bump `STATE_VERSION`.
- Actions, one file each in `shared/src/actions/`: `contact_sol.ts` (`getSuccessChance` from `config.comms`, `fail` raises the chance), `decode_rebel.ts` (target a base), `contact_xyloph.ts` (weighted draw with the seeded RNG), `update_neron.ts`. Costs and odds in `config.comms`. Odds and progress go through modifier hooks, so Radio Expert, Rebel and Kivanç Terzi can attach.
- Logs: `logPublic` for the link (attempt or success, per decision 4), `logPrivate` for the rest. Strings through i18n (en/fr/es).
- `viewFor`: `PlayerView.comms` with the public link status, plus only what the viewer learned privately. Run `leak-check`.
- Web: the Com center's `TerminalDialog` gets the link status, the rebel base list with the actor's known progress, and the Xyloph and NERON buttons, from `view.actions` only. Works at 360px.
- Tests in `shared/tests/comms.test.ts`: pinned config numbers, chance growth, rebel progress and reward at 100%, the weighted Xyloph draw for a seed, each live reward, illegal actions leave state unchanged, and `viewFor` leak tests (another player's decode or Xyloph results never appear in your view).
- Record it in `docs/implemented-rules.md`, `docs/rules-design.md` ("Decisions received"), `docs/code-map/shared.md`, and `docs/ai-workflow.md` (append).
