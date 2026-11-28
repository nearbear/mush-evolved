import { describe, expect, it } from "vitest";
import { parseGameMessage } from "../src/protocol.ts";
import { queueAction } from "../src/queue.ts";
import { applyAction, createGame, viewFor } from "../src/rules.ts";
import type { Action, GameState } from "../src/types.ts";
import { makeSeats, must, testConfig } from "./support.ts";

const seats = makeSeats(4);
const config = testConfig({ maxAp: 99, startAp: 10, manualCycles: true });

function ship(): GameState {
  const s = createGame(seats, config, 3);
  s.players.forEach((p) => (p.room = "BEDROOM_A"));
  return s;
}
const bed = (s: GameState) => s.equipment.BEDROOM_A!.find((e) => e.type === "BED")!.id;
describe("lie down", () => {
  it("is free and adds the modifier, and the cycle gives +1 AP", () => {
    const s = ship();
    const lying = must(applyAction(s, "p1", { type: "lie_down", equipment: bed(s) }));
    expect(lying.players[1]!.ap).toBe(config.startAp - config.lieDown.cost.ap);
    expect(lying.players[1]!.modifiers).toContain("lying_down");
    const next = ["p1", "p0", "p2", "p3"].reduce((st, id) => must(applyAction(st, id, { type: "ready" })), lying);
    expect(next.players[1]!.ap).toBeGreaterThan(next.players[0]!.ap);
  });

  it("is illegal away from a bed or when already lying down", () => {
    const s = ship();
    s.players[1]!.room = "LABORATORY";
    expect(applyAction(s, "p1", { type: "lie_down", equipment: bed(ship()) }).ok).toBe(false);
    const t = ship();
    const lying = must(applyAction(t, "p2", { type: "lie_down", equipment: bed(t) }));
    expect(applyAction(lying, "p2", { type: "lie_down", equipment: bed(t) }).ok).toBe(false);
  });

  it("one person per bed: a taken bed is not offered or allowed, and frees when its occupant gets up or dies", () => {
    const s = ship();
    const b = bed(s);
    const lying = must(applyAction(s, "p1", { type: "lie_down", equipment: b }));
    expect(applyAction(lying, "p2", { type: "lie_down", equipment: b }).ok).toBe(false);
    expect(viewFor(lying, "p2").actions.some((a) => a.type === "lie_down" && a.equipment === b)).toBe(false);
    const up = must(applyAction(lying, "p1", { type: "get_up" }));
    expect(applyAction(up, "p2", { type: "lie_down", equipment: b }).ok).toBe(true);
    const dead = structuredClone(lying);
    dead.players[1]!.alive = false;
    expect(applyAction(dead, "p2", { type: "lie_down", equipment: b }).ok).toBe(true);
  });

  it("get up removes it, and get up is illegal otherwise", () => {
    const s = ship();
    expect(applyAction(s, "p1", { type: "get_up" }).ok).toBe(false);
    const up = must(applyAction(must(applyAction(s, "p1", { type: "lie_down", equipment: bed(s) })), "p1", { type: "get_up" }));
    expect(up.players[1]!.modifiers).not.toContain("lying_down");
  });

  it("lying down and getting up are logged publicly in the room; getting up through another action is not", () => {
    const s = ship();
    s.players[3]!.room = "LABORATORY";
    const lying = must(applyAction(s, "p1", { type: "lie_down", equipment: bed(s) }));
    expect(lying.log.at(-1)).toMatchObject({ key: "laidDown", params: { name: lying.players[1]!.character } });
    const up = must(applyAction(lying, "p1", { type: "get_up" }));
    expect(up.log.at(-1)).toMatchObject({ key: "gotUp", params: { name: up.players[1]!.character } });
    const keys = (st: GameState, id: string) => viewFor(st, id).log.map((e) => e.key);
    expect(keys(up, "p2")).toEqual(expect.arrayContaining(["laidDown", "gotUp"]));
    expect(keys(up, "p3")).not.toContain("laidDown");
    expect(keys(up, "p3")).not.toContain("gotUp");
    const examined = must(applyAction(lying, "p1", { type: "examine", target: { kind: "equipment", id: bed(s) } }));
    expect(examined.log.some((e) => e.key === "gotUp")).toBe(false);
  });

  it("another action ends it, but ending your cycle does not", () => {
    const s = ship();
    const lying = must(applyAction(s, "p1", { type: "lie_down", equipment: bed(s) }));
    expect(must(applyAction(lying, "p1", { type: "ready" })).players[1]!.modifiers).toContain("lying_down");
    expect(must(applyAction(lying, "p1", { type: "examine", target: { kind: "equipment", id: bed(s) } })).players[1]!.modifiers).not.toContain("lying_down");
  });

  it("queuing an action gets you up at once, even behind one already under way", () => {
    const s = ship();
    const lying = must(applyAction(s, "p1", { type: "lie_down", equipment: bed(s) }));
    const examine = (): Action => ({ type: "examine", target: { kind: "equipment", id: bed(s) } });
    const busy = must(queueAction(lying, "p1", examine(), 1000));
    expect(busy.players[1]!.modifiers).not.toContain("lying_down");
    expect(busy.players[1]!.lyingIn).toBeUndefined();
    // Lying down again, then queueing behind the action under way: up before it even starts.
    const again = must(applyAction(busy, "p1", { type: "lie_down", equipment: bed(s) }));
    const waiting = must(queueAction(again, "p1", examine(), 1100));
    expect(waiting.players[1]!.queue).toHaveLength(1);
    expect(waiting.players[1]!.modifiers).not.toContain("lying_down");
  });

  it("moving to another room gets you up", () => {
    const s = ship();
    const to = s.config.rooms.BEDROOM_A![0]!;
    const lying = must(applyAction(s, "p1", { type: "lie_down", equipment: bed(s) }));
    const moved = must(applyAction(lying, "p1", { type: "move", to }));
    expect(moved.players[1]!.modifiers).not.toContain("lying_down");
    expect(moved.players[1]!.lyingIn).toBeUndefined();
  });

  it("shows which bed you lie in to the room, and to nobody elsewhere", () => {
    const s = ship();
    const lying = must(applyAction(s, "p1", { type: "lie_down", equipment: bed(s) }));
    expect(viewFor(lying, "p2").players.find((p) => p.id === "p1")!.lying).toBe(bed(s));
    expect(viewFor(lying, "p1").you.lyingIn).toBe(bed(s));
    lying.players[2]!.room = "CORRIDOR_C";
    expect(viewFor(lying, "p2").players.find((p) => p.id === "p1")!.lying).toBeUndefined();
    const up = must(applyAction(lying, "p1", { type: "get_up" }));
    expect(viewFor(up, "p0").players.find((p) => p.id === "p1")!.lying).toBeUndefined();
    expect(viewFor(up, "p1").you.lyingIn).toBeUndefined();
  });

  it("parses from client messages", () => {
    expect(parseGameMessage(JSON.stringify({ type: "action", action: { type: "lie_down", equipment: "x" } }))).not.toBeNull();
    expect(parseGameMessage(JSON.stringify({ type: "action", action: { type: "get_up" } }))).not.toBeNull();
    expect(parseGameMessage(JSON.stringify({ type: "action", action: { type: "lie_down" } }))).toBeNull();
  });
});
