import { describe, expect, it } from "vitest";
import { CHARACTERS } from "../src/characters.ts";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { parseGameMessage } from "../src/protocol.ts";
import { applyAction, createGame, legalActions, viewFor } from "../src/rules.ts";
import type { GameState, Seat } from "../src/types.ts";

const seats: Seat[] = Array.from({ length: 4 }, (_, i) => ({ id: `p${i}`, name: `Player ${i}`, isBot: false, character: CHARACTERS[i]!.id }));
const config = { ...DEFAULT_CONFIG, mushCount: 1, startInventory: [], startItems: [], maxAp: 99, startAp: 10 };

function ship(): GameState {
  const s = createGame(seats, config, 3);
  s.players.forEach((p) => (p.room = "BEDROOM_A"));
  return s;
}
const bed = (s: GameState) => s.config.equipment.BEDROOM_A!.find((e) => e.type === "BED")!.id;
const ok = (r: ReturnType<typeof applyAction>) => {
  if (!r.ok) throw new Error(r.error);
  return r.state;
};

describe("lie down", () => {
  it("is free and adds the modifier, and the cycle gives +1 AP", () => {
    const s = ship();
    const lying = ok(applyAction(s, "p1", { type: "lie_down", equipment: bed(s) }));
    expect(lying.players[1]!.ap).toBe(10);
    expect(lying.players[1]!.modifiers).toContain("lying_down");
    const next = ["p1", "p0", "p2", "p3"].reduce((st, id) => ok(applyAction(st, id, { type: "ready" })), lying);
    expect(next.players[1]!.ap).toBeGreaterThan(next.players[0]!.ap);
  });

  it("is illegal away from a bed or when already lying down", () => {
    const s = ship();
    s.players[1]!.room = "LABORATORY";
    expect(applyAction(s, "p1", { type: "lie_down", equipment: bed(ship()) }).ok).toBe(false);
    const t = ship();
    const lying = ok(applyAction(t, "p2", { type: "lie_down", equipment: bed(t) }));
    expect(applyAction(lying, "p2", { type: "lie_down", equipment: bed(t) }).ok).toBe(false);
  });

  it("get up removes it, and get up is illegal otherwise", () => {
    const s = ship();
    expect(applyAction(s, "p1", { type: "get_up" }).ok).toBe(false);
    const up = ok(applyAction(ok(applyAction(s, "p1", { type: "lie_down", equipment: bed(s) })), "p1", { type: "get_up" }));
    expect(up.players[1]!.modifiers).not.toContain("lying_down");
  });

  it("another action ends it, but ending your cycle does not", () => {
    const s = ship();
    const lying = ok(applyAction(s, "p1", { type: "lie_down", equipment: bed(s) }));
    expect(ok(applyAction(lying, "p1", { type: "ready" })).players[1]!.modifiers).toContain("lying_down");
    expect(ok(applyAction(lying, "p1", { type: "examine", target: { kind: "player", id: "p0" } })).players[1]!.modifiers).not.toContain("lying_down");
  });

  it("moving to another room gets you up", () => {
    const s = ship();
    const to = s.config.rooms.BEDROOM_A![0]!;
    const lying = ok(applyAction(s, "p1", { type: "lie_down", equipment: bed(s) }));
    const moved = ok(applyAction(lying, "p1", { type: "move", to }));
    expect(moved.players[1]!.modifiers).not.toContain("lying_down");
    expect(moved.players[1]!.lyingIn).toBeUndefined();
  });

  it("shows which bed you lie in to the room, and to nobody elsewhere", () => {
    const s = ship();
    const lying = ok(applyAction(s, "p1", { type: "lie_down", equipment: bed(s) }));
    expect(viewFor(lying, "p2").players.find((p) => p.id === "p1")!.lying).toBe(bed(s));
    expect(viewFor(lying, "p1").you.lyingIn).toBe(bed(s));
    lying.players[2]!.room = "CORRIDOR_C";
    expect(viewFor(lying, "p2").players.find((p) => p.id === "p1")!.lying).toBeUndefined();
    const up = ok(applyAction(lying, "p1", { type: "get_up" }));
    expect(viewFor(up, "p0").players.find((p) => p.id === "p1")!.lying).toBeUndefined();
    expect(viewFor(up, "p1").you.lyingIn).toBeUndefined();
  });

  it("parses from client messages", () => {
    expect(parseGameMessage(JSON.stringify({ type: "action", action: { type: "lie_down", equipment: "x" } }))).not.toBeNull();
    expect(parseGameMessage(JSON.stringify({ type: "action", action: { type: "get_up" } }))).not.toBeNull();
    expect(parseGameMessage(JSON.stringify({ type: "action", action: { type: "lie_down" } }))).toBeNull();
  });
});
