import { describe, expect, it } from "vitest";
import { actionVisibility } from "../src/actions.ts";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { killPlayer } from "../src/death.ts";
import { parseGameMessage } from "../src/protocol.ts";
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
  it("starts with all switches on, CPU priority none, crew lock piloting, and changing is free and private", () => {
    const s = ship();
    expect(s.bios).toEqual({
      actopi: true,
      death_announcements: true,
      plasma_shield: true,
      cpu_priority: "none",
      crew_lock: "piloting",
    });
    expect(costOf(s, "p0", set("actopi", false))).toEqual({ ap: 0, mp: 0 });
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

  it("offers the NERON Admin the opposite of each switch and the other values of CPU priority and crew lock", () => {
    const s = ship();
    expect(biosOffers(s, "p0")).toEqual([
      set("actopi", false),
      set("death_announcements", false),
      set("plasma_shield", false),
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
      set("plasma_shield", false),
      setCpu("none"),
      setCpu("astronavigation"),
      setCpu("research"),
      setLock("piloting"),
      setLock("projects"),
    ]);
  });

  it("only the NERON Admin can switch, Mush included; a vacant title locks it", () => {
    const s = ship();
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

  it("switching ACTOPI off hides who is in the other rooms", () => {
    const s = ship();
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
      actopi: true,
      death_announcements: true,
      plasma_shield: true,
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
});
