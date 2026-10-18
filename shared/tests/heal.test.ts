import { describe, expect, it } from "vitest";
import { CHARACTERS } from "../src/characters.ts";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { MODIFIERS, healAmount } from "../src/modifiers.ts";
import { parseGameMessage } from "../src/protocol.ts";
import { applyAction, createGame, legalIn, viewFor } from "../src/rules.ts";
import type { Action, GameState, PlayerId, Seat } from "../src/types.ts";

const seats: Seat[] = Array.from({ length: 3 }, (_, i) => ({ id: `p${i}`, name: `Player ${i}`, isBot: false, character: CHARACTERS[i]!.id }));
const config = { ...DEFAULT_CONFIG, mushCount: 1, startInventory: [], startItems: [] };
const player = (s: GameState, id: PlayerId) => s.players.find((p) => p.id === id)!;
const heal = (target: PlayerId): Action => ({ type: "heal", target });

/** Three people in one room; p0 holds a medikit and everyone is hurt to 5 HP. */
function ship(): GameState {
  const s = createGame(seats, config, 3);
  s.players.forEach((p) => {
    p.room = "LABORATORY";
    p.hp = 5;
  });
  s.items.push({ id: "kit", type: "medikit", at: { kind: "player", id: "p0" } });
  return s;
}

describe("healing", () => {
  it("costs 2 AP on someone else and restores 3 HP", () => {
    const r = applyAction(ship(), "p0", heal("p1"));
    if (!r.ok) throw new Error(r.error);
    expect(player(r.state, "p1").hp).toBe(8);
    expect(player(r.state, "p0").hp).toBe(5);
    expect(player(r.state, "p0").ap).toBe(config.startAp - 2);
  });

  it("costs 3 AP on yourself", () => {
    const r = applyAction(ship(), "p0", heal("p0"));
    if (!r.ok) throw new Error(r.error);
    expect(player(r.state, "p0").hp).toBe(8);
    expect(player(r.state, "p0").ap).toBe(config.startAp - 3);
  });

  it("caps at max HP and is still offered at full HP", () => {
    const s = ship();
    player(s, "p1").hp = config.maxHp - 1;
    const r = applyAction(s, "p0", heal("p1"));
    if (!r.ok) throw new Error(r.error);
    expect(player(r.state, "p1").hp).toBe(config.maxHp);
    player(s, "p1").hp = config.maxHp;
    expect(legalIn(viewFor(s, "p0"))).toContainEqual(heal("p1"));
  });

  it("needs a medikit in your inventory, not on the floor or in someone else's hands", () => {
    const s = ship();
    expect(legalIn(viewFor(s, "p1")).some((a) => a.type === "heal")).toBe(false);
    expect(applyAction(s, "p1", heal("p0")).ok).toBe(false);
    s.items[0]!.at = { kind: "room", id: "LABORATORY" };
    expect(applyAction(s, "p0", heal("p1")).ok).toBe(false);
  });

  it("needs the target alive and in your room, and the AP; failures leave state unchanged", () => {
    const s = ship();
    player(s, "p1").room = "CORRIDOR_A";
    player(s, "p2").alive = false;
    const before = JSON.stringify(s);
    expect(applyAction(s, "p0", heal("p1")).ok).toBe(false);
    expect(applyAction(s, "p0", heal("p2")).ok).toBe(false);
    expect(legalIn(viewFor(s, "p0"))).not.toContainEqual(heal("p1"));
    player(s, "p0").ap = 2;
    const poor = JSON.stringify(s);
    expect(applyAction(s, "p0", heal("p0")).ok).toBe(false);
    expect(JSON.stringify(s)).toBe(poor);
    expect(before).not.toBe(poor);
  });

  it("restores more with a modifier", () => {
    const s = ship();
    player(s, "p0").modifiers.push("test_healer");
    MODIFIERS.test_healer = { healAmount: (n) => n + 2 };
    try {
      expect(healAmount(s, player(s, "p0"))).toBe(5);
      const r = applyAction(s, "p0", heal("p1"));
      if (!r.ok) throw new Error(r.error);
      expect(player(r.state, "p1").hp).toBe(10);
    } finally {
      delete MODIFIERS.test_healer;
    }
  });

  it("is public to the room and invisible elsewhere", () => {
    const s = ship();
    player(s, "p2").room = "CORRIDOR_A";
    const r = applyAction(s, "p0", heal("p1"));
    if (!r.ok) throw new Error(r.error);
    expect(viewFor(r.state, "p1").log.some((e) => e.key === "healed")).toBe(true);
    expect(JSON.stringify(viewFor(r.state, "p2"))).not.toContain("healed");
  });

  it("parses from client messages", () => {
    expect(parseGameMessage(JSON.stringify({ type: "action", action: { type: "heal", target: "p1" } }))).toEqual({
      type: "action",
      action: heal("p1"),
    });
  });
});
