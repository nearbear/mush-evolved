import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { addDisease, diseaseStats } from "../src/diseases.ts";
import { contaminate } from "../src/infection.ts";
import { contaminationCapacity } from "../src/modifiers.ts";
import { createGame } from "../src/rules.ts";
import type { GameState } from "../src/types.ts";
import { costOf, makeSeats, mustApply, noCharacterModifiers, player, testConfig } from "./support.ts";

const BLACK_BITE = "black_bite_disease";
const QUINCKE = "quincks_oedema_disease";
const config = noCharacterModifiers(testConfig({ mushCount: 2 }));

/** p0 and p1 Mush (p0 a Demoralizer with spores), p2 and p3 humans, everyone on the bridge; p2 has Black Bite. */
const ship = (): GameState => {
  const s = createGame(makeSeats(4), config, 5, { p0: "mush", p1: "mush" });
  const p0 = player(s, "p0");
  p0.mushSkills.push("disheartening_contact");
  p0.spores = 2;
  p0.ap = 8;
  for (const p of s.players) p.room = "BRIDGE";
  addDisease(s, player(s, "p2"), BLACK_BITE);
  return s;
};

describe("Black Bite", () => {
  it("lasts 20 to 32 cycles, and alien fruits can give it", () => {
    expect(diseaseStats({ config: DEFAULT_CONFIG } as GameState, BLACK_BITE)).toMatchObject({ durationMin: 20, durationMax: 32 });
    expect(DEFAULT_CONFIG.diseases.allDiseases).toContain(BLACK_BITE);
    expect(Object.keys(DEFAULT_CONFIG.botany.fruits.diseases)).toContain(BLACK_BITE);
  });

  it("makes Mush actions aimed at a carrier cost no AP; the spore is still spent", () => {
    const s = ship();
    expect(costOf(s, "p0", { type: "spike", target: "p2" })?.ap).toBe(0);
    expect(costOf(s, "p0", { type: "demoralize", target: "p2" })?.ap).toBe(0);
    // Not a carrier: the usual price.
    expect(costOf(s, "p0", { type: "spike", target: "p3" })?.ap).toBe(config.spike.cost.ap);
    expect(costOf(s, "p0", { type: "demoralize", target: "p3" })?.ap).toBe(config.demoralize.cost.ap);
    const after = mustApply(s, "p0", { type: "spike", target: "p2" });
    expect([player(after, "p0").ap, player(after, "p0").spores]).toEqual([8, 1]);
  });

  it("doesn't discount an action that isn't Mush-only, or a Mush carrier", () => {
    const s = ship();
    s.items.push({ id: "knife", type: "knife", at: { kind: "player", id: "p0" } });
    expect(costOf(s, "p0", { type: "attack", target: "p2", weapon: "knife" })?.ap).toBe(config.weapons.cost.ap);
    addDisease(s, player(s, "p1"), BLACK_BITE);
    expect(costOf(s, "p0", { type: "demoralize", target: "p1" })?.ap).toBe(config.demoralize.cost.ap);
  });

  it("gives a carrier Quincke's Oedema when they receive a spore", () => {
    const s = ship();
    const p2 = player(s, "p2");
    p2.hp = 14;
    contaminate(s, p2, 1);
    expect(p2.modifiers).toContain(QUINCKE);
  });

  it("gives nothing when the spore converts them, nor to a Mush carrier", () => {
    const s = ship();
    const p2 = player(s, "p2");
    contaminate(s, p2, contaminationCapacity(s, p2));
    expect(p2.role).toBe("mush");
    expect(p2.modifiers).not.toContain(QUINCKE);
    const p1 = player(s, "p1");
    addDisease(s, p1, BLACK_BITE);
    contaminate(s, p1, 1);
    expect(p1.modifiers).not.toContain(QUINCKE);
  });
});
