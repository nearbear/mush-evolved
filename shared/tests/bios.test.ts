import { describe, expect, it } from "vitest";
import { actionVisibility } from "../src/actions.ts";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { killPlayer } from "../src/death.ts";
import { parseGameMessage } from "../src/protocol.ts";
import { applyAction, createGame, viewFor } from "../src/rules.ts";
import type { BiosOption } from "../src/bios.ts";
import type { Action, GameState } from "../src/types.ts";
import { clone, costOf, makeSeats, must, offered, player } from "./support.ts";

const TERMINAL = "NEXUS_ROOM:NERON_BIOS_TERM";
const set = (option: BiosOption, value: boolean): Action => ({ type: "set_bios", equipment: TERMINAL, option, value });

/** Three players in the Nexus; p0 is the NERON Admin. */
function ship(): GameState {
  const s = createGame(makeSeats(3), DEFAULT_CONFIG, 7);
  for (const p of s.players) p.room = "NEXUS_ROOM";
  s.titles.neron_admin = "p0";
  return s;
}

const biosOffers = (s: GameState, id: string) => offered(s, id).filter((a) => a.type === "set_bios");

describe("NERON's BIOS", () => {
  it("starts with both options on, and switching is free and private", () => {
    const s = ship();
    expect(s.bios).toEqual({ actopi: true, death_announcements: true, plasma_shield: true });
    expect(costOf(s, "p0", set("actopi", false))).toEqual({ ap: 0, mp: 0 });
    expect(actionVisibility("set_bios")).toBe("private");
  });

  it("parses the action and rejects malformed ones", () => {
    const action = set("death_announcements", false);
    expect(parseGameMessage(JSON.stringify({ type: "action", action }))).toEqual({ type: "action", action });
    expect(parseGameMessage(JSON.stringify({ type: "action", action: { ...action, option: "self_destruct" } }))).toBeNull();
    expect(parseGameMessage(JSON.stringify({ type: "action", action: { ...action, value: "off" } }))).toBeNull();
  });

  it("offers the NERON Admin the opposite of each current value", () => {
    const s = ship();
    expect(biosOffers(s, "p0")).toEqual([set("actopi", false), set("death_announcements", false), set("plasma_shield", false)]);
    s.bios.actopi = false;
    expect(biosOffers(s, "p0")).toEqual([set("actopi", true), set("death_announcements", false), set("plasma_shield", false)]);
  });

  it("only the NERON Admin can switch, Mush included; a vacant title locks it", () => {
    const s = ship();
    expect(biosOffers(s, "p1")).toEqual([]);
    expect(applyAction(s, "p1", set("actopi", false)).ok).toBe(false);
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
    killPlayer(s, player(s, "p1"));
    expect(s.chat.some((m) => m.system?.key === "diedHuman" || m.system?.key === "diedMush")).toBe(false);
    expect(s.log.find((e) => e.key === "died")).toMatchObject({ room: "NEXUS_ROOM", visibleTo: "all" });
    s.bios.death_announcements = true;
    killPlayer(s, player(s, "p2"));
    expect(s.chat.filter((m) => m.system?.key === "diedHuman" || m.system?.key === "diedMush")).toHaveLength(1);
  });

  it("the settings go only to the living at a BIOS terminal", () => {
    const s = ship();
    expect(viewFor(s, "p1").bios).toEqual({ actopi: true, death_announcements: true, plasma_shield: true });
    player(s, "p1").room = "REFECTORY";
    expect(viewFor(s, "p1").bios).toBeNull();
    killPlayer(s, player(s, "p2"));
    expect(viewFor(s, "p2").bios).toBeNull();
  });
});
