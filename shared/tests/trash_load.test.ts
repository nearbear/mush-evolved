import { describe, expect, it } from "vitest";
import { BLUEPRINTS, BLUEPRINT_ITEM } from "../src/blueprints.ts";
import { advanceNeron } from "../src/comms.ts";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { BOOK_ITEM, TREE_POT_ITEM } from "../src/items.ts";
import { PROJECT_COMPLETE, PROJECT_IDS, projectStatus } from "../src/projects.ts";
import { createGame } from "../src/rules.ts";
import { SKILLS } from "../src/skills.ts";
import type { GameState, ItemState } from "../src/types.ts";
import { clone, makeSeats, mustApply, setProgress } from "./support.ts";

// Scrap heap (TRASH_LOAD; owner, 2026-11-16): completing it spawns one item from each pool across the storage rooms in shuffled order.
const work = { type: "project", equipment: "NEXUS_ROOM:NERON_CORE", project: "TRASH_LOAD" } as const;

function ship(progress = PROJECT_COMPLETE - 1, seed = 7): GameState {
  const s = createGame(makeSeats(3, "others"), DEFAULT_CONFIG, seed);
  for (const p of s.players) p.room = "NEXUS_ROOM";
  setProgress(s, { project: "TRASH_LOAD" }, progress);
  return s;
}

function addedItems(before: GameState, after: GameState): ItemState[] {
  const beforeIds = new Set(before.items.map((i) => i.id));
  return after.items.filter((i) => !beforeIds.has(i.id));
}

describe("Scrap heap project (TRASH_LOAD)", () => {
  it("uses the confirmed config values, weapon blueprints, and full status", () => {
    expect(DEFAULT_CONFIG.project.trashLoad).toEqual({
      rooms: ["STORAGE_FRONT", "STORAGE_A_0", "STORAGE_A_1", "STORAGE_B_0", "STORAGE_B_1"],
      weaponBlueprints: ["MISSILE_LAUNCHER", "SNIPER_RIFFLE", "MACHINE_GUN"],
      misc: ["knife", "soap", TREE_POT_ITEM, "protection_gloves"],
    });
    expect(BLUEPRINTS.SNIPER_RIFFLE).toEqual({ needs: ["metal_scraps", "metal_scraps", "plastic_scraps"], makes: { item: "sniper_riffle" } });
    expect(BLUEPRINTS.MACHINE_GUN).toEqual({ needs: ["metal_scraps", "metal_scraps", "metal_scraps", "metal_scraps"], makes: { item: "machine_gun" } });
    expect(projectStatus("TRASH_LOAD")).toBe("full");
  });

  it("spawns one item per pool across the storage rooms in wrapped shuffled order when completed", () => {
    const s = ship();
    const done = mustApply(s, "p0", work);
    const added = addedItems(s, done);
    expect(added).toHaveLength(7);

    const { rooms, weaponBlueprints, misc } = s.config.project.trashLoad;
    const roomSet = new Set(rooms);
    expect(added.every((i) => i.at.kind === "room" && roomSet.has(i.at.id))).toBe(true);

    // 7 items across 5 rooms in repeating shuffled order: first 2 rooms get 2 items, remaining 3 get 1;
    // items[0] and items[5] share a room, and items[1] and items[6] share a room.
    const counts = new Map<string, number>();
    for (const item of added) counts.set(item.at.id, (counts.get(item.at.id) ?? 0) + 1);
    expect([...counts.values()].sort()).toEqual([1, 1, 1, 2, 2]);
    expect(added[0]!.at.id).toBe(added[5]!.at.id);
    expect(added[1]!.at.id).toBe(added[6]!.at.id);

    expect(added[0]!.type).toBe("thick_tube");
    expect(added[1]!.type).toBe("plastic_scraps");
    expect(added[2]!.type).toBe(BOOK_ITEM);
    expect(SKILLS).toContain(added[2]!.teaches);
    expect(added[3]!.type).toBe(BLUEPRINT_ITEM);
    expect(weaponBlueprints).toContain(added[3]!.builds);
    expect(added[4]!.type).toBe("rope");
    expect(added[5]!.type).toBe("bandage");
    expect(misc).toContain(added[6]!.type);
  });

  it("spawns the items when a NERON update completes it", () => {
    const s = clone(ship(0));
    for (const id of PROJECT_IDS) if (id !== "TRASH_LOAD") s.projects[id] = PROJECT_COMPLETE;
    const before = clone(s);
    expect(advanceNeron(s, 100)).toBe("TRASH_LOAD");
    expect(addedItems(before, s)).toHaveLength(7);
  });

  it("spawns none before it is complete", () => {
    const s = ship(0);
    const after = mustApply(s, "p0", work);
    expect(addedItems(s, after)).toHaveLength(0);
  });

  it("draws across all weapon blueprints, misc items, and room orders over multiple seeds", () => {
    const blueprints = new Set<string>();
    const miscs = new Set<string>();
    const firstRooms = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) {
      const s = ship(PROJECT_COMPLETE - 1, seed);
      const done = mustApply(s, "p0", work);
      const added = addedItems(s, done);
      firstRooms.add(added[0]!.at.id);
      blueprints.add(added[3]!.builds!);
      miscs.add(added[6]!.type);
    }
    expect(blueprints).toEqual(new Set(DEFAULT_CONFIG.project.trashLoad.weaponBlueprints));
    expect(miscs).toEqual(new Set(DEFAULT_CONFIG.project.trashLoad.misc));
    expect(firstRooms.size).toBeGreaterThan(1);
  });

  it("allows building the new SNIPER_RIFFLE and MACHINE_GUN blueprints", () => {
    const s = ship(0);
    s.items.push(
      { id: "bp_sniper", type: BLUEPRINT_ITEM, builds: "SNIPER_RIFFLE", at: { kind: "room", id: "NEXUS_ROOM" } },
      { id: "bp_mg", type: BLUEPRINT_ITEM, builds: "MACHINE_GUN", at: { kind: "room", id: "NEXUS_ROOM" } },
      ...Array.from({ length: 6 }, (_, i) => ({ id: `m${i}`, type: "metal_scraps", at: { kind: "room" as const, id: "NEXUS_ROOM" as const } })),
      { id: "p0_s", type: "plastic_scraps", at: { kind: "room", id: "NEXUS_ROOM" } },
    );
    const afterSniper = mustApply(s, "p0", { type: "build", item: "bp_sniper" });
    expect(afterSniper.items.some((i) => i.type === "sniper_riffle")).toBe(true);
    const afterMg = mustApply(afterSniper, "p0", { type: "build", item: "bp_mg" });
    expect(afterMg.items.some((i) => i.type === "machine_gun")).toBe(true);
  });
});
