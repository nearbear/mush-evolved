import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { addDisease, diseaseStats } from "../src/diseases.ts";
import { applyAction, createGame } from "../src/rules.ts";
import type { GameState } from "../src/types.ts";
import { makeSeats, mustApply, nextCycle, noCharacterModifiers, offered, player, testConfig, withoutDrugs } from "./support.ts";

const STIFF_NECK = "stiff_neck_injury";
const config = noCharacterModifiers(testConfig());

/** Everyone in Bedroom A, next to a bed. */
function ship(): GameState {
  const s = withoutDrugs(createGame(makeSeats(3), config, 1));
  s.players.forEach((p) => (p.room = "BEDROOM_A"));
  return s;
}
const bed = (s: GameState) => s.equipment.BEDROOM_A!.find((e) => e.type === "BED")!.id;
const lieDown = (s: GameState) => ({ type: "lie_down" as const, equipment: bed(s) });

describe("stiff neck injury", () => {
  it("uses the owner's numbers: 4 cycles, an injury, not a random combat injury", () => {
    const stats = diseaseStats({ config: DEFAULT_CONFIG } as GameState, STIFF_NECK);
    expect([stats?.durationMin, stats?.durationMax]).toEqual([4, 4]);
    expect(DEFAULT_CONFIG.diseases.allInjuries).toContain(STIFF_NECK);
    expect(DEFAULT_CONFIG.diseases.notRandomInjuries).toEqual([STIFF_NECK]);
  });

  it("keeps you from lying down, and an attempt leaves the state unchanged", () => {
    const s = ship();
    expect(offered(s, "p0")).toContainEqual(lieDown(s));
    addDisease(s, player(s, "p0"), STIFF_NECK);
    expect(offered(s, "p0")).not.toContainEqual(lieDown(s));
    const before = JSON.stringify(s);
    expect(applyAction(s, "p0", lieDown(s)).ok).toBe(false);
    expect(JSON.stringify(s)).toBe(before);
  });

  it("gets you out of bed when you get it", () => {
    const s = mustApply(ship(), "p0", lieDown(ship()));
    const p0 = player(s, "p0");
    expect(p0.modifiers).toContain("lying_down");
    addDisease(s, p0, STIFF_NECK);
    expect(p0.modifiers).not.toContain("lying_down");
    expect(p0.lyingIn).toBeUndefined();
  });

  it("wears off after 4 cycles, and you can lie down again", () => {
    let s = ship();
    addDisease(s, player(s, "p0"), STIFF_NECK);
    for (let i = 0; i < 3; i++) s = nextCycle(s);
    expect(player(s, "p0").modifiers).toContain(STIFF_NECK);
    s = nextCycle(s);
    expect(player(s, "p0").modifiers).not.toContain(STIFF_NECK);
    expect(player(s, "p0").statuses).not.toContain(STIFF_NECK);
    expect(offered(s, "p0")).toContainEqual(lieDown(s));
  });

  it("is cured by surgery", () => {
    const s = withoutDrugs(createGame(makeSeats(3), { ...config, surgery: { ...config.surgery, successChance: 1, dirtyChance: 0 } }, 1));
    s.players.forEach((p) => {
      p.room = "SICK_BAY";
      p.role = "human";
    });
    addDisease(s, player(s, "p1"), STIFF_NECK);
    const r = mustApply(s, "p0", { type: "surgery", target: "p1" });
    expect(player(r, "p1").modifiers).not.toContain(STIFF_NECK);
  });

  it("leaves the other injuries permanent", () => {
    let s = ship();
    addDisease(s, player(s, "p0"), "burnt_hand_injury");
    for (let i = 0; i < 6; i++) s = nextCycle(s);
    expect(player(s, "p0").modifiers).toContain("burnt_hand_injury");
  });
});
