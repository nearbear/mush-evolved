import { describe, expect, it } from "vitest";
import { ACTIONS } from "../src/actions.ts";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { CAMERA_EQUIPMENT } from "../src/equipment.ts";
import { applyAction, createGame, legalActions, viewFor } from "../src/rules.ts";
import { makeSeats, mustApply, player, testConfig } from "./support.ts";

const ship = () => {
  const s = createGame(makeSeats(4), testConfig({ mushCount: 2 }), 5, {
    p0: "mush",
    p1: "mush",
  });
  const p0 = player(s, "p0");
  p0.mushSkills.push("disheartening_contact");
  p0.ap = 6;
  for (const p of s.players) {
    p.room = "BRIDGE";
    p.morale = 6;
  }
  return s;
};

const offeredTargets = (s: ReturnType<typeof ship>, id: string) =>
  legalActions(s, id)
    .filter((a) => a.type === "demoralize")
    .map((a) => a.target);

describe("Demoralizer (demoralize)", () => {
  it("pins config defaults, costs 2 AP with no limit, and lowers a human or Mush roommate's morale by 2", () => {
    expect([DEFAULT_CONFIG.demoralize.cost.ap, DEFAULT_CONFIG.demoralize.morale]).toEqual([2, 2]);
    const s = ship();
    const apBefore = player(s, "p0").ap;
    const humanBefore = player(s, "p2").morale;
    const mushBefore = player(s, "p1").morale;

    expect(offeredTargets(s, "p0")).toEqual(["p1", "p2", "p3"]);

    const afterHuman = mustApply(s, "p0", { type: "demoralize", target: "p2" });
    expect(player(afterHuman, "p0").ap).toBe(apBefore - DEFAULT_CONFIG.demoralize.cost.ap);
    expect(player(afterHuman, "p2").morale).toBe(humanBefore - DEFAULT_CONFIG.demoralize.morale);

    // No daily limit or cooldown: can immediately target the same human again or a Mush teammate.
    const afterAgain = mustApply(afterHuman, "p0", { type: "demoralize", target: "p2" });
    expect(player(afterAgain, "p2").morale).toBe(humanBefore - 2 * DEFAULT_CONFIG.demoralize.morale);

    const afterMush = mustApply(afterAgain, "p0", { type: "demoralize", target: "p1" });
    expect(player(afterMush, "p1").morale).toBe(mushBefore - DEFAULT_CONFIG.demoralize.morale);
  });

  it("clamps morale at 0 and stays offered when target is already at 0 morale", () => {
    const s = ship();
    player(s, "p2").morale = 1;
    const afterOne = mustApply(s, "p0", { type: "demoralize", target: "p2" });
    expect(player(afterOne, "p2").morale).toBe(0);
    expect(viewFor(afterOne, "p2").statuses).toContain("hopeless");

    // Still offered at 0 morale so withholding it does not leak the target's private morale.
    expect(offeredTargets(afterOne, "p0")).toContain("p2");
    const afterTwo = mustApply(afterOne, "p0", { type: "demoralize", target: "p2" });
    expect(player(afterTwo, "p2").morale).toBe(0);
  });

  it("rejects non-Mush, missing skill, pre-selection, missing/dead/distant targets, self, and low AP", () => {
    const noSkill = ship();
    player(noSkill, "p0").mushSkills = ["fertile"];
    expect(offeredTargets(noSkill, "p0")).toEqual([]);
    expect(applyAction(noSkill, "p0", { type: "demoralize", target: "p2" }).ok).toBe(false);

    const human = ship();
    player(human, "p0").role = "human";
    expect(offeredTargets(human, "p0")).toEqual([]);
    expect(applyAction(human, "p0", { type: "demoralize", target: "p2" }).ok).toBe(false);

    const pre = ship();
    pre.preselection = { endsAt: 1000, seats: 4, picks: {} };
    expect(offeredTargets(pre, "p0")).toEqual([]);
    expect(applyAction(pre, "p0", { type: "demoralize", target: "p2" }).ok).toBe(false);

    const s = ship();
    player(s, "p2").room = "LABORATORY";
    player(s, "p3").alive = false;
    expect(offeredTargets(s, "p0")).toEqual(["p1"]);
    expect(applyAction(s, "p0", { type: "demoralize", target: "p2" }).ok).toBe(false);
    expect(applyAction(s, "p0", { type: "demoralize", target: "p3" }).ok).toBe(false);
    expect(applyAction(s, "p0", { type: "demoralize", target: "p0" }).ok).toBe(false);

    player(s, "p0").ap = DEFAULT_CONFIG.demoralize.cost.ap - 1;
    expect(applyAction(s, "p0", { type: "demoralize", target: "p1" }).ok).toBe(false);
  });

  it("is aggressive: Pacifist and Bodyguard surcharges apply to its AP cost", () => {
    expect(ACTIONS.demoralize.tags).toContain("aggressive");
    const s = ship();
    player(s, "p3").skills.push("pacifist");
    const option = viewFor(s, "p0").actions.find((o) => o.action.type === "demoralize" && o.action.target === "p2");
    expect(option?.cost.ap).toBe(DEFAULT_CONFIG.demoralize.cost.ap + DEFAULT_CONFIG.pacifist.aggressiveApSurcharge);
  });

  it("logs covertly to the room and privately to the victim without leaking to bystanders", () => {
    expect(ACTIONS.demoralize.visibility).toBe("covert");
    const s = ship();
    const next = mustApply(s, "p0", { type: "demoralize", target: "p2" });

    // Actor sees covert log; victim sees only private loseMorale; bystander sees neither.
    expect(viewFor(next, "p0").log.some((e) => e.key === "demoralized")).toBe(true);
    expect(viewFor(next, "p2").log.some((e) => e.key === "demoralized")).toBe(false);
    expect(viewFor(next, "p2").log.some((e) => e.key === "loseMorale")).toBe(true);
    expect(viewFor(next, "p3").log.some((e) => e.key === "demoralized" || e.key === "loseMorale")).toBe(false);

    // Camera in the room reveals the covert log to everyone in the room.
    const withCam = ship();
    withCam.equipment["BRIDGE"] = [{ id: "cam1", type: CAMERA_EQUIPMENT, broken: false }];
    const afterCam = mustApply(withCam, "p0", { type: "demoralize", target: "p2" });
    expect(viewFor(afterCam, "p2").log.some((e) => e.key === "demoralized")).toBe(true);
    expect(viewFor(afterCam, "p3").log.some((e) => e.key === "demoralized")).toBe(true);
  });
});
