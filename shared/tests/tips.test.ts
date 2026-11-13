import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, SHIP_ROOMS } from "../src/config.ts";
import { createGame, viewFor } from "../src/rules.ts";
import { doorCount, roomsWith } from "../src/situation.ts";
import { TIP_EAT_AFTER_CYCLES, TIP_HURT_HP, TIP_REST_AP, tipsFor, type TipId } from "../src/tips.ts";
import type { GameState } from "../src/types.ts";
import { makeSeats, player } from "./support.ts";

const config = { ...DEFAULT_CONFIG, mushCount: 1, startInventory: [], startItems: [] };

/** p0 in the Laboratory with full points and nothing wrong, so only the welcome tip applies. */
function ship(change: (s: GameState) => void = () => {}): GameState {
  const s = createGame(makeSeats(3), config, 3);
  const p = player(s, "p0");
  p.room = "LABORATORY";
  p.satiety = 3;
  p.satietyZeroSince = null;
  change(s);
  return s;
}
const tips = (s: GameState) => tipsFor(viewFor(s, "p0"));
const ids = (s: GameState): TipId[] => tips(s).map((t) => t.id);
const tip = (s: GameState, id: TipId) => tips(s).find((t) => t.id === id);

describe("tips", () => {
  it("shows only the welcome tip to someone with nothing wrong", () => {
    expect(ids(ship())).toEqual(["welcome"]);
  });

  it("mentions End cycle only where it is offered", () => {
    expect(tip(ship(), "welcome")!.endCycle).toBe(false);
    expect(tip(ship((s) => (s.config.manualCycles = true)), "welcome")!.endCycle).toBe(true);
  });

  it("shows none to the dead or once the game is over", () => {
    expect(ids(ship((s) => (player(s, "p0").alive = false)))).toEqual([]);
    expect(ids(ship((s) => (s.phase = "ended")))).toEqual([]);
  });

  it("points a tired player at the nearest bed, only at or under the AP line and out of bed", () => {
    const tired = ship((s) => (player(s, "p0").ap = TIP_REST_AP));
    const rest = tip(tired, "rest")!;
    const view = viewFor(tired, "p0");
    expect(rest.room).toBe(roomsWith(view, ["BED"])[0]);
    expect(rest.doors).toBe(doorCount(view, rest.room!));
    expect(tip(ship((s) => (player(s, "p0").ap = TIP_REST_AP + 1)), "rest")).toBeUndefined();
    expect(tip(ship((s) => Object.assign(player(s, "p0"), { ap: 0, lyingIn: "bed" })), "rest")).toBeUndefined();
  });

  it("explains AP-to-MP conversion when out of MP", () => {
    expect(tip(ship((s) => (player(s, "p0").mp = 0)), "noMp")).toEqual({ id: "noMp" });
    expect(tip(ship(), "noMp")).toBeUndefined();
  });

  it("sends the hungry, or long unfed, to the nearest food, but not the full", () => {
    const unfed = (cycles: number) => ship((s) => Object.assign(player(s, "p0"), { satiety: 0, satietyZeroSince: s.cycle - cycles }));
    expect(tip(unfed(TIP_EAT_AFTER_CYCLES), "eat")!.room).toBeDefined();
    expect(tip(unfed(TIP_EAT_AFTER_CYCLES - 1), "eat")).toBeUndefined();
    expect(tip(ship((s) => (player(s, "p0").satiety = 10)), "eat")).toBeUndefined();
  });

  it("sends the hurt to the Sick Bay, at or under the HP line", () => {
    expect(tip(ship((s) => (player(s, "p0").hp = TIP_HURT_HP)), "hurt")!.room).toBe("SICK_BAY");
    expect(tip(ship((s) => (player(s, "p0").hp = TIP_HURT_HP + 1)), "hurt")).toBeUndefined();
  });

  it("says where the shower is only once dirt refuses an action here", () => {
    // Dirty in the Laboratory, where research refuses dirty players.
    const dirty = ship((s) => player(s, "p0").statuses.push("dirty"));
    expect(viewFor(dirty, "p0").actions.some((o) => o.lacks.includes("clean"))).toBe(true);
    expect(tip(dirty, "dirty")!.room).toBe(roomsWith(viewFor(dirty, "p0"), ["SHOWER"])[0]);
    // Dirty in a room with no equipment, where nothing refuses it: no tip.
    const bare = SHIP_ROOMS.find((r) => r.equipment.length === 0)!.id;
    expect(tip(ship((s) => Object.assign(player(s, "p0"), { room: bare, statuses: ["dirty"] })), "dirty")).toBeUndefined();
  });

  it("points at the nearest turret while hunters attack, before every other tip", () => {
    const attacked = ship((s) => {
      s.hunters.list.push({ id: "h1", hp: 6, hitChance: 0.5, target: null, type: "hunter", countdown: null });
      player(s, "p0").hp = 1;
    });
    expect(ids(attacked).slice(0, 2)).toEqual(["hunters", "hurt"]);
    expect(tip(attacked, "hunters")!.room).toBeDefined();
  });

  it("names the room the player is in with 0 doors", () => {
    const here = ship((s) => Object.assign(player(s, "p0"), { room: "SICK_BAY", hp: 1 }));
    expect(tip(here, "hurt")).toEqual({ id: "hurt", room: "SICK_BAY", doors: 0 });
  });
});
