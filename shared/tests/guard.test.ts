import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { applyAction, createGame, viewFor } from "../src/rules.ts";
import { killPlayer } from "../src/death.ts";
import type { GameState } from "../src/types.ts";
import { makeSeats, mustApply, option, player } from "./support.ts";

const base = { ...DEFAULT_CONFIG, mushCount: 1, startInventory: [], startItems: [], startSkills: [] };
const ROOM = Object.keys(base.rooms).find((r) => base.rooms[r]!.length >= 3)!;
const [DOOR_A, DOOR_B] = base.rooms[ROOM]!;

/** p0 and p1 share ROOM; p1 came in by DOOR_A; p2 is elsewhere. */
function ship(): GameState {
  const s = createGame(makeSeats(3), base, 3);
  player(s, "p0").room = player(s, "p1").room = ROOM;
  player(s, "p0").enteredFrom = DOOR_A;
  player(s, "p1").enteredFrom = DOOR_A;
  player(s, "p2").room = DOOR_B!;
  return s;
}
const moves = (s: GameState, id: string) => viewFor(s, id).actions.filter((o) => o.action.type === "move").map((o) => (o.action as { to: string }).to);

describe("guard", () => {
  it("costs 1 AP, is aggressive, and gives a public guardian status", () => {
    expect(base.guard.cost.ap).toBe(1);
    const s = ship();
    const o = option(s, "p0", { type: "guard" })!;
    expect([o.cost.ap, o.tags]).toEqual([1, ["aggressive"]]);
    const after = mustApply(s, "p0", { type: "guard" });
    expect(after.players.find((p) => p.id === "p0")!.statuses).toContain("guardian");
    expect(viewFor(after, "p1").players.find((p) => p.id === "p0")!.statuses).toContain("guardian");
  });

  it("leaves everyone else only the door they came in by", () => {
    const s = mustApply(ship(), "p0", { type: "guard" });
    expect(moves(s, "p1")).toEqual([DOOR_A]);
    expect(applyAction(s, "p1", { type: "move", to: DOOR_B! }).ok).toBe(false);
    expect(applyAction(s, "p1", { type: "move", to: DOOR_A! }).ok).toBe(true);
  });

  it("blocks every door for someone who did not come in by a door", () => {
    const s = ship();
    delete player(s, "p1").enteredFrom;
    expect(moves(mustApply(s, "p0", { type: "guard" }), "p1")).toEqual([]);
  });

  it("never blocks the guardian, and leaving ends the status", () => {
    const s = mustApply(ship(), "p0", { type: "guard" });
    expect(moves(s, "p0").length).toBe(base.rooms[ROOM]!.length);
    const out = mustApply(s, "p0", { type: "move", to: DOOR_B! });
    expect(player(out, "p0").statuses).not.toContain("guardian");
    expect(player(out, "p0").enteredFrom).toBe(ROOM);
  });

  it("doesn't hold back someone with the Escape (Sneak) skill, whichever way they came in", () => {
    const s = ship();
    player(s, "p1").skills = ["escape"];
    delete player(s, "p1").enteredFrom;
    expect(moves(mustApply(s, "p0", { type: "guard" }), "p1").length).toBe(base.rooms[ROOM]!.length);
  });

  it("stop_guarding is free and unblocks the room", () => {
    const s = mustApply(ship(), "p0", { type: "guard" });
    expect(option(s, "p1", { type: "stop_guarding" })).toBeUndefined();
    const o = option(s, "p0", { type: "stop_guarding" })!;
    expect(o.cost.ap).toBe(0);
    const after = mustApply(s, "p0", { type: "stop_guarding" });
    expect(player(after, "p0").statuses).not.toContain("guardian");
    expect(moves(after, "p1").length).toBe(base.rooms[ROOM]!.length);
  });

  it("can't guard twice, and death ends it", () => {
    const s = mustApply(ship(), "p0", { type: "guard" });
    expect(option(s, "p0", { type: "guard" })).toBeUndefined();
    killPlayer(s, player(s, "p0"));
    expect(player(s, "p0").statuses).not.toContain("guardian");
    expect(moves(s, "p1").length).toBe(base.rooms[ROOM]!.length);
  });

  it("never sends where someone came in from", () => {
    const view = viewFor(ship(), "p0");
    expect(JSON.stringify(view)).not.toContain("enteredFrom");
  });
});
