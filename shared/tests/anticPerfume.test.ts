import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { contaminate } from "../src/infection.ts";
import { applyAction, createGame, viewFor } from "../src/rules.ts";
import { addStatus } from "../src/statuses.ts";
import type { Action, GameState } from "../src/types.ts";
import { makeSeats, player } from "./support.ts";

const seats = makeSeats(4);
const config = { ...DEFAULT_CONFIG, mushCount: 1, startInventory: [], startItems: [], maxAp: 99, startAp: 10 };
const shower: Action = { type: "shower", equipment: "BEDROOM_A:SHOWER" };

/** p0 is Mush, the rest human; everyone in Bedroom Alpha; p1 has the skill and is dirty. */
function ship(skills: string[] = ["antic_perfume"]): GameState {
  const s = createGame(seats, config, 3);
  s.players.forEach((p, i) => {
    p.role = i === 0 ? "mush" : "human";
    p.room = "BEDROOM_A";
  });
  player(s, "p1").skills = skills;
  addStatus(player(s, "p1"), "dirty");
  return s;
}

function showered(s: GameState): GameState {
  const r = applyAction(s, "p1", shower);
  if (!r.ok) throw new Error(r.error);
  return r.state;
}

describe("antic_perfume", () => {
  it("blocks contamination for 2 cycles after a shower, silently, then wears off", () => {
    const s = showered(ship());
    contaminate(s, player(s, "p1"));
    expect(s.contamination["p1"]).toBeUndefined();
    s.cycle += 1;
    contaminate(s, player(s, "p1"));
    expect(s.contamination["p1"]).toBeUndefined();
    s.cycle += 1;
    contaminate(s, player(s, "p1"));
    expect(s.contamination["p1"]).toBe(1);
  });

  it("does nothing without the skill", () => {
    const s = showered(ship([]));
    contaminate(s, player(s, "p1"));
    expect(s.contamination["p1"]).toBe(1);
  });

  it("resets on a new shower instead of stacking", () => {
    let s = showered(ship());
    s.cycle += 1;
    addStatus(player(s, "p1"), "dirty");
    s = showered(s);
    expect(player(s, "p1").immuneUntil).toBe(s.cycle + 2);
  });

  it("shows the immune status to its owner only", () => {
    const s = showered(ship());
    expect(viewFor(s, "p1").statuses).toContain("immune");
    expect(JSON.stringify(viewFor(s, "p2"))).not.toContain("immune");
    expect(JSON.stringify(viewFor(s, "p0"))).not.toContain("immune");
  });
});
