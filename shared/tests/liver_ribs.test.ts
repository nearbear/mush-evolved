import { describe, expect, it } from "vitest";
import { addDisease } from "../src/diseases.ts";
import { ITEM_TYPES } from "../src/items.ts";
import { consumed, enteredRoom, movementRules } from "../src/modifiers.ts";
import { createGame } from "../src/rules.ts";
import type { GameState, ItemState } from "../src/types.ts";
import { costOf, makeSeats, noCharacterModifiers, player, testConfig, withoutDrugs } from "./support.ts";

const LIVER = "liver_disfunction_injury";
const RIBS = "broken_ribs_injury";
const config = noCharacterModifiers(testConfig());

/** p0 (a human) and p1 in the lab, everyone else on the bridge; p0 holds a medikit. */
function ship(seed = 1): GameState {
  const s = withoutDrugs(createGame(makeSeats(3), config, seed));
  for (const p of s.players) p.room = "BRIDGE";
  for (const id of ["p0", "p1"]) player(s, id).room = "LABORATORY";
  player(s, "p0").role = "human";
  s.items.push({ id: "kit", type: "medikit", at: { kind: "player", id: "p0" } });
  return s;
}

const item = (type: string): ItemState => ({ id: `i-${type}`, type, at: { kind: "player", id: "p0" } });
const vomited = (s: GameState) => s.log.some((e) => e.key === "vomitSelf" || e.key === "vomitOther");

describe("liver dysfunction injury", () => {
  it("is in the combat and blade pools", () => {
    expect(config.diseases.combatInjuries).toContain(LIVER);
    expect(config.diseases.bladeInjuries).toContain(LIVER);
  });

  it("costs 1 more AP on actions that cost AP and lowers max HP by 2", () => {
    const s = ship();
    const max = player(s, "p0").maxHp;
    addDisease(s, player(s, "p0"), LIVER);
    expect(player(s, "p0").maxHp).toBe(max - 2);
    expect(costOf(s, "p0", { type: "heal", target: "p1" })?.ap).toBe(config.heal.cost.apOther + 1);
  });

  it("takes 2 AP after consuming any item, and vomits after food but not after a drug", () => {
    const s = ship();
    const p0 = player(s, "p0");
    addDisease(s, p0, LIVER);
    const drug = Object.entries(ITEM_TYPES).find(([, t]) => t.consume && t.consume.satiety <= 0)![0];
    p0.ap = 6;
    consumed(s, p0, item(drug));
    expect(p0.ap).toBe(4);
    expect(vomited(s)).toBe(false);
    consumed(s, p0, item("fruit_banana"));
    expect(p0.ap).toBe(2);
    expect(vomited(s)).toBe(true);
  });

  it("foams on every room entered and vomits on about 40% of them", () => {
    let vomits = 0;
    const runs = 400;
    for (let seed = 0; seed < runs; seed++) {
      const s = ship(seed);
      addDisease(s, player(s, "p0"), LIVER);
      enteredRoom(s, player(s, "p0"));
      expect(s.log.some((e) => e.key === "foams")).toBe(true);
      if (vomited(s)) vomits++;
    }
    expect(vomits / runs).toBeGreaterThan(0.3);
    expect(vomits / runs).toBeLessThan(0.5);
  });
});

describe("broken ribs injury", () => {
  it("costs 1 more AP on actions that cost AP and 1 more MP per move", () => {
    const plain = ship();
    const s = ship();
    addDisease(s, player(s, "p0"), RIBS);
    expect(config.diseases.combatInjuries).toContain(RIBS);
    expect(config.diseases.bluntInjuries).toContain(RIBS);
    expect(costOf(s, "p0", { type: "heal", target: "p1" })?.ap).toBe(config.heal.cost.apOther + 1);
    expect(movementRules(s, player(s, "p0")).mpPerMove).toBe(movementRules(plain, player(plain, "p0")).mpPerMove + 1);
    expect(player(s, "p0").maxHp).toBe(player(plain, "p0").maxHp);
  });
});
