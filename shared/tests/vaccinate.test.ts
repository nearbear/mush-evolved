import { describe, expect, it } from "vitest";
import { ANTI_MUSH_SERUM_ITEM } from "../src/actions/vaccinate.ts";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { RESEARCH_COMPLETE } from "../src/research.ts";
import { applyAction, createGame, viewFor } from "../src/rules.ts";
import type { Action, GameState, PlayerId } from "../src/types.ts";
import { makeSeats, must, mustApply, offered as legal, player, stockLab, setProgress } from "./support.ts";

const seats = makeSeats(4);
const config = { ...DEFAULT_CONFIG, characterModifiers: {}, mushCount: 1, startInventory: [], startItems: [], maxAp: 99, startAp: 50 };
const vaccinate = (target: PlayerId): Action => ({ type: "vaccinate", target });
const serums = (s: GameState) => s.items.filter((i) => i.type === ANTI_MUSH_SERUM_ITEM);
const offered = (s: GameState, id: PlayerId) => legal(s, id).filter((a) => a.type === "vaccinate");
const logKeys = (s: GameState, p: PlayerId) => viewFor(s, p).log.map((e) => e.key);

/** p0 human holding a serum, p1 Mush and p2 human beside them in SICK_BAY; p3 human in the lab. */
function ship(): GameState {
  const s = createGame(seats, config, 3);
  s.players.forEach((p) => {
    p.role = p.id === "p1" ? "mush" : "human";
    p.room = p.id === "p3" ? "LABORATORY" : "SICK_BAY";
  });
  s.items.push({ id: `item-${s.nextItemId++}`, type: ANTI_MUSH_SERUM_ITEM, at: { kind: "player", id: "p0" } });
  return s;
}

describe("anti-mush serum", () => {
  it("costs the configured AP and is used up", () => {
    expect(DEFAULT_CONFIG.vaccine.cost.ap).toBe(1);
    const s = ship();
    const after = must(applyAction(s, "p0", vaccinate("p2")));
    expect(player(after, "p0").ap).toBe(player(s, "p0").ap - config.vaccine.cost.ap);
    expect(serums(after)).toHaveLength(0);
  });

  it("turns a Mush human: spores and Mush skills go, satiety restarts", () => {
    const s = ship();
    Object.assign(player(s, "p1"), { spores: 3, mushSkills: ["spiker"], satiety: 0 });
    const after = mustApply(s, "p0", vaccinate("p1"));
    expect(player(after, "p1")).toMatchObject({ role: "human", alpha: false, spores: 0, mushSkills: [], satietyZeroSince: after.cycle });
    expect(logKeys(after, "p1")).toContain("cured");
    expect(logKeys(after, "p0")).toContain("vaccineWorked");
  });

  it("clears contamination on a human, and is used up on a healthy one with nothing happening", () => {
    const s = ship();
    s.contamination["p2"] = 2;
    const cured = mustApply(s, "p0", vaccinate("p2"));
    expect(cured.contamination["p2"]).toBeUndefined();
    expect(logKeys(cured, "p2")).toContain("cured");

    const healthy = mustApply(ship(), "p0", vaccinate("p2"));
    expect(serums(healthy)).toHaveLength(0);
    expect(logKeys(healthy, "p0")).toContain("vaccineNothing");
    expect(logKeys(healthy, "p2")).not.toContain("cured");
  });

  it("shows the room that a serum was used, never the result", () => {
    const after = mustApply(ship(), "p0", vaccinate("p1"));
    expect(logKeys(after, "p2")).toContain("vaccinated");
    for (const key of ["vaccineWorked", "vaccineNothing", "cured"]) expect(logKeys(after, "p2")).not.toContain(key);
    expect(logKeys(after, "p3")).not.toContain("vaccinated");
  });

  it("is only offered to someone carrying a serum, on others in the room, and an illegal try changes nothing", () => {
    const s = ship();
    expect(offered(s, "p0").map((a) => (a as { target: string }).target).sort()).toEqual(["p1", "p2"]);
    expect(offered(s, "p2")).toHaveLength(0);
    const floor = ship();
    floor.items.find((i) => i.type === ANTI_MUSH_SERUM_ITEM)!.at = { kind: "room", id: "SICK_BAY" };
    expect(offered(floor, "p0")).toHaveLength(0);
    for (const bad of [vaccinate("p0"), vaccinate("p3")]) {
      const before = JSON.stringify(s);
      expect(applyAction(s, "p0", bad).ok).toBe(false);
      expect(JSON.stringify(s)).toBe(before);
    }
  });

  it("is left on the lab floor when the research completes", () => {
    const s = ship();
    setProgress(s, { research: "ANTI_MUSH_SERUM" }, RESEARCH_COMPLETE - 1);
    stockLab(s, "LABORATORY", "ANTI_MUSH_SERUM");
    const after = mustApply(s, "p3", { type: "research", equipment: "LABORATORY:RESEARCH_LAB", research: "ANTI_MUSH_SERUM" });
    expect(serums(after).filter((i) => i.at.kind === "room" && i.at.id === "LABORATORY")).toHaveLength(1);
  });
});
