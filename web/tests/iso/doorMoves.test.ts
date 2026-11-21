import { describe, expect, it } from "vitest";
import type { LogLine } from "@mush2/shared";
import { recentDoorMoves } from "../../src/iso/doorMoves.ts";

const entry = (key: string, name: string, room: string, at?: number): LogLine => ({ cycle: 1, key, params: { name, room }, visibleTo: "all", ...(at !== undefined && { at }) });
const players = [{ id: "p1", character: "kuanti" }, { id: "p2", character: "chun" }];

describe("recentDoorMoves", () => {
  it("reads the latest recent way in and way out per player", () => {
    const log = [entry("entered", "kuanti", "BRIDGE", 1000), entry("left", "kuanti", "LABORATORY", 2000), entry("entered", "kuanti", "REFECTORY", 3000), entry("left", "chun", "BRIDGE", 3000)];
    const moves = recentDoorMoves(log, players, 5000);
    expect(moves.get("p1")).toEqual({ from: "REFECTORY", to: "LABORATORY" });
    expect(moves.get("p2")).toEqual({ to: "BRIDGE" });
  });

  it("leaves out old moves, moves with no time, other entries and unknown characters", () => {
    const log = [entry("entered", "kuanti", "BRIDGE", 0), entry("left", "chun", "BRIDGE"), entry("said", "chun", "BRIDGE", 99_000), entry("left", "nobody", "BRIDGE", 99_000)];
    expect(recentDoorMoves(log, players, 100_000).size).toBe(0);
  });

  it("fades a move with no direction (no Tracker) in or out instead of walking a door", () => {
    const undirected = (key: string, name: string, at: number): LogLine => ({ cycle: 1, key, params: { name }, visibleTo: "all", at });
    const log = [entry("entered", "kuanti", "BRIDGE", 1000), undirected("leftRoom", "kuanti", 2000), undirected("enteredRoom", "chun", 3000)];
    const moves = recentDoorMoves(log, players, 5000);
    expect(moves.get("p1")).toEqual({ from: "BRIDGE", fadeOut: true });
    expect(moves.get("p2")).toEqual({ fadeIn: true });
    // A later move by a door replaces the fade on its side.
    expect(recentDoorMoves([...log, entry("entered", "chun", "LABORATORY", 4000)], players, 5000).get("p2")).toEqual({ from: "LABORATORY" });
  });
});
