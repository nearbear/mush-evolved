import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { ITEM_TYPES } from "../src/itemTypes.ts";
import { ALIEN_FRUIT_ITEMS } from "../src/itemIds.ts";
import { createGame, viewFor } from "../src/rules.ts";
import { nextSpoilStage, spoilFood } from "../src/spoilage.ts";
import type { GameState, PlayerId, SpoilStage } from "../src/types.ts";
import { makeSeats, mustApply, nextCycle, nextDay, noCharacterModifiers, player, testConfig } from "./support.ts";

// Owner, 2026-11-18, from eMush: perishable food spoils one stage per day change; eating hazardous food gives Food
// Poisoning at 50%, decomposing at 90%; a Mush catches it as a carrier; only living Chefs see the stage.
const config = noCharacterModifiers(testConfig({ consume: { dirtyChance: 0 } }));

/** p0 is Mush, p1 and p2 human, all in one room. */
function ship(sickChance?: Partial<Record<SpoilStage, number>>): GameState {
  const spoilage = { ...config.spoilage, sickChance: { ...config.spoilage.sickChance, ...sickChance } };
  const s = createGame(makeSeats(3), { ...config, spoilage }, 3);
  s.players.forEach((p, i) => (p.role = i === 0 ? "mush" : "human"));
  return s;
}

function give(s: GameState, id: PlayerId, type: string, spoil?: SpoilStage): string {
  const item = `t${s.items.length}`;
  s.items.push({ id: item, type, at: { kind: "player", id }, ...(spoil && { spoil }) });
  return item;
}

const poisoned = (s: GameState, id: PlayerId) => player(s, id).modifiers.includes("food_poisoning_disease");

describe("spoilage", () => {
  it("uses eMush's numbers", () => {
    const { sickChance, disease } = DEFAULT_CONFIG.spoilage;
    expect([sickChance.unstable, sickChance.hazardous, sickChance.decomposing, disease]).toEqual([0, 0.5, 0.9, "food_poisoning_disease"]);
  });

  it("marks coffee, cooked rations, bananas and alien fruits perishable, but not raw rations or drugs", () => {
    for (const type of ["coffee", "cooked_ration", "fruit_banana", ...ALIEN_FRUIT_ITEMS]) expect(ITEM_TYPES[type]?.perishable).toBe(true);
    for (const type of ["uncooked_ration", "steroids"]) expect(ITEM_TYPES[type]?.perishable).toBeUndefined();
  });

  it("goes one stage per stage and stops at decomposing", () => {
    expect([nextSpoilStage(undefined), nextSpoilStage("unstable"), nextSpoilStage("hazardous"), nextSpoilStage("decomposing")]).toEqual(["unstable", "hazardous", "decomposing", "decomposing"]);
  });

  it("spoils perishable food one stage at each day change, carried or on the floor, not at other cycle changes", () => {
    let s = ship();
    const carried = give(s, "p1", "cooked_ration");
    const raw = give(s, "p1", "uncooked_ration");
    s.items.push({ id: "floor", type: "coffee", at: { kind: "room", id: player(s, "p1").room } });
    const stage = (st: GameState, id: string) => st.items.find((i) => i.id === id)?.spoil;
    s = nextDay(s);
    expect([stage(s, carried), stage(s, "floor"), stage(s, raw)]).toEqual(["unstable", "unstable", undefined]);
    s = nextCycle(s);
    expect(stage(s, carried)).toBe("unstable");
    s = nextDay(s);
    expect(stage(s, carried)).toBe("hazardous");
    // Later day changes, without playing the days through (the crew would starve).
    spoilFood(s);
    spoilFood(s);
    expect([stage(s, carried), stage(s, "floor"), stage(s, raw)]).toEqual(["decomposing", "decomposing", undefined]);
  });

  it("makes no one sick from fresh or unstable food, even at certain odds", () => {
    for (const spoil of [undefined, "unstable"] as const) {
      const s = ship({ unstable: 0 });
      const item = give(s, "p1", "cooked_ration", spoil);
      expect(poisoned(mustApply(s, "p1", { type: "consume", item }), "p1")).toBe(false);
    }
  });

  it("gives Food Poisoning to a human who eats hazardous or decomposing food when the roll hits", () => {
    for (const stage of ["hazardous", "decomposing"] as const) {
      const sick = ship({ [stage]: 1 });
      expect(poisoned(mustApply(sick, "p1", { type: "consume", item: give(sick, "p1", "cooked_ration", stage) }), "p1")).toBe(true);
      const lucky = ship({ [stage]: 0 });
      const after = mustApply(lucky, "p1", { type: "consume", item: give(lucky, "p1", "cooked_ration", stage) });
      expect(poisoned(after, "p1")).toBe(false);
      // The food still feeds.
      expect(player(after, "p1").satiety).toBe(player(lucky, "p1").satiety + ITEM_TYPES.cooked_ration!.consume!.satiety);
    }
  });

  it("makes a Mush a carrier of Food Poisoning from spoiled food", () => {
    const s = ship({ decomposing: 1 });
    expect(poisoned(mustApply(s, "p0", { type: "consume", item: give(s, "p0", "coffee", "decomposing") }), "p0")).toBe(true);
  });

  it("rolls about half the time for hazardous food", () => {
    let sick = 0;
    for (let seed = 0; seed < 200; seed++) {
      const s = ship();
      s.rng = seed + 1;
      if (poisoned(mustApply(s, "p1", { type: "consume", item: give(s, "p1", "fruit_banana", "hazardous") }), "p1")) sick++;
    }
    expect(sick).toBeGreaterThan(70);
    expect(sick).toBeLessThan(130);
  });

  it("shows the stage only to living Chefs, never to anyone else, Mush included", () => {
    const s = ship();
    give(s, "p1", "cooked_ration", "hazardous");
    s.items.push({ id: "floor", type: "coffee", at: { kind: "room", id: player(s, "p1").room }, spoil: "decomposing" });
    player(s, "p2").skills.push("cook");
    const chef = viewFor(s, "p2");
    expect(chef.roomItems.find((i) => i.id === "floor")?.spoil).toBe("decomposing");
    for (const id of ["p0", "p1"]) expect(JSON.stringify({ ...viewFor(s, id), actions: [] })).not.toContain('"spoil"');
    player(s, "p2").alive = false;
    expect(JSON.stringify({ ...viewFor(s, "p2"), actions: [] })).not.toContain('"spoil"');
  });
});
