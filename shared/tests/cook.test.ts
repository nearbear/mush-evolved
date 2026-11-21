import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { resourceAvailable } from "../src/resources.ts";
import { applyAction, createGame, viewFor } from "../src/rules.ts";
import { skillStatus } from "../src/skills.ts";
import type { GameState } from "../src/types.ts";
import { makeSeats, must, nextDay, option, player, testConfig } from "./support.ts";

const seats = makeSeats(3);
// p1 is Stephen, who has cook (Chef) in CHARACTER_SKILLS.
const base = testConfig();

function ship(): GameState {
  const s = createGame(seats, base, 1);
  player(s, "p1").character = "stephen";
  return s;
}

describe("cook (Chef) skill", () => {
  it("pins the configured cook points and cap", () => {
    expect(DEFAULT_CONFIG.cook.pointsPerDay).toBe(4);
    expect(DEFAULT_CONFIG.cook.pointsOnPick).toBe(4);
    expect(DEFAULT_CONFIG.cook.capPoints).toBe(8);
    expect(skillStatus("cook")).toBe("full");
  });

  it("grants 4 Cook points on pick and each day, clamped to capPoints", () => {
    const s = must(applyAction(ship(), "p1", { type: "pick_skill", skill: "cook" }));
    expect(player(s, "p1").resources.cook).toBe(base.cook.pointsOnPick);
    expect(player(s, "p0").resources.cook).toBe(0);

    const d2 = nextDay(s);
    expect(player(d2, "p1").resources.cook).toBe(Math.min(base.cook.capPoints, base.cook.pointsOnPick + base.cook.pointsPerDay));

    // Near cap: day start clamps to config.cook.capPoints (8).
    const nearCap = ship();
    player(nearCap, "p1").skills.push("cook");
    player(nearCap, "p1").resources.cook = base.cook.capPoints - 1;
    expect(player(nextDay(nearCap), "p1").resources.cook).toBe(base.cook.capPoints);

    // Dead players gain nothing on day start.
    const dead = ship();
    player(dead, "p1").skills.push("cook");
    player(dead, "p1").alive = false;
    expect(player(nextDay(dead), "p1").resources.cook).toBe(0);
  });

  it("clamps onPick when Cook points are already near cap", () => {
    const s = ship();
    player(s, "p1").resources.cook = base.cook.capPoints - 1;
    const after = must(applyAction(s, "p1", { type: "pick_skill", skill: "cook" }));
    expect(player(after, "p1").resources.cook).toBe(base.cook.capPoints);
  });

  it("spends Cook points to cook for 0 AP even at 0 AP, then falls back to AP", () => {
    const s = must(applyAction(ship(), "p1", { type: "pick_skill", skill: "cook" }));
    player(s, "p1").room = "REFECTORY";
    player(s, "p1").ap = 0;
    player(s, "p1").resources.cook = 1;
    s.items.push({ id: "r1", type: "uncooked_ration", at: { kind: "room", id: "REFECTORY" } });
    s.items.push({ id: "r2", type: "uncooked_ration", at: { kind: "room", id: "REFECTORY" } });

    expect(option(s, "p1", { type: "cook", item: "r1" })).toMatchObject({ cost: { ap: 0, mp: 0, paidBy: "cook" } });
    const after = must(applyAction(s, "p1", { type: "cook", item: "r1" }));
    expect(player(after, "p1").ap).toBe(0);
    expect(player(after, "p1").resources.cook).toBe(0);

    // Next cook falls back to normal AP cost and is refused at 0 AP.
    expect(option(after, "p1", { type: "cook", item: "r2" })).toMatchObject({ cost: { ap: base.cook.cost.ap, mp: 0 } });
    expect(applyAction(after, "p1", { type: "cook", item: "r2" })).toEqual({ ok: false, error: "illegal_action" });
  });

  it("makes cook resource available in the UI and keeps it private", () => {
    expect(resourceAvailable("cook", 0, ["cook"])).toBe(true);
    expect(resourceAvailable("cook", 0, [], "cook")).toBe(true);
    expect(resourceAvailable("cook", 0, [])).toBe(false);

    const s = must(applyAction(ship(), "p1", { type: "pick_skill", skill: "cook" }));
    expect(viewFor(s, "p1").you.resources.cook).toBe(base.cook.pointsOnPick);
    const p0View = viewFor(s, "p0");
    expect(p0View.you.resources.cook).toBe(0);
    expect(p0View.players.find((o) => o.id === "p1")).not.toHaveProperty("resources");
  });
});
