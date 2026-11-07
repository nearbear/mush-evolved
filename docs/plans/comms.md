# Communication center (plan)

Status: **done.** Built 2026-10-21; travel and leaving orbit end open rebel calls since 2026-11-07. `docs/rules/implemented-rules.md` ("Communication center") is the authority on what the code does. The 2026-10-21 answers below supersede decisions 2, 4 and 5 where they differ. What is left is in GitHub issues (see the end).

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

## Built as

Where the build differs from the first draft of this plan (which is no longer kept here):

- All four actions are private, the Sol link included: only the actor gets a log line. The only public signal is the link status (`PlayerView.comms.linked`) and NERON's rebel call announcement in global chat while the link is up.
- Nothing per-player is stored. Rebel progress, the Sol chance, Xyloph entries left and NERON progress are ship-wide, in `GameState.comms`, and go read-only to anyone alive in the room with the terminal (`comms.terminal`). Which Xyloph entries were drawn is never sent.
- The Xyloph items now work through other systems: skill books (`read_book`), blueprints (`build`), and the genome disk and Mush sample as research ingredients. Zong Chun's ghost stands in for Chun at the researches that need her.

## Left, in issues

- General announcement, the Comms Officer's broadcast: [#393](https://github.com/nearbear/mush2/issues/393).
- Finola's lost analysis printout: [#394](https://github.com/nearbear/mush2/issues/394).
- Merchant trades: [#143](https://github.com/nearbear/mush2/issues/143).
- Comms triumphs (Kivanç for Paola, Wolf, Eleesha's rebel bases): [#354](https://github.com/nearbear/mush2/issues/354).
- Cygni's patrol ship damage +1 is built (owner, 2026-11-07). [#173](https://github.com/nearbear/mush2/issues/173) (a blaster blueprint for Cygni) stays open.
- Centauri's blaster bonus on expeditions: [#358](https://github.com/nearbear/mush2/issues/358).
