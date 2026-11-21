import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { CAMERA_EQUIPMENT } from "../src/equipment.ts";
import { nextFloat } from "../src/rng.ts";
import { createGame, viewFor } from "../src/rules.ts";
import { skillStatus } from "../src/skills.ts";
import type { GameConfig, GameState } from "../src/types.ts";
import { costOf, makeSeats, mustApply, player, testConfig } from "./support.ts";

const base = testConfig();
const withChance = (revealChance: number): GameConfig => testConfig({ observant: { revealChance } });
const spike = { type: "spike", target: "p3" } as const;

/** p0 is an Observant; p1 is a Mush with a spore. p0, p1, p2 and p3 share the sick bay, p4 is in the refectory. */
function ship(config = base): GameState {
  const s = createGame(makeSeats(5), config, 11);
  for (const p of s.players) p.room = "SICK_BAY";
  player(s, "p4").room = "REFECTORY";
  player(s, "p0").skills.push("observant");
  player(s, "p1").role = "mush";
  player(s, "p1").spores = 1;
  return s;
}

const sees = (s: GameState, id: string, key: string) => viewFor(s, id).log.some((e) => e.key === key);

describe("Observant", () => {
  it("pins the confirmed numbers (owner, 2026-11-14)", () => {
    expect([DEFAULT_CONFIG.observant.searchApDiscount, DEFAULT_CONFIG.observant.revealChance]).toEqual([1, 0.25]);
    expect(skillStatus("observant")).toBe("full");
  });

  it("makes Search cheaper for the Observant only, never below 0", () => {
    const s = ship();
    s.preselection = false;
    const discounted = Math.max(0, base.search.cost.ap - base.observant.searchApDiscount);
    expect(costOf(s, "p0", { type: "search" })?.ap).toBe(discounted);
    expect(costOf(s, "p2", { type: "search" })?.ap).toBe(base.search.cost.ap);
    const after = mustApply(s, "p0", { type: "search" });
    expect(player(after, "p0").ap).toBe(player(s, "p0").ap - discounted);
  });

  it("on a successful roll, the covert line becomes room history, victim included, with a public line naming the Observant", () => {
    const s = mustApply(ship(withChance(1)), "p1", spike);
    for (const id of ["p0", "p2", "p3"]) expect(sees(s, id, "spiked")).toBe(true);
    const line = s.log.find((e) => e.key === "spiked")!;
    expect([line.visibleTo, line.kind, line.leaked]).toEqual(["all", "covert", true]);
    const notice = viewFor(s, "p2").log.find((e) => e.key === "observantNoticed");
    expect(notice?.params?.name).toBe(player(s, "p0").character);
    // Room history: someone elsewhere sees neither line.
    expect(sees(s, "p4", "spiked") || sees(s, "p4", "observantNoticed")).toBe(false);
  });

  it("on a failed roll, the covert line stays the actor's alone and no one is told", () => {
    const s = mustApply(ship(withChance(0)), "p1", spike);
    expect(sees(s, "p1", "spiked")).toBe(true);
    for (const id of ["p0", "p2", "p3"]) expect(sees(s, id, "spiked")).toBe(false);
    expect(s.log.some((e) => e.key === "observantNoticed")).toBe(false);
  });

  it("never reveals the Observant's own covert actions (a Mush Observant)", () => {
    const s0 = ship(withChance(1));
    player(s0, "p0").skills = [];
    player(s0, "p1").skills.push("observant");
    const s = mustApply(s0, "p1", spike);
    expect(sees(s, "p2", "spiked")).toBe(false);
    expect(s.log.some((e) => e.key === "observantNoticed")).toBe(false);
  });

  it("needs a living Observant in the room, and then rolls nothing", () => {
    for (const away of [(s: GameState) => (player(s, "p0").room = "REFECTORY"), (s: GameState) => (player(s, "p0").alive = false)]) {
      const s0 = ship(withChance(1));
      away(s0);
      const s = mustApply(s0, "p1", spike);
      expect(sees(s, "p2", "spiked")).toBe(false);
      expect(s.rng).toBe(s0.rng);
    }
  });

  it("rolls once per Observant present; the first who succeeds is named", () => {
    const failing = ship(withChance(0));
    player(failing, "p2").skills.push("observant");
    const failed = mustApply(failing, "p1", spike);
    expect(failed.rng).toBe(nextFloat(nextFloat(failing.rng)[1])[1]);

    const both = ship(withChance(1));
    player(both, "p2").skills.push("observant");
    const s = mustApply(both, "p1", spike);
    const notices = s.log.filter((e) => e.key === "observantNoticed");
    expect(notices.map((e) => e.params?.name)).toEqual([player(s, "p0").character]);
  });

  it("does not roll when a camera already films the room", () => {
    const s0 = ship(withChance(1));
    (s0.equipment.SICK_BAY ??= []).push({ id: "SICK_BAY:CAMERA", type: CAMERA_EQUIPMENT });
    const s = mustApply(s0, "p1", spike);
    expect(sees(s, "p2", "spiked")).toBe(true);
    expect(s.log.some((e) => e.key === "observantNoticed")).toBe(false);
    expect(s.rng).toBe(s0.rng);
  });
});
