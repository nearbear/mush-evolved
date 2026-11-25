import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { parseGameMessage } from "../src/protocol.ts";
import { applyAction, createGame, viewFor } from "../src/rules.ts";
import { addStatus } from "../src/statuses.ts";
import type { Action, GameState } from "../src/types.ts";
import { makeSeats, player, offered, testConfig } from "./support.ts";

const seats = makeSeats(4);
const config = testConfig({ maxAp: 99, startAp: 10 });
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

const { cost, effect } = config.shower;

describe("shower", () => {
  it("removes dirty for its AP, and a human keeps their HP", () => {
    const s = ship();
    addStatus(player(s, "p1"), "dirty");
    const r = applyAction(s, "p1", shower);
    if (!r.ok) throw new Error(r.error);
    const p = player(r.state, "p1");
    expect(p.statuses).not.toContain("dirty");
    expect(p.ap).toBe(config.startAp - cost.ap);
    expect(p.hp).toBe(config.startHp);
  });

  it("costs less AP with soap in the inventory, and keeps the soap", () => {
    const s = ship();
    addStatus(player(s, "p1"), "dirty");
    s.items.push({ id: "soap-1", type: "soap", at: { kind: "player", id: "p1" } });
    const r = applyAction(s, "p1", shower);
    if (!r.ok) throw new Error(r.error);
    expect(player(r.state, "p1").ap).toBe(config.startAp - cost.ap + cost.soapDiscountAp);
    expect(r.state.items.some((i) => i.id === "soap-1")).toBe(true);
  });

  it("does not discount soap lying in the room", () => {
    const s = ship();
    addStatus(player(s, "p1"), "dirty");
    s.items.push({ id: "soap-1", type: "soap", at: { kind: "room", id: "BEDROOM_A" } });
    const r = applyAction(s, "p1", shower);
    if (!r.ok) throw new Error(r.error);
    expect(player(r.state, "p1").ap).toBe(config.startAp - cost.ap);
  });

  it("burns a Mush, which can kill", () => {
    const s = ship();
    addStatus(player(s, "p0"), "dirty");
    const r = applyAction(s, "p0", shower);
    if (!r.ok) throw new Error(r.error);
    expect(player(r.state, "p0").hp).toBe(config.startHp - effect.mushDamage);
    const low = ship();
    addStatus(player(low, "p0"), "dirty");
    player(low, "p0").hp = effect.mushDamage - 1;
    const r2 = applyAction(low, "p0", shower);
    if (!r2.ok) throw new Error(r2.error);
    expect(player(r2.state, "p0").hp).toBe(0);
    expect(player(r2.state, "p0").alive).toBe(false);
  });

  it("is refused, leaving state unchanged, when short on AP or not at a shower", () => {
    const poor = ship();
    addStatus(player(poor, "p1"), "dirty");
    player(poor, "p1").ap = cost.ap - 1;
    expect(applyAction(poor, "p1", shower).ok).toBe(false);
    const away = ship();
    addStatus(player(away, "p1"), "dirty");
    player(away, "p1").room = "REFECTORY";
    const before = JSON.stringify(away);
    expect(applyAction(away, "p1", shower).ok).toBe(false);
    expect(JSON.stringify(away)).toBe(before);
  });

  it("is offered clean or dirty, costs the same, and the log line is private", () => {
    const s = ship();
    expect(offered(s, "p1")).toContainEqual(shower);
    const clean = applyAction(s, "p1", shower);
    if (!clean.ok) throw new Error(clean.error);
    expect(player(clean.state, "p1").ap).toBe(config.startAp - cost.ap);
    addStatus(player(s, "p1"), "dirty");
    expect(offered(s, "p1")).toContainEqual(shower);
    const r = applyAction(s, "p1", shower);
    if (!r.ok) throw new Error(r.error);
    expect(viewFor(r.state, "p1").log.some((e) => e.key === "showered")).toBe(true);
    expect(viewFor(r.state, "p2").log.some((e) => e.key === "showered")).toBe(false);
  });

  it("spawns soap in a storage room and parses from the client", () => {
    const s = createGame(seats, DEFAULT_CONFIG, 3);
    expect(s.items.some((i) => i.type === "soap" && i.at.kind === "room" && DEFAULT_CONFIG.snoop.rooms.includes(i.at.id))).toBe(true);
    expect(parseGameMessage(JSON.stringify({ type: "action", action: shower }))).toEqual({ type: "action", action: shower });
  });

  it("discounts AP and removes 1 contamination from humans with Super Soap, keeping it private and reusable", () => {
    const s = ship();
    s.items.push({ id: "super-1", type: "super_soap", at: { kind: "player", id: "p1" } });
    s.contamination.p1 = 2;
    const r = applyAction(s, "p1", shower);
    if (!r.ok) throw new Error(r.error);
    expect(player(r.state, "p1").ap).toBe(config.startAp - cost.ap + cost.soapDiscountAp);
    expect(r.state.contamination.p1).toBe(1);
    expect(r.state.items.some((i) => i.id === "super-1" && i.type === "super_soap")).toBe(true);
    expect(viewFor(r.state, "p1").log.some((e) => e.key === "showered")).toBe(true);
    expect(viewFor(r.state, "p2").log.some((e) => e.key === "showered")).toBe(false);

    // Removes last contamination cleanly, and logs the same when already at 0.
    const r2 = applyAction(r.state, "p1", shower);
    if (!r2.ok) throw new Error(r2.error);
    expect(r2.state.contamination.p1).toBeUndefined();
    const r3 = applyAction(r2.state, "p1", shower);
    if (!r3.ok) throw new Error(r3.error);
    expect(r3.state.contamination.p1).toBeUndefined();
    expect(viewFor(r3.state, "p1").log.filter((e) => e.key === "showered")).toHaveLength(3);
  });

  it("does not remove contamination when Super Soap is only on the floor, and does not remove Mush spores", () => {
    const s = ship();
    s.items.push({ id: "super-floor", type: "super_soap", at: { kind: "room", id: "BEDROOM_A" } });
    s.contamination.p1 = 1;
    const r = applyAction(s, "p1", shower);
    if (!r.ok) throw new Error(r.error);
    expect(player(r.state, "p1").ap).toBe(config.startAp - cost.ap);
    expect(r.state.contamination.p1).toBe(1);

    const mushShip = ship();
    mushShip.items.push({ id: "super-mush", type: "super_soap", at: { kind: "player", id: "p0" } });
    player(mushShip, "p0").spores = 2;
    const rm = applyAction(mushShip, "p0", shower);
    if (!rm.ok) throw new Error(rm.error);
    expect(player(rm.state, "p0").hp).toBe(config.startHp - effect.mushDamage);
    expect(player(rm.state, "p0").spores).toBe(2);
  });
});
