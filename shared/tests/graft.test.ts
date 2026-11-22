import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { drawFruits, drawHybrid, drawHybrids, FRUIT_BUFF_IDS, type FruitEffect, fruitValue } from "../src/fruits.ts";
import { ALIEN_FRUIT_ITEMS, HYBRID_FRUIT_ITEMS, hybridOf, hybridParents, ITEM_TYPES } from "../src/items.ts";
import { normalizeGame } from "../src/normalizeState.ts";
import { growCyclesFor } from "../src/botany.ts";
import { applyAction, createGame, viewFor } from "../src/rules.ts";
import type { GameState, ItemState, PlantState } from "../src/types.ts";
import { costOf, makeSeats, mustApply, player, testConfig } from "./support.ts";

const FRUIT_CFG = DEFAULT_CONFIG.botany.fruits;
const GRAFT = DEFAULT_CONFIG.botany.graft;

describe("graft hybrids: ids", () => {
  it("has 66 hybrids, one per unordered pair of the 12 alien species, each a perishable fruit with the base +1 AP and satiety", () => {
    expect(HYBRID_FRUIT_ITEMS).toHaveLength(66);
    expect(new Set(HYBRID_FRUIT_ITEMS).size).toBe(66);
    for (const id of HYBRID_FRUIT_ITEMS) {
      expect(ITEM_TYPES[id]).toEqual({ fruit: true, perishable: true, consume: { ap: 1, satiety: 1 } });
      const [a, b] = hybridParents(id)!;
      expect(a < b).toBe(true);
      expect(hybridOf(a, b)).toBe(id);
      expect(hybridOf(b, a)).toBe(id);
    }
  });

  it("has no hybrid of a species with itself, a banana or a hybrid", () => {
    expect(hybridOf("fruit01", "fruit01")).toBeNull();
    expect(hybridOf("fruit01", "fruit_banana")).toBeNull();
    expect(hybridOf("fruit01", "graft_fruit02_fruit03")).toBeNull();
    expect(hybridParents("fruit01")).toBeNull();
    expect(hybridParents("graft_fruit05_fruit01")).toBeNull();
  });
});

describe("graft hybrids: generation", () => {
  it("pins the owner's numbers", () => {
    expect([GRAFT.cost.ap, GRAFT.valueRange, GRAFT.maxGrowCycles, GRAFT.keepChance, GRAFT.maxBuffs, GRAFT.maxDiseases]).toEqual([2, [4, 9], 32, 0.5, 3, 3]);
    expect(DEFAULT_CONFIG.greenThumb.graftHeadStart).toBe(0.25);
  });

  it("draws every hybrid inside 4..9 from its parents' effects, grow time 4 per point capped at 32, over 100 seeds", () => {
    let drawn = 0;
    for (let seed = 1; seed <= 100; seed++) {
      const fruits = drawFruits({ rng: seed, config: DEFAULT_CONFIG });
      const hybrids = drawHybrids({ rng: seed + 1000 }, DEFAULT_CONFIG, fruits);
      for (const [id, h] of Object.entries(hybrids)) {
        drawn++;
        const [a, b] = hybridParents(id)!.map((p) => fruits[p]!) as [FruitEffect, FruitEffect];
        const value = fruitValue(FRUIT_CFG, h);
        expect(value).toBeGreaterThanOrEqual(4);
        expect(value).toBeLessThanOrEqual(9);
        expect(h.growCycles).toBe(Math.min(32, value * 4));
        expect([a.ap, b.ap]).toContain(h.ap);
        expect([a.morale, b.morale]).toContain(h.morale);
        expect([a.hp, b.hp]).toContain(h.hp);
        expect(h.buffs.length).toBeLessThanOrEqual(3);
        expect(new Set(h.buffs).size).toBe(h.buffs.length);
        for (const buff of h.buffs) {
          expect(FRUIT_BUFF_IDS).toContain(buff);
          expect([...a.buffs, ...b.buffs]).toContain(buff);
        }
        expect(h.diseases.length).toBeLessThanOrEqual(3);
        expect(new Set(h.diseases.map((d) => d.id)).size).toBe(h.diseases.length);
        for (const d of h.diseases) {
          const odds = [...a.diseases, ...b.diseases].filter((p) => p.id === d.id).map((p) => p.odds);
          expect(odds).toContain(d.odds);
        }
      }
    }
    // Most pairs fit; the rest are simply not graftable.
    expect(drawn).toBeGreaterThan(100 * 66 * 0.5);
  });

  it("is deterministic for a seed", () => {
    const a = createGame(makeSeats(3), DEFAULT_CONFIG, 42);
    const b = createGame(makeSeats(3), DEFAULT_CONFIG, 42);
    expect(a.hybrids).toEqual(b.hybrids);
    expect(Object.keys(a.hybrids).length).toBeGreaterThan(0);
    for (const id of Object.keys(a.hybrids)) expect(HYBRID_FRUIT_ITEMS).toContain(id);
    // Nobody has grafted yet: no hybrid is known.
    expect(Object.keys(a.fruits)).toEqual([...ALIEN_FRUIT_ITEMS]);
  });

  it("gives no hybrid for a pair that can't fit the budget", () => {
    const nothing: FruitEffect = { ap: 0, morale: 0, hp: 0, buffs: [], diseases: [], growCycles: 12 };
    expect(drawHybrid({ rng: 1 }, DEFAULT_CONFIG, nothing, nothing)).toBeNull();
  });

  it("draws hybrids for a ship stored before grafting, the same on every load", () => {
    const s = createGame(makeSeats(3), DEFAULT_CONFIG, 9);
    const { config: _config, hybrids: _hybrids, ...stored } = s;
    const once = normalizeGame(JSON.parse(JSON.stringify(stored)), {});
    const twice = normalizeGame(JSON.parse(JSON.stringify(stored)), {});
    expect(Object.keys(once.hybrids).length).toBeGreaterThan(0);
    expect(once.hybrids).toEqual(twice.hybrids);
    // A stored ship keeps its own.
    const kept = normalizeGame(JSON.parse(JSON.stringify({ ...stored, hybrids: s.hybrids })), {});
    expect(kept.hybrids).toEqual(s.hybrids);
  });
});

const GARDEN = "HYDROPONIC_CENTER";

/** Three humans in the garden, p0 a Botanist, no random sickness. */
function ship(): GameState {
  const s = createGame(makeSeats(3), testConfig({ mushCount: 0, startItems: DEFAULT_CONFIG.startItems, botany: { sickChancePerCycle: 0 } }), 3, {});
  for (const p of s.players) {
    p.room = GARDEN;
    p.skills = [];
  }
  player(s, "p0").skills.push("botanic");
  return s;
}

/** An adult `species` plant in a new garden pot; returns the pot. */
function plant(s: GameState, species: string, over: Partial<PlantState> = {}): ItemState {
  const pot: ItemState = { id: `item-${s.nextItemId++}`, type: "tree_pot", at: { kind: "room", id: GARDEN }, plant: { species, age: null, thirst: 0, sick: false, ...over } };
  s.items.push(pot);
  return pot;
}

function give(s: GameState, type: string, to = "p0"): string {
  const id = `item-${s.nextItemId++}`;
  s.items.push({ id, type, at: { kind: "player", id: to } });
  return id;
}

const item = (s: GameState, id: string) => s.items.find((i) => i.id === id);
const grafts = (s: GameState, id = "p0") => viewFor(s, id).actions.filter((o) => o.action.type === "graft").map((o) => o.action);

describe("the Graft action", () => {
  it("turns the plant into a young hybrid, uses up the fruit, makes the hybrid known, and logs it", () => {
    const s = ship();
    const pot = plant(s, "fruit05");
    const fruit = give(s, "fruit01");
    const hybrid = "graft_fruit01_fruit05";
    expect(s.fruits[hybrid]).toBeUndefined();
    const ap = player(s, "p0").ap;
    const next = mustApply(s, "p0", { type: "graft", item: pot.id, fruit });
    expect(item(next, fruit)).toBeUndefined();
    expect(item(next, pot.id)!.plant).toEqual({ species: hybrid, age: 0, thirst: 0, sick: false });
    expect(next.fruits[hybrid]).toEqual(s.hybrids[hybrid]);
    expect(player(next, "p0").ap).toBe(ap - GRAFT.cost.ap);
    expect(next.log.at(-1)).toMatchObject({ key: "graftedPlant", room: GARDEN, visibleTo: "all", params: { name: player(s, "p0").character, item: hybrid } });
  });

  it("gives the same hybrid whichever species is the fruit, and again on a repeat graft", () => {
    let s = ship();
    const a = plant(s, "fruit05");
    const b = plant(s, "fruit01");
    s = mustApply(s, "p0", { type: "graft", item: a.id, fruit: give(s, "fruit01") }, { type: "graft", item: b.id, fruit: give(s, "fruit05") });
    expect(item(s, a.id)!.plant!.species).toBe("graft_fruit01_fruit05");
    expect(item(s, b.id)!.plant!.species).toBe("graft_fruit01_fruit05");
    expect(s.fruits.graft_fruit01_fruit05).toEqual(s.hybrids.graft_fruit01_fruit05);
  });

  const causes: [string, (s: GameState, pot: ItemState) => void][] = [
    ["dirty", (s) => void player(s, "p0").statuses.push("dirty")],
    ["thirsty", (_s, pot) => void (pot.plant!.thirst = 1)],
    ["dried", (_s, pot) => void (pot.plant!.thirst = 2)],
    ["sick", (_s, pot) => void (pot.plant!.sick = true)],
  ];
  for (const [cause, setup] of causes) {
    it(`always fails when ${cause}: the fruit and the plant are lost, an empty pot is left`, () => {
      const s = ship();
      const pot = plant(s, "fruit05");
      setup(s, pot);
      const fruit = give(s, "fruit01");
      const next = mustApply(s, "p0", { type: "graft", item: pot.id, fruit });
      expect(item(next, fruit)).toBeUndefined();
      expect(item(next, pot.id)!.plant).toBeUndefined();
      expect(next.fruits.graft_fruit01_fruit05).toBeUndefined();
      expect(next.log.at(-1)).toMatchObject({ key: "graftFailed", room: GARDEN, visibleTo: "all", params: { item: "fruit05" } });
    });
  }

  it("is offered for each held alien fruit on each reachable alien plant of another species, and nothing else", () => {
    const s = ship();
    const alien = plant(s, "fruit05");
    plant(s, "fruit_banana");
    plant(s, "fruit01");
    plant(s, "graft_fruit02_fruit03");
    const f1 = give(s, "fruit01");
    give(s, "fruit_banana");
    give(s, "graft_fruit02_fruit03");
    // On the floor, not held.
    s.items.push({ id: "floor-fruit", type: "fruit02", at: { kind: "room", id: GARDEN } });
    expect(grafts(s)).toEqual([{ type: "graft", item: alien.id, fruit: f1 }]);
  });

  it("is not offered for a pair with no hybrid in the budget", () => {
    const s = ship();
    const pot = plant(s, "fruit05");
    const fruit = give(s, "fruit01");
    delete s.hybrids.graft_fruit01_fruit05;
    expect(grafts(s)).toEqual([]);
    expect(applyAction(s, "p0", { type: "graft", item: pot.id, fruit })).toMatchObject({ ok: false });
  });

  it("is the Botanist's alone: not the Skilful's, not anyone else's", () => {
    const s = ship();
    const pot = plant(s, "fruit05");
    player(s, "p1").skills.push("skilful");
    const fruit = give(s, "fruit01", "p1");
    give(s, "fruit01", "p2");
    expect(grafts(s, "p1")).toEqual([]);
    expect(grafts(s, "p2")).toEqual([]);
    const before = JSON.stringify(s);
    expect(applyAction(s, "p1", { type: "graft", item: pot.id, fruit })).toMatchObject({ ok: false });
    expect(JSON.stringify(s)).toBe(before);
  });

  it("is paid with a garden point on a plant in the garden", () => {
    const s = ship();
    const pot = plant(s, "fruit05");
    const fruit = give(s, "fruit01");
    player(s, "p0").resources.garden = 1;
    expect(costOf(s, "p0", { type: "graft", item: pot.id })).toEqual({ ap: 0, mp: 0, paidBy: "garden" });
    const next = mustApply(s, "p0", { type: "graft", item: pot.id, fruit });
    expect([player(next, "p0").resources.garden, player(next, "p0").ap]).toEqual([0, player(s, "p0").ap]);
  });

  it("starts a Green Thumb's graft with a quarter of its grow time done", () => {
    const s = ship();
    player(s, "p0").skills.push("green_thumb");
    const pot = plant(s, "fruit05");
    s.hybrids.graft_fruit01_fruit05!.growCycles = 32;
    const next = mustApply(s, "p0", { type: "graft", item: pot.id, fruit: give(s, "fruit01") });
    expect(item(next, pot.id)!.plant!.age).toBe(8);
    expect(growCyclesFor(next, "graft_fruit01_fruit05")).toBe(32);
  });

  it("a hybrid fruit sows into a hybrid plant that grows in its own time", () => {
    let s = ship();
    s = mustApply(s, "p0", { type: "graft", item: plant(s, "fruit05").id, fruit: give(s, "fruit01") });
    s.items = s.items.filter((i) => !(i.type === "tree_pot" && !i.plant));
    s.items.push({ id: "empty-pot", type: "tree_pot", at: { kind: "room", id: GARDEN } });
    s = mustApply(s, "p1", { type: "sow", item: give(s, "graft_fruit01_fruit05", "p1") });
    expect(item(s, "empty-pot")!.plant).toMatchObject({ species: "graft_fruit01_fruit05", age: 0 });
    expect(growCyclesFor(s, "graft_fruit01_fruit05")).toBe(s.hybrids.graft_fruit01_fruit05!.growCycles);
  });

  it("a Frugivore gets the alien fruit bonus from a hybrid", () => {
    const s = ship();
    s.fruits.graft_fruit01_fruit05 = { ap: 0, morale: 0, hp: 0, buffs: [], diseases: [], growCycles: 16 };
    const p = player(s, "p1");
    p.skills.push("frugivore");
    p.ap = 0;
    const next = mustApply(s, "p1", { type: "consume", item: give(s, "graft_fruit01_fruit05", "p1") });
    expect(player(next, "p1").ap).toBe(1 + DEFAULT_CONFIG.frugivore.alienFruitAp);
  });
});

describe("graft hybrids: what players see", () => {
  it("no view holds an ungrafted hybrid; a grafted one's effects reach only lore holders", () => {
    let s = ship();
    player(s, "p1").skills.push("cook");
    s = mustApply(s, "p0", { type: "graft", item: plant(s, "fruit05").id, fruit: give(s, "fruit01") });
    const others = Object.keys(s.hybrids).filter((id) => id !== "graft_fruit01_fruit05");
    for (const id of ["p0", "p1", "p2"]) {
      const json = JSON.stringify(viewFor(s, id));
      for (const other of others) expect(json).not.toContain(other);
    }
    expect(viewFor(s, "p0").fruitEffects?.graft_fruit01_fruit05).toEqual(s.hybrids.graft_fruit01_fruit05);
    expect(viewFor(s, "p1").fruitEffects?.graft_fruit01_fruit05).toEqual(s.hybrids.graft_fruit01_fruit05);
    expect(viewFor(s, "p2").fruitEffects).toBeNull();
  });
});
