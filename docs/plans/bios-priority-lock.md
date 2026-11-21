# BIOS CPU Priority and Crew Lock (plan)

2026-11-21. Status: **Not built** (fully answered). Numbers and behavior extracted from upstream eMush via `npm run emush`, with all design decisions confirmed by the owner on 2026-11-21.

## What eMush does

### CPU priority (`cpuPriority`, starts at `none`)

- **Values:** `none`, `astronavigation`, `projects`, `research`.
- **Who and where:** changed at the BIOS terminal (for us, by the NERON Admin via `set_bios`). It costs 0 AP and always succeeds.
- **Limit:** each player can change it once per day. In eMush, a hidden player status (`CHANGED_CPU_PRIORITY`) with 1 charge is removed when the day changes. A player with NERON's Only Friend (`neron_only_friend`) never gets that status, so they can change it as often as they like.
- **Astronavigation:** gives a ship status that makes `analyze_planet` reveal 1 more sector. On top of that, each living Only Friend player adds a 33% roll for another sector.
- **Projects / research:** in `Player.php` (`getScalableEfficiencyForProject` → `getEfficiencyWithCpuPriorityBonus`), the contributor's scalable base efficiency before the `1.5×` max calculation gets a bonus of `(number of living Only Friend players + 1) × 1`, so `+1` with no Only Friend. Only `astronavigation` uses a ship status; `projects` and `research` check NERON's priority directly. PILGRED is never boosted by CPU priority.
- **NERON depression:** sets it to a uniform random value other than the current one.

### Crew lock (`crewLock`, starts at `piloting`)

- **Values:** `piloting`, `projects`, `research`. Set at the BIOS terminal for 0 AP, with no daily limit.
- **Who is allowed through (`NeronCrewLockValidator.php` & `EquipmentEnum.php`):**
  - `piloting`: requires Pilot (`pilot`) or working Patrolship Keys (`spaceship_keys`). Covers patrol ships, the Pasiphae, and the Icarus (`Takeoff` and `TakeoffToPlanet`).
  - `projects`: requires Conceptor (our Designer, `designer`). Covers `NERON_CORE` and `AUXILIARY_TERMINAL` (not PILGRED or the Super Calculator).
  - `research`: requires Biologist (`biologist`) or Medic (`medic`). Covers `RESEARCH_LABORATORY` (our `RESEARCH_LAB`).
- **When someone else tries:** the action is refused before any AP is spent, and only that player sees why.
- **NERON depression:** sets it to a uniform random value other than the current one.

---

## Decisions (owner, 2026-11-21)

1. **Project and research CPU priority bonus (`+1` on `tokenBase`):**
   - When `state.bios.cpu_priority` matches the work (`"projects"` for NERON projects, `"research"` for lab research; never PILGRED), add `+1` (`config.bios.cpuPriorityBonus = 1`) to `tokenBase` in `shared/src/relay.ts`.
   - Because `tokenBase` is the scalable base `g` before `rolled(g, roll)` / `min + (min >> 1)`, `min` gains `+1` and `max` becomes `min + floor(min / 2)` (e.g. an unskilled first contribution goes from base `6` / range `6–9%` to base `7` / range `7–10%`), matching eMush.
   - Update the 2026-10-27 note in `docs/rules/rules-design.md` ("NERON project skill bonus") to reflect that the BIOS CPU-priority boost is now included (leaving out per-project `mod` and NERON's Only Friend).

2. **Crew lock gates the work and launch actions, not terminal `access`:**
   - Rather than blocking `access` on `NERON_CORE` or `RESEARCH_LAB`, the locks gate the work/launch actions so any crew member can still open the terminal windows to inspect progress:
     - `crew_lock === "piloting"`: gates `takeoff` (`shared/src/actions/takeoff.ts`, patrol ships and the Pasiphae) and `icarus_takeoff` (`shared/src/actions/icarus_takeoff.ts`) on `hasSkill(player, "pilot")` (or `freeHacking`). `land` and `land_on_planet` while already airborne stay ungated so a non-pilot in flight is never stranded if the lock changes.
     - `crew_lock === "projects"`: gates `project` (`shared/src/actions/project.ts`, on `NERON_CORE`, including online auxiliary terminals) on `hasSkill(player, "designer")` (or `freeHacking`). `coup` and `become_genius` are unaffected.
     - `crew_lock === "research"`: gates `research` and `spoil_research` (`shared/src/actions/research.ts`, `shared/src/actions/spoil_research.ts`) on `hasSkill(player, "biologist") || hasSkill(player, "medic") || hasSkill(player, "skilful")` (Polyvalent counts as Biologist, as on eMushpedia's Finola page; or `freeHacking`). `contaminate` is unaffected.

3. **Visibility and logs:**
   - Changing either `cpu_priority` or `crew_lock` via `set_bios` writes a private log line to the actor only (`logPrivate`), matching the existing BIOS switches, and stays unrecorded in action history (`recorded = false`).
   - `PlayerView.cpuPriority` (`CpuPriority | null`, sent to all living players, `null` for dead players; decided 2026-11-10 in `docs/rules/rules-design.md`) exposes the current CPU priority ship-wide.
   - `crew_lock` stays inside `PlayerView.bios` (visible only to living players in a room with a BIOS terminal, alongside `actopi`, `death_announcements`, `plasma_shield`, and `cpu_priority`).
   - `PlayerState.cpuPriorityChangedToday` (`boolean`) tracks the once-per-day per-player limit on changing CPU priority, cleared when the day changes, and sent only on `PlayerView.you` (listed in `shared/tests/leakFields.ts`).

4. **Scope (deferred items and skills):**
   - **Patrolship Keys (`spaceship_keys`)** and **Depress NERON (`nerondepress`)** are both out of scope for this plan and deferred to their own future tasks.
   - **NERON's Only Friend (`neron_only_friend`)** exemptions and bonuses (extra 33% sector rolls, larger project/research bonus, daily-limit exemption) are left out until that skill is built.

---

## Phases

### Phase 1: State, `set_bios`, normalization, and BIOS terminal window

- **`shared/src/bios.ts`**:
  - Define `CPU_PRIORITIES = ["none", "astronavigation", "projects", "research"] as const` (`CpuPriority`, default `"none"`) and `CREW_LOCKS = ["piloting", "projects", "research"] as const` (`CrewLock`, default `"piloting"`), with type guards `isCpuPriority` and `isCrewLock`.
  - Add `cpu_priority: CpuPriority` and `crew_lock: CrewLock` to `BiosState` and `newBios()`.
- **`shared/src/types/` & `shared/src/rules.ts`**:
  - Add `cpuPriorityChangedToday: boolean` to `PlayerState` (starts `false` in `newPlayer`, reset to `false` on day change in `rules.ts`, kept on `YouView`, stripped from `OtherPlayerView`).
  - Add `cpuPriority: CpuPriority | null` to `PlayerView` (`state.bios.cpu_priority` for living viewers, `null` for dead viewers).
- **`shared/src/actions/set_bios.ts`**:
  - Support setting `cpu_priority` to any `CpuPriority` and `crew_lock` to any `CrewLock` alongside the boolean `BIOS_OPTIONS`.
  - Refuse a `cpu_priority` change when `player.cpuPriorityChangedToday` is `true` (e.g. `"daily_limit"` / `COOLDOWN`); on apply, set `player.cpuPriorityChangedToday = true`.
  - Write a whole-sentence private log line per option and value (i18n rule 2).
- **`shared/src/normalizeState.ts`**:
  - Normalize `bios.cpu_priority` (`added(bios, "cpu_priority", "none", ...)`), `bios.crew_lock` (`added(bios, "crew_lock", "piloting", ...)`), and `player.cpuPriorityChangedToday` (`added(p, "cpuPriorityChangedToday", false, ...)`). Because all three are additive fields with sensible in-progress defaults, no `STATE_VERSION` bump is needed (`#384`).
- **`web/src/hud/BiosTerminal.tsx` & locales (`en`, `fr`, `es`)**:
  - Render the CPU priority and crew lock selectors in `BiosTerminal.tsx`, in en/fr/es, and check both desktop and phone (`<1024px`) layouts.
- **Tests**:
  - Legality, daily limit on `cpu_priority` and its reset on `nextDay`, no daily limit on `crew_lock`, `shared/tests/leakFields.ts` / `shared/tests/leaks.test.ts`, and `shared/tests/protocol.test.ts` (`SAMPLES`).

### Phase 2: Piloting lock

- **`shared/src/patrol.ts` & `shared/src/expeditions.ts`**:
  - Gate `takeoff` (`shared/src/actions/takeoff.ts`, patrol ships and the Pasiphae) and `icarus_takeoff` (`shared/src/actions/icarus_takeoff.ts`) on `state.bios.crew_lock !== "piloting" || hasSkill(player, "pilot") || player.cheats.includes("freeHacking")`, in addition to `canFly(player)` (Gastroenteritis and Slight Nausea still ground humans).
  - Leave `land` and `land_on_planet` ungated so an airborne non-pilot can still land or set down if the lock changes back to `"piloting"`.
  - When `crew_lock !== "piloting"`, non-pilots can fly and the existing rough-manoeuvre roll (`cleanManoeuvreChance` in `shared/src/modifiers.ts`) fires for them.
- **Tests**:
  - Under the default `"piloting"` lock, only Pilots (or `freeHacking`) can `takeoff` or `icarus_takeoff`.
  - Under `"projects"` or `"research"` lock, non-pilots can launch patrol ships, the Pasiphae, and the Icarus.

### Phase 3: Projects and research locks & bots

- **`shared/src/actions/project.ts`**:
  - Gate `project` on `state.bios.crew_lock !== "projects" || hasSkill(player, "designer") || player.cheats.includes("freeHacking")`.
- **`shared/src/actions/research.ts`**:
  - Gate `research` (and `spoil_research`, which delegates to `research`) on `state.bios.crew_lock !== "research" || hasSkill(player, "biologist") || hasSkill(player, "medic") || hasSkill(player, "skilful") || player.cheats.includes("freeHacking")`.
- **Bots (`server/src/bots/`)**:
  - Update bot goals (`server/src/bots/goals/project.ts`, `research.ts`, `patrolShootHunters.ts`, `expeditionLaunch.ts`) so bots don't pick or loop on actions refused by the lock, while respecting architecture rule 5 (bots only read `PlayerView`; `view.bios` is only visible at the BIOS terminal, whereas `view.actions` shows what is legal in the terminal's room).
- **Tests**:
  - Projects lock blocks non-Designers from `project` and allows Designers (`coup` and `become_genius` unaffected).
  - Research lock blocks non-Biologist/Medic/Polyvalent from `research` and `spoil_research` and allows Biologist, Medic, and Polyvalent (`contaminate` unaffected).
  - Bots act legally under all three crew locks.

### Phase 4: CPU priority effects

- **Astronavigation (`shared/src/modifiers.ts`)**:
  - In `analysisSectors(state, player)`, add `state.config.bios.astroExtraSectors` (`1`) when `state.bios.cpu_priority === "astronavigation"`. Stacks with Astrophysicist, Quantum Sensors, and deep analysis in orbit.
- **Projects and research (`shared/src/relay.ts`, `shared/src/relayView.ts`, `shared/src/actions/project.ts`, `shared/src/actions/research.ts`)**:
  - Add `bonus = 0` (or pass `state.config.bios.cpuPriorityBonus` when `state.bios.cpu_priority` matches `"projects"` or `"research"`) into `tokenBase` / `makeToken` / `relayGainRange` / `contributionGain`.
  - PILGRED (`repair_pilgred.ts`) passes `0`.
- **Docs**:
  - Update `docs/rules/rules-design.md` (including the 2026-10-27 note on line 127), `docs/rules/implemented-rules.md`, `docs/README.md`, and append an entry to `docs/process/ai-workflow.md`.
- **Tests**:
  - `analyze_planet` reveals `+1` sector under `"astronavigation"` priority and stacks with Astrophysicist, Quantum Sensors, and deep analysis.
  - Project and research contributions gain `+1` on `tokenBase` (and updated `min`/`max` range in `relayView`) when `cpu_priority` matches, and PILGRED is unaffected.

## Open questions

None left.
