import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { modifierIds } from "../src/modifiers.ts";
import { parseGameMessage } from "../src/protocol.ts";
import { applyAction, createGame, viewFor } from "../src/rules.ts";
import { SKILLS } from "../src/skills.ts";
import type { Action, GameState } from "../src/types.ts";
import { makeSeats, must, mustApply, option, player } from "./support.ts";

const seats = makeSeats(3);
const base = { ...DEFAULT_CONFIG, mushCount: 1, startInventory: [], startItems: [], startSkills: [], equipment: {} };
const read = (item: string): Action => ({ type: "read_book", item });
const room = (id: string) => ({ kind: "room" as const, id });

/** p0 and p1 on the bridge, p2 elsewhere. A medic book on the floor, a pilot book carried by p0, a sprint book in the lab. */
function ship(): GameState {
  const s = createGame(seats, base, 3);
  player(s, "p0").room = player(s, "p1").room = "COMMAND_CENTER";
  player(s, "p2").room = "LABORATORY";
  s.items.push({ id: "medic", type: "book", teaches: "medic", at: room("COMMAND_CENTER") });
  s.items.push({ id: "pilot", type: "book", teaches: "pilot", at: { kind: "player", id: "p0" } });
  s.items.push({ id: "sprint", type: "book", teaches: "sprint", at: room("LABORATORY") });
  return s;
}

describe("skill books", () => {
  it("costs 2 AP, and one book for every skill spawns on the bridge", () => {
    expect(DEFAULT_CONFIG.readBook.cost.ap).toBe(2);
    const s = createGame(seats, DEFAULT_CONFIG, 1);
    const books = s.items.filter((i) => i.type === "book");
    expect(books.map((b) => b.teaches)).toEqual([...SKILLS]);
    expect(books.every((b) => b.at.kind === "room" && b.at.id === "COMMAND_CENTER")).toBe(true);
  });

  it("fills the book slot, destroys the book, and logs publicly", () => {
    const s = mustApply(ship(), "p0", read("medic"));
    const p0 = player(s, "p0");
    expect(p0.bookSkill).toBe("medic");
    expect(p0.skills).toEqual([]);
    expect(modifierIds(p0)).toContain("medic");
    expect(p0.ap).toBe(base.startAp - base.readBook.cost.ap);
    expect(s.items.some((i) => i.id === "medic")).toBe(false);
    expect(viewFor(s, "p1").log.some((e) => e.key === "bookRead" && e.params?.skill === "medic")).toBe(true);
    expect(viewFor(s, "p2").log.some((e) => e.key === "bookRead")).toBe(false);
  });

  it("reads a carried book too, but not one in another room", () => {
    expect(option(ship(), "p0", read("pilot"))).toBeDefined();
    expect(option(ship(), "p0", read("sprint"))).toBeUndefined();
    expect(applyAction(ship(), "p0", read("sprint"))).toMatchObject({ ok: false });
  });

  it("allows one book per player", () => {
    const s = mustApply(ship(), "p0", read("medic"));
    expect(option(s, "p0", { type: "read_book" })).toBeUndefined();
    expect(applyAction(s, "p0", read("pilot"))).toMatchObject({ ok: false });
  });

  it("refuses a skill you already have, and the book skill can't be picked again", () => {
    const s = ship();
    player(s, "p0").skills.push("medic");
    expect(option(s, "p0", read("medic"))).toBeUndefined();
    expect(applyAction(s, "p0", read("medic"))).toMatchObject({ ok: false });

    const after = mustApply(ship(), "p0", read("medic"));
    expect(option(after, "p0", { type: "pick_skill", skill: "medic" })).toBeUndefined();
    expect(applyAction(after, "p0", { type: "pick_skill", skill: "medic" })).toMatchObject({ ok: false });
  });

  it("works with full normal slots, and for a Mush", () => {
    const s = ship();
    const p0 = player(s, "p0");
    p0.skills.push("cook", "sprint", "pilot");
    p0.role = "mush";
    expect(player(must(applyAction(s, "p0", read("medic"))), "p0").bookSkill).toBe("medic");
  });

  it("is refused without the AP, and leaves the state unchanged", () => {
    const s = ship();
    player(s, "p0").ap = base.readBook.cost.ap - 1;
    const before = JSON.stringify(s);
    expect(applyAction(s, "p0", read("medic")).ok).toBe(false);
    expect(JSON.stringify(s)).toBe(before);
  });

  it("shows the book's skill to whoever sees the book, and the book slot only to roommates", () => {
    const s = mustApply(ship(), "p0", read("medic"));
    expect(viewFor(s, "p1").roomItems.find((i) => i.id === "pilot")).toBeUndefined();
    expect(viewFor(s, "p0").inventory.find((i) => i.id === "pilot")).toMatchObject({ teaches: "pilot" });
    expect(viewFor(s, "p1").players.find((p) => p.id === "p0")?.bookSkill).toBe("medic");
    expect(viewFor(s, "p2").players.find((p) => p.id === "p0")?.bookSkill).toBeUndefined();
    expect(viewFor(s, "p2").roomItems.find((i) => i.id === "sprint")).toMatchObject({ teaches: "sprint" });
    expect(viewFor(s, "p0").roomItems.some((i) => i.id === "sprint")).toBe(false);
  });

  it("parses from the wire", () => {
    expect(parseGameMessage(JSON.stringify({ type: "action", action: { type: "read_book", item: "x" } }))).toEqual({ type: "action", action: read("x") });
    expect(parseGameMessage(JSON.stringify({ type: "action", action: { type: "read_book", item: 3 } }))).toBeNull();
  });
});
