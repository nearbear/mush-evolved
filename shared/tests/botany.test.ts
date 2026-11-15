import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { PROJECT_COMPLETE, projectStatus } from "../src/projects.ts";
import { parseGameMessage } from "../src/protocol.ts";
import { applyAction, createGame, viewFor } from "../src/rules.ts";
import type { GameConfig, GameState, ItemState, PlantState } from "../src/types.ts";
import { costOf, makeSeats, must, mustApply, nextCycle, nextDay, offered, option, player, noHunters, noIncidents } from "./support.ts";

const GARDEN = "HYDROPONIC_CENTER";
const BANANA = "fruit_banana";
const cfg = DEFAULT_CONFIG.botany;
const adult = (over: Partial<PlantState> = {}): PlantState => ({ species: BANANA, age: null, thirst: 0, sick: false, ...over });

/** Three humans in the garden (p2 Mush when `mush`), the default start items, and no random sickness unless asked. */
function ship(config: Partial<GameConfig["botany"]> = {}, mush = false): GameState {
  const s = createGame(makeSeats(3), noIncidents(noHunters({ ...DEFAULT_CONFIG, mushCount: mush ? 1 : 0, botany: { ...cfg, sickChancePerCycle: 0, ...config } })), 3, mush ? { p2: "mush" } : {});
  for (const p of s.players) p.room = GARDEN;
  return s;
}

const pots = (s: GameState) => s.items.filter((i) => i.type === "tree_pot");
const planted = (s: GameState) => pots(s).filter((i) => i.plant && i.at.kind === "room" && i.at.id === GARDEN);
const emptyPot = (s: GameState) => pots(s).find((i) => !i.plant && i.at.kind === "room" && i.at.id === GARDEN)!;
const bananas = (s: GameState) => s.items.filter((i) => i.type === BANANA);
const item = (s: GameState, id: string) => s.items.find((i) => i.id === id)!;

/** Moves the clock to the last cycle of the day, so the next cycle starts a new day. */
function lastCycleOfDay(s: GameState): GameState {
  s.cycle = s.config.cyclesPerDay;
  return s;
}

/** Gives p0 a banana and returns its id. */
function giveBanana(s: GameState, to = "p0"): string {
  const id = `item-${s.nextItemId++}`;
  s.items.push({ id, type: BANANA, at: { kind: "player", id: to } });
  return id;
}

describe("botany: the decided numbers and the start", () => {
  it("starts with an empty pot and two adult banana plants in the garden and two empty pots in front storage", () => {
    const s = createGame(makeSeats(3), noIncidents(DEFAULT_CONFIG), 1);
    const where = (room: string) => pots(s).filter((p) => p.at.kind === "room" && p.at.id === room);
    expect(where(GARDEN).map((p) => p.plant ?? null)).toEqual([null, adult(), adult()]);
    expect(where("STORAGE_FRONT").map((p) => p.plant ?? null)).toEqual([null, null]);
    expect(pots(s)).toHaveLength(5);
  });

  it("a banana gives +1 AP, satiety, morale and HP when eaten", () => {
    const s = ship();
    const p = player(s, "p0");
    Object.assign(p, { ap: 3, satiety: 0, morale: 5, hp: 10 });
    const after = player(mustApply(s, "p0", { type: "consume", item: giveBanana(s) }), "p0");
    expect([after.ap, after.satiety, after.morale, after.hp]).toEqual([4, 1, 6, 11]);
  });
});

describe("botany: the day change", () => {
  it("each producing plant gives +1 oxygen and a banana beside it, then gets thirsty", () => {
    const s = lastCycleOfDay(ship());
    const oxygen = s.ship.oxygen;
    const next = nextCycle(s);
    expect(next.ship.oxygen).toBe(oxygen - s.config.ship.oxygen.perCycle + 2 * cfg.oxygenPerPlant);
    expect(bananas(next).map((b) => b.at)).toEqual([
      { kind: "room", id: GARDEN },
      { kind: "room", id: GARDEN },
    ]);
    expect(planted(next).map((p) => p.plant!.thirst)).toEqual([1, 1]);
    expect(next.log.filter((e) => e.key === "plantProduced")).toHaveLength(2);
    expect(next.log.find((e) => e.key === "plantProduced")).toMatchObject({ room: GARDEN, visibleTo: "all", params: { item: BANANA } });
  });

  it("never pushes oxygen past the ship's max", () => {
    const s = lastCycleOfDay(ship());
    s.ship.oxygen = s.config.ship.oxygen.max;
    expect(nextCycle(s).ship.oxygen).toBe(s.config.ship.oxygen.max);
  });

  it("thirsty, dried and sick plants make neither oxygen nor bananas", () => {
    for (const plant of [adult({ thirst: 1 }), adult({ thirst: 2 }), adult({ sick: true })]) {
      const s = lastCycleOfDay(ship());
      for (const p of planted(s)) p.plant = { ...plant };
      const next = nextCycle(s);
      expect(next.ship.oxygen).toBe(s.ship.oxygen - s.config.ship.oxygen.perCycle);
      expect(bananas(next)).toEqual([]);
    }
  });

  it("an unwatered plant goes thirsty, then dried, and stays dried (no death yet)", () => {
    let s = ship();
    const id = planted(s)[0]!.id;
    const thirst: number[] = [];
    for (let day = 0; day < 4; day++) {
      s = nextDay(s);
      thirst.push(item(s, id).plant!.thirst);
    }
    expect(thirst).toEqual([1, 2, 2, 2]);
    expect(item(s, id).type).toBe("tree_pot");
  });

  it("a plant sown at cycle 1 that needs 8 cycles is adult and produces from cycle 1 of the next day", () => {
    let s = ship({ growCycles: { [BANANA]: 8 } });
    s.items = s.items.filter((i) => !i.plant);
    s = mustApply(s, "p0", { type: "sow", item: giveBanana(s) });
    const pot = planted(s)[0]!.id;
    expect(item(s, pot).plant).toEqual({ species: BANANA, age: 0, thirst: 0, sick: false });
    for (let c = 0; c < s.config.cyclesPerDay - 1; c++) s = nextCycle(s);
    expect(item(s, pot).plant!.age).toBe(7);
    s = nextCycle(s);
    expect(s.cycle).toBe(s.config.cyclesPerDay + 1);
    expect(item(s, pot).plant!.age).toBeNull();
    expect(bananas(s)).toHaveLength(1);
    expect(s.log.some((e) => e.key === "plantMatured" && e.room === GARDEN)).toBe(true);
  });

  it("young plants don't produce", () => {
    const s = lastCycleOfDay(ship());
    for (const p of planted(s)) p.plant = adult({ age: 0 });
    expect(bananas(nextCycle(s))).toEqual([]);
  });

  it("plants grow and produce outside the garden, and a carried plant's banana goes to its carrier", () => {
    const s = lastCycleOfDay(ship());
    const [a, b] = planted(s);
    a!.at = { kind: "room", id: "REFECTORY" };
    b!.at = { kind: "player", id: "p0" };
    player(s, "p0").room = "LABORATORY";
    const next = nextCycle(s);
    expect(bananas(next).map((i) => i.at)).toEqual([
      { kind: "room", id: "REFECTORY" },
      { kind: "player", id: "p0" },
    ]);
    expect(next.log.find((e) => e.key === "plantProduced" && e.room === "LABORATORY")).toBeDefined();
  });

  it("a carrier with a full inventory finds the banana on the floor of their room", () => {
    const s = lastCycleOfDay(ship());
    const pot = planted(s)[0]!;
    pot.at = { kind: "player", id: "p0" };
    player(s, "p0").room = "LABORATORY";
    for (let n = 0; n < s.config.inventorySlots; n++) giveBanana(s);
    const before = bananas(s).length;
    const fresh = bananas(nextCycle(s)).slice(before);
    expect(fresh.map((i) => i.at)).toContainEqual({ kind: "room", id: "LABORATORY" });
  });

  it("plants, young ones too, fall sick with the configured chance, and sick plants still get thirsty", () => {
    const never = nextCycle(ship({ sickChancePerCycle: 0 }));
    expect(planted(never).some((p) => p.plant!.sick)).toBe(false);
    const s = ship({ sickChancePerCycle: 1 });
    planted(s)[0]!.plant = adult({ age: 0 });
    const always = nextCycle(s);
    expect(planted(always).map((p) => p.plant!.sick)).toEqual([true, true]);
    const later = nextDay(always);
    expect(planted(later).map((p) => p.plant!.thirst)).toEqual([1, 1]);
  });
});

describe("botany: water", () => {
  it("is offered only on a thirsty or dried plant, costs 1 AP, makes it healthy, and is public", () => {
    const s = ship();
    const [a, b] = planted(s);
    expect(offered(s, "p0").some((x) => x.type === "water")).toBe(false);
    a!.plant!.thirst = 1;
    b!.plant!.thirst = 2;
    expect(offered(s, "p0").filter((x) => x.type === "water")).toEqual([
      { type: "water", item: a!.id },
      { type: "water", item: b!.id },
    ]);
    const ap = player(s, "p0").ap;
    const next = mustApply(s, "p0", { type: "water", item: b!.id });
    expect(item(next, b!.id).plant!.thirst).toBe(0);
    expect(player(next, "p0").ap).toBe(ap - cfg.water.cost.ap);
    expect(next.log.find((e) => e.key === "wateredPlant")).toMatchObject({ room: GARDEN, visibleTo: "all", params: { name: player(s, "p0").character, item: BANANA } });
  });

  it("refuses a healthy plant and a plant out of reach, leaving the state unchanged", () => {
    const s = ship();
    const pot = planted(s)[0]!;
    expect(applyAction(s, "p0", { type: "water", item: pot.id }).ok).toBe(false);
    pot.plant!.thirst = 1;
    player(s, "p0").room = "LABORATORY";
    expect(applyAction(s, "p0", { type: "water", item: pot.id }).ok).toBe(false);
  });
});

describe("botany: treat and hidden sickness", () => {
  it("a non-Botanist is offered every plant; treating a healthy one costs and reads the same as a sick one", () => {
    const s = ship();
    const [sick, healthy] = planted(s);
    sick!.plant!.sick = true;
    expect(offered(s, "p0").filter((x) => x.type === "treat")).toEqual([
      { type: "treat", item: sick!.id },
      { type: "treat", item: healthy!.id },
    ]);
    expect(costOf(s, "p0", { type: "treat", item: sick!.id })).toEqual(costOf(s, "p0", { type: "treat", item: healthy!.id }));
    const onSick = mustApply(s, "p0", { type: "treat", item: sick!.id });
    const onHealthy = mustApply(s, "p0", { type: "treat", item: healthy!.id });
    expect(item(onSick, sick!.id).plant!.sick).toBe(false);
    expect(item(onHealthy, healthy!.id).plant!.sick).toBe(false);
    expect(player(onSick, "p0").ap).toBe(player(s, "p0").ap - cfg.treat.cost.ap);
    expect(player(onHealthy, "p0").ap).toBe(player(onSick, "p0").ap);
    const line = (r: GameState) => {
      const { key, room, visibleTo, params } = r.log.find((e) => e.key === "treatedPlant")!;
      return { key, room, visibleTo, params };
    };
    expect(line(onHealthy)).toEqual(line(onSick));
    expect(line(onSick)).toMatchObject({ visibleTo: "all", room: GARDEN });
  });

  it("the Botanist role (Botanist or Skilful) is offered only sick plants and refused on a healthy one", () => {
    for (const skill of ["botanic", "skilful"]) {
      const s = ship();
      player(s, "p0").skills.push(skill);
      const [sick, healthy] = planted(s);
      sick!.plant!.sick = true;
      expect(offered(s, "p0").filter((x) => x.type === "treat")).toEqual([{ type: "treat", item: sick!.id }]);
      expect(applyAction(s, "p0", { type: "treat", item: healthy!.id }).ok).toBe(false);
      expect(item(mustApply(s, "p0", { type: "treat", item: sick!.id }), sick!.id).plant!.sick).toBe(false);
    }
  });

  it("sickness is in the views of the Botanist role only: not anyone else's, a Mush's included", () => {
    const s = ship({}, true);
    player(s, "p1").skills.push("skilful");
    const [sick] = planted(s);
    sick!.plant!.sick = true;
    const plantsIn = (id: string) => viewFor(s, id).roomItems.filter((i) => i.plant).map((i) => i.plant!);
    expect(plantsIn("p0")).toEqual([
      { species: BANANA, age: null, thirst: 0 },
      { species: BANANA, age: null, thirst: 0 },
    ]);
    expect(JSON.stringify(viewFor(s, "p0"))).not.toMatch(/"sick"/);
    expect(JSON.stringify(viewFor(s, "p2"))).not.toMatch(/"sick"/);
    expect(player(s, "p2").role).toBe("mush");
    expect(plantsIn("p1").map((p) => p.sick)).toEqual([true, false]);
  });

  it("a Botanist who becomes Mush still sees sickness, in the room and carried", () => {
    const s = ship({}, true);
    player(s, "p2").skills.push("botanic");
    const [sick] = planted(s);
    sick!.plant!.sick = true;
    sick!.at = { kind: "player", id: "p2" };
    expect(viewFor(s, "p2").inventory.find((i) => i.id === sick!.id)!.plant!.sick).toBe(true);
  });
});

describe("botany: sow", () => {
  it("needs a reachable fruit and an empty pot in reach, uses the fruit up, and is public", () => {
    const s = ship();
    expect(offered(s, "p0").some((x) => x.type === "sow")).toBe(false);
    const fruit = giveBanana(s);
    const pot = emptyPot(s).id;
    expect(offered(s, "p0")).toContainEqual({ type: "sow", item: fruit });
    const ap = player(s, "p0").ap;
    const next = mustApply(s, "p0", { type: "sow", item: fruit });
    expect(item(next, pot).plant).toEqual({ species: BANANA, age: 0, thirst: 0, sick: false });
    expect(next.items.some((i) => i.id === fruit)).toBe(false);
    expect(player(next, "p0").ap).toBe(ap - cfg.sow.cost.ap);
    expect(next.log.find((e) => e.key === "sowedPlant")).toMatchObject({ room: GARDEN, visibleTo: "all" });
  });

  it("can sow a fruit on the floor, preferring a floor pot over a carried pot", () => {
    const s = ship();
    const fruit = giveBanana(s);
    item(s, fruit).at = { kind: "room", id: GARDEN };
    s.items.push({ id: "carried-pot", type: "tree_pot", at: { kind: "player", id: "p0" } });
    const pot = emptyPot(s).id;
    expect(offered(s, "p0")).toContainEqual({ type: "sow", item: fruit });
    const next = mustApply(s, "p0", { type: "sow", item: fruit });
    expect(item(next, pot).plant).toEqual({ species: BANANA, age: 0, thirst: 0, sick: false });
    expect(item(next, "carried-pot").plant).toBeUndefined();
    expect(next.items.some((i) => i.id === fruit)).toBe(false);
  });

  it("refuses when no empty pot is in reach, someone else's fruit, or a non-fruit", () => {
    const s = ship();
    const fruit = giveBanana(s);
    expect(applyAction(s, "p1", { type: "sow", item: fruit }).ok).toBe(false);
    item(s, emptyPot(s).id).at = { kind: "room", id: "LABORATORY" };
    expect(applyAction(s, "p0", { type: "sow", item: fruit }).ok).toBe(false);
    expect(applyAction(s, "p0", { type: "sow", item: planted(s)[0]!.id }).ok).toBe(false);
  });
});

describe("botany: garden points", () => {
  it("the Botanist gains 2 a day up to 4; the Skilful gains none", () => {
    let s = ship();
    player(s, "p0").skills.push("botanic");
    player(s, "p1").skills.push("skilful");
    s = nextDay(s);
    expect(player(s, "p0").resources.garden).toBe(cfg.pointsPerDay);
    s = nextDay(nextDay(s));
    expect(player(s, "p0").resources.garden).toBe(cfg.capPoints);
    expect(player(s, "p1").resources.garden).toBe(0);
  });

  it("pay for a botany action on a plant in the garden, and only there", () => {
    const s = ship();
    const p = player(s, "p0");
    p.resources.garden = 1;
    const pot: ItemState = planted(s)[0]!;
    pot.plant!.thirst = 1;
    expect(option(s, "p0", { type: "water", item: pot.id })!.cost).toEqual({ ap: 0, mp: 0, paidBy: "garden" });
    const next = mustApply(s, "p0", { type: "water", item: pot.id });
    expect([player(next, "p0").resources.garden, player(next, "p0").ap]).toEqual([0, p.ap]);

    pot.at = { kind: "room", id: "LABORATORY" };
    p.room = "LABORATORY";
    expect(costOf(s, "p0", { type: "water", item: pot.id })).toEqual({ ap: cfg.water.cost.ap, mp: 0 });
    const away = mustApply(s, "p0", { type: "water", item: pot.id });
    expect(player(away, "p0").resources.garden).toBe(1);
  });
});

describe("botany: protocol", () => {
  it("parses water, treat and sow, and rejects a sow without an item", () => {
    for (const action of [{ type: "water", item: "i" }, { type: "treat", item: "i" }, { type: "sow", item: "i" }]) {
      expect(parseGameMessage(JSON.stringify({ type: "action", action }))).toEqual({ type: "action", action });
    }
    expect(parseGameMessage(JSON.stringify({ type: "action", action: { type: "sow" } }))).toBeNull();
  });

  it("an illegal action leaves the state unchanged", () => {
    const s = ship();
    const before = JSON.stringify(s);
    applyAction(s, "p0", { type: "treat", item: "nope" });
    expect(JSON.stringify(s)).toBe(before);
    expect(must(applyAction(s, "p0", { type: "treat", item: planted(s)[0]!.id }))).not.toBe(s);
  });
});

describe("botany: heat lamps", () => {
  function heatShip(extraFruitChance = DEFAULT_CONFIG.project.heatLamp.extraFruitChance, progress = PROJECT_COMPLETE): GameState {
    const s = createGame(
      makeSeats(3),
      noIncidents(noHunters({
        ...DEFAULT_CONFIG,
        mushCount: 0,
        botany: { ...cfg, sickChancePerCycle: 0 },
        project: { ...DEFAULT_CONFIG.project, heatLamp: { extraFruitChance } },
      })),
      3,
    );
    s.projects.HEAT_LAMP = progress;
    return lastCycleOfDay(s);
  }

  it("uses the confirmed config values and project status", () => {
    expect(DEFAULT_CONFIG.project.heatLamp).toEqual({ extraFruitChance: 0.5 });
    expect(projectStatus("HEAT_LAMP")).toBe("full");
  });

  it("produces an extra fruit and logs plantExtraFruit for floor and carried plants in the garden", () => {
    const s = heatShip(1);
    const [floorPot, carriedPot] = planted(s);
    // Free p0's inventory so both produced fruits fit instead of overflowing onto the garden floor.
    s.items = s.items.filter((i) => !(i.at.kind === "player" && i.at.id === "p0"));
    carriedPot!.at = { kind: "player", id: "p0" };
    player(s, "p0").room = GARDEN;

    const next = nextCycle(s);
    expect(bananas(next).filter((b) => b.at.kind === "room" && b.at.id === GARDEN)).toHaveLength(2);
    expect(bananas(next).filter((b) => b.at.kind === "player" && b.at.id === "p0")).toHaveLength(2);
    expect(next.log.filter((e) => e.key === "plantProduced")).toHaveLength(2);
    expect(next.log.filter((e) => e.key === "plantExtraFruit")).toHaveLength(2);
    expect(next.log.find((e) => e.key === "plantExtraFruit")).toMatchObject({
      room: GARDEN,
      visibleTo: "all",
      params: { item: BANANA },
    });
  });

  it("does not apply outside the garden or to non-producing plants", () => {
    const s = heatShip(1);
    const [labPot, sickPot] = planted(s);
    labPot!.at = { kind: "room", id: "LABORATORY" };
    sickPot!.plant!.sick = true;

    const next = nextCycle(s);
    expect(bananas(next)).toHaveLength(1);
    expect(bananas(next)[0]!.at).toEqual({ kind: "room", id: "LABORATORY" });
    expect(next.log.filter((e) => e.key === "plantExtraFruit")).toHaveLength(0);
  });

  it("does nothing before Heat lamps is complete, when extraFruitChance is 0, or when the Hydroponics center is broken", () => {
    const incomplete = nextCycle(heatShip(1, PROJECT_COMPLETE - 1));
    expect(bananas(incomplete)).toHaveLength(2);
    expect(incomplete.log.filter((e) => e.key === "plantExtraFruit")).toHaveLength(0);

    const zeroChance = nextCycle(heatShip(0, PROJECT_COMPLETE));
    expect(bananas(zeroChance)).toHaveLength(2);
    expect(zeroChance.log.filter((e) => e.key === "plantExtraFruit")).toHaveLength(0);

    const brokenShip = heatShip(1, PROJECT_COMPLETE);
    (brokenShip.equipment[GARDEN] ?? []).find((e) => e.type === "PLANT_CONTROLLER")!.broken = true;
    const broken = nextCycle(brokenShip);
    expect(bananas(broken)).toHaveLength(2);
    expect(broken.log.filter((e) => e.key === "plantExtraFruit")).toHaveLength(0);
  });

  it("rolls the 50% chance deterministically per plant", () => {
    let minCount = Infinity;
    let maxCount = -Infinity;
    for (let seed = 1; seed <= 12; seed++) {
      const s = createGame(
        makeSeats(3),
        noIncidents(noHunters({ ...DEFAULT_CONFIG, mushCount: 0, botany: { ...cfg, sickChancePerCycle: 0 } })),
        seed,
      );
      s.projects.HEAT_LAMP = PROJECT_COMPLETE;
      const next = nextCycle(lastCycleOfDay(s));
      const count = bananas(next).length;
      minCount = Math.min(minCount, count);
      maxCount = Math.max(maxCount, count);
    }
    expect(minCount).toBe(2);
    expect(maxCount).toBeGreaterThan(2);
  });
});

describe("Hydroponic incubator", () => {
  function incubatorShip(progress = PROJECT_COMPLETE, broken = false): GameState {
    const s = ship();
    s.projects.HYDROPONIC_INCUBATOR = progress;
    const [floorPot, carriedPot] = planted(s);
    floorPot!.plant = { species: BANANA, age: 0, thirst: 0, sick: false };
    carriedPot!.plant = { species: BANANA, age: 0, thirst: 0, sick: false };
    carriedPot!.at = { kind: "player", id: "p0" };
    if (broken) {
      const controller = (s.equipment[GARDEN] ?? []).find((e) => e.type === "PLANT_CONTROLLER")!;
      controller.broken = true;
    }
    return s;
  }

  it("uses the confirmed config values and project status", () => {
    expect(DEFAULT_CONFIG.project.hydroponicIncubator).toEqual({ growthMultiplier: 2 });
    expect(projectStatus("HYDROPONIC_INCUBATOR")).toBe("full");
  });

  it("doubles young plant aging for floor and carried pots in the garden and matures at day start", () => {
    const s = incubatorShip();
    const growCycles = s.config.botany.growCycles[BANANA]!;
    const [floorPot, carriedPot] = pots(s).filter((p) => p.plant);
    floorPot!.plant!.age = growCycles - 2;

    // Mid-day cycle: +2 reaches growCycles, but maturation waits for day start.
    const midDay = nextCycle(s);
    expect(item(midDay, floorPot!.id).plant!.age).toBe(growCycles);
    expect(item(midDay, carriedPot!.id).plant!.age).toBe(s.config.project.hydroponicIncubator.growthMultiplier);

    // Day start: floor pot ages again (+2) and matures; carried pot ages +2 more.
    const dayStart = nextCycle(lastCycleOfDay(midDay));
    expect(item(dayStart, floorPot!.id).plant!.age).toBeNull();
    expect(dayStart.log.filter((e) => e.key === "plantMatured")).toHaveLength(1);
    expect(item(dayStart, carriedPot!.id).plant!.age).toBe(s.config.project.hydroponicIncubator.growthMultiplier * 2);
  });

  it("does not speed up young plants outside the garden or adult plants", () => {
    const s = incubatorShip();
    const [floorPot, carriedPot] = pots(s).filter((p) => p.plant);
    floorPot!.at = { kind: "room", id: "LABORATORY" };
    player(s, "p0").room = "LABORATORY";
    const adultPot = emptyPot(s);
    adultPot.plant = adult();

    const next = nextCycle(s);
    expect(item(next, floorPot!.id).plant!.age).toBe(1);
    expect(item(next, carriedPot!.id).plant!.age).toBe(1);
    expect(item(next, adultPot.id).plant!.age).toBeNull();
  });

  it("does nothing while the project is incomplete or the Hydroponics center is broken", () => {
    const incomplete = nextCycle(incubatorShip(PROJECT_COMPLETE - 1));
    for (const pot of pots(incomplete).filter((p) => p.plant)) {
      expect(pot.plant!.age).toBe(1);
    }

    const broken = nextCycle(incubatorShip(PROJECT_COMPLETE, true));
    for (const pot of pots(broken).filter((p) => p.plant)) {
      expect(pot.plant!.age).toBe(1);
    }
  });
});
