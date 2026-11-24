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
  p.spores = DEFAULT_CONFIG.massMouldering.spores;
  return s;
};
const offered = (s: ReturnType<typeof ship>, id: string) => legalActions(s, id).some((a) => a.type === "mass_mouldering");

describe("Mass Mushification", () => {
  it("costs 2 AP and 2 spores, drains 2 AP from living humans (not Mush), soils every living player once", () => {
    expect([
      DEFAULT_CONFIG.massMouldering.cost.ap,
      DEFAULT_CONFIG.massMouldering.spores,
      DEFAULT_CONFIG.massMouldering.apDrain,
    ]).toEqual([2, 2, 2]);
    const s = ship();
    player(s, "p1").role = "mush";
    player(s, "p1").room = "LABORATORY";
    player(s, "p2").room = "LABORATORY";
    player(s, "p2").ap = 1; // clamps to 0
    player(s, "p3").alive = false;
    const apBefore = s.players.map((p) => p.ap);
    expect(offered(s, "p0")).toBe(true);

    const next = mustApply(s, "p0", { type: "mass_mouldering" });
    expect(player(next, "p0").ap).toBe(apBefore[0]! - DEFAULT_CONFIG.massMouldering.cost.ap);
    expect(player(next, "p0").spores).toBe(0);
    // Other Mush keeps their AP; living human loses apDrain (clamped at 0); dead human untouched.
    expect(player(next, "p1").ap).toBe(apBefore[1]);
    expect(player(next, "p2").ap).toBe(Math.max(0, apBefore[2]! - DEFAULT_CONFIG.massMouldering.apDrain));
    expect(player(next, "p3").ap).toBe(apBefore[3]);

    for (const id of ["p0", "p1", "p2"]) {
      expect(player(next, id).statuses).toContain("dirty");
    }
    expect(player(next, "p3").statuses).not.toContain("dirty");
    expect(offered(next, "p0")).toBe(false);
    expect(applyAction(next, "p0", { type: "mass_mouldering" }).ok).toBe(false);
  });

  it("bypasses apron and Stickler, fires becameDirty on newly dirty players, and sends the dedicated private log to other living players", () => {
    const s = ship();
    player(s, "p1").skills.push("stickler");
    s.items.push({ id: "apron1", type: "apron", at: { kind: "player", id: "p2" }, broken: false });
    player(s, "p3").statuses.push("dirty");
    const apBefore = s.players.map((p) => p.ap);

    const next = mustApply(s, "p0", { type: "mass_mouldering" });
    for (const id of ["p0", "p1", "p2", "p3"]) {
      expect(player(next, id).statuses).toContain("dirty");
    }
    for (const id of ["p1", "p2", "p3"]) {
      const idx = Number(id.slice(1));
      expect(player(next, id).ap).toBe(Math.max(0, apBefore[idx]! - DEFAULT_CONFIG.massMouldering.apDrain));
      expect(viewFor(next, id).log.some((e) => e.key === "soiledByMassMouldering")).toBe(true);
      expect(viewFor(next, id).log.some((e) => e.key === "sticklerBlockedDirty" || e.key === "apronBlockedDirty")).toBe(false);
    }
    // Actor does not receive the victim log.
    expect(viewFor(next, "p0").log.some((e) => e.key === "soiledByMassMouldering")).toBe(false);
  });

  it("requires 2 spores and is only offered to a Mush holding massggedon outside preselection", () => {
    const fewSpores = ship();
    player(fewSpores, "p0").spores = DEFAULT_CONFIG.massMouldering.spores - 1;
    expect(offered(fewSpores, "p0")).toBe(false);
    expect(applyAction(fewSpores, "p0", { type: "mass_mouldering" }).ok).toBe(false);

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

  it("is secret (witnessed by roommates or camera, hidden when alone), does not trigger myco-alarms, and moves its used flag with the mind on Body Transfer", () => {
    expect(ACTIONS.mass_mouldering.visibility).toBe("secret");
    expect(ACTIONS.mass_mouldering.tags).not.toContain("spore");

    // Alone in room: only actor sees massMouldering log, not players in other rooms.
    const alone = ship();
    player(alone, "p0").room = "BRIDGE";
    for (const id of ["p1", "p2", "p3"]) player(alone, id).room = "LABORATORY";
    const afterAlone = mustApply(alone, "p0", { type: "mass_mouldering" });
    expect(viewFor(afterAlone, "p0").log.some((e) => e.key === "massMouldering")).toBe(true);
    for (const id of ["p1", "p2", "p3"]) {
      expect(viewFor(afterAlone, id).log.some((e) => e.key === "massMouldering")).toBe(false);
    }

    // With a roommate in the same room: roommate witnesses massMouldering, others elsewhere do not.
    const witnessed = ship();
    player(witnessed, "p0").room = "BRIDGE";
    player(witnessed, "p1").room = "BRIDGE";
    player(witnessed, "p2").room = "LABORATORY";
    player(witnessed, "p0").mushSkills.push("transfert");
    witnessed.contamination["p1"] = 1;
    const afterWitnessed = mustApply(witnessed, "p0", { type: "mass_mouldering" });
    expect(viewFor(afterWitnessed, "p0").log.some((e) => e.key === "massMouldering")).toBe(true);
    expect(viewFor(afterWitnessed, "p1").log.some((e) => e.key === "massMouldering")).toBe(true);
    expect(viewFor(afterWitnessed, "p2").log.some((e) => e.key === "massMouldering")).toBe(false);

    const afterTransfer = mustApply(afterWitnessed, "p0", { type: "body_transfer", target: "p1" });
    player(afterTransfer, "p1").spores = DEFAULT_CONFIG.massMouldering.spores;
    // Mind moved to p1; still cannot use Mass Mushification a second time.
    expect(offered(afterTransfer, "p1")).toBe(false);
    expect(applyAction(afterTransfer, "p1", { type: "mass_mouldering" }).ok).toBe(false);
  });
});
