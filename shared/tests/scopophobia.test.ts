import { describe, expect, it } from "vitest";
import { addDisease } from "../src/diseases.ts";
import { CAMERA_EQUIPMENT, cameraEquipmentId } from "../src/equipment.ts";
import { actionSuccessRate, type CostContext } from "../src/modifiers.ts";
import { createGame } from "../src/rules.ts";
import type { Action, GameState, PlayerState } from "../src/types.ts";
import { makeSeats, noCharacterModifiers, player, testConfig } from "./support.ts";

// Scopophobia (owner, 2026-11-28): a disorder in the random pool (threshold 100). While a working installed camera or
// another living player (human or Mush) is in the room, rolled actions succeed x0.9 as often (relative); an action that
// can't fail stays certain. Nothing to a Mush.
const config = noCharacterModifiers(testConfig({ mushCount: 0 }));
const SCOPO = "scopophobia_disorder";

/** p0 (scopophobic unless `disorder` is false) alone in the Laboratory; p1 in the room next door. */
function ship(disorder = true): GameState {
  const s = createGame(makeSeats(2), config, 5);
  player(s, "p0").room = "LABORATORY";
  player(s, "p1").room = config.rooms.LABORATORY![0]!;
  s.equipment.LABORATORY = (s.equipment.LABORATORY ?? []).filter((e) => e.type !== CAMERA_EQUIPMENT);
  if (disorder) addDisease(s, player(s, "p0"), SCOPO);
  return s;
}

const ctx = (state: GameState, actor: PlayerState): CostContext => ({ state, actor, action: { type: "repair" } as unknown as Action, tags: [] });
const rate = (s: GameState, base = 0.6) => actionSuccessRate(base, ctx(s, player(s, "p0")));
const watchedRate = 0.6 * config.scopophobia.successFactor;

describe("Scopophobia disorder", () => {
  it("pins the confirmed numbers", () => {
    expect(config.diseases.allDisorders).toContain(SCOPO);
    expect(config.scopophobia).toEqual({ successFactor: 0.9 });
    expect(config.sanity.disorderThresholds[SCOPO]).toBe(100);
  });

  it("alone and unwatched, nothing changes", () => {
    expect(rate(ship())).toBeCloseTo(0.6);
  });

  it("another living player in the room scales the odds, relatively; a dead one doesn't", () => {
    const s = ship();
    player(s, "p1").room = "LABORATORY";
    expect(rate(s)).toBeCloseTo(watchedRate);
    expect(rate(s, 1)).toBe(1);
    player(s, "p1").alive = false;
    expect(rate(s)).toBeCloseTo(0.6);
  });

  it("a Mush in the room counts like anyone else", () => {
    const s = ship();
    player(s, "p1").room = "LABORATORY";
    player(s, "p1").role = "mush";
    expect(rate(s)).toBeCloseTo(watchedRate);
  });

  it("a working installed camera counts; a broken one doesn't", () => {
    const s = ship();
    const cam = { id: cameraEquipmentId("LABORATORY"), type: CAMERA_EQUIPMENT, broken: false };
    s.equipment.LABORATORY = [...(s.equipment.LABORATORY ?? []), cam];
    expect(rate(s)).toBeCloseTo(watchedRate);
    cam.broken = true;
    expect(rate(s)).toBeCloseTo(0.6);
  });

  it("does nothing to someone without it, or to a Mush", () => {
    const healthy = ship(false);
    player(healthy, "p1").room = "LABORATORY";
    expect(rate(healthy)).toBeCloseTo(0.6);
    const s = ship();
    player(s, "p1").room = "LABORATORY";
    player(s, "p0").role = "mush";
    expect(rate(s)).toBeCloseTo(0.6);
  });
});
