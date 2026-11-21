import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { MODIFIERS } from "../src/modifiers.ts";
import { RESEARCH_COMPLETE } from "../src/research.ts";
import { applyAction, createGame, viewFor } from "../src/rules.ts";
import type { Action, GameState, PlayerId } from "../src/types.ts";
import { makeSeats, player, offered, mustApply, testConfig, withoutDrugs } from "./support.ts";

const seats = makeSeats(3);
const config = testConfig();
const bandage = (target: PlayerId): Action => ({ type: "use_bandage", target });
const { cost, effect } = config.bandage;

/** Three people in one room, hurt to 5 HP; p0 holds one bandage. */
function ship(): GameState {
  const s = withoutDrugs(createGame(seats, config, 3));
  s.players.forEach((p) => {
    p.room = "LABORATORY";
    p.hp = 5;
  });
  s.items.push({ id: "b1", type: "bandage", at: { kind: "player", id: "p0" } });
  return s;
}

describe("bandages", () => {
  it("uses the confirmed numbers and spawns two in the medlab", () => {
    expect([cost.ap, effect.hp]).toEqual([1, 2]);
    expect(DEFAULT_CONFIG.startItems.filter((i) => i.type === "bandage" && i.room === "SICK_BAY")).toHaveLength(2);
  });

  it("heals someone else in the room, costs its AP and is used up", () => {
    const s = mustApply(ship(), "p0", bandage("p1"));
    expect(player(s, "p1").hp).toBe(5 + effect.hp);
    expect(player(s, "p0").ap).toBe(config.startAp - cost.ap);
    expect(s.items.some((i) => i.type === "bandage")).toBe(false);
    expect(offered(s, "p0").some((a) => a.type === "use_bandage")).toBe(false);
  });

  it("heals yourself for the same cost", () => {
    const s = mustApply(ship(), "p0", bandage("p0"));
    expect(player(s, "p0").hp).toBe(5 + effect.hp);
    expect(player(s, "p0").ap).toBe(config.startAp - cost.ap);
  });

  it("caps at max HP and is still offered at full HP", () => {
    const s = ship();
    player(s, "p1").hp = player(s, "p1").maxHp;
    expect(offered(s, "p0")).toContainEqual(bandage("p1"));
    expect(player(mustApply(s, "p0", bandage("p1")), "p1").hp).toBe(player(s, "p1").maxHp);
  });

  it("works the same for a Mush", () => {
    const s = ship();
    player(s, "p0").role = "mush";
    expect(player(mustApply(s, "p0", bandage("p1")), "p1").hp).toBe(5 + effect.hp);
  });

  it("needs a bandage in your inventory", () => {
    const s = ship();
    expect(offered(s, "p1").some((a) => a.type === "use_bandage")).toBe(false);
    expect(applyAction(s, "p1", bandage("p0")).ok).toBe(false);
    s.items[0]!.at = { kind: "room", id: "LABORATORY" };
    expect(applyAction(s, "p0", bandage("p1")).ok).toBe(false);
  });

  it("needs the target alive and in your room, and the AP; failures leave state unchanged", () => {
    const s = ship();
    player(s, "p1").room = "CORRIDOR_A";
    player(s, "p2").alive = false;
    expect(offered(s, "p0")).toEqual(expect.not.arrayContaining([bandage("p1"), bandage("p2")]));
    const before = JSON.stringify(s);
    expect(applyAction(s, "p0", bandage("p1")).ok).toBe(false);
    expect(applyAction(s, "p0", bandage("p2")).ok).toBe(false);
    player(s, "p0").ap = cost.ap - 1;
    const poor = JSON.stringify(s);
    expect(applyAction(s, "p0", bandage("p0")).ok).toBe(false);
    expect(JSON.stringify(s)).toBe(poor);
    expect(before).not.toBe(poor);
  });

  it("goes through the healAmount modifier hook", () => {
    const s = ship();
    player(s, "p0").modifiers.push("test_healer");
    MODIFIERS.test_healer = { healAmount: (n) => n + 2 };
    try {
      expect(player(mustApply(s, "p0", bandage("p1")), "p1").hp).toBe(5 + effect.hp + 2);
    } finally {
      delete MODIFIERS.test_healer;
    }
  });

  it("is public to the room and invisible elsewhere", () => {
    const s = ship();
    player(s, "p2").room = "CORRIDOR_A";
    const r = mustApply(s, "p0", bandage("p1"));
    expect(viewFor(r, "p1").log.some((e) => e.key === "bandaged")).toBe(true);
    expect(JSON.stringify(viewFor(r, "p2"))).not.toContain("bandaged");
  });

  it("restores ointmentBonusHp extra HP once HEALING_OINTMANT is complete (humans and Mush, stacking with medic)", () => {
    const partial = ship();
    partial.research.HEALING_OINTMANT = RESEARCH_COMPLETE - 1;
    expect(player(mustApply(partial, "p0", bandage("p1")), "p1").hp).toBe(5 + effect.hp);

    const done = ship();
    done.research.HEALING_OINTMANT = RESEARCH_COMPLETE;
    expect(player(mustApply(done, "p0", bandage("p1")), "p1").hp).toBe(5 + effect.hp + config.heal.effect.ointmentBonusHp);

    const mushMedic = ship();
    mushMedic.research.HEALING_OINTMANT = RESEARCH_COMPLETE;
    player(mushMedic, "p0").role = "mush";
    player(mushMedic, "p0").skills.push("medic");
    expect(player(mustApply(mushMedic, "p0", bandage("p1")), "p1").hp).toBe(
      5 + effect.hp + config.heal.effect.medicBonusHp + config.heal.effect.ointmentBonusHp,
    );
  });
});
