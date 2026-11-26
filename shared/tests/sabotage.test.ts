import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EQUIPMENT_TYPES } from "../src/equipment.ts";
import { ITEM_TYPES } from "../src/itemTypes.ts";
import { parseGameMessage } from "../src/protocol.ts";
import { applyAction, createGame, viewFor } from "../src/rules.ts";
import type { Action, GameState } from "../src/types.ts";
import { makeSeats, must, offered, option, player, testConfig } from "./support.ts";

// Sabotage (owner, 2026-11-07): a Mush breaks flagged equipment or items, secretly and silently, at the repair chance.
const config = testConfig();
const real = { shower: EQUIPMENT_TYPES.SHOWER, knife: ITEM_TYPES.knife, wrench: ITEM_TYPES.wrench, soap: ITEM_TYPES.soap };
const SHOWER = "SICK_BAY:SHOWER";

// The real data flags many types; start from none, so each test says exactly what can be sabotaged.
const snapshot = { equipment: { ...EQUIPMENT_TYPES }, items: { ...ITEM_TYPES } };
const unflag = <T extends { canBeSabotaged?: boolean }>(table: Record<string, T>) => {
  for (const [key, type] of Object.entries(table)) table[key] = { ...type, canBeSabotaged: false };
};

beforeEach(() => {
  unflag(EQUIPMENT_TYPES);
  unflag(ITEM_TYPES);
  EQUIPMENT_TYPES.SHOWER = { ...real.shower!, canBeSabotaged: true };
  ITEM_TYPES.knife = { ...real.knife!, canBreak: true, canBeSabotaged: true, repairChance: 0.5 };
  ITEM_TYPES.wrench = { ...real.wrench!, canBreak: true, canBeSabotaged: true };
  ITEM_TYPES.soap = { ...real.soap!, canBreak: true, isDestroyedWhenBroken: true, canBeSabotaged: true };
});
afterEach(() => {
  Object.assign(EQUIPMENT_TYPES, snapshot.equipment);
  Object.assign(ITEM_TYPES, snapshot.items);
});

/** p0 (Mush), p1 and p2 in the sick bay, p3 in the lab; the sick bay has a shower; p0 reaches a knife, a wrench and soap. */
function ship(): GameState {
  const s = createGame(makeSeats(4), config, 3);
  s.config = structuredClone(s.config);
  for (const id of ["p0", "p1", "p2"]) player(s, id).room = "SICK_BAY";
  player(s, "p3").room = "LABORATORY";
  player(s, "p0").role = "mush";
  for (const id of ["p1", "p2", "p3"]) player(s, id).role = "human";
  if (!s.equipment.SICK_BAY!.some((e) => e.type === "SHOWER")) s.equipment.SICK_BAY!.push({ id: SHOWER, type: "SHOWER" });
  s.equipment.SICK_BAY!.find((e) => e.type === "SHOWER")!.id = SHOWER;
  for (const [id, type] of [["knife", "knife"], ["wrench", "wrench"], ["soap", "soap"]] as const) s.items.push({ id, type, at: { kind: "player", id: "p0" } });
  return s;
}
const item = (s: GameState, id: string) => s.items.find((i) => i.id === id);
const showerBroken = (s: GameState) => s.equipment.SICK_BAY!.find((e) => e.id === SHOWER)?.broken === true;
const sabotage = (target: { equipment: string } | { item: string }): Action => ({ type: "sabotage", ...target });
const sureShower = (s: GameState, chance: number) => (s.config.repair.chance.SHOWER = chance);

describe("sabotage", () => {
  it("is offered to a Mush for flagged equipment and items only", () => {
    const s = ship();
    const options = offered(s, "p0").filter((a) => a.type === "sabotage");
    expect(options).toEqual(expect.arrayContaining([sabotage({ equipment: SHOWER }), sabotage({ item: "knife" }), sabotage({ item: "wrench" })]));
    ITEM_TYPES.wrench = { ...real.wrench!, canBreak: true };
    EQUIPMENT_TYPES.SHOWER = { ...real.shower!, canBeSabotaged: false };
    ITEM_TYPES.knife = { ...real.knife!, canBreak: false, canBeSabotaged: true }; // flagged but it can't break
    expect(offered(s, "p0").filter((a) => a.type === "sabotage")).toEqual([sabotage({ item: "soap" })]);
  });

  it("is not offered to a human, and is refused", () => {
    const s = ship();
    expect(offered(s, "p1").some((a) => a.type === "sabotage")).toBe(false);
    expect(applyAction(s, "p1", sabotage({ equipment: SHOWER })).ok).toBe(false);
  });

  it("is not offered for broken things, equipment that can't break, or items out of reach", () => {
    const s = ship();
    item(s, "knife")!.broken = true;
    s.equipment.SICK_BAY!.find((e) => e.id === SHOWER)!.broken = true;
    item(s, "wrench")!.at = { kind: "room", id: "LABORATORY" };
    expect(offered(s, "p0").filter((a) => a.type === "sabotage")).toEqual([sabotage({ item: "soap" })]);
    const t = ship();
    EQUIPMENT_TYPES.SHOWER = { ...real.shower!, canBeSabotaged: true };
    delete t.config.repair.chance.SHOWER;
    expect(offered(t, "p0")).not.toContainEqual(sabotage({ equipment: SHOWER }));
  });

  it("costs 1 AP and uses the repair chance, or the default for an item without one", () => {
    const s = ship();
    expect(option(s, "p0", sabotage({ equipment: SHOWER }))).toMatchObject({ chance: s.config.repair.chance.SHOWER, cost: { ap: 1 } });
    expect(option(s, "p0", sabotage({ item: "knife" }))?.chance).toBe(0.5);
    expect(option(s, "p0", sabotage({ item: "wrench" }))?.chance).toBe(s.config.sabotage.defaultChance);
    expect(s.config.sabotage).toEqual({ cost: { ap: 1 }, defaultChance: 0.12, sapperFactor: 3, dirtyChance: 0.25 });
  });

  it("breaks equipment, and spends the AP", () => {
    const s = ship();
    sureShower(s, 1);
    const ap = player(s, "p0").ap;
    const after = must(applyAction(s, "p0", sabotage({ equipment: SHOWER })));
    expect(showerBroken(after)).toBe(true);
    expect(player(after, "p0").ap).toBe(ap - 1);
  });

  it("breaks an item, or destroys one that is destroyed when broken", () => {
    const s = ship();
    s.config.sabotage.defaultChance = 1;
    ITEM_TYPES.knife!.repairChance = 1;
    expect(item(must(applyAction(s, "p0", sabotage({ item: "knife" }))), "knife")?.broken).toBe(true);
    expect(item(must(applyAction(s, "p0", sabotage({ item: "soap" }))), "soap")).toBeUndefined();
  });

  it("can fail, leaving the target working", () => {
    const s = ship();
    sureShower(s, 0);
    const after = must(applyAction(s, "p0", sabotage({ equipment: SHOWER })));
    expect(showerBroken(after)).toBe(false);
    ITEM_TYPES.knife!.repairChance = 0;
    expect(item(must(applyAction(s, "p0", sabotage({ item: "knife" }))), "knife")?.broken).toBeUndefined();
  });

  it("is secret and silent: roommates see it, others and NERON don't", () => {
    const s = ship();
    sureShower(s, 1);
    const after = must(applyAction(s, "p0", sabotage({ equipment: SHOWER })));
    expect(viewFor(after, "p1").log.some((e) => e.key === "sabotaged")).toBe(true);
    expect(viewFor(after, "p3").log.some((e) => e.key === "sabotaged")).toBe(false);
    expect(after.chat.some((m) => m.system?.key === "equipmentBroken")).toBe(false);
    const alone = ship();
    sureShower(alone, 1);
    for (const id of ["p1", "p2"]) player(alone, id).room = "LABORATORY";
    const unseen = must(applyAction(alone, "p0", sabotage({ equipment: SHOWER })));
    expect(viewFor(unseen, "p0").log.some((e) => e.key === "sabotaged")).toBe(true);
    expect(viewFor(unseen, "p1").log.some((e) => e.key === "sabotaged")).toBe(false);
  });

  it("is tripled for a Saboteur (sapper), equipment and items alike, capped at 99%", () => {
    const s = ship();
    player(s, "p0").mushSkills = ["sapper"];
    expect(option(s, "p0", sabotage({ equipment: SHOWER }))?.chance).toBeCloseTo(s.config.repair.chance.SHOWER! * 3);
    expect(option(s, "p0", sabotage({ item: "wrench" }))?.chance).toBeCloseTo(s.config.sabotage.defaultChance * 3);
    expect(option(s, "p0", sabotage({ item: "knife" }))?.chance).toBe(0.99); // 0.5 x 3, capped like every chance
  });

  it("is untouched by other skills: a Mush without sapper keeps the base chance", () => {
    const s = ship();
    expect(option(s, "p0", sabotage({ item: "wrench" }))?.chance).toBe(s.config.sabotage.defaultChance);
  });

  it("is accepted from the wire", () => {
    for (const action of [{ type: "sabotage", item: "knife" }, { type: "sabotage", equipment: SHOWER }])
      expect(parseGameMessage(JSON.stringify({ type: "action", action }))).toEqual({ type: "action", action });
  });
});
