import { describe, expect, it } from "vitest";
import { actionVisibility } from "../src/actions.ts";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { killPlayer } from "../src/death.ts";
import { analysisSectors } from "../src/modifiers.ts";
import { offeredProjects } from "../src/projectEffects.ts";
import { PROJECT_COMPLETE, projectProgressConfig } from "../src/projects.ts";
import { parseGameMessage } from "../src/protocol.ts";
import { tokenBase } from "../src/relay.ts";
import { RESEARCH_COMPLETE, RESEARCH_IDS, RESEARCH_REQUIRES, RESEARCH_SKILLS, researchProgressConfig } from "../src/research.ts";
import { applyAction, createGame, viewFor } from "../src/rules.ts";
import type { BiosOption, CpuPriority, CrewLock } from "../src/bios.ts";
import type { Action, GameState } from "../src/types.ts";
import { clone, costOf, makeSeats, must, nextDay, noHunters, noIncidents, offered, player } from "./support.ts";

const TERMINAL = "NEXUS_ROOM:NERON_BIOS_TERM";
const set = (option: BiosOption, value: boolean): Action => ({ type: "set_bios", equipment: TERMINAL, option, value });
const setCpu = (value: CpuPriority): Action => ({ type: "set_bios", equipment: TERMINAL, option: "cpu_priority", value });
const setLock = (value: CrewLock): Action => ({ type: "set_bios", equipment: TERMINAL, option: "crew_lock", value });

/** Three players in the Nexus; p0 is the NERON Admin. */
function ship(): GameState {
  const s = createGame(makeSeats(3), noIncidents(noHunters(DEFAULT_CONFIG)), 7);
  for (const p of s.players) p.room = "NEXUS_ROOM";
  s.titles.neron_admin = "p0";
  return s;
}

const biosOffers = (s: GameState, id: string) => offered(s, id).filter((a) => a.type === "set_bios");

describe("NERON's BIOS", () => {
  it("starts with death announcements on, ACTOPI and plasma shield off, CPU priority none, crew lock piloting, and changing is free and private", () => {
    const s = ship();
    expect(s.bios).toEqual({
      actopi: false,
      death_announcements: true,
      plasma_shield: false,
      cpu_priority: "none",
      crew_lock: "piloting",
    });
    expect(costOf(s, "p0", set("death_announcements", false))).toEqual({ ap: 0, mp: 0 });
    expect(costOf(s, "p0", setCpu("projects"))).toEqual({ ap: 0, mp: 0 });
    expect(costOf(s, "p0", setLock("research"))).toEqual({ ap: 0, mp: 0 });
    expect(actionVisibility("set_bios")).toBe("private");
  });

  it("parses the action and rejects malformed ones", () => {
    const action = set("death_announcements", false);
    expect(parseGameMessage(JSON.stringify({ type: "action", action }))).toEqual({ type: "action", action });
    expect(parseGameMessage(JSON.stringify({ type: "action", action: setCpu("astronavigation") }))).toEqual({
      type: "action",
      action: setCpu("astronavigation"),
    });
    expect(parseGameMessage(JSON.stringify({ type: "action", action: setLock("projects") }))).toEqual({
      type: "action",
      action: setLock("projects"),
    });
    expect(parseGameMessage(JSON.stringify({ type: "action", action: { ...action, option: "self_destruct" } }))).toBeNull();
    expect(parseGameMessage(JSON.stringify({ type: "action", action: { ...action, value: "off" } }))).toBeNull();
    expect(parseGameMessage(JSON.stringify({ type: "action", action: { type: "set_bios", equipment: TERMINAL, option: "cpu_priority", value: true } }))).toBeNull();
    expect(parseGameMessage(JSON.stringify({ type: "action", action: { type: "set_bios", equipment: TERMINAL, option: "cpu_priority", value: "piloting" } }))).toBeNull();
    expect(parseGameMessage(JSON.stringify({ type: "action", action: { type: "set_bios", equipment: TERMINAL, option: "crew_lock", value: "none" } }))).toBeNull();
  });

  it("offers the NERON Admin the opposite of each unlocked switch and the other values of CPU priority and crew lock", () => {
    const s = ship();
    // ACTOPI is locked until WHOS_WHO research completes (owner, 2026-11-24).
    expect(biosOffers(s, "p0")).toEqual([
      set("death_announcements", false),
      set("plasma_shield", true),
      setCpu("astronavigation"),
      setCpu("projects"),
      setCpu("research"),
      setLock("projects"),
      setLock("research"),
    ]);
    const before = clone(s);
    expect(applyAction(s, "p0", set("actopi", true))).toEqual({ ok: false, error: "illegal_action" });
    expect(s).toEqual(before);

    // Once WHOS_WHO is complete, ACTOPI is offered and can be toggled.
    s.research.WHOS_WHO = RESEARCH_COMPLETE;
    s.bios.actopi = true;
    expect(biosOffers(s, "p0")).toEqual([
      set("actopi", false),
      set("death_announcements", false),
      set("plasma_shield", true),
      setCpu("astronavigation"),
      setCpu("projects"),
      setCpu("research"),
      setLock("projects"),
      setLock("research"),
    ]);
    s.bios.actopi = false;
    s.bios.cpu_priority = "projects";
    s.bios.crew_lock = "research";
    expect(biosOffers(s, "p0")).toEqual([
      set("actopi", true),
      set("death_announcements", false),
      set("plasma_shield", true),
      setCpu("none"),
      setCpu("astronavigation"),
      setCpu("research"),
      setLock("piloting"),
      setLock("projects"),
    ]);
  });

  it("only the NERON Admin can switch, Mush included; a vacant title locks it", () => {
    const s = ship();
    s.research.WHOS_WHO = RESEARCH_COMPLETE;
    s.bios.actopi = true;
    expect(biosOffers(s, "p1")).toEqual([]);
    expect(applyAction(s, "p1", set("actopi", false)).ok).toBe(false);
    expect(applyAction(s, "p1", setCpu("projects")).ok).toBe(false);
    expect(applyAction(s, "p1", setLock("projects")).ok).toBe(false);
    player(s, "p0").role = "mush";
    expect(must(applyAction(s, "p0", set("actopi", false))).bios.actopi).toBe(false);
    s.titles.neron_admin = null;
    expect(biosOffers(s, "p0")).toEqual([]);
  });

  it("needs the BIOS terminal in the room", () => {
    const s = ship();
    player(s, "p0").room = "REFECTORY";
    expect(biosOffers(s, "p0")).toEqual([]);
    expect(applyAction(s, "p0", set("actopi", false)).ok).toBe(false);
  });

  it("refuses setting a value it already has, leaving state unchanged", () => {
    const s = ship();
    const before = clone(s);
    expect(applyAction(s, "p0", set("actopi", true)).ok).toBe(false);
    expect(applyAction(s, "p0", setCpu("none")).ok).toBe(false);
    expect(applyAction(s, "p0", setLock("piloting")).ok).toBe(false);
    expect(s).toEqual(before);
  });

  it("switching logs a line only the actor sees", () => {
    const s = must(applyAction(ship(), "p0", set("death_announcements", false)));
    expect(s.bios.death_announcements).toBe(false);
    expect(s.log.at(-1)).toMatchObject({ key: "biosDeathsOff", visibleTo: ["p0"] });
    expect(viewFor(s, "p1").log.some((e) => e.key.startsWith("bios"))).toBe(false);
    const back = must(applyAction(s, "p0", set("death_announcements", true)));
    expect(back.log.at(-1)).toMatchObject({ key: "biosDeathsOn", visibleTo: ["p0"] });
  });

  it("limits CPU priority changes to once per player per day, resets on nextDay, and logs privately", () => {
    const s = must(applyAction(ship(), "p0", setCpu("astronavigation")));
    expect(s.bios.cpu_priority).toBe("astronavigation");
    expect(player(s, "p0").cpuPriorityChangedToday).toBe(true);
    expect(s.log.at(-1)).toMatchObject({ key: "biosCpuAstronavigation", visibleTo: ["p0"] });
    expect(viewFor(s, "p1").log.some((e) => e.key.startsWith("bios"))).toBe(false);

    // Second change the same day is refused, leaving state unchanged; shown disabled in view.actions.
    const before = clone(s);
    expect(applyAction(s, "p0", setCpu("projects")).ok).toBe(false);
    expect(s).toEqual(before);
    expect(biosOffers(s, "p0").some((a) => a.option === "cpu_priority")).toBe(false);
    const blocked = viewFor(s, "p0").actions.filter((o) => o.action.type === "set_bios" && o.action.option === "cpu_priority");
    expect(blocked).toHaveLength(3);
    expect(blocked.every((o) => o.lacks[0] === "capacity")).toBe(true);

    // Limit is per-player: another player who becomes NERON Admin today can still change it once.
    s.titles.neron_admin = "p1";
    const s2 = must(applyAction(s, "p1", setCpu("projects")));
    expect(s2.bios.cpu_priority).toBe("projects");
    expect(s2.log.at(-1)).toMatchObject({ key: "biosCpuProjects", visibleTo: ["p1"] });
    expect(player(s2, "p1").cpuPriorityChangedToday).toBe(true);

    // Next day resets the limit for everyone.
    s2.titles.neron_admin = "p0";
    const tomorrow = nextDay(s2);
    expect(player(tomorrow, "p0").cpuPriorityChangedToday).toBe(false);
    expect(player(tomorrow, "p1").cpuPriorityChangedToday).toBe(false);
    const s3 = must(applyAction(tomorrow, "p0", setCpu("research")));
    expect(s3.bios.cpu_priority).toBe("research");
    expect(s3.log.at(-1)).toMatchObject({ key: "biosCpuResearch", visibleTo: ["p0"] });
    const nextTomorrow = nextDay(s3);
    const s4 = must(applyAction(nextTomorrow, "p0", setCpu("none")));
    expect(s4.bios.cpu_priority).toBe("none");
    expect(s4.log.at(-1)).toMatchObject({ key: "biosCpuNone", visibleTo: ["p0"] });
  });

  it("allows changing crew lock without a daily limit and logs privately", () => {
    const s1 = must(applyAction(ship(), "p0", setLock("projects")));
    expect(s1.bios.crew_lock).toBe("projects");
    expect(s1.log.at(-1)).toMatchObject({ key: "biosLockProjects", visibleTo: ["p0"] });
    expect(viewFor(s1, "p1").log.some((e) => e.key.startsWith("bios"))).toBe(false);

    const s2 = must(applyAction(s1, "p0", setLock("research")));
    expect(s2.bios.crew_lock).toBe("research");
    expect(s2.log.at(-1)).toMatchObject({ key: "biosLockResearch", visibleTo: ["p0"] });

    const s3 = must(applyAction(s2, "p0", setLock("piloting")));
    expect(s3.bios.crew_lock).toBe("piloting");
    expect(s3.log.at(-1)).toMatchObject({ key: "biosLockPiloting", visibleTo: ["p0"] });
  });

  it("evicts unqualified occupants from locked terminals when crew lock changes", () => {
    const s = ship();
    // p0 at BIOS, p1 (non-Designer) at NERON_CORE, p2 (Designer) at NERON_CORE.
    player(s, "p2").skills = ["designer"];
    let cur = must(applyAction(s, "p0", { type: "access", equipment: TERMINAL }));
    cur = must(applyAction(cur, "p1", { type: "access", equipment: "NEXUS_ROOM:NERON_CORE" }));
    cur = must(applyAction(cur, "p2", { type: "access", equipment: "NEXUS_ROOM:NERON_CORE" }));
    expect(player(cur, "p1").spot?.kind).toBe("occupancy");
    expect(player(cur, "p2").spot?.kind).toBe("occupancy");

    const locked = must(applyAction(cur, "p0", setLock("projects")));
    expect(player(locked, "p0").spot?.kind).toBe("occupancy");
    expect(player(locked, "p1").spot).toBeUndefined();
    expect(player(locked, "p2").spot?.kind).toBe("occupancy");
  });

  it("switching ACTOPI off hides who is in the other rooms", () => {
    const s = ship();
    s.research.WHOS_WHO = RESEARCH_COMPLETE;
    s.bios.actopi = true;
    player(s, "p2").room = "REFECTORY";
    expect(viewFor(s, "p1").unidentified).toEqual([]);
    const off = must(applyAction(s, "p0", set("actopi", false)));
    expect(viewFor(off, "p1").unidentified).toEqual(["REFECTORY"]);
    expect(viewFor(off, "p1").players.find((o) => o.id === "p2")).not.toHaveProperty("room");
  });

  it("with death announcements off, a death posts no global message but still logs in the room", () => {
    const s = must(applyAction(ship(), "p0", set("death_announcements", false)));
    killPlayer(s, player(s, "p1"), "injury");
    expect(s.chat.some((m) => m.system?.key === "diedHuman" || m.system?.key === "diedMush")).toBe(false);
    expect(s.log.find((e) => e.key === "died")).toMatchObject({ room: "NEXUS_ROOM", visibleTo: "all" });
    s.bios.death_announcements = true;
    killPlayer(s, player(s, "p2"), "injury");
    expect(s.chat.filter((m) => m.system?.key === "diedHuman" || m.system?.key === "diedMush")).toHaveLength(1);
  });

  it("sends full bios only to the living at a BIOS terminal, cpuPriority to all living players, and cpuPriorityChangedToday only to its owner", () => {
    const s = must(applyAction(ship(), "p0", setCpu("projects")));
    expect(viewFor(s, "p1").bios).toEqual({
      actopi: false,
      death_announcements: true,
      plasma_shield: false,
      cpu_priority: "projects",
      crew_lock: "piloting",
    });
    expect(viewFor(s, "p1").cpuPriority).toBe("projects");

    // Outside the Nexus: bios is null, but cpuPriority is still visible ship-wide.
    player(s, "p1").room = "REFECTORY";
    expect(viewFor(s, "p1").bios).toBeNull();
    expect(viewFor(s, "p1").cpuPriority).toBe("projects");

    // Dead players see neither bios nor cpuPriority.
    killPlayer(s, player(s, "p2"), "injury");
    expect(viewFor(s, "p2").bios).toBeNull();
    expect(viewFor(s, "p2").cpuPriority).toBeNull();

    // cpuPriorityChangedToday appears only on your own view, never on OtherPlayerView.
    const p0Json = JSON.stringify(viewFor(s, "p0"));
    expect(p0Json.match(/"cpuPriorityChangedToday"/g)).toHaveLength(1);
    expect(viewFor(s, "p0").you.cpuPriorityChangedToday).toBe(true);
    const p1Json = JSON.stringify(viewFor(s, "p1"));
    expect(p1Json.match(/"cpuPriorityChangedToday"/g)).toHaveLength(1);
    expect(viewFor(s, "p1").you.cpuPriorityChangedToday).toBe(false);
  });

  describe("CPU priority effects (phase 4)", () => {
    it("pins the confirmed BIOS CPU priority config numbers", () => {
      expect([DEFAULT_CONFIG.bios.astroExtraSectors, DEFAULT_CONFIG.bios.cpuPriorityBonus]).toEqual([1, 1]);
    });

    it("astronavigation reveals +1 sector on analyze_planet and stacks with Astrophysicist, Quantum Sensors, and deep analysis", () => {
      const mkPlanet = (id: string) =>
        ({
          id,
          name: "Astra",
          position: { direction: "north", distance: 2 },
          sectors: ["FOREST", "MOUNTAIN", "SWAMP", "DESERT", "OCEAN", "HYDROCARBON"].map((tag) => ({ tag, known: false })),
        }) as never;

      const s = ship();
      for (const p of s.players) p.room = "COMMAND_CENTER";
      const astro = "COMMAND_CENTER:ASTRO_MODULE";
      s.planets.p0 = [mkPlanet("pl-0")];

      // Non-astronavigation priorities add nothing.
      for (const priority of ["none", "projects", "research"] as const) {
        s.bios.cpu_priority = priority;
        expect(analysisSectors(s, player(s, "p0"))).toBe(1);
      }

      // Astronavigation adds +1 sector (2 total for an unskilled player).
      s.bios.cpu_priority = "astronavigation";
      expect(analysisSectors(s, player(s, "p0"))).toBe(1 + s.config.bios.astroExtraSectors);
      const afterBasic = must(applyAction(s, "p0", { type: "analyze_planet", equipment: astro, planet: "pl-0" }));
      expect(afterBasic.planets.p0![0]!.sectors.filter((x) => x.known)).toHaveLength(1 + s.config.bios.astroExtraSectors);

      // Stacks with Astrophysicist, Quantum Sensors, and deep analysis in orbit (1 + 1 + 1 + 1 + 1 = 5).
      s.planets.p1 = [mkPlanet("pl-1")];
      player(s, "p1").skills.push("astrophysician");
      s.projects.QUANTUM_SENSORS = PROJECT_COMPLETE;
      s.navigation.orbit = "pl-1";
      const expectedTotal =
        1 +
        s.config.astrophysicist.extraSectors +
        s.config.project.quantumSensors.extraSectors +
        s.config.bios.astroExtraSectors +
        s.config.astro.analyze.orbitExtraSectors;
      const afterStacked = must(applyAction(s, "p1", { type: "analyze_planet", equipment: astro, planet: "pl-1" }));
      expect(afterStacked.planets.p1![0]!.sectors.filter((x) => x.known)).toHaveLength(expectedTotal);
    });

    it("projects priority adds +1 to project tokenBase in relayView and when working on a project", () => {
      const s = ship();
      s.bios.crew_lock = "piloting";
      const core = "NEXUS_ROOM:NERON_CORE";
      const proj = offeredProjects(s)[0]!;
      const p0 = player(s, "p0");
      p0.skills = [];

      const unboostedBase = tokenBase(projectProgressConfig(s.config.project.progress, proj), p0, []);
      const boostedBase = unboostedBase + s.config.bios.cpuPriorityBonus;

      // Baseline (none) and non-matching priorities do not boost projects.
      for (const priority of ["none", "astronavigation", "research"] as const) {
        s.bios.cpu_priority = priority;
        expect(viewFor(s, "p0").relay.projects[proj]?.gain).toEqual({
          min: unboostedBase,
          max: unboostedBase + (unboostedBase >> 1),
        });
      }

      // Projects priority boosts both relayView gain range and actual rolled progress.
      s.bios.cpu_priority = "projects";
      expect(viewFor(s, "p0").relay.projects[proj]?.gain).toEqual({
        min: boostedBase,
        max: boostedBase + (boostedBase >> 1),
      });

      const gains = new Set<number>();
      for (let seed = 1; seed <= 40; seed++) {
        const trial = createGame(makeSeats(3), noIncidents(noHunters(DEFAULT_CONFIG)), seed);
        player(trial, "p0").room = "NEXUS_ROOM";
        player(trial, "p0").skills = [];
        trial.bios.cpu_priority = "projects";
        trial.projectDeck = [proj, ...trial.projectDeck.filter((id) => id !== proj)];
        const after = must(applyAction(trial, "p0", { type: "project", equipment: core, project: proj }));
        const gain = after.projects[proj] ?? 0;
        expect(gain).toBeGreaterThanOrEqual(boostedBase);
        expect(gain).toBeLessThanOrEqual(boostedBase + (boostedBase >> 1));
        gains.add(gain);
      }
      // Confirms the boosted top of the range is actually reachable.
      expect(gains.has(boostedBase + (boostedBase >> 1))).toBe(true);
    });

    it("research priority adds +1 to research tokenBase in relayView and on new research samples", () => {
      const s = ship();
      for (const p of s.players) p.room = "LABORATORY";
      const lab = "LABORATORY:RESEARCH_LAB";
      const research = RESEARCH_IDS.find((id) => !RESEARCH_REQUIRES[id])!;
      const p0 = player(s, "p0");
      const p1 = player(s, "p1");
      p0.skills = [];
      p1.skills = ["biologist"];

      const progressCfg = researchProgressConfig(s.config.research.progress, research);
      const unskilledBase = tokenBase(progressCfg, p0, RESEARCH_SKILLS);
      const skilledBase = tokenBase(progressCfg, p1, RESEARCH_SKILLS);
      const bonus = s.config.bios.cpuPriorityBonus;

      // Non-matching priorities give no boost.
      for (const priority of ["none", "astronavigation", "projects"] as const) {
        s.bios.cpu_priority = priority;
        expect(viewFor(s, "p0").relay.research[research]?.gain).toEqual({
          min: unskilledBase,
          max: unskilledBase + (unskilledBase >> 1),
        });
      }

      // Research priority boosts relayView for unskilled and skilled contributors, and stamps the sample's base.
      s.bios.cpu_priority = "research";
      expect(viewFor(s, "p0").relay.research[research]?.gain).toEqual({
        min: unskilledBase + bonus,
        max: unskilledBase + bonus + ((unskilledBase + bonus) >> 1),
      });
      expect(viewFor(s, "p1").relay.research[research]?.gain).toEqual({
        min: skilledBase + bonus,
        max: skilledBase + bonus + ((skilledBase + bonus) >> 1),
      });

      const after = must(applyAction(s, "p0", { type: "research", equipment: lab, research }));
      expect(after.relay.research[research]?.pending[0]?.base).toBe(unskilledBase + bonus);
    });

    it("PILGRED is never boosted by any CPU priority", () => {
      const s = ship();
      player(s, "p0").room = "MOTOR_ROOM";
      player(s, "p0").skills = [];
      const pilgredBase = tokenBase(s.config.pilgred.progress, player(s, "p0"), []);
      const expectedGain = { min: pilgredBase, max: pilgredBase + (pilgredBase >> 1) };

      for (const priority of ["none", "astronavigation", "projects", "research"] as const) {
        s.bios.cpu_priority = priority;
        expect(viewFor(s, "p0").relay.pilgred?.gain).toEqual(expectedGain);
        const after = must(applyAction(s, "p0", { type: "repair_pilgred", equipment: "MOTOR_ROOM:PILGRED" }));
        expect(after.pilgred.pool.tokens.at(-1)?.base).toBe(pilgredBase);
      }
    });
  });
});
