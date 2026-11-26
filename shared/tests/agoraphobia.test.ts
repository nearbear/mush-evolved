import { describe, expect, it } from "vitest";
import { addDisease } from "../src/diseases.ts";
import { INTRUDER, spawnHostile } from "../src/hostiles.ts";
import { movementRules } from "../src/modifiers.ts";
import { createGame, viewFor } from "../src/rules.ts";
import type { GameState } from "../src/types.ts";
import { costOf, makeSeats, mustApply, nextCycle, noCharacterModifiers, pickSkill, player, testConfig } from "./support.ts";

// Agoraphobia (owner, 2026-11-26): a disorder. With 4 or more living crew and hostile NPCs in the room (the holder
// included), actions that cost AP cost 1 more, leaving costs 1 more MP, and each cycle change there costs 1 morale.
// Nothing to a Mush or while a Shrink has it calmed. Private.
const config = noCharacterModifiers(testConfig({ mushCount: 0 }));
const AGORAPHOBIA = "agoraphobia_disorder";
const ROOM = "SICK_BAY";

/** p0 (agoraphobic) shares the sick bay with `others` of p1-p4; the rest are in the refectory. */
function ship(others: number): GameState {
  const s = createGame(makeSeats(5), config, 5);
  s.players.forEach((p, i) => {
    p.room = i <= others ? ROOM : "REFECTORY";
    p.ap = 8;
    p.morale = 8;
  });
  addDisease(s, player(s, "p0"), AGORAPHOBIA);
  return s;
}

const punchCost = (s: GameState) => costOf(s, "p0", { type: "punch", target: "p1" })!.ap;
const mpPerMove = (s: GameState) => movementRules(s, player(s, "p0")).mpPerMove;

describe("Agoraphobia disorder", () => {
  it("pins the confirmed numbers", () => {
    expect(config.diseases.allDisorders).toContain(AGORAPHOBIA);
    expect(config.agoraphobia).toEqual({ crowd: 4, apSurcharge: 1, mpSurcharge: 1, moraleLoss: 1 });
  });

  it("4 in the room, the holder included, adds AP to AP-costing actions and MP to leaving; 3 doesn't", () => {
    const calm = ship(2);
    const crowd = ship(3);
    expect(punchCost(crowd)).toBe(punchCost(calm) + config.agoraphobia.apSurcharge);
    expect(mpPerMove(crowd)).toBe(mpPerMove(calm) + config.agoraphobia.mpSurcharge);
    expect(mpPerMove(calm)).toBe(config.movement.mpPerMove);
  });

  it("hostile NPCs count toward the crowd; the dead don't", () => {
    const s = ship(2);
    spawnHostile(s, INTRUDER, ROOM);
    expect(mpPerMove(s)).toBe(config.movement.mpPerMove + config.agoraphobia.mpSurcharge);
    const t = ship(3);
    player(t, "p3").alive = false;
    expect(mpPerMove(t)).toBe(config.movement.mpPerMove);
  });

  it("free actions stay free", () => {
    const s = ship(3);
    const free = viewFor(s, "p0").actions.filter((o) => o.cost.ap === 0 && o.action.type !== "move");
    expect(free.length).toBeGreaterThan(0);
    const calm = ship(2);
    for (const o of free) expect(costOf(calm, "p0", o.action)?.ap ?? 0).toBe(0);
  });

  it("a cycle change in a crowd costs 1 morale, privately; not in a quiet room", () => {
    const crowd = nextCycle(ship(3));
    const calm = nextCycle(ship(2));
    expect(player(calm, "p0").morale - player(crowd, "p0").morale).toBe(config.agoraphobia.moraleLoss);
    expect(viewFor(crowd, "p0").log.some((l) => l.key === "agoraphobiaMoraleLoss")).toBe(true);
    for (const id of ["p1", "p2", "p3"]) expect(viewFor(crowd, id).log.some((l) => l.key === "agoraphobiaMoraleLoss")).toBe(false);
  });

  it("does nothing to a Mush", () => {
    const s = ship(3);
    player(s, "p0").role = "mush";
    expect(mpPerMove(s)).toBe(config.movement.mpPerMove);
    expect(player(nextCycle(s), "p0").morale).toBe(player(s, "p0").morale);
  });

  it("does nothing while a Shrink has it calmed", () => {
    let s = ship(3);
    s = pickSkill(s, "p1", "shrink");
    s = mustApply(s, "p1", { type: "comfort", target: "p0" });
    expect(mpPerMove(s)).toBe(config.movement.mpPerMove);
  });
});
