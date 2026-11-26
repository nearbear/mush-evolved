import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { BLUEPRINT_ITEM, CAT_ITEM, CUSTOMIZED_BLASTER_ITEM, hybridParents, SUPPORT_DRONE_ITEM, TREE_POT_ITEM } from "../src/itemIds.ts";
import { itemsIn } from "../src/items.ts";
import { parseGameMessage } from "../src/protocol.ts";
import { MAX_ITEM_NAME_LENGTH, canRenameItem, isRenameableType, renameItem } from "../src/rename.ts";
import { createGame, viewFor } from "../src/rules.ts";
import { joinShip } from "../src/preselection.ts";
import { applyInput, replayGame, type GameSetup, type Input } from "../src/replay.ts";
import { MUSH_CHANNEL, type GameConfig, type GameState } from "../src/types.ts";
import { type DeepPartial, makeSeats, must, mustApply, nextCycle, nextDay, pickSkill, player, testConfig } from "./support.ts";

function ship(config: DeepPartial<GameConfig> = {}): GameState {
  const seats = makeSeats(6);
  seats[0]!.character = "raluca";
  seats[1]!.character = "terrence";
  seats[2]!.character = "chao";
  const s = createGame(seats, testConfig({ startRoom: "CORRIDOR_A", startItems: DEFAULT_CONFIG.startItems, ...config }), 42, { p0: "human", p1: "human", p2: "human" });
  return s;
}

describe("item ownership", () => {
  it("leaves the starting drone unowned until the first person upgrades it", () => {
    let s = ship();
    const drone = s.items.find((i) => i.type === SUPPORT_DRONE_ITEM)!;
    expect(drone.owner).toBeUndefined();

    // Give p1 and p2 robotics + scraps in CORRIDOR_A.
    player(s, "p1").skills.push("robotics");
    player(s, "p2").skills.push("robotics");
    for (let i = 0; i < 6; i++) s.items.push({ id: `scrap-${i}`, type: "metal_scraps", at: { kind: "room", id: "CORRIDOR_A" } });

    // p1 upgrades first -> becomes owner.
    s = mustApply(s, "p1", { type: "upgrade_drone", item: drone.id, upgrade: "firefighter" });
    expect(s.items.find((i) => i.id === drone.id)!.owner).toBe("p1");

    // p2 upgrades second -> ownership stays with p1.
    s = mustApply(s, "p2", { type: "upgrade_drone", item: drone.id, upgrade: "turbo" });
    expect(s.items.find((i) => i.id === drone.id)!.owner).toBe("p1");
  });

  it("assigns ownership of a built drone to its builder", () => {
    let s = ship();
    const bp = { id: "bp-drone", type: BLUEPRINT_ITEM, builds: "SUPPORT_DRONE", at: { kind: "room" as const, id: "CORRIDOR_A" } };
    s.items.push(bp);
    for (let i = 0; i < 4; i++) s.items.push({ id: `m-${i}`, type: "metal_scraps", at: { kind: "room", id: "CORRIDOR_A" } });
    s.items.push({ id: "pl-1", type: "plastic_scraps", at: { kind: "room", id: "CORRIDOR_A" } });

    const before = new Set(s.items.map((i) => i.id));
    s = mustApply(s, "p1", { type: "build", item: bp.id });
    const built = s.items.find((i) => i.type === SUPPORT_DRONE_ITEM && !before.has(i.id))!;
    expect(built.owner).toBe("p1");
  });

  it("assigns Schrödinger to Raluca at launch and when joining in pre-selection", () => {
    const s = ship();
    const cat = s.items.find((i) => i.type === CAT_ITEM)!;
    expect(cat.owner).toBe("p0");

    // Pre-selection join: Raluca joins later and gets Schrödinger owned by her seat.
    const pre = createGame([], testConfig({ preselection: { seats: 4, mushCount: 1, minPlayers: 2, twoMushAbove: 8, endsOn: { day: 2, cycle: 1 } } }), 7);
    const joined = must(joinShip(pre, { id: "p-raluca", name: "RalucaPlayer", isBot: false, character: "raluca" }));
    const preCat = joined.items.find((i) => i.type === CAT_ITEM)!;
    expect(preCat.owner).toBe("p-raluca");
  });

  it("sets plant ownership on sow and graft, and clears it on failed graft", () => {
    let s = ship({ startRoom: "HYDROPONIC_CENTER" });
    // Starting banana plants are unowned.
    const startingPlants = s.items.filter((i) => i.type === TREE_POT_ITEM && i.plant);
    expect(startingPlants.length).toBeGreaterThan(0);
    for (const p of startingPlants) expect(p.owner).toBeUndefined();

    // Pick a valid alien fruit pair that has a hybrid in this ship.
    const [fruitA, fruitB] = hybridParents(Object.keys(s.hybrids)[0]!)!;

    // Sow a fruit into an empty pot -> sower owns it.
    const emptyPot = s.items.find((i) => i.type === TREE_POT_ITEM && !i.plant && i.at.kind === "room" && i.at.id === "HYDROPONIC_CENTER")!;
    s.items.push({ id: "f1", type: fruitA, at: { kind: "player", id: "p0" } });
    s = mustApply(s, "p0", { type: "sow", item: "f1" });
    expect(s.items.find((i) => i.id === emptyPot.id)!.owner).toBe("p0");

    // Rename it, then have p1 graft onto it -> p1 becomes owner and customName resets.
    s = must(renameItem(s, "p0", emptyPot.id, "Sprout"));
    expect(s.items.find((i) => i.id === emptyPot.id)!.customName).toBe("Sprout");
    player(s, "p1").skills.push("botanic");
    s.items.push({ id: "f2", type: fruitB, at: { kind: "player", id: "p1" } });
    s = mustApply(s, "p1", { type: "graft", item: emptyPot.id, fruit: "f2" });
    const grafted = s.items.find((i) => i.id === emptyPot.id)!;
    expect(grafted.owner).toBe("p1");
    expect(grafted.customName).toBeUndefined();

    // Failed graft (dirty actor) clears plant, owner, and customName.
    s = must(renameItem(s, "p1", emptyPot.id, "HybridOne"));
    player(s, "p1").statuses.push("dirty");
    // Ensure a second graftable fruit exists against an alien plant.
    s.items.find((i) => i.id === emptyPot.id)!.plant!.species = fruitA;
    s.items.push({ id: "f3", type: fruitB, at: { kind: "player", id: "p1" } });
    s = mustApply(s, "p1", { type: "graft", item: emptyPot.id, fruit: "f3" });
    const afterFail = s.items.find((i) => i.id === emptyPot.id)!;
    expect(afterFail.plant).toBeUndefined();
    expect(afterFail.owner).toBeUndefined();
    expect(afterFail.customName).toBeUndefined();
  });
});

describe("renaming owned items", () => {
  it("allows the owner to rename and clear custom names for free, silently, and repeatedly", () => {
    let s = ship();
    // Owned customized blaster (p2 is Chao).
    s = pickSkill(s, "p2", "infantryman");
    const blaster = itemsIn(s, { kind: "player", id: "p2" }).find((i) => i.type === CUSTOMIZED_BLASTER_ITEM)!;
    const apBefore = player(s, "p2").ap;
    const logBefore = s.log.length;

    expect(canRenameItem(s, player(s, "p2"), blaster)).toBe(true);
    s = must(applyInput(s, { type: "renameItem", by: "p2", item: blaster.id, name: "Zapper" }));
    expect(s.items.find((i) => i.id === blaster.id)!.customName).toBe("Zapper");
    expect(player(s, "p2").ap).toBe(apBefore);
    expect(s.log.length).toBe(logBefore);

    // Rename again.
    s = must(renameItem(s, "p2", blaster.id, "Zapper II"));
    expect(s.items.find((i) => i.id === blaster.id)!.customName).toBe("Zapper II");

    // Empty name clears customName.
    s = must(renameItem(s, "p2", blaster.id, "   "));
    expect(s.items.find((i) => i.id === blaster.id)!.customName).toBeUndefined();
  });

  it("refuses illegal renames without mutating state", () => {
    const s = ship();
    const drone = s.items.find((i) => i.type === SUPPORT_DRONE_ITEM)!; // in CORRIDOR_A, with everyone

    // Unowned item.
    expect(renameItem(s, "p0", drone.id, "Beeper")).toEqual({ ok: false, error: "not_owner" });
    drone.owner = "p0";
    // Non-owner.
    expect(renameItem(s, "p1", drone.id, "Beeper")).toEqual({ ok: false, error: "not_owner" });
    // Owner out of reach.
    player(s, "p0").room = "LABORATORY";
    expect(renameItem(s, "p0", drone.id, "Beeper")).toEqual({ ok: false, error: "cant_rename" });
    // Too long.
    player(s, "p0").room = "CORRIDOR_A";
    expect(renameItem(s, "p0", drone.id, "x".repeat(MAX_ITEM_NAME_LENGTH + 1))).toEqual({ ok: false, error: "item_name_invalid" });
    // Dead or comatose owner.
    player(s, "p0").comaUntil = s.cycle + 2;
    expect(renameItem(s, "p0", drone.id, "Beeper")).toEqual({ ok: false, error: "comatose" });
    delete player(s, "p0").comaUntil;
    player(s, "p0").alive = false;
    expect(renameItem(s, "p0", drone.id, "Beeper")).toEqual({ ok: false, error: "dead" });
    expect(drone.customName).toBeUndefined();
  });

  it("never renames Schrödinger, even for his owner within reach (owner, 2026-11-26)", () => {
    const s = ship();
    const cat = s.items.find((i) => i.type === CAT_ITEM)!;
    expect(cat.owner).toBe("p0");
    player(s, "p0").room = "LABORATORY";
    expect(canRenameItem(s, player(s, "p0"), cat)).toBe(false);
    expect(renameItem(s, "p0", cat.id, "Mittens")).toEqual({ ok: false, error: "cant_rename" });
    expect(isRenameableType(CAT_ITEM)).toBe(false);
    expect(isRenameableType(SUPPORT_DRONE_ITEM)).toBe(true);
    expect(cat.customName).toBeUndefined();
  });

  it("uses custom names in drone and plant logs", () => {
    // Drone log: custom name without serial.
    let s = ship();
    const drone = s.items.find((i) => i.type === SUPPORT_DRONE_ITEM)!;
    drone.owner = "p1";
    s = must(renameItem(s, "p1", drone.id, "Sparky"));
    player(s, "p1").skills.push("robotics");
    for (let i = 0; i < 3; i++) s.items.push({ id: `sc-${i}`, type: "metal_scraps", at: { kind: "room", id: "CORRIDOR_A" } });
    s = mustApply(s, "p1", { type: "upgrade_drone", item: drone.id, upgrade: "firefighter" });
    const upgradeLog = s.log.find((e) => e.key === "droneUpgraded")!;
    expect(upgradeLog.params?.drone).toBe("Sparky");
    expect(upgradeLog.params?.serial).toBeUndefined();

    // Plant logs: wateredNamedPlant, treatedNamedPlant, namedPlantMatured, namedPlantProduced.
    let ps = ship({ startRoom: "HYDROPONIC_CENTER" });
    const pot = ps.items.find((i) => i.type === TREE_POT_ITEM && !i.plant && i.at.kind === "room" && i.at.id === "HYDROPONIC_CENTER")!;
    ps.items.push({ id: "ban-1", type: "fruit_banana", at: { kind: "player", id: "p0" } });
    ps = mustApply(ps, "p0", { type: "sow", item: "ban-1" });
    ps = must(renameItem(ps, "p0", pot.id, "Audrey"));
    const planted = ps.items.find((i) => i.id === pot.id)!;
    planted.plant!.thirst = 1;
    planted.plant!.sick = true;
    ps = mustApply(ps, "p0", { type: "water", item: pot.id });
    expect(ps.log.find((e) => e.key === "wateredNamedPlant")!.params?.plant).toBe("Audrey");
    ps = mustApply(ps, "p0", { type: "treat", item: pot.id });
    expect(ps.log.find((e) => e.key === "treatedNamedPlant")!.params?.plant).toBe("Audrey");

    // Mature and produce on day change.
    const livePot = ps.items.find((i) => i.id === pot.id)!;
    livePot.plant!.age = 100;
    livePot.plant!.thirst = 0;
    livePot.plant!.sick = false;
    ps = nextDay(nextCycle(ps));
    expect(ps.log.some((e) => e.key === "namedPlantMatured" && e.params?.plant === "Audrey")).toBe(true);
    expect(ps.log.some((e) => e.key === "namedPlantProduced" && e.params?.plant === "Audrey")).toBe(true);
  });

  it("hides owner and customName from players who cannot see the item", () => {
    let s = ship();
    const drone = s.items.find((i) => i.type === SUPPORT_DRONE_ITEM)!;
    drone.owner = "p0";
    drone.at = { kind: "room", id: "LABORATORY" };
    player(s, "p0").room = "LABORATORY";
    player(s, "p1").room = "LABORATORY";
    player(s, "p2").room = "CORRIDOR_A";
    s = must(renameItem(s, "p0", drone.id, "SecretBot"));

    // Floor item in LABORATORY: p0 and p1 see owner & customName; p2 in CORRIDOR_A does not.
    expect(viewFor(s, "p0").roomItems.find((i) => i.id === drone.id)).toMatchObject({ owner: "p0", customName: "SecretBot" });
    expect(viewFor(s, "p1").roomItems.find((i) => i.id === drone.id)).toMatchObject({ owner: "p0", customName: "SecretBot" });
    const p2Json = JSON.stringify(viewFor(s, "p2"));
    expect(p2Json).not.toContain("SecretBot");
    expect(p2Json).not.toMatch(/"owner":"p0"/);

    // Carried by p0: p1 in the same room no longer sees it.
    s = mustApply(s, "p0", { type: "take", item: drone.id });
    expect(viewFor(s, "p0").inventory.find((i) => i.id === drone.id)).toMatchObject({ owner: "p0", customName: "SecretBot" });
    expect(JSON.stringify(viewFor(s, "p1"))).not.toContain("SecretBot");
    expect(viewFor(s, "p1").roomItems.some((i) => i.id === drone.id)).toBe(false);
  });

  it("parses renameItem wire messages and replays deterministically", () => {
    expect(parseGameMessage(JSON.stringify({ type: "renameItem", item: "item-1", name: "Bolt" }))).toEqual({
      type: "renameItem",
      item: "item-1",
      name: "Bolt",
    });
    expect(parseGameMessage(JSON.stringify({ type: "renameItem", item: "", name: "Bolt" }))).toBeNull();
    expect(parseGameMessage(JSON.stringify({ type: "renameItem", item: "item-1", name: "x".repeat(MAX_ITEM_NAME_LENGTH * 4 + 1) }))).toBeNull();

    // Chao picks Infantryman (with the anySkill and instantActions cheats) for an owned blaster, then renames it.
    const seats = makeSeats(4);
    seats[0]!.character = "chao";
    const setup: GameSetup = {
      seats,
      config: testConfig({ startRoom: "LABORATORY" }),
      seed: 12,
      rulesVersion: "test",
    };
    const prefix: Input[] = [
      { type: "cheat", by: "p0", cheat: "anySkill", on: true },
      { type: "cheat", by: "p0", cheat: "instantActions", on: true },
      { type: "action", by: "p0", action: { type: "pick_skill", skill: "infantryman" }, at: 1000 },
    ];
    let forward = createGame(setup.seats, setup.config, setup.seed);
    for (const input of prefix) forward = must(applyInput(forward, input));
    const blaster = itemsIn(forward, { kind: "player", id: "p0" }).find((i) => i.type === CUSTOMIZED_BLASTER_ITEM)!;
    const replayed = replayGame(setup, [...prefix, { type: "renameItem", by: "p0", item: blaster.id, name: "Quantum" }]);
    expect(replayed.items.find((i) => i.id === blaster.id)!.customName).toBe("Quantum");
  });
});
