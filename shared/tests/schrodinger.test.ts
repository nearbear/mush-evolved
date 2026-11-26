// Schrödinger (owner, 2026-11-21): Raluca's cat arrives with her in the laboratory, moves at each cycle change by
// eMush's cat AI, and supports Caress, Infectious Caress, and Take (scratch + contamination when Mush).
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, PRESELECTION } from "../src/config.ts";
import { breakDoor, doorId } from "../src/doors.ts";
import { CAMERA_EQUIPMENT } from "../src/equipment.ts";
import { CAT_ITEM, MYCO_ALARM_ITEM } from "../src/itemIds.ts";
import { shortestPath } from "../src/paths.ts";
import { joinShip } from "../src/preselection.ts";
import { applyAction, createGame, viewFor } from "../src/rules.ts";
import { MUSH_CHANNEL, type GameConfig, type GameState, type ItemState, type RoomId, type Seat } from "../src/types.ts";
import { makeSeats, must, mustApply, nextCycle, offered, option, player, testConfig } from "./support.ts";

const LAB = "LABORATORY";

const quiet = (favoredChance = DEFAULT_CONFIG.schrodinger.favoredChance): GameConfig =>
  testConfig({ schrodinger: { favoredChance } });

/** p0 is Raluca, p1 and p2 someone else. */
const seats = (): Seat[] => makeSeats(3).map((s, i) => (i === 0 ? { ...s, character: "raluca" } : { ...s, character: i === 1 ? "chun" : "kuanti" }));

const cats = (s: GameState): ItemState[] => s.items.filter((i) => i.type === CAT_ITEM);
const cat = (s: GameState): ItemState => {
  const all = cats(s);
  expect(all).toHaveLength(1);
  return all[0]!;
};
const catRoom = (s: GameState): RoomId | null => {
  const at = cat(s).at;
  return at.kind === "room" ? at.id : null;
};
const lines = (s: GameState, key: string) => s.log.filter((e) => e.key === key);
const neighbours = (s: GameState, room: RoomId): RoomId[] => [...s.config.rooms[room]!];

/** A ship with the cat in `room` and everyone parked in `others` (Raluca too unless `raluca` says where she is). */
function ship(favoredChance: number, room: RoomId, others: RoomId, raluca: RoomId | "dead" = others, seed = 5): GameState {
  const s = createGame(seats(), quiet(favoredChance), seed);
  for (const p of s.players) p.room = others;
  const r = player(s, "p0");
  if (raluca === "dead") r.alive = false;
  else r.room = raluca;
  cat(s).at = { kind: "room", id: room };
  return s;
}

/** A room two doors from LAB (not adjacent to it), and the room between. */
function twoAway(s: GameState): { far: RoomId; via: RoomId } {
  for (const via of neighbours(s, LAB)) {
    const far = neighbours(s, via).find((r) => r !== LAB && !neighbours(s, LAB).includes(r) && s.config.rooms[r]);
    if (far) return { far, via };
  }
  throw new Error("no room two doors from the lab");
}

describe("Schrödinger: arrival", () => {
  it("pins the confirmed numbers", () => {
    const { owner, room, favoredChance, caress, mushCaress, take } = DEFAULT_CONFIG.schrodinger;
    expect([owner, room, favoredChance, caress.cost.ap, caress.morale, caress.injuryChance, mushCaress.cost.ap, take.injuryChance]).toEqual([
      "raluca",
      "LABORATORY",
      0.7,
      1,
      3,
      0.1,
      1,
      0.2,
    ]);
  });

  it("appears on the laboratory floor when Raluca boards at launch", () => {
    const s = createGame(seats(), quiet(), 1);
    expect(cat(s).at).toEqual({ kind: "room", id: LAB });
    expect(s.log.some((e) => e.key.startsWith("cat"))).toBe(false);
  });

  it("doesn't exist without Raluca aboard", () => {
    const s = createGame(makeSeats(3).map((x) => ({ ...x, character: x.character === "raluca" ? "chun" : x.character })), quiet(), 1);
    expect(cats(s)).toEqual([]);
  });

  it("appears when Raluca joins a ship in pre-selection, and only then", () => {
    let s = createGame([], { ...quiet(), preselection: { ...PRESELECTION, seats: 4 } }, 1);
    const [raluca, chun] = seats();
    s = must(joinShip(s, chun!));
    expect(cats(s)).toEqual([]);
    s = must(joinShip(s, raluca!));
    expect(cat(s).at).toEqual({ kind: "room", id: LAB });
  });
});

describe("Schrödinger: Raluca alive", () => {
  it("stays in her room, whatever the roll", () => {
    const s = nextCycle(ship(0, LAB, LAB));
    expect(catRoom(s)).toBe(LAB);
    expect(lines(s, "catLeft")).toEqual([]);
  });

  it("on the favoured roll, steps toward her along the shortest path, with public lines in both rooms", () => {
    const base = ship(1, LAB, LAB);
    const { far } = twoAway(base);
    player(base, "p0").room = far;
    const s = nextCycle(base);
    const step = shortestPath(s.config.rooms, LAB, far)![0]!;
    expect(catRoom(s)).toBe(step);
    expect(lines(s, "catLeft")).toEqual([expect.objectContaining({ room: LAB, visibleTo: "all", params: { room: step } })]);
    expect(lines(s, "catEntered")).toEqual([expect.objectContaining({ room: step, visibleTo: "all", params: { room: LAB } })]);
  });

  it("otherwise takes a random step", () => {
    const base = ship(0, LAB, LAB);
    player(base, "p0").room = twoAway(base).far;
    expect(neighbours(base, LAB)).toContain(catRoom(nextCycle(base)));
  });
});

describe("Schrödinger: Raluca dead", () => {
  it("with people in his room, on the favoured roll, steps to an empty neighbour", () => {
    const base = ship(1, LAB, LAB, "dead");
    const next = neighbours(base, LAB);
    // Someone in every neighbour but the last.
    for (const [i, r] of next.slice(0, -1).entries()) base.players.push({ ...player(base, "p1"), id: `x${i}`, room: r });
    expect(catRoom(nextCycle(base))).toBe(next.at(-1));
  });

  it("counts any living player as people, but not the dead", () => {
    const base = ship(1, LAB, LAB, "dead");
    for (const p of base.players) if (p.id !== "p1") p.alive = false;
    expect(neighbours(base, LAB)).toContain(catRoom(nextCycle(base)));
    for (const p of base.players) p.alive = false;
    base.players[1]!.alive = true;
    base.players[1]!.room = "REFECTORY";
    expect(catRoom(nextCycle(base))).toBe(LAB);
  });

  it("in an empty room, stays on the favoured roll", () => {
    const s = nextCycle(ship(1, LAB, "REFECTORY", "dead"));
    expect(catRoom(s)).toBe(LAB);
    expect(lines(s, "catLeft")).toEqual([]);
  });

  it("in an empty room, otherwise takes a random step, only through a working door", () => {
    const base = ship(0, LAB, "REFECTORY", "dead");
    const [open, ...rest] = neighbours(base, LAB);
    for (const r of rest) breakDoor(base, doorId(LAB, r));
    expect(catRoom(nextCycle(base))).toBe(open);
  });

  it("stays when every door out is broken", () => {
    const base = ship(0, LAB, "REFECTORY", "dead");
    for (const r of neighbours(base, LAB)) breakDoor(base, doorId(LAB, r));
    const s = nextCycle(base);
    expect(catRoom(s)).toBe(LAB);
    expect(lines(s, "catLeft")).toEqual([]);
  });
});

describe("Schrödinger: carried", () => {
  it("acts from his carrier's room, and a move takes him out of their hands", () => {
    const base = ship(1, LAB, LAB, "dead");
    cat(base).at = { kind: "player", id: "p1" };
    const s = nextCycle(base);
    expect(neighbours(s, LAB)).toContain(catRoom(s));
    expect(lines(s, "catLeft")).toEqual([expect.objectContaining({ room: LAB })]);
  });

  it("stays in their hands when he doesn't move", () => {
    const base = ship(0, LAB, LAB);
    cat(base).at = { kind: "player", id: "p1" };
    expect(cat(nextCycle(base)).at).toEqual({ kind: "player", id: "p1" });
  });
});

/** A ship in LAB with Raluca (human, p0), Finola (human + germaphobe, p1), and Kuan Ti (Mush with 2 spores, p2). */
function actionShip(): GameState {
  const customSeats: Seat[] = makeSeats(3).map((s, i) => ({ ...s, character: (["raluca", "finola", "kuanti"] as const)[i]! }));
  const s = createGame(customSeats, testConfig({ schrodinger: { caress: { injuryChance: 0 }, take: { injuryChance: 0 } } }), 7);
  for (const p of s.players) {
    p.room = LAB;
    p.role = iRole(p.id);
    p.ap = s.config.maxAp;
    p.morale = 4;
  }
  player(s, "p2").spores = 2;
  return s;
}
const iRole = (id: string) => (id === "p2" ? "mush" : "human");

describe("Schrödinger: Caress", () => {
  it("requires carrying Schrödinger in inventory, costs 1 AP, reports injury chance, logs publicly, and grants +3 morale once", () => {
    const s = createGame(
      makeSeats(3).map((x, i) => ({ ...x, character: (["raluca", "chun", "kuanti"] as const)[i]! })),
      quiet(),
      7,
    );
    for (const p of s.players) {
      p.room = LAB;
      p.morale = 4;
    }
    const c = cat(s);
    // On the floor: not offered and illegal.
    expect(offered(s, "p0").some((a) => a.type === "caress")).toBe(false);
    expect(option(s, "p0", { type: "caress", item: c.id })).toBeUndefined();
    expect(applyAction(s, "p0", { type: "caress", item: c.id }).ok).toBe(false);

    c.at = { kind: "player", id: "p0" };
    const opt = option(s, "p0", { type: "caress", item: c.id });
    expect(opt?.cost.ap).toBe(s.config.schrodinger.caress.cost.ap);
    expect(opt?.injury).toBe(s.config.schrodinger.caress.injuryChance);

    const apBefore = player(s, "p0").ap;
    const after1 = mustApply(s, "p0", { type: "caress", item: c.id });
    expect(player(after1, "p0").ap).toBe(apBefore - s.config.schrodinger.caress.cost.ap);
    expect(player(after1, "p0").morale).toBe(4 + s.config.schrodinger.caress.morale);
    expect(player(after1, "p0").caressedCat).toBe(true);
    expect(lines(after1, "caressedCat")).toEqual([expect.objectContaining({ room: LAB, visibleTo: "all", params: { name: "raluca" } })]);

    // Still repeatable after claiming the bonus, for 0 extra morale.
    const after2 = mustApply(after1, "p0", { type: "caress", item: c.id });
    expect(player(after2, "p0").morale).toBe(4 + s.config.schrodinger.caress.morale);
    expect(lines(after2, "caressedCat")).toHaveLength(2);

    // caressedCat is private to the actor; roommates never see it.
    expect(viewFor(after1, "p0").you.caressedCat).toBe(true);
    expect(viewFor(after1, "p1").you.caressedCat).toBeUndefined();
    expect(JSON.stringify(viewFor(after1, "p1").players)).not.toContain("caressedCat");
  });

  it("is blocked for Germaphobe (Finola), shown disabled with lacks germaphobe, and illegal apply leaves state unchanged", () => {
    const s = actionShip();
    const c = cat(s);
    c.at = { kind: "player", id: "p1" };
    const opt = option(s, "p1", { type: "caress", item: c.id });
    expect(opt?.lacks).toContain("germaphobe");
    expect(offered(s, "p1").some((a) => a.type === "caress")).toBe(false);
    const res = applyAction(s, "p1", { type: "caress", item: c.id });
    expect(res.ok).toBe(false);
    expect(player(s, "p1").morale).toBe(4);
    expect(player(s, "p1").caressedCat).toBeUndefined();
  });
});

describe("Schrödinger: Infectious Caress", () => {
  it("requires carrying Schrödinger in inventory, spends 1 AP and 1 spore covertly, rings Myco Alarm, and notifies Mush chat", () => {
    const s = actionShip();
    const c = cat(s);
    s.items.push({ id: `item-${s.nextItemId++}`, type: MYCO_ALARM_ITEM, at: { kind: "room", id: LAB } });

    // On the floor: not offered and illegal.
    expect(offered(s, "p2").some((a) => a.type === "mush_caress")).toBe(false);
    expect(applyAction(s, "p2", { type: "mush_caress", item: c.id }).ok).toBe(false);

    c.at = { kind: "player", id: "p2" };
    expect(offered(s, "p0").some((a) => a.type === "mush_caress")).toBe(false);
    expect(offered(s, "p2").some((a) => a.type === "mush_caress" && a.item === c.id)).toBe(true);

    const apBefore = player(s, "p2").ap;
    const after = mustApply(s, "p2", { type: "mush_caress", item: c.id });
    expect(player(after, "p2").ap).toBe(apBefore - s.config.schrodinger.mushCaress.cost.ap);
    expect(player(after, "p2").spores).toBe(1);
    expect(cat(after).mush).toBe(true);

    // Covert: bystander p0 does not see mushCaressedCat, actor p2 does.
    expect(viewFor(after, "p0").log.some((e) => e.key === "mushCaressedCat")).toBe(false);
    expect(viewFor(after, "p2").log.some((e) => e.key === "mushCaressedCat")).toBe(true);
    // Rings Myco Alarm (`spore` tag).
    expect(lines(after, "mycoAlarmRang")).toHaveLength(1);
    // Mush channel system notice.
    expect(after.chat.some((m) => m.channel === MUSH_CHANNEL && m.system?.key === "mushConvertedCat" && m.system.params?.name === "kuanti")).toBe(true);
    // Cannot infect again once already Mush.
    expect(offered(after, "p2").some((a) => a.type === "mush_caress")).toBe(false);
    expect(applyAction(after, "p2", { type: "mush_caress", item: c.id }).ok).toBe(false);
  });

  it("is revealed by a camera in the room, and is blocked in pre-selection or without spores", () => {
    const s = actionShip();
    const c = cat(s);
    c.at = { kind: "player", id: "p2" };
    (s.equipment[LAB] ??= []).push({ id: "cam-1", type: CAMERA_EQUIPMENT });
    const after = mustApply(s, "p2", { type: "mush_caress", item: c.id });
    expect(viewFor(after, "p0").log.some((e) => e.key === "mushCaressedCat")).toBe(true);

    const pre = actionShip();
    cat(pre).at = { kind: "player", id: "p2" };
    pre.preselection = true;
    expect(offered(pre, "p2").some((a) => a.type === "mush_caress")).toBe(false);
    expect(applyAction(pre, "p2", { type: "mush_caress", item: cat(pre).id }).ok).toBe(false);

    const dry = actionShip();
    cat(dry).at = { kind: "player", id: "p2" };
    player(dry, "p2").spores = 0;
    expect(offered(dry, "p2").some((a) => a.type === "mush_caress")).toBe(false);
    expect(applyAction(dry, "p2", { type: "mush_caress", item: cat(dry).id }).ok).toBe(false);
  });

  it("exposes ItemView.mush only to living Mush, never to humans or dead Mush", () => {
    const s = actionShip();
    const c = cat(s);
    c.at = { kind: "player", id: "p2" };
    const after = mustApply(s, "p2", { type: "mush_caress", item: c.id });
    const dropped = mustApply(after, "p2", { type: "drop", item: c.id });

    const mushItem = viewFor(dropped, "p2").roomItems.find((i) => i.id === c.id);
    const humanItem = viewFor(dropped, "p0").roomItems.find((i) => i.id === c.id);
    expect(mushItem?.mush).toBe(true);
    expect(humanItem?.mush).toBeUndefined();
    expect(JSON.stringify(viewFor(dropped, "p0"))).not.toContain('"mush":true');

    player(dropped, "p2").alive = false;
    const deadMushView = viewFor(dropped, "p2");
    expect(deadMushView.roomItems.find((i) => i.id === c.id)?.mush).toBeUndefined();
  });
});

describe("Schrödinger: Take, Caress & scratch contamination", () => {
  it("reports the cat-specific 20% injury chance on take (vs default transfer injury chance on other items)", () => {
    const s = createGame(seats(), quiet(), 7);
    for (const p of s.players) p.room = LAB;
    const c = cat(s);
    const other: ItemState = { id: `item-${s.nextItemId++}`, type: "metal_scraps", at: { kind: "room", id: LAB } };
    s.items.push(other);
    expect(option(s, "p1", { type: "take", item: c.id })?.injury).toBe(s.config.schrodinger.take.injuryChance);
    expect(option(s, "p1", { type: "take", item: other.id })?.injury).toBe(s.config.transfer.injuryChance);
  });

  it("never scratches his owner when she picks him up, even when Mush (owner, 2026-11-26)", () => {
    const customSeats: Seat[] = makeSeats(3).map((s, i) => ({ ...s, character: (["raluca", "finola", "kuanti"] as const)[i]! }));
    const s = createGame(customSeats, testConfig({ schrodinger: { take: { injuryChance: 1 }, caress: { injuryChance: 0 } } }), 7);
    for (const p of s.players) {
      p.room = LAB;
      p.role = iRole(p.id);
      p.ap = s.config.maxAp;
    }
    player(s, "p2").spores = 1;
    const c = cat(s);
    expect(c.owner).toBe("p0");
    c.at = { kind: "player", id: "p2" };
    const infected = mustApply(s, "p2", { type: "mush_caress", item: c.id });
    const onFloor = mustApply(infected, "p2", { type: "drop", item: c.id });

    expect(option(onFloor, "p0", { type: "take", item: c.id })?.injury).toBe(0);
    const hpBefore = player(onFloor, "p0").hp;
    const taken = mustApply(onFloor, "p0", { type: "take", item: c.id });
    expect(player(taken, "p0").hp).toBe(hpBefore);
    expect(taken.contamination["p0"]).toBeUndefined();
    // Anyone else still risks it.
    expect(option(onFloor, "p1", { type: "take", item: c.id })?.injury).toBe(1);
  });

  it("does not contaminate on Take or Caress when the scratch/injury roll does not trigger", () => {
    const s = actionShip();
    const c = cat(s);
    c.at = { kind: "player", id: "p2" };
    const infected = mustApply(s, "p2", { type: "mush_caress", item: c.id });
    const onFloor = mustApply(infected, "p2", { type: "drop", item: c.id });

    const taken = mustApply(onFloor, "p0", { type: "take", item: c.id });
    expect(taken.contamination["p0"]).toBeUndefined();
    const caressed = mustApply(taken, "p0", { type: "caress", item: c.id });
    expect(caressed.contamination["p0"]).toBeUndefined();
  });

  it("contaminates a living human (not his owner) by 1 and deals 2 HP injury when scratched on Take, converting at capacity", () => {
    const customSeats: Seat[] = makeSeats(3).map((s, i) => ({ ...s, character: (["raluca", "finola", "kuanti"] as const)[i]! }));
    const s = createGame(customSeats, testConfig({ schrodinger: { take: { injuryChance: 1 }, caress: { injuryChance: 0 } } }), 7);
    for (const p of s.players) {
      p.room = LAB;
      p.role = iRole(p.id);
      p.ap = s.config.maxAp;
    }
    player(s, "p2").spores = 1;
    const c = cat(s);
    c.at = { kind: "player", id: "p2" };
    const infected = mustApply(s, "p2", { type: "mush_caress", item: c.id });
    const onFloor = mustApply(infected, "p2", { type: "drop", item: c.id });

    const hpBefore = player(onFloor, "p1").hp;
    const taken1 = mustApply(onFloor, "p1", { type: "take", item: c.id });
    expect(player(taken1, "p1").hp).toBe(hpBefore - 2);
    expect(taken1.contamination["p1"]).toBe(1);
    expect(cat(taken1).mush).toBe(true);
    expect(viewFor(taken1, "p1").chat.some((m) => m.system?.key === "mushContaminated")).toBe(false);
    expect(taken1.chat.some((m) => m.channel === MUSH_CHANNEL && m.system?.key === "mushContaminated" && m.system.params?.name === "finola")).toBe(true);

    // Dropping and picking him up again scratches and contaminates again, converting at capacity.
    let cur = taken1;
    for (let i = 1; i < cur.config.infection.capacity; i++) {
      player(cur, "p1").hp = cur.config.maxHp;
      cur = mustApply(cur, "p1", { type: "drop", item: c.id });
      cur = mustApply(cur, "p1", { type: "take", item: c.id });
    }
    expect(player(cur, "p1").role).toBe("mush");
  });

  it("contaminates a living human by 1 and deals 2 HP injury when scratched on Caress", () => {
    const customSeats: Seat[] = makeSeats(3).map((s, i) => ({ ...s, character: (["raluca", "finola", "kuanti"] as const)[i]! }));
    const s = createGame(customSeats, testConfig({ schrodinger: { take: { injuryChance: 0 }, caress: { injuryChance: 1 } } }), 7);
    for (const p of s.players) {
      p.room = LAB;
      p.role = iRole(p.id);
      p.ap = s.config.maxAp;
    }
    player(s, "p2").spores = 1;
    const c = cat(s);
    c.at = { kind: "player", id: "p2" };
    const infected = mustApply(s, "p2", { type: "mush_caress", item: c.id });
    const onFloor = mustApply(infected, "p2", { type: "drop", item: c.id });
    const held = mustApply(onFloor, "p0", { type: "take", item: c.id });
    expect(held.contamination["p0"]).toBeUndefined();

    const hpBefore = player(held, "p0").hp;
    const caressed = mustApply(held, "p0", { type: "caress", item: c.id });
    expect(player(caressed, "p0").hp).toBe(hpBefore - 2);
    expect(caressed.contamination["p0"]).toBe(1);
  });

  it("blocks both injury and contamination when the human carries Protective Gloves", () => {
    const customSeats: Seat[] = makeSeats(3).map((s, i) => ({ ...s, character: (["raluca", "finola", "kuanti"] as const)[i]! }));
    const s = createGame(customSeats, testConfig({ schrodinger: { take: { injuryChance: 1 }, caress: { injuryChance: 1 } } }), 7);
    for (const p of s.players) {
      p.room = LAB;
      p.role = iRole(p.id);
      p.ap = s.config.maxAp;
    }
    player(s, "p2").spores = 1;
    s.items.push({ id: `item-${s.nextItemId++}`, type: "protection_gloves", at: { kind: "player", id: "p0" } });
    const c = cat(s);
    delete c.owner; // so the take could scratch her
    c.at = { kind: "player", id: "p2" };
    const infected = mustApply(s, "p2", { type: "mush_caress", item: c.id });
    const onFloor = mustApply(infected, "p2", { type: "drop", item: c.id });

    const hpBefore = player(onFloor, "p0").hp;
    const taken = mustApply(onFloor, "p0", { type: "take", item: c.id });
    expect(player(taken, "p0").hp).toBe(hpBefore);
    expect(taken.contamination["p0"]).toBeUndefined();

    const caressed = mustApply(taken, "p0", { type: "caress", item: c.id });
    expect(player(caressed, "p0").hp).toBe(hpBefore);
    expect(caressed.contamination["p0"]).toBeUndefined();
  });

  it("does not contaminate Mush or immune humans (Chun) when scratched", () => {
    const s = createGame(
      makeSeats(3).map((x, i) => ({ ...x, character: (["raluca", "chun", "kuanti"] as const)[i]! })),
      testConfig({ schrodinger: { take: { injuryChance: 1 } } }),
      7,
    );
    for (const p of s.players) {
      p.room = LAB;
      p.role = p.id === "p2" ? "mush" : "human";
    }
    player(s, "p2").spores = 1;
    const c = cat(s);
    c.at = { kind: "player", id: "p2" };
    const infected = mustApply(s, "p2", { type: "mush_caress", item: c.id });
    const onFloor = mustApply(infected, "p2", { type: "drop", item: c.id });

    const chunTook = mustApply(onFloor, "p1", { type: "take", item: c.id });
    expect(chunTook.contamination["p1"]).toBeUndefined();

    const dropped = mustApply(chunTook, "p1", { type: "drop", item: c.id });
    const mushTook = mustApply(dropped, "p2", { type: "take", item: c.id });
    expect(mushTook.contamination["p2"]).toBeUndefined();
  });
});
