import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { OXYGEN_CAPSULE_ITEM, capacity, itemsIn } from "../src/items.ts";
import { parseGameMessage } from "../src/protocol.ts";
import { applyAction, createGame } from "../src/rules.ts";
import type { Action, GameState } from "../src/types.ts";
import { makeSeats, must, offered } from "./support.ts";

const TANK = "STORAGE_A_0:OXYGEN_TANK";
const take: Action = { type: "take_oxygen", equipment: TANK };
const back: Action = { type: "return_oxygen", equipment: TANK };
const { ship, oxygenCapsule } = DEFAULT_CONFIG;

function game(room: string): GameState {
  const s = createGame(makeSeats(3), structuredClone(DEFAULT_CONFIG), 3);
  for (const p of s.players) p.room = room;
  return s;
}
const capsules = (s: GameState) => itemsIn(s, { kind: "player", id: "p0" }).filter((i) => i.type === OXYGEN_CAPSULE_ITEM).length;

describe("oxygen capsules", () => {
  
  it("takes a capsule from a tank, lowering the ship's oxygen, only in a central storage", () => {
    const s = game("STORAGE_A_0");
    expect(offered(s, "p0")).toContainEqual(take);
    const next = must(applyAction(s, "p0", take));
    expect([next.ship.oxygen, capsules(next)]).toEqual([s.ship.oxygen - 1, 1]);
    expect(next.log.some((e) => e.key === "tookOxygen")).toBe(true);
    const elsewhere = game("MOTOR_ROOM");
    expect(offered(elsewhere, "p0").some((a) => a.type === "take_oxygen")).toBe(false);
    expect(applyAction(elsewhere, "p0", take)).toMatchObject({ ok: false });
  });

  it("an empty tank gives nothing", () => {
    const s = game("STORAGE_A_0");
    s.ship.oxygen = 0;
    expect(applyAction(s, "p0", take)).toMatchObject({ ok: false });
  });

  it("is refused with full hands, and the capsule can't be dropped", () => {
    let s = game("STORAGE_A_0");
    const mine = { kind: "player", id: "p0" } as const;
    const free = capacity(s, mine) - itemsIn(s, mine).length;
    for (let i = 0; i < free; i++) s = must(applyAction(s, "p0", take));
    expect(capsules(s)).toBe(free);
    expect(applyAction(s, "p0", take)).toMatchObject({ ok: false });
    const capsule = itemsIn(s, mine).find((i) => i.type === OXYGEN_CAPSULE_ITEM)!;
    expect(applyAction(s, "p0", { type: "drop", item: capsule.id })).toMatchObject({ ok: false });
  });

  it("returns a capsule to a tank, up to the maximum", () => {
    const s = must(applyAction(game("STORAGE_A_0"), "p0", take));
    expect(offered(s, "p0")).toContainEqual(back);
    const next = must(applyAction(s, "p0", back));
    expect([next.ship.oxygen, capsules(next)]).toEqual([s.ship.oxygen + 1, 0]);
    expect(next.log.some((e) => e.key === "returnedOxygen")).toBe(true);
    const full = structuredClone(s);
    full.ship.oxygen = ship.oxygen.max;
    expect(applyAction(full, "p0", back)).toMatchObject({ ok: false });
  });

  it("can't return without a capsule", () => {
    const s = game("STORAGE_A_0");
    expect(offered(s, "p0").some((a) => a.type === "return_oxygen")).toBe(false);
    expect(applyAction(s, "p0", back)).toMatchObject({ ok: false });
  });

  it("is secret: alone, only the actor sees the line", () => {
    const s = game("STORAGE_A_0");
    s.players = s.players.map((p, i) => (i === 0 ? p : { ...p, room: "MOTOR_ROOM" }));
    const next = must(applyAction(s, "p0", take));
    expect(next.log.find((e) => e.key === "tookOxygen")?.visibleTo).toEqual(["p0"]);
  });

  it("parses from the wire", () => {
    for (const action of [take, back]) expect(parseGameMessage(JSON.stringify({ type: "action", action }))).toEqual({ type: "action", action });
  });
});
