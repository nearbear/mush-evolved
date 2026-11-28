import { describe, expect, it } from "vitest";
import { addDisease } from "../src/diseases.ts";
import { createGame, viewFor } from "../src/rules.ts";
import type { Action, GameState } from "../src/types.ts";
import { makeSeats, mustApply, noCharacterModifiers, player, testConfig } from "./support.ts";

// Kinesiophobia (owner, 2026-11-28): a disorder in the random pool (threshold 95). Each AP-to-MP conversion costs 1
// morale; a move paid with MP alone costs nothing extra. Nothing to a Mush. Private.
const config = noCharacterModifiers(testConfig({ mushCount: 0, maxAp: 99, startAp: 20 }));
const KINESIO = "kinesiophobia_disorder";
const toCorridor: Action = { type: "move", to: config.rooms.LABORATORY![0]! };

/** p0 (kinesiophobic unless `disorder` is false) and p1 in the Laboratory, with `mp` MP each. */
function ship(mp: number, disorder = true): GameState {
  const s = createGame(makeSeats(2), config, 5);
  for (const p of s.players) {
    p.room = "LABORATORY";
    p.ap = 20;
    p.mp = mp;
    p.morale = 8;
  }
  if (disorder) addDisease(s, player(s, "p0"), KINESIO);
  return s;
}

describe("Kinesiophobia disorder", () => {
  it("pins the confirmed numbers", () => {
    expect(config.diseases.allDisorders).toContain(KINESIO);
    expect(config.kinesiophobia).toEqual({ moraleLoss: 1 });
    expect(config.sanity.disorderThresholds[KINESIO]).toBe(95);
  });

  it("a move that converts AP into MP costs moraleLoss morale, privately", () => {
    const after = mustApply(ship(0), "p0", toCorridor);
    expect(player(after, "p0").ap).toBe(20 - config.movement.apPerConversion);
    expect(player(after, "p0").morale).toBe(8 - config.kinesiophobia.moraleLoss);
    expect(viewFor(after, "p0").log.some((l) => l.key === "kinesiophobiaMoraleLoss")).toBe(true);
    expect(viewFor(after, "p1").log.some((l) => l.key === "kinesiophobiaMoraleLoss")).toBe(false);
  });

  it("a move paid with MP alone costs no morale", () => {
    const after = mustApply(ship(config.movement.mpCap), "p0", toCorridor);
    expect(player(after, "p0").ap).toBe(20);
    expect(player(after, "p0").morale).toBe(8);
  });

  it("does nothing to someone without it, or to a Mush", () => {
    expect(player(mustApply(ship(0, false), "p0", toCorridor), "p0").morale).toBe(8);
    const s = ship(0);
    player(s, "p0").role = "mush";
    expect(player(mustApply(s, "p0", toCorridor), "p0").morale).toBe(8);
  });
});
