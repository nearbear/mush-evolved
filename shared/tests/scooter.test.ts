import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { ITEM_TYPES } from "../src/itemTypes.ts";
import { produceItem, spawnInRoom } from "../src/items.ts";
import { createGame, viewFor } from "../src/rules.ts";
import { makeSeats, mustApply, nextCycle, player, testConfig } from "./support.ts";

const base = testConfig();

function ship() {
  const s = createGame(makeSeats(3), base, 7);
  // Remove any random starting scooter so tests control the exact item.
  s.items = s.items.filter((i) => i.type !== "scooter");
  player(s, "p0").mp = 0;
  return s;
}

function giveScooter(s: ReturnType<typeof ship>, pid = "p0", charges?: number) {
  const { item } = produceItem(s, player(s, pid), "scooter");
  if (charges !== undefined) item.charges = charges;
  return item;
}

function firstMove(s: ReturnType<typeof ship>, pid = "p0") {
  const act = viewFor(s, pid).actions.find((a) => a.action.type === "move")!.action;
  return mustApply(s, pid, act);
}

describe("Antigrav Scooter", () => {
  it("pins the configured numbers", () => {
    const { extraMpPerConversion, charges } = DEFAULT_CONFIG.scooter;
    expect([extraMpPerConversion, charges.start, charges.max, charges.perCycle]).toEqual([2, 8, 8, 1]);
    expect(ITEM_TYPES.scooter?.notImplemented).toBeFalsy();
  });

  it("starts with 8 charges and adds 2 MP per AP-to-MP conversion, spending 1 charge", () => {
    const plain = ship();
    const withScooter = ship();
    const scooter = giveScooter(withScooter);
    expect(scooter.charges).toBe(base.scooter.charges.start);

    const a = firstMove(plain);
    const b = firstMove(withScooter);
    expect(player(b, "p0").mp - player(a, "p0").mp).toBe(base.scooter.extraMpPerConversion);
    expect(player(b, "p0").ap).toBe(player(a, "p0").ap);
    expect(b.items.find((i) => i.id === scooter.id)!.charges).toBe(base.scooter.charges.start - 1);
  });

  it("does not spend a charge when moving with existing MP", () => {
    const s = ship();
    const scooter = giveScooter(s);
    player(s, "p0").mp = base.movement.mpPerMove;

    const after = firstMove(s);
    expect(after.items.find((i) => i.id === scooter.id)!.charges).toBe(base.scooter.charges.start);
  });

  it("does not stack with Sprinter and does not spend a charge when the carrier has Sprinter", () => {
    const sprinterOnly = ship();
    player(sprinterOnly, "p0").skills.push("sprint");

    const both = ship();
    player(both, "p0").skills.push("sprint");
    const scooter = giveScooter(both);

    const a = firstMove(sprinterOnly);
    const b = firstMove(both);
    expect(player(b, "p0").mp).toBe(player(a, "p0").mp);
    expect(b.items.find((i) => i.id === scooter.id)!.charges).toBe(base.scooter.charges.start);
  });

  it("does not stack with a second scooter in inventory", () => {
    const one = ship();
    giveScooter(one);

    const two = ship();
    const s1 = giveScooter(two);
    const s2 = giveScooter(two);

    const a = firstMove(one);
    const b = firstMove(two);
    expect(player(b, "p0").mp).toBe(player(a, "p0").mp);
    expect(b.items.find((i) => i.id === s1.id)!.charges).toBe(base.scooter.charges.start - 1);
    expect(b.items.find((i) => i.id === s2.id)!.charges).toBe(base.scooter.charges.start);
  });

  it("does not apply when on the floor, broken, or out of charges", () => {
    const plain = ship();
    const plainMp = player(firstMove(plain), "p0").mp;

    const onFloor = ship();
    spawnInRoom(onFloor, player(onFloor, "p0").room, "scooter");
    expect(player(firstMove(onFloor), "p0").mp).toBe(plainMp);

    const broken = ship();
    const brokenScooter = giveScooter(broken);
    brokenScooter.broken = true;
    const afterBroken = firstMove(broken);
    expect(player(afterBroken, "p0").mp).toBe(plainMp);
    expect(afterBroken.items.find((i) => i.id === brokenScooter.id)!.charges).toBe(base.scooter.charges.start);

    const empty = ship();
    const emptyScooter = giveScooter(empty, "p0", 0);
    expect(player(firstMove(empty), "p0").mp).toBe(plainMp);
    expect(emptyScooter.charges).toBe(0);
  });

  it("recharges 1 charge per cycle up to the max", () => {
    let s = ship();
    const scooter = giveScooter(s, "p0", base.scooter.charges.max - 2);
    s = nextCycle(s);
    expect(s.items.find((i) => i.id === scooter.id)!.charges).toBe(base.scooter.charges.max - 1);
    s = nextCycle(s);
    expect(s.items.find((i) => i.id === scooter.id)!.charges).toBe(base.scooter.charges.max);
    s = nextCycle(s);
    expect(s.items.find((i) => i.id === scooter.id)!.charges).toBe(base.scooter.charges.max);
  });

  it("only changes the carrier's own movement view", () => {
    const s = ship();
    giveScooter(s, "p0");
    expect(viewFor(s, "p0").movement.mpPerConversion).toBe(base.movement.mpPerConversion + base.scooter.extraMpPerConversion);
    expect(viewFor(s, "p1").movement.mpPerConversion).toBe(base.movement.mpPerConversion);
  });
});
