import { describe, expect, it } from "vitest";
import { ACTIONS } from "../src/actions.ts";
import { applyAction, createGame, legalActions, viewFor } from "../src/rules.ts";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { makeSeats, mustApply, player, testConfig } from "./support.ts";

const ship = () => {
  const s = createGame(makeSeats(4), testConfig(), 5, { p0: "mush" });
  const p = player(s, "p0");
  p.mushSkills.push("massggedon");
  p.ap = 5;
  p.spores = 0;
  return s;
};
const offered = (s: ReturnType<typeof ship>, id: string) => legalActions(s, id).some((a) => a.type === "mass_mouldering");

describe("Mass Mouldering", () => {
  it("costs 2 AP and 0 spores, makes every living player including the actor dirty once, and leaves AP untouched", () => {
    expect(DEFAULT_CONFIG.massMouldering.cost.ap).toBe(2);
    const s = ship();
    player(s, "p2").room = "LABORATORY";
    player(s, "p3").alive = false;
    const apBefore = s.players.map((p) => p.ap);
    expect(offered(s, "p0")).toBe(true);

    const next = mustApply(s, "p0", { type: "mass_mouldering" });
    expect(player(next, "p0").ap).toBe(apBefore[0] - DEFAULT_CONFIG.massMouldering.cost.ap);
    expect(player(next, "p0").spores).toBe(0);
    for (const id of ["p1", "p2", "p3"]) {
      const idx = Number(id.slice(1));
      expect(player(next, id).ap).toBe(apBefore[idx]);
    }
    for (const id of ["p0", "p1", "p2"]) {
      expect(player(next, id).statuses).toContain("dirty");
    }
    expect(player(next, "p3").statuses).not.toContain("dirty");
    expect(offered(next, "p0")).toBe(false);
    expect(applyAction(next, "p0", { type: "mass_mouldering" }).ok).toBe(false);
  });

  it("respects apron, Stickler, and already-dirty players via soil()", () => {
    const s = ship();
    player(s, "p1").skills.push("stickler");
    s.items.push({ id: "apron1", type: "apron", at: { kind: "player", id: "p2" }, broken: false });
    player(s, "p3").statuses.push("dirty");

    const next = mustApply(s, "p0", { type: "mass_mouldering" });
    expect(player(next, "p0").statuses).toContain("dirty");
    expect(player(next, "p1").statuses).not.toContain("dirty");
    expect(player(next, "p2").statuses).not.toContain("dirty");
    expect(player(next, "p3").statuses).toContain("dirty");

    expect(viewFor(next, "p1").log.some((e) => e.key === "sticklerBlockedDirty")).toBe(true);
    expect(viewFor(next, "p2").log.some((e) => e.key === "apronBlockedDirty")).toBe(true);
    expect(viewFor(next, "p3").log.some((e) => e.key === "becomeDirty")).toBe(false);
  });

  it("is only offered to and usable by a Mush holding massggedon outside preselection", () => {
    const noSkill = ship();
    player(noSkill, "p0").mushSkills = ["ninja"];
    expect(offered(noSkill, "p0")).toBe(false);
    expect(applyAction(noSkill, "p0", { type: "mass_mouldering" }).ok).toBe(false);

    const human = ship();
    player(human, "p0").role = "human";
    expect(offered(human, "p0")).toBe(false);
    expect(applyAction(human, "p0", { type: "mass_mouldering" }).ok).toBe(false);

    const pre = ship();
    pre.preselection = { endsAt: 1000, seats: 4, picks: {} };
    expect(offered(pre, "p0")).toBe(false);
    expect(applyAction(pre, "p0", { type: "mass_mouldering" }).ok).toBe(false);
  });

  it("moves its used flag with the mind on Body Transfer and logs privately with spore tag", () => {
    expect(ACTIONS.mass_mouldering.tags).toContain("spore");

    const s = ship();
    player(s, "p0").mushSkills.push("transfert");
    s.contamination["p1"] = 1;
    const afterMould = mustApply(s, "p0", { type: "mass_mouldering" });

    expect(viewFor(afterMould, "p0").log.some((e) => e.key === "massMouldering")).toBe(true);
    for (const id of ["p1", "p2", "p3"]) {
      expect(viewFor(afterMould, id).log.some((e) => e.key === "massMouldering")).toBe(false);
    }

    const afterTransfer = mustApply(afterMould, "p0", { type: "body_transfer", target: "p1" });
    // Mind moved to p1; still cannot use Mass Mouldering a second time.
    expect(offered(afterTransfer, "p1")).toBe(false);
    expect(applyAction(afterTransfer, "p1", { type: "mass_mouldering" }).ok).toBe(false);
  });
});
