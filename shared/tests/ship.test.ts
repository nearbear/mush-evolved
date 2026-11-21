import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { createGame, newCycle, viewFor } from "../src/rules.ts";
import { PROJECT_COMPLETE } from "../src/projects.ts";
import { damageShip } from "../src/ship.ts";
import { makeSeats } from "./support.ts";

const game = () => createGame(makeSeats(4, "others"), DEFAULT_CONFIG, 7);
const cycle = (s: ReturnType<typeof game>) => {
  const r = newCycle(s);
  if (!r.ok) throw new Error(r.error);
  return r.state;
};

describe("ship resources", () => {
  it("start at the decided values and are public", () => {
    const s = game();
    expect(s.ship).toEqual({ oxygen: 20, fuel: 20, combustion: 0, hull: 100, plasmaShield: 50 });
    expect(viewFor(s, "p0").ship).toEqual({ oxygen: s.ship.oxygen, fuel: s.ship.fuel, hull: s.ship.hull, plasmaShield: s.ship.plasmaShield, max: { oxygen: 32, fuel: 32, hull: 100, plasmaShield: 100 } });
    expect(viewFor(s, "p3").ship).toEqual(viewFor(s, "p0").ship);
  });

  it("burns one oxygen per cycle and kills nobody while any is left", () => {
    const s = cycle(game());
    expect(s.ship.oxygen).toBe(19);
    expect(s.players.every((p) => p.alive)).toBe(true);
  });

  it("kills one random living player per cycle once oxygen is at 0, after a cycle of grace", () => {
    let s = game();
    s.ship.oxygen = 1;
    s = cycle(s);
    expect(s.ship.oxygen).toBe(0);
    expect(s.players.filter((p) => !p.alive)).toHaveLength(0);
    s = cycle(s);
    expect(s.players.filter((p) => !p.alive)).toHaveLength(1);
    expect(s.ship.oxygen).toBe(0);
    s = cycle(s);
    expect(s.players.filter((p) => !p.alive)).toHaveLength(2);
    expect(s.log.filter((e) => e.key === "oxygenOut")).toHaveLength(2);
  });

  it("ends the game for the Mush when the last human suffocates", () => {
    let s = game();
    s.ship.oxygen = 0;
    for (let i = 0; i < 6 && s.phase === "playing"; i++) s = cycle(s);
    expect([s.phase, s.winner]).toEqual(["ended", "mush"]);
    expect(newCycle(s)).toEqual({ ok: false, error: "game_over" });
  });

  it("splits damage 33% to the shield (rounded) and the rest to the hull", () => {
    const s = game();
    expect([s.config.ship.plasmaShield.absorbPercent, s.config.ship.plasmaShield.projectAbsorbPercent, s.config.ship.plasmaShield.regen]).toEqual([33, 67, 5]);
    damageShip(s, 10);
    expect(s.ship).toMatchObject({ plasmaShield: 47, hull: 93 });
    damageShip(s, 2);
    expect(s.ship).toMatchObject({ plasmaShield: 46, hull: 92 });
  });

  it("splits 67% to the shield once the Plasma Shield project is done", () => {
    const s = game();
    s.projects.PLASMA_SHIELD = PROJECT_COMPLETE;
    damageShip(s, 10);
    expect(s.ship).toMatchObject({ plasmaShield: 43, hull: 97 });
  });

  it("sends all damage to the hull while the BIOS has the shield off, and shows the shield as 0", () => {
    const s = game();
    s.bios.plasma_shield = false;
    damageShip(s, 10);
    expect(s.ship).toMatchObject({ plasmaShield: 50, hull: 90 });
    expect(viewFor(s, "p0").ship.plasmaShield).toBe(0);
    s.bios.plasma_shield = true;
    expect(viewFor(s, "p0").ship.plasmaShield).toBe(50);
  });

  it("sends all damage to the hull once the shield is gone, and never goes below 0", () => {
    const s = game();
    s.ship.plasmaShield = 3;
    damageShip(s, 10);
    expect(s.ship).toMatchObject({ plasmaShield: 0, hull: 93 });
    damageShip(s, 200);
    expect(s.ship.hull).toBe(0);
  });

  it("places fixed eMush starting items, 6 spacesuits in ICARUS, 24 storage items, 1 apprentron, 5 daedalus items, 4 random blueprints, and 1 Mush sample", () => {
    const s = createGame(makeSeats(4, "others"), { ...DEFAULT_CONFIG, startInventory: [] }, 7);
    const inRoom = (id: string) => s.items.filter((i) => i.at.kind === "room" && i.at.id === id);
    expect(inRoom("SICK_BAY").filter((i) => i.type === "bandage")).toHaveLength(2);
    expect(inRoom("REFECTORY").filter((i) => i.type === "freezer")).toHaveLength(1);
    expect(inRoom("REFECTORY").filter((i) => i.type === "mad_kube")).toHaveLength(1);
    expect(inRoom("REFECTORY").filter((i) => i.type === "microwave")).toHaveLength(1);
    expect(inRoom("REFECTORY").filter((i) => i.type === "uncooked_ration")).toHaveLength(32);
    expect(inRoom("HYDROPONIC_CENTER").filter((i) => i.type === "tree_pot")).toHaveLength(3);
    expect(inRoom("CORRIDOR_A").some((i) => i.type === "support_drone")).toBe(true);
    expect(inRoom("ICARUS").filter((i) => i.type === "space_suit")).toHaveLength(6);
    // 2 + 12 (drugs) + 35 + 3 + 1 + 6 + 24 + 1 (apprentron) + 5 + 4 + 1 (mush_sample) = 94 items total
    expect(s.items).toHaveLength(94);
    expect(s.items.filter((i) => i.type === "mush_sample")).toHaveLength(1);
    // Same seed is deterministic; different seeds distribute pooled items differently.
    expect(createGame(makeSeats(4, "others"), { ...DEFAULT_CONFIG, startInventory: [] }, 7).items).toEqual(s.items);
    expect(createGame(makeSeats(4, "others"), { ...DEFAULT_CONFIG, startInventory: [] }, 8).items).not.toEqual(s.items);
  });

  it("spawns 1 Mush sample in a random room across all 27 Daedalus rooms when pre-selection is off", () => {
    const sampleEntry = DEFAULT_CONFIG.startItems.find((i) => i.type === "mush_sample");
    expect(sampleEntry).toEqual({ type: "mush_sample", pool: "daedalus", atSelection: true });
    const allRooms = new Set(Object.keys(DEFAULT_CONFIG.rooms).filter((r) => !r.startsWith("PATROL_") && r !== "ICARUS_CRAFT"));
    expect(allRooms.size).toBe(27);
    const seenRooms = new Set<string>();
    const seats = makeSeats(4, "others");
    const config = { ...DEFAULT_CONFIG, startInventory: [] };
    for (let seed = 1; seed <= 60; seed++) {
      const s = createGame(seats, config, seed);
      const samples = s.items.filter((i) => i.type === "mush_sample");
      expect(samples).toHaveLength(1);
      const sample = samples[0]!;
      expect(sample.at.kind).toBe("room");
      if (sample.at.kind === "room") {
        expect(allRooms.has(sample.at.id)).toBe(true);
        seenRooms.add(sample.at.id);
      }
    }
    expect(seenRooms.size).toBeGreaterThan(10);
  });

  it("spawns 1 apprentron (skill book) in a random storage room drawn from the weighted skill pool", () => {
    const bookEntry = DEFAULT_CONFIG.startItems.find((i) => i.type === "book");
    expect(bookEntry).toEqual({
      type: "book",
      pool: "storage",
      teachesWeights: {
        engineer: 14,
        pilot: 12,
        astrophysician: 10,
        biologist: 10,
        botanic: 10,
        gunman: 10,
        radio_expert: 9,
        medic: 8,
        sprint: 8,
        shrink: 6,
        robotics: 4,
        fireman: 2,
        computer: 2,
        diplomacy: 2,
        logistics: 2,
      },
    });
    const poolSkills = new Set(Object.keys(bookEntry!.teachesWeights!));
    const storageRooms = new Set(DEFAULT_CONFIG.snoop.rooms);
    const seenSkills = new Set<string>();
    const seenRooms = new Set<string>();
    const seats = makeSeats(4, "others");
    const config = { ...DEFAULT_CONFIG, startInventory: [] };
    for (let seed = 1; seed <= 80; seed++) {
      const s = createGame(seats, config, seed);
      const books = s.items.filter((i) => i.type === "book");
      expect(books).toHaveLength(1);
      const book = books[0]!;
      expect(book.at.kind).toBe("room");
      if (book.at.kind === "room") {
        expect(storageRooms.has(book.at.id)).toBe(true);
        seenRooms.add(book.at.id);
      }
      expect(book.teaches).toBeDefined();
      expect(poolSkills.has(book.teaches!)).toBe(true);
      seenSkills.add(book.teaches!);
    }
    expect(seenRooms.size).toBeGreaterThan(1);
    expect(seenSkills.size).toBeGreaterThan(1);
  });

  it("draws distinct starting blueprints without replacement across seeds", () => {
    const seats = makeSeats(4, "others");
    const config = { ...DEFAULT_CONFIG, startInventory: [] };
    for (let seed = 1; seed <= 50; seed++) {
      const s = createGame(seats, config, seed);
      const blueprints = s.items.filter((i) => i.type === "blueprint").map((i) => i.builds);
      expect(blueprints).toHaveLength(6);
      expect(new Set(blueprints).size).toBe(6);
    }
  });
});
