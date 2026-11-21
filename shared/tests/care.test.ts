import { describe, expect, it } from "vitest";
import { applyAction, createGame, viewFor } from "../src/rules.ts";
import type { Action, GameState, PlayerId } from "../src/types.ts";
import { makeSeats, player, mustApply, nextDay, offered, pickSkill, testConfig, withoutDrugs } from "./support.ts";

const seats = makeSeats(3);
const config = testConfig();
const heal = (target: PlayerId): Action => ({ type: "heal", target });

/** Everyone is hurt in one room that is not the sick bay; p0 holds a medikit. */
function ward(): GameState {
  const s = withoutDrugs(createGame(seats, { ...config, startSkills: [] }, 3));
  s.players.forEach((p) => {
    p.room = "LABORATORY";
    p.hp = 5;
  });
  s.items.push({ id: "kit", type: "medikit", at: { kind: "player", id: "p0" } });
  return s;
}

describe("medic skill", () => {
  it("makes heals restore 2 more HP, for the medic only", () => {
    const s = ward();
    player(s, "p0").skills = ["medic"];
    s.items.push({ id: "kit2", type: "medikit", at: { kind: "player", id: "p1" } });
    const byMedic = mustApply(s, "p0", heal("p1"));
    expect(player(byMedic, "p1").hp).toBe(5 + config.heal.effect.hp + config.heal.effect.medicBonusHp);
    const byOther = mustApply(s, "p1", heal("p2"));
    expect(player(byOther, "p2").hp).toBe(5 + config.heal.effect.hp);
  });

  it("does not grant care points", () => {
    const s = nextDay(createGame(seats, { ...config, startSkills: ["medic"] }, 3));
    expect(player(s, "p0").resources.heal).toBe(0);
  });
});

describe("care points", () => {
  it("gives nothing to players without the skill", () => {
    const s = nextDay(createGame(seats, config, 3));
    expect(player(s, "p1").resources.heal).toBe(0);
  });

  it("makes a heal free and spends one care point, on others and on yourself", () => {
    let s = ward();
    player(s, "p0").resources.heal = 2;
    s = mustApply(s, "p0", heal("p1"));
    expect(player(s, "p1").hp).toBe(5 + config.heal.effect.hp);
    expect(player(s, "p0").ap).toBe(config.startAp);
    expect(player(s, "p0").resources.heal).toBe(1);
    s = mustApply(s, "p0", heal("p0"));
    expect(player(s, "p0").ap).toBe(config.startAp);
    expect(player(s, "p0").resources.heal).toBe(0);
    s = mustApply(s, "p0", heal("p1"));
    expect(player(s, "p0").ap).toBe(config.startAp - config.heal.cost.apOther);
  });

  it("still needs a medikit or the sick bay", () => {
    const s = ward();
    player(s, "p0").resources.heal = 2;
    s.items[0]!.at = { kind: "room", id: "LABORATORY" };
    expect(applyAction(s, "p0", heal("p1")).ok).toBe(false);
  });

  it("lets care points be spent by anyone who has them, with no skill check at heal time", () => {
    const s = ward();
    player(s, "p1").resources.heal = 1;
    s.items.push({ id: "kit2", type: "medikit", at: { kind: "player", id: "p1" } });
    const r = mustApply(s, "p1", heal("p2"));
    expect(player(r, "p1").ap).toBe(config.startAp);
  });
});

describe("healing in the sick bay", () => {
  function bay(): GameState {
    const s = ward();
    s.items = [];
    s.players.forEach((p) => {
      p.room = "SICK_BAY";
    });
    return s;
  }

  it("works without a medikit, for anyone, at the normal AP cost", () => {
    const s = mustApply(bay(), "p1", heal("p2"));
    expect(player(s, "p2").hp).toBe(5 + config.heal.effect.hp);
    expect(player(s, "p1").ap).toBe(config.startAp - config.heal.cost.apOther);
    const self = mustApply(bay(), "p1", heal("p1"));
    expect(player(self, "p1").ap).toBe(config.startAp - config.heal.cost.apSelf);
  });

  it("is not offered outside the sick bay without a medikit", () => {
    const s = bay();
    s.players.forEach((p) => {
      p.room = "LABORATORY";
    });
    expect(offered(s, "p1").some((a) => a.type === "heal")).toBe(false);
    expect(applyAction(s, "p1", heal("p2")).ok).toBe(false);
  });

  it("uses a care point when one is held", () => {
    const s = bay();
    player(s, "p0").resources.heal = 1;
    const r = mustApply(s, "p0", heal("p1"));
    expect(player(r, "p0").ap).toBe(config.startAp);
    expect(player(r, "p0").resources.heal).toBe(0);
  });

  it("keeps other players' care points out of their views", () => {
    const s = ward();
    player(s, "p0").resources.heal = 2;
    expect(viewFor(s, "p0").you.resources.heal).toBe(2);
    const other = viewFor(s, "p1");
    expect(other.you.resources.heal).toBe(0);
    expect(JSON.stringify(other.players)).not.toContain("resources");
    expect(JSON.stringify(other.players)).not.toContain("heal");
  });
});

describe("nurse skill (first_aid)", () => {
  const pick = pickSkill;

  it("grants 2 care points when picked, then 2 each day", () => {
    let s = createGame(seats, config, 3);
    s = pick(s, "p0", "first_aid");
    expect(player(s, "p0").resources.heal).toBe(2);
    expect(player(nextDay(s), "p0").resources.heal).toBe(4);
  });

  it("grants 2 at game start when the player starts with it", () => {
    const s = createGame(seats, { ...config, startSkills: ["first_aid"] }, 3);
    expect(player(s, "p0").resources.heal).toBe(2);
  });

  it("gives nothing for picking an unrelated skill", () => {
    const s = pick(createGame(seats, config, 3), "p0", "creative");
    expect(player(s, "p0").resources.heal).toBe(0);
  });
});
