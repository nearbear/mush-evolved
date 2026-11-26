import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { ITEM_TYPES } from "../src/itemTypes.ts";
import { applyAction, createGame, legalActions, viewFor } from "../src/rules.ts";
import type { GameState } from "../src/types.ts";
import { makeSeats, must, mustApply, option, player, testConfig } from "./support.ts";

/** p0 Mush with Fungal cuisine and spores, p1 Mush, p2 and p3 human; a banana on the floor of everyone's room. */
function ship(): GameState {
  const state = createGame(makeSeats(4), testConfig({ mushCount: 2 }), 42, { p0: "mush", p1: "mush" });
  const p0 = player(state, "p0");
  p0.mushSkills = ["fungus_cook"];
  p0.spores = 3;
  for (const p of state.players) p.room = p0.room;
  state.items.push({ id: "i-banana", type: "fruit_banana", at: { kind: "room", id: p0.room } });
  return state;
}

const trap = (state: GameState) => must(applyAction(state, "p0", { type: "fungal_cuisine", item: "i-banana" }));
const item = (state: GameState) => state.items.find((i) => i.id === "i-banana");

describe("Fungal cuisine", () => {
  it("costs its AP and 1 spore, and adds a level each time", () => {
    const before = ship();
    const once = trap(before);
    expect([item(once)?.spores, player(once, "p0").spores, player(once, "p0").ap]).toEqual([1, 2, player(before, "p0").ap - DEFAULT_CONFIG.fungalCuisine.cost.ap]);
    expect(item(trap(once))?.spores).toBe(2);
    expect(item(before)?.spores).toBeUndefined();
  });

  it("needs the skill, a spore and a Mush, and is refused otherwise", () => {
    const action = { type: "fungal_cuisine", item: "i-banana" } as const;
    const noSkill = ship();
    player(noSkill, "p0").mushSkills = [];
    expect(applyAction(noSkill, "p0", action).ok).toBe(false);
    const noSpores = ship();
    player(noSpores, "p0").spores = 0;
    expect(applyAction(noSpores, "p0", action).ok).toBe(false);
    expect(applyAction(ship(), "p2", action).ok).toBe(false);
    expect(legalActions(noSpores, "p0").some((a) => a.type === "fungal_cuisine")).toBe(false);
    expect(legalActions(ship(), "p0").some((a) => a.type === "fungal_cuisine")).toBe(true);
  });

  it("contaminates the human who eats it by its level, with the usual food effects", () => {
    const eaten = mustApply(trap(ship()), "p2", { type: "consume", item: "i-banana" });
    expect(eaten.contamination.p2).toBe(1);
    expect(player(eaten, "p2").role).toBe("human");
    expect(item(eaten)).toBeUndefined();
  });

  it("still gives food effects when eating it converts the human to Mush", () => {
    const state = trap(ship());
    const p2 = player(state, "p2");
    p2.ap = 2;
    p2.hp = 5;
    state.contamination.p2 = DEFAULT_CONFIG.infection.capacity - 1;
    const eaten = mustApply(state, "p2", { type: "consume", item: "i-banana" });
    const banana = ITEM_TYPES.fruit_banana.consume!;
    expect(player(eaten, "p2").role).toBe("mush");
    expect(player(eaten, "p2").ap).toBe(2 + banana.ap);
    expect(player(eaten, "p2").hp).toBe(5 + (banana.hp ?? 0));
  });

  it("does nothing to a Mush who eats it", () => {
    const eaten = mustApply(trap(ship()), "p1", { type: "consume", item: "i-banana" });
    expect(eaten.contamination.p1).toBeUndefined();
    expect(player(eaten, "p1").role).toBe("mush");
  });

  it("is destroyed by cooking", () => {
    const state = ship();
    state.items.find((i) => i.id === "i-banana")!.type = "uncooked_ration";
    const trapped = trap(state);
    expect(item(trapped)?.spores).toBe(1);
    for (const p of trapped.players) p.room = DEFAULT_CONFIG.cook.rooms[0]!;
    trapped.items.find((i) => i.id === "i-banana")!.at = { kind: "room", id: DEFAULT_CONFIG.cook.rooms[0]! };
    expect(item(mustApply(trapped, "p0", { type: "cook", item: "i-banana" }))?.spores).toBeUndefined();
  });

  it("shows the level to living Mush only, and the log line to its author only", () => {
    const state = trap(ship());
    const seen = (id: string) => viewFor(state, id).roomItems.find((i) => i.id === "i-banana")?.spores;
    expect([seen("p0"), seen("p1"), seen("p2"), seen("p3")]).toEqual([1, 1, undefined, undefined]);
    expect(viewFor(state, "p0").log.some((e) => e.key === "fungalCooked")).toBe(true);
    for (const id of ["p1", "p2", "p3"]) expect(viewFor(state, id).log.some((e) => e.key === "fungalCooked")).toBe(false);
  });

  it("spends Cook points for 0 AP even at 0 AP, then falls back to AP", () => {
    const state = ship();
    const p0 = player(state, "p0");
    p0.ap = 0;
    p0.resources.cook = 1;
    const action = { type: "fungal_cuisine", item: "i-banana" } as const;

    expect(option(state, "p0", action)).toMatchObject({ cost: { ap: 0, mp: 0, paidBy: "cook" } });
    const after = must(applyAction(state, "p0", action));
    expect(player(after, "p0").ap).toBe(0);
    expect(player(after, "p0").resources.cook).toBe(0);
    expect(player(after, "p0").spores).toBe(2);
    expect(item(after)?.spores).toBe(1);

    expect(option(after, "p0", action)).toMatchObject({ cost: { ap: DEFAULT_CONFIG.fungalCuisine.cost.ap, mp: 0 } });
    expect(applyAction(after, "p0", action)).toEqual({ ok: false, error: "illegal_action" });
  });
});
