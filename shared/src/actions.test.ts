import { describe, expect, it } from "vitest";
import { CHARACTERS } from "./characters.ts";
import { DEFAULT_CONFIG } from "./config.ts";
import { applyAction, createGame, legalActions } from "./rules.ts";
import type { Action, Seat } from "./types.ts";

const seats: Seat[] = Array.from({ length: 4 }, (_, i) => ({
  id: `p${i}`,
  name: `Player ${i}`,
  isBot: true,
  character: CHARACTERS[i]!.id,
}));

const sorted = (actions: Action[]) => actions.map((a) => JSON.stringify(a)).sort();

describe("action registry", () => {
  // Pins the full legal set for p0 at the start (Laboratory: wrench and
  // blaster on the floor, an iTrackie in hand), so a check that is too loose
  // or too strict shows up here.
  it("offers exactly the legal actions at the start of a game", () => {
    const state = createGame(seats, DEFAULT_CONFIG, 1);
    const floor = state.items.filter((i) => i.at.kind === "room" && i.at.id === "LABORATORY");
    const mine = state.items.filter((i) => i.at.kind === "player" && i.at.id === "p0");
    const expected: Action[] = [
      { type: "ready" },
      ...DEFAULT_CONFIG.rooms.LABORATORY!.map((to): Action => ({ type: "move", to })),
      ...floor.map((i): Action => ({ type: "take", item: i.id })),
      ...mine.map((i): Action => ({ type: "drop", item: i.id })),
      ...seats.map((s): Action => ({ type: "examine", target: { kind: "player", id: s.id } })),
      // Everyone starts in the Laboratory, so p0 can bond with the other three (DTT and STT need a bond first).
      ...seats.filter((s) => s.id !== "p0").map((s): Action => ({ type: "bond", target: s.id })),
      ...DEFAULT_CONFIG.equipment.LABORATORY!.map((e): Action => ({ type: "examine", target: { kind: "equipment", id: e.id } })),
      ...[...mine, ...floor].map((i): Action => ({ type: "examine", target: { kind: "item", id: i.id } })),
    ];
    expect(floor.length).toBeGreaterThan(0);
    expect(sorted(legalActions(state, "p0"))).toEqual(sorted(expected));
  });

  it("offers no moves when broke and no takes when the inventory is full", () => {
    const state = createGame(seats, DEFAULT_CONFIG, 1);
    Object.assign(state.players[0]!, { ap: 0, mp: 0 });
    for (let i = 0; i < 5; i++) state.items.push({ id: `extra-${i}`, type: "super_talky", at: { kind: "player", id: "p0" } });
    const legal = legalActions(state, "p0");
    expect(legal.some((a) => a.type === "move" || a.type === "take")).toBe(false);
    for (const action of [{ type: "move", to: DEFAULT_CONFIG.rooms.LABORATORY![0]! }, { type: "take", item: "item-1" }] as Action[]) {
      expect(applyAction(state, "p0", action).ok).toBe(false);
    }
  });

  it("rejects actions that aren't candidates at all", () => {
    const state = createGame(seats, DEFAULT_CONFIG, 1);
    for (const action of [
      { type: "take", item: "no-such-item" },
      { type: "examine", target: { kind: "player", id: "nobody" } },
      { type: "teleport" },
    ] as Action[]) {
      expect(applyAction(state, "p0", action).ok, JSON.stringify(action)).toBe(false);
    }
  });
});
