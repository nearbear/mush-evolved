import { describe, expect, it } from "vitest";
import { ACTIONS } from "../src/actions.ts";
import { canFly, groundedBy, interfaceId, patrolShip } from "../src/patrol.ts";
import { applyAction, createGame, viewFor } from "../src/rules.ts";
import { overheadStatuses } from "../src/statuses.ts";
import type { Action, GameState } from "../src/types.ts";
import { makeSeats, mustApply, offered, option, player, testConfig } from "./support.ts";

// Eleesha's Chronic Vertigo trait (owner, 2026-11-22): permanent and public, Mush included; she can't fly.
// Seats: p0 (Chao) and p2 (Eleesha) in Bay Alpha, p1 (Chun) in the laboratory. The piloting lock is off so
// anyone ungrounded may take off. The Icarus side is in expeditions.test.ts.
const BAY = "SPACESHIP_BAY_A";
const takeoff: Action = { type: "takeoff", equipment: interfaceId(patrolShip("PATROL_SHIP_A_0")!) };
const refusal = (s: GameState, id: string, action: Action) => ACTIONS[action.type]!.check(s, player(s, id), action);

function ship(): GameState {
  const s = createGame(makeSeats(3), testConfig(), 3);
  s.bios.crew_lock = "projects";
  for (const p of s.players) {
    p.role = "human";
    p.room = p.id === "p1" ? "LABORATORY" : BAY;
  }
  return s;
}

describe("Chronic Vertigo (Eleesha)", () => {
  it("is Eleesha's from the start, and nobody else's", () => {
    const s = ship();
    expect(player(s, "p2").character).toBe("eleesha");
    expect(s.config.characterModifiers.eleesha).toEqual(["chronic_vertigo"]);
    expect(player(s, "p2").modifiers).toContain("chronic_vertigo");
    expect(player(s, "p0").modifiers).not.toContain("chronic_vertigo");
  });

  it("grounds her: Take off shows disabled with the reason, and is refused", () => {
    const s = ship();
    expect(canFly(player(s, "p2"))).toBe(false);
    expect(offered(s, "p0")).toContainEqual(takeoff);
    expect(offered(s, "p2")).not.toContainEqual(takeoff);
    expect(refusal(s, "p2", takeoff)).toBe("chronic_vertigo");
    expect(option(s, "p2", takeoff)?.lacks).toEqual(["vertigo"]);
    const r = applyAction(s, "p2", takeoff);
    expect(r).toEqual({ ok: false, error: "illegal_action" });
  });

  it("grounds her as a Pilot, and as a Mush (unlike a grounding disease)", () => {
    const pilot = ship();
    player(pilot, "p2").skills.push("pilot");
    expect(refusal(pilot, "p2", takeoff)).toBe("chronic_vertigo");

    const mush = ship();
    player(mush, "p2").role = "mush";
    expect(groundedBy(player(mush, "p2"))).toBe("chronic_vertigo");
    expect(refusal(mush, "p2", takeoff)).toBe("chronic_vertigo");
  });

  it("names the trait before an illness when she has both", () => {
    const s = ship();
    player(s, "p2").modifiers.push("gastroenteritis_disease");
    expect(groundedBy(player(s, "p2"))).toBe("chronic_vertigo");
    expect(option(s, "p2", takeoff)?.lacks).toEqual(["vertigo"]);
  });

  it("leaves the other crew free to fly", () => {
    const next = mustApply(ship(), "p0", takeoff);
    expect(player(next, "p0").room).toBe("PATROL_SHIP_A_0");
  });

  it("is a public trait status (Inspect-only in the room, not overhead)", () => {
    const s = ship();
    expect(viewFor(s, "p2").statuses).toContain("chronic_vertigo");
    expect(viewFor(s, "p0").players.find((p) => p.id === "p2")!.statuses).toContain("chronic_vertigo");
    expect(viewFor(s, "p1").players.find((p) => p.id === "p2")!.statuses).toEqual([]);
    expect(overheadStatuses(viewFor(s, "p2").statuses)).not.toContain("chronic_vertigo");
  });
});
