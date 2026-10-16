import { describe, expect, it } from "vitest";
import { CHARACTERS } from "./characters.ts";
import { DEFAULT_CONFIG } from "./config.ts";
import { actionFailed } from "./modifiers.ts";
import { applyAction, createGame, viewFor } from "./rules.ts";
import type { GameConfig, GameState, Seat } from "./types.ts";

const seats: Seat[] = Array.from({ length: 4 }, (_, i) => ({
  id: `p${i}`,
  name: `Player ${i}`,
  isBot: i > 0,
  character: CHARACTERS[i]!.id,
}));

const config: GameConfig = { ...DEFAULT_CONFIG, startInventory: [], startItems: [] };

/** Everyone starts in the same room; p0 carries a camera to dismantle (3 AP). */
function withCamera(dismantleOdds: number, creativeRefundOdds: number): GameState {
  const state = createGame(seats, { ...config, dismantleOdds, creativeRefundOdds }, 42);
  state.items.push({ id: "item-camera", type: "camera", at: { kind: "player", id: "p0" } });
  return state;
}

function dismantle(state: GameState): GameState {
  const result = applyAction(state, "p0", { type: "dismantle", item: "item-camera" });
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

const refunds = (state: GameState) => state.log.filter((e) => e.key === "creativeRefund");

describe("Creative", () => {
  it("is one of every player's starting skills", () => {
    const state = createGame(seats, DEFAULT_CONFIG, 42);
    for (const p of state.players) expect(p.skills).toEqual(["creative"]);
  });

  it("refunds 1 AP after a failed action that cost AP, with a private log line", () => {
    const before = withCamera(0, 1);
    const next = dismantle(before);
    expect(next.items.some((i) => i.id === "item-camera")).toBe(true); // it failed
    expect(next.players[0]!.ap).toBe(before.players[0]!.ap - config.dismantleAp + 1);
    expect(refunds(next)).toHaveLength(1);
    expect(refunds(next)[0]!.visibleTo).toEqual(["p0"]);
    expect(JSON.stringify(viewFor(next, "p0").log)).toContain("creativeRefund");
    // p1 is in the same room and still doesn't see it.
    expect(next.players[1]!.room).toBe(next.players[0]!.room);
    expect(JSON.stringify(viewFor(next, "p1"))).not.toContain("creativeRefund");
  });

  it("gives nothing back when its own roll misses", () => {
    const before = withCamera(0, 0);
    const next = dismantle(before);
    expect(next.players[0]!.ap).toBe(before.players[0]!.ap - config.dismantleAp);
    expect(refunds(next)).toHaveLength(0);
  });

  it("does nothing when the action succeeds", () => {
    const before = withCamera(1, 1);
    const next = dismantle(before);
    expect(next.players[0]!.ap).toBe(before.players[0]!.ap - config.dismantleAp);
    expect(refunds(next)).toHaveLength(0);
  });

  it("does nothing for a player without the skill", () => {
    const before = withCamera(0, 1);
    before.players[0]!.skills = [];
    const next = dismantle(before);
    expect(next.players[0]!.ap).toBe(before.players[0]!.ap - config.dismantleAp);
    expect(refunds(next)).toHaveLength(0);
  });

  it("does nothing when the failed action was free", () => {
    const state = withCamera(0, 1);
    const p = state.players[0]!;
    const ap = p.ap;
    actionFailed(state, p, 0);
    expect(p.ap).toBe(ap);
    expect(refunds(state)).toHaveLength(0);
  });

  it("rolls with the seeded RNG, so the same seed gives the same outcome", () => {
    const outcomes = (seed: number) => {
      const state = createGame(seats, { ...config, dismantleOdds: 0 }, seed);
      state.items.push({ id: "item-camera", type: "camera", at: { kind: "player", id: "p0" } });
      return dismantle(state).players[0]!.ap;
    };
    for (const seed of [1, 2, 3, 4, 5]) expect(outcomes(seed)).toBe(outcomes(seed));
  });

  it("shows your own skills only to you, not to anyone else (even in your room)", () => {
    const state = createGame(seats, DEFAULT_CONFIG, 42);
    for (const p of state.players) {
      const view = viewFor(state, p.id);
      expect(view.you.skills).toEqual(["creative"]);
      expect(JSON.stringify({ ...view, you: undefined })).not.toMatch(/"skills"|"creative"/);
    }
  });
});
