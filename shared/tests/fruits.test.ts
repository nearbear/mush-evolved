import { describe, expect, it } from "vitest";
import { growCyclesFor } from "../src/botany.ts";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { addDisease } from "../src/diseases.ts";
import { drawFruits, FRUIT_BUFF_IDS, type FruitEffect } from "../src/fruits.ts";
import { convert } from "../src/infection.ts";
import { ALIEN_FRUIT_ITEMS, ITEM_TYPES } from "../src/items.ts";
import { actionSuccessRate } from "../src/modifiers.ts";
import { NAME_CATALOGS } from "../src/names.ts";
import { applyAction, createGame, viewFor } from "../src/rules.ts";
import { addStatus } from "../src/statuses.ts";
import type { GameState } from "../src/types.ts";
import { clone, makeSeats, mustApply, nextCycle, noHunters, noIncidents, option, player } from "./support.ts";

const FRUIT_CFG = DEFAULT_CONFIG.botany.fruits;
const TEST_FRUIT = ALIEN_FRUIT_ITEMS[0];

function fruitValue(f: FruitEffect): number {
  const apVal = f.ap === 0 ? 0 : FRUIT_CFG.ap.find((o) => o.ap === f.ap)!.value;
  const moraleVal = f.morale === 0 ? 0 : FRUIT_CFG.morale.find((o) => o.morale === f.morale)!.value;
  const hpVal = f.hp === 0 ? 0 : FRUIT_CFG.hp.find((o) => o.hp === f.hp)!.value;
  const buffVal = f.buffs.reduce((sum, b) => sum + FRUIT_CFG.buffs[b].value, 0);
  const diseaseVal = f.diseases.reduce((sum, d) => {
    const cost = FRUIT_CFG.diseases[d.id]!;
    return sum - Math.max(1, Math.round((cost * d.odds) / FRUIT_CFG.diseaseValueDivisor));
  }, 0);
  return apVal + moraleVal + hpVal + buffVal + diseaseVal;
}

function ship(seatsCount = 4): GameState {
  const s = createGame(
    makeSeats(seatsCount),
    noIncidents(
      noHunters({
        ...DEFAULT_CONFIG,
        characterModifiers: {},
        startInventory: [],
        mushCount: 1,
        maxAp: 99,
        startAp: 20,
        botany: { ...DEFAULT_CONFIG.botany, sickChancePerCycle: 0 },
      }),
    ),
    7,
    { p3: "mush" },
  );
  for (const p of s.players) {
    p.room = "HYDROPONIC_CENTER";
    p.skills = [];
    p.modifiers = [];
  }
  return s;
}

function giveFruit(s: GameState, to = "p0", type: string = TEST_FRUIT): string {
  const id = `item-${s.nextItemId++}`;
  s.items.push({ id, type, at: { kind: "player", id: to } });
  return id;
}

function setFruit(s: GameState, effect: Partial<FruitEffect>, type: string = TEST_FRUIT): void {
  s.fruits[type] = { ap: 0, morale: 0, hp: 0, buffs: [], diseases: [], growCycles: 16, ...effect };
}

describe("alien fruit generation and launch state", () => {
  it("draws 12 alien species inside the 3..6 value budget over 200 seeds, excluding cold and unbuilt diseases", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const drawn = drawFruits({ rng: seed, config: DEFAULT_CONFIG });
      expect(Object.keys(drawn)).toEqual([...ALIEN_FRUIT_ITEMS]);
      for (const effect of Object.values(drawn)) {
        const value = fruitValue(effect);
        expect(value).toBeGreaterThanOrEqual(3);
        expect(value).toBeLessThanOrEqual(6);
        expect(effect.growCycles).toBe(value * 4);
        expect(effect.growCycles).toBeGreaterThanOrEqual(12);
        expect(effect.growCycles).toBeLessThanOrEqual(24);
        expect([0, 1, 2]).toContain(effect.ap);
        expect([0, -2, 1, 2, 3]).toContain(effect.morale);
        expect([0, 1, 2]).toContain(effect.hp);
        expect(new Set(effect.buffs).size).toBe(effect.buffs.length);
        expect(effect.buffs.length).toBeLessThanOrEqual(3);
        for (const b of effect.buffs) expect(FRUIT_BUFF_IDS).toContain(b);
        expect(new Set(effect.diseases.map((d) => d.id)).size).toBe(effect.diseases.length);
        expect(effect.diseases.length).toBeLessThanOrEqual(3);
        for (const d of effect.diseases) {
          expect(d.id).not.toBe("cold_disease");
          expect(DEFAULT_CONFIG.diseases.allDiseases).toContain(d.id);
          expect(FRUIT_CFG.diseases[d.id]).toBeDefined();
          const pct = Math.round(d.odds * 100);
          expect(d.odds).toBe(pct / 100);
          expect(pct).toBeGreaterThanOrEqual(30);
          expect(pct).toBeLessThanOrEqual(80);
        }
      }
    }
  });

  it("caps re-rolls and fails loudly if no fruit fits the configured range", () => {
    const impossible = {
      ...DEFAULT_CONFIG,
      botany: {
        ...DEFAULT_CONFIG.botany,
        fruits: { ...FRUIT_CFG, valueRange: [99, 100] as [number, number], maxAttempts: 10 },
      },
    };
    expect(() => drawFruits({ rng: 1, config: impossible })).toThrow("fruit_generation_exceeded_max_tries");
  });

  it("keeps bananas unchanged and starts the ship with no alien fruits", () => {
    expect(ITEM_TYPES.fruit_banana).toEqual({ fruit: true, consume: { ap: 1, satiety: 1, morale: 1, hp: 1 } });
    expect(DEFAULT_CONFIG.botany.growCycles.fruit_banana).toBe(36);
    const s = createGame(makeSeats(3), DEFAULT_CONFIG, 5);
    expect(Object.keys(s.fruits)).toEqual([...ALIEN_FRUIT_ITEMS]);
    expect(s.items.filter((i) => ALIEN_FRUIT_ITEMS.includes(i.type as (typeof ALIEN_FRUIT_ITEMS)[number]))).toEqual([]);
  });

  it("has names in English, French and Spanish for all 12 alien species", () => {
    for (const lang of ["en", "fr", "es"] as const) {
      for (const id of ALIEN_FRUIT_ITEMS) {
        expect(NAME_CATALOGS[lang].items[id]?.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("botany: sowing and growing alien fruits", () => {
  it("sows, matures at 4 * value cycles, and produces more of the alien species", () => {
    let s = ship();
    s.cycle = 5; // 12 cycles from cycle 5 lands cleanly on cycle 17 (start of day 3).
    setFruit(s, { growCycles: 12 }, TEST_FRUIT);
    const pot = s.items.find((i) => i.type === "tree_pot" && !i.plant && i.at.kind === "room" && i.at.id === "HYDROPONIC_CENTER")!;
    const fruitId = giveFruit(s, "p0", TEST_FRUIT);
    s = mustApply(s, "p0", { type: "sow", item: pot.id, fruit: fruitId });
    expect(s.items.find((i) => i.id === pot.id)!.plant).toEqual({ species: TEST_FRUIT, age: 0, thirst: 0, sick: false });
    expect(growCyclesFor(s, TEST_FRUIT)).toBe(12);

    // Day 2 start (cycle 9, age 4): still young (< 12), needs watering once thirsty.
    for (let i = 0; i < 4; i++) s = nextCycle(s);
    expect(s.items.find((it) => it.id === pot.id)!.plant!.age).toBe(4);
    s = mustApply(s, "p0", { type: "water", item: pot.id });

    // Remaining 8 cycles reach cycle 17 (age 12, day 3 start): matures and produces the alien fruit.
    for (let i = 0; i < 8; i++) s = nextCycle(s);
    const grown = s.items.find((it) => it.id === pot.id)!.plant!;
    expect(grown.age).toBeNull();
    expect(s.items.some((i) => i.type === TEST_FRUIT && i.at.kind === "room" && i.at.id === "HYDROPONIC_CENTER")).toBe(true);
  });
});

describe("consuming alien fruits", () => {
  it("gives humans +1 base AP and satiety plus the species' AP, morale and HP bonuses", () => {
    const s = ship();
    setFruit(s, { ap: 2, morale: 2, hp: 2 });
    const p = player(s, "p0");
    Object.assign(p, { ap: 3, satiety: 0, morale: 5, hp: 10 });
    const after = player(mustApply(s, "p0", { type: "consume", item: giveFruit(s, "p0") }), "p0");
    expect([after.ap, after.satiety, after.morale, after.hp]).toEqual([6, 1, 7, 12]);
  });

  it("applies morale losses too and allows full belly checks as normal", () => {
    const s = ship();
    setFruit(s, { ap: 1, morale: -2 });
    const p = player(s, "p0");
    const fullAt = DEFAULT_CONFIG.hunger.fullBellyAt;
    Object.assign(p, { ap: 3, satiety: fullAt - 1, morale: 5 });
    const after = mustApply(s, "p0", { type: "consume", item: giveFruit(s, "p0") });
    expect([player(after, "p0").ap, player(after, "p0").morale, player(after, "p0").satiety]).toEqual([5, 3, fullAt]);
    expect(applyAction(after, "p0", { type: "consume", item: giveFruit(after, "p0") }).ok).toBe(false);
  });

  it("gives Mush only base satiety and morale (including -2), with no AP, HP, buffs or diseases", () => {
    const s = ship();
    setFruit(s, {
      ap: 2,
      morale: -2,
      hp: 2,
      buffs: [...FRUIT_BUFF_IDS],
      diseases: [{ id: "fungal_infection_disease", odds: 1 }],
    });
    const m = player(s, "p3");
    Object.assign(m, { ap: 3, satiety: 0, morale: 6, hp: 8 });
    const after = player(mustApply(s, "p3", { type: "consume", item: giveFruit(s, "p3") }), "p3");
    expect([after.ap, after.satiety, after.morale, after.hp]).toEqual([3, 1, 4, 8]);
    expect([after.immuneUntil, after.treatDiseaseUntil, after.energizeUntil, after.perceptionUntil, after.pendingDiseases]).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
    // Positive morale works for Mush too.
    const s2 = ship();
    setFruit(s2, { morale: 3 });
    player(s2, "p3").morale = 5;
    expect(player(mustApply(s2, "p3", { type: "consume", item: giveFruit(s2, "p3") }), "p3").morale).toBe(8);
  });
});

describe("delayed diseases", () => {
  it("manifests a triggered disease after a delay of 2..16 cycles", () => {
    const arrivalCycles = new Set<number>();
    for (let seed = 1; seed <= 25; seed++) {
      let s = ship();
      s.rng = seed * 101;
      setFruit(s, { diseases: [{ id: "fungal_infection_disease", odds: 1 }] });
      const eatCycle = s.cycle;
      s = mustApply(s, "p0", { type: "consume", item: giveFruit(s, "p0") });
      expect(player(s, "p0").modifiers).not.toContain("fungal_infection_disease");
      expect(player(s, "p0").pendingDiseases).toHaveLength(1);
      const delay = player(s, "p0").pendingDiseases![0]!.atCycle - eatCycle;
      expect(delay).toBeGreaterThanOrEqual(2);
      expect(delay).toBeLessThanOrEqual(16);
      arrivalCycles.add(delay);

      for (let step = 1; step < delay; step++) {
        s = nextCycle(s);
        expect(player(s, "p0").modifiers).not.toContain("fungal_infection_disease");
      }
      s = nextCycle(s);
      expect(player(s, "p0").modifiers).toContain("fungal_infection_disease");
      expect(player(s, "p0").pendingDiseases).toBeUndefined();
    }
    expect(arrivalCycles.size).toBeGreaterThan(3);
  });

  it("clears pending diseases if the human converts to Mush before the disease arrives", () => {
    let s = ship();
    setFruit(s, { diseases: [{ id: "extreme_tinnitus_disease", odds: 1 }] });
    s = mustApply(s, "p0", { type: "consume", item: giveFruit(s, "p0") });
    expect(player(s, "p0").pendingDiseases).toHaveLength(1);
    convert(s, player(s, "p0"));
    expect(player(s, "p0").pendingDiseases).toBeUndefined();
    for (let i = 0; i < 16; i++) s = nextCycle(s);
    expect(player(s, "p0").modifiers).not.toContain("extreme_tinnitus_disease");
  });
});

describe("alien fruit buffs", () => {
  it("Treat Disease takes 1 extra duration off active diseases per cycle for 4 cycles, resetting instead of stacking", () => {
    let s = ship();
    addDisease(s, player(s, "p0"), "cold_disease");
    player(s, "p0").diseaseTrackers[0]!.duration = 10;
    addDisease(s, player(s, "p0"), "broken_nose_injury"); // forever: injury unaffected by duration expiry
    setFruit(s, { buffs: ["treat_disease"] });
    s = mustApply(s, "p0", { type: "consume", item: giveFruit(s, "p0") });
    expect(player(s, "p0").treatDiseaseUntil).toBe(s.cycle + 4);

    // Re-eating on the next cycle resets timer to cycle + 4 rather than stacking.
    s = nextCycle(s);
    expect(player(s, "p0").diseaseTrackers[0]!.duration).toBe(8);
    player(s, "p0").satiety = 0;
    s = mustApply(s, "p0", { type: "consume", item: giveFruit(s, "p0") });
    expect(player(s, "p0").treatDiseaseUntil).toBe(s.cycle + 4);

    for (let i = 0; i < 4; i++) s = nextCycle(s);
    // Remaining duration after 4 cycles of -2: 8 -> 6 -> 4 -> 2 -> cured on 4th tick; check on a higher-duration tracker:
    const s2 = ship();
    addDisease(s2, player(s2, "p0"), "cold_disease");
    player(s2, "p0").diseaseTrackers[0]!.duration = 12;
    setFruit(s2, { buffs: ["treat_disease"] });
    let cur = mustApply(s2, "p0", { type: "consume", item: giveFruit(s2, "p0") });
    for (let i = 0; i < 4; i++) cur = nextCycle(cur);
    expect(player(cur, "p0").diseaseTrackers[0]!.duration).toBe(4); // 12 - 4*2
    cur = nextCycle(cur);
    expect(player(cur, "p0").diseaseTrackers[0]!.duration).toBe(3); // wore off: back to -1/cycle
  });

  it("Energize adds +2 MP per AP-to-MP conversion for 2 cycles and does not stack", () => {
    let s = ship();
    setFruit(s, { buffs: ["energize"] });
    player(s, "p0").mp = 0;
    const baseGain = viewFor(s, "p0").movement.mpPerConversion;

    s = mustApply(s, "p0", { type: "consume", item: giveFruit(s, "p0") });
    expect(viewFor(s, "p0").movement.mpPerConversion).toBe(baseGain + 2);
    // Eating again in the same or next cycle keeps +2, only resetting timer.
    s = nextCycle(s);
    expect(viewFor(s, "p0").movement.mpPerConversion).toBe(baseGain + 2);
    player(s, "p0").satiety = 0;
    s = mustApply(s, "p0", { type: "consume", item: giveFruit(s, "p0") });
    expect(viewFor(s, "p0").movement.mpPerConversion).toBe(baseGain + 2);

    player(s, "p0").mp = 0; // force AP -> MP conversion on the move
    const moved = mustApply(s, "p0", { type: "move", to: s.config.rooms.HYDROPONIC_CENTER![0]! });
    expect(player(moved, "p0").mp).toBe(baseGain + 2 - viewFor(s, "p0").movement.mpPerMove);

    s = nextCycle(nextCycle(s));
    expect(viewFor(s, "p0").movement.mpPerConversion).toBe(baseGain);
  });

  it("Resistance grants spore immunity for 2 cycles; spike spends spore and fails silently without telling either player", () => {
    let s = ship();
    setFruit(s, { buffs: ["resistance"] });
    player(s, "p3").spores = 2;

    s = mustApply(s, "p0", { type: "consume", item: giveFruit(s, "p0") });
    expect(viewFor(s, "p0").statuses).toContain("immune");

    // Cycle C spike: fails silently.
    const spiked1 = mustApply(s, "p3", { type: "spike", target: "p0" });
    expect(spiked1.contamination.p0).toBeUndefined();
    expect(player(spiked1, "p3").spores).toBe(1);
    expect(viewFor(spiked1, "p3").log.filter((e) => e.key === "spiked")).toHaveLength(1);
    expect(spiked1.chat.filter((m) => m.channel === "mush")).toHaveLength(0);
    expect(viewFor(spiked1, "p0").log.some((e) => e.key === "spiked")).toBe(false);

    // Cycle C+1 still immune; cycle C+2 expired.
    s = nextCycle(s);
    const spiked2 = mustApply(s, "p3", { type: "spike", target: "p0" });
    expect(spiked2.contamination.p0).toBeUndefined();

    s = nextCycle(s);
    expect(viewFor(s, "p0").statuses).not.toContain("immune");
    const spiked3 = mustApply(s, "p3", { type: "spike", target: "p0" });
    expect(spiked3.contamination.p0).toBe(1);
  });

  it("Perception multiplies non-guaranteed action success chance by 1.1 for 2 cycles without exceeding 0.99", () => {
    let s = ship();
    setFruit(s, { buffs: ["perception"] });
    const camId = `item-${s.nextItemId++}`;
    s.items.push({ id: camId, type: "camera", at: { kind: "room", id: "HYDROPONIC_CENTER" }, broken: true });

    const before = option(s, "p0", { type: "repair", item: camId })!.chance;
    s = mustApply(s, "p0", { type: "consume", item: giveFruit(s, "p0") });
    expect(option(s, "p0", { type: "repair", item: camId })!.chance).toBeCloseTo(before * 1.1, 6);

    // Guaranteed success stays 1, and high odds cap at 0.99.
    expect(actionSuccessRate(1, { state: s, actor: player(s, "p0"), action: { type: "repair", item: camId } })).toBe(1);
    expect(actionSuccessRate(0.95, { state: s, actor: player(s, "p0"), action: { type: "repair", item: camId } })).toBe(0.99);

    s = nextCycle(s);
    expect(option(s, "p0", { type: "repair", item: camId })!.chance).toBeCloseTo(before * 1.1, 6);
    s = nextCycle(s);
    expect(option(s, "p0", { type: "repair", item: camId })!.chance).toBeCloseTo(before, 6);
  });
});

describe("fruitEffects view visibility", () => {
  it("shows fruitEffects only to living Botanist, Skilful, Chef and Mush (book skill included)", () => {
    const s = ship(6);
    for (const p of s.players) p.role = "human";
    player(s, "p0").skills = ["botanic"];
    player(s, "p1").skills = ["skilful"];
    player(s, "p2").bookSkill = "cook";
    player(s, "p3").role = "mush";

    for (const id of ["p0", "p1", "p2", "p3"]) expect(viewFor(s, id).fruitEffects).toEqual(s.fruits);
    for (const id of ["p4", "p5"]) {
      const view = viewFor(s, id);
      expect(view.fruitEffects).toBeNull();
      expect(JSON.stringify(view)).not.toContain("growCycles");
      expect(JSON.stringify(view)).not.toContain("treat_disease");
    }

    player(s, "p0").alive = false;
    player(s, "p3").alive = false;
    expect(viewFor(s, "p0").fruitEffects).toBeNull();
    expect(viewFor(s, "p3").fruitEffects).toBeNull();
  });

  it("deep-clones fruitEffects into each view so mutating one cannot touch state", () => {
    const s = clone(ship());
    player(s, "p0").skills = ["botanic"];
    const view = viewFor(s, "p0");
    view.fruitEffects![TEST_FRUIT]!.ap = 999;
    expect(s.fruits[TEST_FRUIT]!.ap).not.toBe(999);
  });
});
