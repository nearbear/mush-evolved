import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { resourceAvailable } from "../src/resources.ts";
import { applyAction, createGame, viewFor } from "../src/rules.ts";
import { skillStatus } from "../src/skills.ts";
import type { GameState } from "../src/types.ts";
import { makeSeats, must, nextDay, option, player } from "./support.ts";

const seats = makeSeats(3);
// p1 is Chun, who has maintenance_agent in CHARACTER_SKILLS.
const base = { ...DEFAULT_CONFIG, mushCount: 1, startInventory: [], startItems: [], startSkills: [] };

function ship(): GameState {
  const s = createGame(seats, base, 1);
  player(s, "p1").character = "chun";
  return s;
}

describe("maintenance_agent", () => {
  it("pins the configured points and cook cap", () => {
    expect(DEFAULT_CONFIG.maintenanceAgent).toEqual({
      pointsPerDay: { eng: 1, garden: 1, cook: 1 },
      pointsOnPick: { eng: 1, garden: 1, cook: 1 },
    });
    expect(DEFAULT_CONFIG.cook.capPoints).toBe(8);
    expect(skillStatus("maintenance_agent")).toBe("full");
  });

  it("grants 1 eng, 1 garden, and 1 cook on pick and each day, clamped to shared caps", () => {
    const s = must(applyAction(ship(), "p1", { type: "pick_skill", skill: "maintenance_agent" }));
    expect(player(s, "p1").resources).toMatchObject({ eng: 1, garden: 1, cook: 1 });
    expect(player(s, "p0").resources).toMatchObject({ eng: 0, garden: 0, cook: 0 });

    const d2 = nextDay(s);
    expect(player(d2, "p1").resources).toMatchObject({ eng: 2, garden: 2, cook: 2 });

    // eng caps at config.engineer.capPoints (2), garden at config.botany.capPoints (4), cook at config.cook.capPoints (8).
    const nearCap = ship();
    player(nearCap, "p1").skills.push("maintenance_agent");
    player(nearCap, "p1").resources.eng = base.engineer.capPoints;
    player(nearCap, "p1").resources.garden = base.botany.capPoints;
    player(nearCap, "p1").resources.cook = base.cook.capPoints;
    expect(player(nextDay(nearCap), "p1").resources).toMatchObject({
      eng: base.engineer.capPoints,
      garden: base.botany.capPoints,
      cook: base.cook.capPoints,
    });

    // Dead players gain nothing on day start.
    const dead = ship();
    player(dead, "p1").skills.push("maintenance_agent");
    player(dead, "p1").alive = false;
    expect(player(nextDay(dead), "p1").resources).toMatchObject({ eng: 0, garden: 0, cook: 0 });
  });

  it("clamps onPick when resources are already near cap", () => {
    const s = ship();
    player(s, "p1").resources.eng = base.engineer.capPoints;
    player(s, "p1").resources.garden = base.botany.capPoints;
    player(s, "p1").resources.cook = base.cook.capPoints;
    const after = must(applyAction(s, "p1", { type: "pick_skill", skill: "maintenance_agent" }));
    expect(player(after, "p1").resources).toMatchObject({
      eng: base.engineer.capPoints,
      garden: base.botany.capPoints,
      cook: base.cook.capPoints,
    });
  });

  it("spends a Cook point to cook for 0 AP even at 0 AP, then falls back to AP", () => {
    const s = must(applyAction(ship(), "p1", { type: "pick_skill", skill: "maintenance_agent" }));
    player(s, "p1").room = "REFECTORY";
    player(s, "p1").ap = 0;
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

  it("makes eng, garden, and cook resources available in the UI and keeps them private", () => {
    expect(resourceAvailable("eng", 0, ["maintenance_agent"])).toBe(true);
    expect(resourceAvailable("garden", 0, ["maintenance_agent"])).toBe(true);
    expect(resourceAvailable("cook", 0, ["maintenance_agent"])).toBe(true);
    expect(resourceAvailable("cook", 0, [], "maintenance_agent")).toBe(true);
    expect(resourceAvailable("cook", 0, [])).toBe(false);

    const s = must(applyAction(ship(), "p1", { type: "pick_skill", skill: "maintenance_agent" }));
    expect(viewFor(s, "p1").you.resources.cook).toBe(1);
    const p0View = viewFor(s, "p0");
    expect(p0View.you.resources.cook).toBe(0);
    expect(p0View.players.find((o) => o.id === "p1")).not.toHaveProperty("resources");
  });
});
