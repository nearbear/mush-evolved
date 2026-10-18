import { describe, expect, it } from "vitest";
import { CHARACTERS } from "../src/characters.ts";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { parseGameMessage } from "../src/protocol.ts";
import { applyAction, createGame, legalIn, viewFor } from "../src/rules.ts";
import { addStatus } from "../src/statuses.ts";
import type { Action, GameState, PlayerId, Seat } from "../src/types.ts";

const seats: Seat[] = Array.from({ length: 4 }, (_, i) => ({ id: `p${i}`, name: `Player ${i}`, isBot: false, character: CHARACTERS[i]!.id }));
const config = { ...DEFAULT_CONFIG, mushCount: 1, startInventory: [], startItems: [], maxAp: 99, startAp: 10 };
const shower: Action = { type: "shower", equipment: "BEDROOM_A:SHOWER" };

/** p0 is Mush, the rest human; everyone in Bedroom Alpha. */
function ship(): GameState {
  const s = createGame(seats, config, 3);
  s.players.forEach((p, i) => {
    p.role = i === 0 ? "mush" : "human";
    p.room = "BEDROOM_A";
  });
  return s;
}
const player = (s: GameState, id: PlayerId) => s.players.find((p) => p.id === id)!;

describe("shower", () => {
  it("removes dirty for 2 AP, and a human keeps their HP", () => {
    const s = ship();
    addStatus(player(s, "p1"), "dirty");
    const r = applyAction(s, "p1", shower);
    if (!r.ok) throw new Error(r.error);
    const p = player(r.state, "p1");
    expect(p.statuses).not.toContain("dirty");
    expect(p.ap).toBe(8);
    expect(p.hp).toBe(DEFAULT_CONFIG.startHp);
  });

  it("costs 1 less AP with soap in the inventory, and keeps the soap", () => {
    const s = ship();
    addStatus(player(s, "p1"), "dirty");
    s.items.push({ id: "soap-1", type: "soap", at: { kind: "player", id: "p1" } });
    const r = applyAction(s, "p1", shower);
    if (!r.ok) throw new Error(r.error);
    expect(player(r.state, "p1").ap).toBe(9);
    expect(r.state.items.some((i) => i.id === "soap-1")).toBe(true);
  });

  it("does not discount soap lying in the room", () => {
    const s = ship();
    addStatus(player(s, "p1"), "dirty");
    s.items.push({ id: "soap-1", type: "soap", at: { kind: "room", id: "BEDROOM_A" } });
    const r = applyAction(s, "p1", shower);
    if (!r.ok) throw new Error(r.error);
    expect(player(r.state, "p1").ap).toBe(8);
  });

  it("burns a Mush for 4 HP, which can kill", () => {
    const s = ship();
    addStatus(player(s, "p0"), "dirty");
    const r = applyAction(s, "p0", shower);
    if (!r.ok) throw new Error(r.error);
    expect(player(r.state, "p0").hp).toBe(DEFAULT_CONFIG.startHp - 4);
    const low = ship();
    addStatus(player(low, "p0"), "dirty");
    player(low, "p0").hp = 2;
    const r2 = applyAction(low, "p0", shower);
    if (!r2.ok) throw new Error(r2.error);
    expect(player(r2.state, "p0").hp).toBe(0);
    expect(player(r2.state, "p0").alive).toBe(false);
  });

  it("is refused, leaving state unchanged, when clean, short on AP, or not at a shower", () => {
    const clean = ship();
    expect(applyAction(clean, "p1", shower).ok).toBe(false);
    const poor = ship();
    addStatus(player(poor, "p1"), "dirty");
    player(poor, "p1").ap = 1;
    expect(applyAction(poor, "p1", shower).ok).toBe(false);
    const away = ship();
    addStatus(player(away, "p1"), "dirty");
    player(away, "p1").room = "REFECTORY";
    const before = JSON.stringify(away);
    expect(applyAction(away, "p1", shower).ok).toBe(false);
    expect(JSON.stringify(away)).toBe(before);
  });

  it("is only offered while dirty, and the log line is private", () => {
    const s = ship();
    expect(legalIn(viewFor(s, "p1")).some((a) => a.type === "shower")).toBe(false);
    addStatus(player(s, "p1"), "dirty");
    expect(legalIn(viewFor(s, "p1"))).toContainEqual(shower);
    const r = applyAction(s, "p1", shower);
    if (!r.ok) throw new Error(r.error);
    expect(viewFor(r.state, "p1").log.some((e) => e.key === "showered")).toBe(true);
    expect(viewFor(r.state, "p2").log.some((e) => e.key === "showered")).toBe(false);
  });

  it("spawns soap in Bedroom Alpha and parses from the client", () => {
    const s = createGame(seats, DEFAULT_CONFIG, 3);
    expect(s.items.some((i) => i.type === "soap" && i.at.kind === "room" && i.at.id === "BEDROOM_A")).toBe(true);
    expect(parseGameMessage(JSON.stringify({ type: "action", action: shower }))).toEqual({ type: "action", action: shower });
  });
});
