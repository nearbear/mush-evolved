import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { parseGameMessage } from "../src/protocol.ts";
import { queueAction } from "../src/queue.ts";
import { applyInput } from "../src/replay.ts";
import { applyAction, createGame, viewFor } from "../src/rules.ts";
import { MAX_SPOT_CELL, walk } from "../src/spot.ts";
import type { GameState } from "../src/types.ts";
import { makeSeats, must, player } from "./support.ts";

const config = { ...DEFAULT_CONFIG, mushCount: 1, startInventory: [], startItems: [], maxAp: 99, startAp: 10, manualCycles: true };

/** p0, p1 and p2 in the laboratory, p3 in the refectory. */
function ship(): GameState {
  const s = createGame(makeSeats(4), config, 3);
  s.players.forEach((p) => (p.room = p.id === "p3" ? "REFECTORY" : "LABORATORY"));
  return s;
}

describe("where you stand", () => {
  it("nobody has a spot until they walk or move", () => {
    expect(ship().players.map((p) => p.spot)).toEqual([undefined, undefined, undefined, undefined]);
  });

  it("walking sets your cell, and sitting if it's a chair", () => {
    const s = must(walk(ship(), "p1", 3, -4, false));
    expect(player(s, "p1").spot).toEqual({ x: 3, y: -4 });
    expect(player(must(walk(s, "p1", 5, 6, true)), "p1").spot).toEqual({ x: 5, y: 6, sitting: true });
  });

  it("is free and touches nothing else", () => {
    const s = ship();
    const after = must(walk(s, "p1", 1, 2, false));
    const { spot, ...rest } = player(after, "p1");
    expect(rest).toEqual(player(s, "p1"));
    expect(after.log).toEqual(s.log);
  });

  it("roommates see it; people elsewhere don't", () => {
    const s = must(walk(ship(), "p1", 3, 4, true));
    expect(viewFor(s, "p0").players.find((o) => o.id === "p1")?.spot).toEqual({ x: 3, y: 4, sitting: true });
    expect(viewFor(s, "p1").you.spot).toEqual({ x: 3, y: 4, sitting: true });
    expect(viewFor(s, "p3").players.find((o) => o.id === "p1")?.spot).toBeUndefined();
  });

  it("the dead see nobody's spot", () => {
    const s = must(walk(ship(), "p1", 3, 4, false));
    player(s, "p0").alive = false;
    expect(viewFor(s, "p0").players.find((o) => o.id === "p1")?.spot).toBeUndefined();
  });

  it("is refused when dead, in bed, pushed in a wheelchair, or off any room", () => {
    const refused = (setup: (s: GameState) => void, x = 1, y = 1) => {
      const s = ship();
      setup(s);
      return walk(s, "p1", x, y, false);
    };
    expect(refused((s) => (player(s, "p1").alive = false))).toEqual({ ok: false, error: "cant_walk" });
    expect(refused((s) => (player(s, "p1").lyingIn = "bed"))).toEqual({ ok: false, error: "cant_walk" });
    expect(refused((s) => (player(s, "p1").pushedBy = "p0"))).toEqual({ ok: false, error: "cant_walk" });
    expect(refused((s) => (s.phase = "ended"))).toEqual({ ok: false, error: "cant_walk" });
    expect(refused(() => {}, MAX_SPOT_CELL + 1)).toEqual({ ok: false, error: "cant_walk" });
    expect(refused(() => {}, 1.5)).toEqual({ ok: false, error: "cant_walk" });
  });

  it("moving puts you in front of the door you came in by", () => {
    const s = must(walk(ship(), "p1", 3, 4, true));
    const to = s.config.rooms.LABORATORY![0]!;
    const moved = must(applyAction(s, "p1", { type: "move", to }));
    expect(player(moved, "p1").spot).toEqual({ door: "LABORATORY" });
  });

  it("someone pushed in a wheelchair arrives at the same door as the pusher", () => {
    const s = ship();
    player(s, "p2").pushedBy = "p1";
    const to = s.config.rooms.LABORATORY![0]!;
    const moved = must(applyAction(s, "p1", { type: "move", to }));
    expect(player(moved, "p2").spot).toEqual({ door: "LABORATORY" });
  });

  it("sending a public action gets you up from a chair, timed or not, and keeps your cell", () => {
    const s = must(walk(ship(), "p1", 3, 4, true));
    const to = s.config.rooms.LABORATORY![0]!;
    const timed = must(queueAction(s, "p1", { type: "move", to }, 1000));
    expect(player(timed, "p1").spot).toEqual({ x: 3, y: 4 });
    const untimed = must(queueAction(s, "p1", { type: "ready" }, 1000));
    expect(player(untimed, "p1").spot).toEqual({ x: 3, y: 4 });
  });

  it("a private, secret or covert action leaves you seated as your roommates see it", () => {
    const s = must(walk(ship(), "p1", 3, 4, true));
    const examined = must(queueAction(s, "p1", { type: "examine", target: { kind: "player", id: "p0" } }, 1000));
    expect(player(examined, "p1").spot).toEqual({ x: 3, y: 4, sitting: true });
    expect(viewFor(examined, "p0").players.find((o) => o.id === "p1")?.spot).toEqual({ x: 3, y: 4, sitting: true });
  });

  it("can be switched off: walks are refused and nobody's spot is sent", () => {
    const s = must(walk(ship(), "p1", 3, 4, false));
    s.config.sharedSpots = false;
    expect(walk(s, "p1", 5, 6, false)).toEqual({ ok: false, error: "cant_walk" });
    expect(viewFor(s, "p0").players.find((o) => o.id === "p1")?.spot).toBeUndefined();
    expect(viewFor(s, "p0").config.sharedSpots).toBe(false);
  });

  it("goes through applyInput, so replays have it", () => {
    const s = must(applyInput(ship(), { type: "walk", x: 2, y: 3, sitting: false, by: "p1" }));
    expect(player(s, "p1").spot).toEqual({ x: 2, y: 3 });
  });

  it("parses only whole cells in range with a sitting flag", () => {
    expect(parseGameMessage(JSON.stringify({ type: "walk", x: 1, y: -2, sitting: true }))).toEqual({ type: "walk", x: 1, y: -2, sitting: true });
    for (const bad of [{ x: 1, y: 2 }, { x: "1", y: 2, sitting: false }, { x: 1.5, y: 2, sitting: false }, { x: MAX_SPOT_CELL + 1, y: 0, sitting: false }]) {
      expect(parseGameMessage(JSON.stringify({ type: "walk", ...bad }))).toBeNull();
    }
  });
});
