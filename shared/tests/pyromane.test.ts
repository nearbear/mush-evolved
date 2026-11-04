import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { applyAction, createGame, viewFor } from "../src/rules.ts";
import type { GameState } from "../src/types.ts";
import { makeSeats, mustApply, nextCycle, noHunters, noIncidents, offered, option, pickSkill } from "./support.ts";

const HERE = "REFECTORY";
const IGNITE = { type: "ignite" } as const;

/** p0 (a Pyromaniac), p1 and p2 in the refectory; nothing burns and no incident can start a fire. */
function ship(): GameState {
  const s = createGame(makeSeats(3), { ...noIncidents(noHunters(DEFAULT_CONFIG)), mushCount: 1, startItems: [], startSkills: [] }, 3);
  for (const p of s.players) p.room = HERE;
  for (const p of s.players) p.role = p.id === "p0" ? "mush" : "human";
  return pickSkill(s, "p0", "pyromane");
}

describe("Pyromaniac", () => {
  it("costs 4 AP", () => {
    expect(DEFAULT_CONFIG.ignite.cost.ap).toBe(4);
    expect(option(ship(), "p0", IGNITE)).toMatchObject({ cost: { ap: DEFAULT_CONFIG.ignite.cost.ap } });
  });

  it("lights the room at the next cycle change, not before, and NERON announces it", () => {
    const done = mustApply(ship(), "p0", IGNITE);
    expect(done.fires).toEqual([]);
    expect(done.pendingFires).toEqual([HERE]);
    const later = nextCycle(done);
    expect(later.fires).toEqual([HERE]);
    expect(later.pendingFires).toEqual([]);
    expect(JSON.stringify(later.chat)).toContain("fireStarted");
  });

  it("is only for a Pyromaniac, in a room that isn't burning or already set", () => {
    const s = ship();
    expect(offered(s, "p1").filter((a) => a.type === "ignite")).toEqual([]);
    expect(applyAction(s, "p1", IGNITE)).toEqual({ ok: false, error: "illegal_action" });
    const set = mustApply(s, "p0", IGNITE);
    expect(offered(set, "p0").filter((a) => a.type === "ignite")).toEqual([]);
    const burning = { ...s, fires: [HERE] };
    expect(applyAction(burning, "p0", IGNITE)).toEqual({ ok: false, error: "illegal_action" });
  });

  it("is secret: the roommates see it, a lone Pyromaniac's room history stays empty", () => {
    const done = mustApply(ship(), "p0", IGNITE);
    expect(viewFor(done, "p1").pendingFires).toBeUndefined();
    expect(done.log.find((e) => e.key === "ignited")).toBeDefined();
    const alone = ship();
    alone.players[1]!.room = "LABORATORY";
    alone.players[2]!.room = "LABORATORY";
    const unseen = mustApply(alone, "p0", IGNITE);
    expect(unseen.log.find((e) => e.key === "ignited")).toMatchObject({ visibleTo: ["p0"] });
  });
});
