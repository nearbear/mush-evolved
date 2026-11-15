import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { MODIFIERS, healAmount } from "../src/modifiers.ts";
import { parseGameMessage } from "../src/protocol.ts";
import { RESEARCH_COMPLETE, researchStatus } from "../src/research.ts";
import { applyAction, createGame, viewFor } from "../src/rules.ts";
import type { Action, GameState, PlayerId } from "../src/types.ts";
import { makeSeats, player, offered, withoutDrugs } from "./support.ts";

const seats = makeSeats(3);
const config = { ...DEFAULT_CONFIG, mushCount: 1, startInventory: [], startItems: [] };
const heal = (target: PlayerId): Action => ({ type: "heal", target });
const { cost, effect } = config.heal;

/** Three people in one room; p0 holds a medikit and everyone is hurt to 5 HP. */
function ship(): GameState {
  const s = withoutDrugs(createGame(seats, config, 3));
  s.players.forEach((p) => {
    p.room = "LABORATORY";
    p.hp = 5;
  });
  s.items.push({ id: "kit", type: "medikit", at: { kind: "player", id: "p0" } });
  return s;
}

describe("healing", () => {
  it("costs its AP on someone else and restores their HP", () => {
    const r = applyAction(ship(), "p0", heal("p1"));
    if (!r.ok) throw new Error(r.error);
    expect(player(r.state, "p1").hp).toBe(5 + effect.hp);
    expect(player(r.state, "p0").hp).toBe(5);
    expect(player(r.state, "p0").ap).toBe(config.startAp - cost.apOther);
  });

  it("caps the patient's HP at the patient's own maximum, not the healer's", () => {
    const s = ship();
    player(s, "p0").maxHp = 6;
    player(s, "p1").maxHp = 14;
    const r = applyAction(s, "p0", heal("p1"));
    if (!r.ok) throw new Error(r.error);
    expect(player(r.state, "p1").hp).toBe(5 + effect.hp);
    player(r.state, "p1").hp = 13;
    const again = applyAction(r.state, "p0", heal("p1"));
    if (!again.ok) throw new Error(again.error);
    expect(player(again.state, "p1").hp).toBe(14);
  });

  it("costs more AP on yourself", () => {
    const r = applyAction(ship(), "p0", heal("p0"));
    if (!r.ok) throw new Error(r.error);
    expect(player(r.state, "p0").hp).toBe(5 + effect.hp);
    expect(player(r.state, "p0").ap).toBe(config.startAp - cost.apSelf);
  });

  it("caps at max HP and is still offered at full HP", () => {
    const s = ship();
    player(s, "p1").hp = config.maxHp - 1;
    const r = applyAction(s, "p0", heal("p1"));
    if (!r.ok) throw new Error(r.error);
    expect(player(r.state, "p1").hp).toBe(config.maxHp);
    player(s, "p1").hp = config.maxHp;
    expect(offered(s, "p0")).toContainEqual(heal("p1"));
  });

  it("needs a medikit in your inventory, not on the floor or in someone else's hands", () => {
    const s = ship();
    expect(offered(s, "p1").some((a) => a.type === "heal")).toBe(false);
    expect(applyAction(s, "p1", heal("p0")).ok).toBe(false);
    s.items[0]!.at = { kind: "room", id: "LABORATORY" };
    expect(applyAction(s, "p0", heal("p1")).ok).toBe(false);
  });

  it("needs the target alive and in your room, and the AP; failures leave state unchanged", () => {
    const s = ship();
    player(s, "p1").room = "CORRIDOR_A";
    player(s, "p2").alive = false;
    const before = JSON.stringify(s);
    expect(applyAction(s, "p0", heal("p1")).ok).toBe(false);
    expect(applyAction(s, "p0", heal("p2")).ok).toBe(false);
    expect(offered(s, "p0")).not.toContainEqual(heal("p1"));
    player(s, "p0").ap = cost.apSelf - 1;
    const poor = JSON.stringify(s);
    expect(applyAction(s, "p0", heal("p0")).ok).toBe(false);
    expect(JSON.stringify(s)).toBe(poor);
    expect(before).not.toBe(poor);
  });

  it("restores more with a modifier", () => {
    const s = ship();
    player(s, "p0").modifiers.push("test_healer");
    MODIFIERS.test_healer = { healAmount: (n) => n + 2 };
    try {
      expect(healAmount(s, player(s, "p0"))).toBe(effect.hp + 2);
      const r = applyAction(s, "p0", heal("p1"));
      if (!r.ok) throw new Error(r.error);
      expect(player(r.state, "p1").hp).toBe(5 + effect.hp + 2);
    } finally {
      delete MODIFIERS.test_healer;
    }
  });

  it("is public to the room and invisible elsewhere", () => {
    const s = ship();
    player(s, "p2").room = "CORRIDOR_A";
    const r = applyAction(s, "p0", heal("p1"));
    if (!r.ok) throw new Error(r.error);
    expect(viewFor(r.state, "p1").log.some((e) => e.key === "healed")).toBe(true);
    expect(JSON.stringify(viewFor(r.state, "p2"))).not.toContain("healed");
  });

  it("parses from client messages", () => {
    expect(parseGameMessage(JSON.stringify({ type: "action", action: { type: "heal", target: "p1" } }))).toEqual({
      type: "action",
      action: heal("p1"),
    });
  });

  it("restores ointmentBonusHp extra HP once HEALING_OINTMANT is complete (humans and Mush, stacking with medic)", () => {
    expect(effect.ointmentBonusHp).toBe(1);
    expect(researchStatus("HEALING_OINTMANT")).toBe("full");

    const partial = ship();
    partial.research.HEALING_OINTMANT = RESEARCH_COMPLETE - 1;
    expect(healAmount(partial, player(partial, "p0"))).toBe(effect.hp);

    const done = ship();
    done.research.HEALING_OINTMANT = RESEARCH_COMPLETE;
    const afterHuman = applyAction(done, "p0", heal("p1"));
    if (!afterHuman.ok) throw new Error(afterHuman.error);
    expect(player(afterHuman.state, "p1").hp).toBe(5 + effect.hp + effect.ointmentBonusHp);

    // Stacks with medic and applies to Mush healers too.
    const mushMedic = ship();
    mushMedic.research.HEALING_OINTMANT = RESEARCH_COMPLETE;
    player(mushMedic, "p0").role = "mush";
    player(mushMedic, "p0").skills.push("medic");
    const afterMush = applyAction(mushMedic, "p0", heal("p1"));
    if (!afterMush.ok) throw new Error(afterMush.error);
    expect(player(afterMush.state, "p1").hp).toBe(5 + effect.hp + effect.medicBonusHp + effect.ointmentBonusHp);
  });
});
