import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { ITEM_TYPES } from "../src/items.ts";
import { actionFailed } from "../src/modifiers.ts";
import { parseGameMessage } from "../src/protocol.ts";
import { applyAction, createGame, legalActions, viewFor } from "../src/rules.ts";
import { CHARACTER_SKILLS, isSkill, SKILLS, SKILL_SLOTS, skillStatus } from "../src/skills.ts";
import { CHARACTERS } from "../src/characters.ts";
import type { GameConfig, GameState } from "../src/types.ts";
import { forceDismantleOdds, makeSeats, nextCycle } from "./support.ts";

const seats = makeSeats(4, "others");

const config: GameConfig = { ...DEFAULT_CONFIG, startInventory: [], startItems: [], startSkills: ["creative"] };

/** Everyone starts in the same room; p0 carries a camera to dismantle (3 AP). */
function withCamera(dismantleOdds: number, creativeRefundOdds: number): GameState {
  forceDismantleOdds(dismantleOdds); // file-wide; each test calls this right before it dismantles
  const state = createGame(seats, { ...config, dismantle: { ...config.dismantle, successChance: dismantleOdds }, creative: { refundOdds: creativeRefundOdds } }, 42);
  state.items.push({ id: "item-camera", type: "camera", at: { kind: "player", id: "p0" } });
  state.players[0]!.skills = ["creative", "engineer"];
  return state;
}

function dismantle(state: GameState): GameState {
  const result = applyAction(state, "p0", { type: "dismantle", item: "item-camera" });
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

const refunds = (state: GameState) => state.log.filter((e) => e.key === "creativeRefund");

describe("Creative", () => {
  it("refunds 1 AP after a failed action that cost AP, with a private log line", () => {
    const before = withCamera(0, 1);
    const next = dismantle(before);
    expect(next.items.some((i) => i.id === "item-camera")).toBe(true); // it failed
    expect(next.players[0]!.ap).toBe(before.players[0]!.ap - config.dismantle.cost.ap + 1);
    expect(refunds(next)).toHaveLength(1);
    expect(refunds(next)[0]!.visibleTo).toEqual(["p0"]);
    expect(JSON.stringify(viewFor(next, "p0").log)).toContain("creativeRefund");
    // p1 is in the same room and still doesn't see it.
    expect(next.players[1]!.room).toBe(next.players[0]!.room);
    expect(JSON.stringify(viewFor(next, "p1"))).not.toContain("creativeRefund");
  });

  it("gives nothing back when its own roll misses", () => {
    const before = withCamera(0, 0);
    const next = dismantle(before);
    expect(next.players[0]!.ap).toBe(before.players[0]!.ap - config.dismantle.cost.ap);
    expect(refunds(next)).toHaveLength(0);
  });

  it("does nothing when the action succeeds", () => {
    const before = withCamera(1, 1);
    const next = dismantle(before);
    expect(next.players[0]!.ap).toBe(before.players[0]!.ap - config.dismantle.cost.ap);
    expect(refunds(next)).toHaveLength(0);
  });

  it("does nothing for a player without the skill", () => {
    const before = withCamera(0, 1);
    before.players[0]!.skills = ["engineer"];
    const next = dismantle(before);
    expect(next.players[0]!.ap).toBe(before.players[0]!.ap - config.dismantle.cost.ap);
    expect(refunds(next)).toHaveLength(0);
  });

  it("does nothing when the failed action was free", () => {
    const state = withCamera(0, 1);
    const p = state.players[0]!;
    const ap = p.ap;
    actionFailed(state, p, 0);
    expect(p.ap).toBe(ap);
    expect(refunds(state)).toHaveLength(0);
  });

  it("rolls with the seeded RNG, so the same seed gives the same outcome", () => {
    const outcomes = (seed: number) => {
      forceDismantleOdds(0);
      const state = createGame(seats, config, seed);
      state.items.push({ id: "item-camera", type: "camera", at: { kind: "player", id: "p0" } });
      state.players[0]!.skills = ["creative", "engineer"];
      return dismantle(state).players[0]!.ap;
    };
    for (const seed of [1, 2, 3, 4, 5]) expect(outcomes(seed)).toBe(outcomes(seed));
  });
});

function pick(state: GameState, id: string, skill: string) {
  return applyAction(state, id, { type: "pick_skill", skill });
}

describe("picking skills", () => {
  const fresh = () => createGame(seats, { ...DEFAULT_CONFIG, startInventory: [], startItems: [] }, 42);

  it("starts everyone with no skills", () => {
    for (const p of fresh().players) expect(p.skills).toEqual([]);
  });

  it("adds the skill for free and keeps it", () => {
    const before = fresh();
    const result = pick(before, "p0", "gunman");
    if (!result.ok) throw new Error(result.error);
    const p = result.state.players[0]!;
    expect(p.skills).toEqual(["gunman"]);
    expect([p.ap, p.mp]).toEqual([before.players[0]!.ap, before.players[0]!.mp]);
    expect(before.players[0]!.skills).toEqual([]); // the input state is untouched
  });

  it("offers every skill on your character's list you lack while a slot is free, and none once full", () => {
    let state = fresh();
    const mine = CHARACTER_SKILLS.chao; // p0 plays Chao
    const offered = () => legalActions(state, "p0").filter((a) => a.type === "pick_skill" && isSkill(a.skill));
    expect(offered()).toHaveLength(mine.length);
    for (const skill of mine.slice(0, SKILL_SLOTS)) {
      const r = pick(state, "p0", skill);
      if (!r.ok) throw new Error(r.error);
      state = r.state;
    }
    expect(offered()).toHaveLength(0);
    expect(pick(state, "p0", mine[SKILL_SLOTS]!).ok).toBe(false);
    expect(state.players[0]!.skills).toHaveLength(SKILL_SLOTS);
  });

  it("refuses a skill you already have or one that doesn't exist, leaving state unchanged", () => {
    const state = fresh();
    state.players[0]!.skills = ["medic"];
    const before = JSON.stringify(state);
    expect(pick(state, "p0", "medic").ok).toBe(false);
    expect(pick(state, "p0", "no_such_skill").ok).toBe(false);
    expect(JSON.stringify(state)).toBe(before);
  });

  it("validates the skill id in untrusted messages", () => {
    const msg = (skill: unknown) => parseGameMessage(JSON.stringify({ type: "action", action: { type: "pick_skill", skill } }));
    expect(msg("medic")).toEqual({ type: "action", action: { type: "pick_skill", skill: "medic" } });
    expect(msg("nope")).toBeNull();
    expect(msg(5)).toBeNull();
  });

  it("shows skills to people in the same room, and to nobody elsewhere", () => {
    const state = fresh();
    state.players[0]!.skills = ["creative", "medic"];
    expect(viewFor(state, "p0").you.skills).toEqual(["creative", "medic"]);
    const roommate = viewFor(state, "p1").players.find((o) => o.id === "p0")!;
    expect(roommate.skills).toEqual(["creative", "medic"]);

    const far = Object.keys(state.config.rooms).find((r) => r !== state.players[0]!.room)!;
    state.players[1]!.room = far;
    const stranger = viewFor(state, "p1").players.find((o) => o.id === "p0");
    expect(JSON.stringify(stranger)).not.toMatch(/creative|medic/);
  });
});

describe("Logistics", () => {
  /** Four people in one room, p0 with Logistics; then the cycle changes. */
  function cycle(setup: (s: GameState) => void): GameState {
    const state = createGame(seats, { ...config, startSkills: [] }, 7);
    state.players[0]!.skills = ["logistics"];
    for (const p of state.players) p.ap = 0;
    setup(state);
    return nextCycle(state);
  }
  const gives = (s: GameState) => s.log.filter((e) => e.key === "logisticsGave");

  it("gives 1 AP to one random roommate each cycle, free for the giver, with private lines", () => {
    const gained = cycle(() => {}).players.map((p) => p.ap - DEFAULT_CONFIG.apPerCycle);
    expect(gained[0]).toBe(0);
    expect(gained.slice(1).sort()).toEqual([0, 0, 1]);
    const next = cycle(() => {});
    expect(gives(next)).toHaveLength(1);
    expect(gives(next)[0]!.visibleTo).toEqual(["p0"]);
    const got = next.log.find((e) => e.key === "logisticsGot")!;
    expect(got.visibleTo).toHaveLength(1);
    expect(JSON.stringify(viewFor(next, "p0").log)).toContain("logisticsGave");
    expect(JSON.stringify(viewFor(next, got.visibleTo[0] as string))).not.toContain("logisticsGave");
  });

  it("skips roommates at the AP cap, the dead and other rooms; does nothing if nobody qualifies", () => {
    const next = cycle((s) => {
      s.players[1]!.ap = s.config.maxAp;
      s.players[2]!.alive = false;
      s.players[0]!.room = "BEDROOM_A";
      s.players[3]!.room = "SICK_BAY";
    });
    expect(gives(next)).toHaveLength(0);
    expect(next.players[1]!.ap).toBe(next.config.maxAp);
  });
});

describe("caffeinomaniac", () => {
  function drink(skills: string[], ap: number, type = "coffee"): GameState {
    const state = createGame(seats, { ...config, startSkills: [] }, 7);
    const p = state.players[0]!;
    p.skills = skills;
    p.ap = ap;
    state.items.push({ id: "item-drink", type, at: { kind: "player", id: "p0" } });
    const r = applyAction(state, "p0", { type: "consume", item: "item-drink" });
    if (!r.ok) throw new Error(r.error);
    return r.state;
  }

  it("adds its AP to a coffee's own", () => {
    const coffee = ITEM_TYPES.coffee!.consume!.ap;
    expect(drink([], 0).players[0]!.ap).toBe(coffee);
    expect(drink(["caffeinomaniac"], 0).players[0]!.ap).toBe(coffee + config.caffeinomaniac.ap);
  });

  it("is capped at maxAp", () => {
    const max = DEFAULT_CONFIG.maxAp;
    expect(drink(["caffeinomaniac"], max - 1).players[0]!.ap).toBe(max);
  });

  it("does not trigger for other consumables", () => {
    const withoutBonus = drink([], 0, "cooked_ration").players[0]!.ap;
    expect(drink(["caffeinomaniac"], 0, "cooked_ration").players[0]!.ap).toBe(withoutBonus);
  });
});

describe("frugivore", () => {
  function eat(skills: string[], ap: number, type: string, role: "human" | "mush" = "human"): GameState {
    const state = createGame(seats, { ...config, startSkills: [] }, 7);
    const p = state.players[0]!;
    p.skills = skills;
    p.ap = ap;
    p.role = role;
    state.items.push({ id: "item-eat", type, at: { kind: "player", id: "p0" } });
    const r = applyAction(state, "p0", { type: "consume", item: "item-eat" });
    if (!r.ok) throw new Error(r.error);
    return r.state;
  }

  it("pins the configured extra AP values", () => {
    expect([DEFAULT_CONFIG.frugivore.bananaAp, DEFAULT_CONFIG.frugivore.alienFruitAp]).toEqual([1, 2]);
  });

  it("adds bananaAp when a human eats a banana", () => {
    const banana = ITEM_TYPES.fruit_banana!.consume!.ap;
    expect(eat([], 0, "fruit_banana").players[0]!.ap).toBe(banana);
    expect(eat(["frugivore"], 0, "fruit_banana").players[0]!.ap).toBe(banana + config.frugivore.bananaAp);
  });

  it("adds alienFruitAp when a human eats an alien fruit", () => {
    const baseState = createGame(seats, { ...config, startSkills: [] }, 7);
    const fruitAp = ITEM_TYPES.fruit01!.consume!.ap + baseState.fruits.fruit01!.ap;
    expect(eat([], 0, "fruit01").players[0]!.ap).toBe(fruitAp);
    expect(eat(["frugivore"], 0, "fruit01").players[0]!.ap).toBe(fruitAp + config.frugivore.alienFruitAp);
  });

  it("is capped at maxAp", () => {
    const max = DEFAULT_CONFIG.maxAp;
    expect(eat(["frugivore"], max - 1, "fruit01").players[0]!.ap).toBe(max);
  });

  it("does not trigger for non-fruit consumables or for Mush", () => {
    const withoutBonus = eat([], 0, "cooked_ration").players[0]!.ap;
    expect(eat(["frugivore"], 0, "cooked_ration").players[0]!.ap).toBe(withoutBonus);
    expect(eat(["frugivore"], 0, "fruit_banana", "mush").players[0]!.ap).toBe(0);
    expect(eat(["frugivore"], 0, "fruit01", "mush").players[0]!.ap).toBe(0);
  });
});

describe("character skill lists", () => {
  const fresh = () => createGame(makeSeats(CHARACTERS.length), { ...DEFAULT_CONFIG, startInventory: [], startItems: [] }, 42);

  it("pins two lists from eMushpedia (owner, 2026-10-25): Paola's, and Chao's eMush version", () => {
    expect(CHARACTER_SKILLS.paola).toEqual(["radio_expert", "logistics", "gunman", "biologist", "rebel", "gunner"]);
    expect(CHARACTER_SKILLS.chao).toEqual(["gunman", "survival", "wrestler", "torturer", "bodyguard", "infantryman"]);
  });

  it("offers each character exactly their own list", () => {
    const state = fresh();
    for (const p of state.players) {
      const offered = legalActions(state, p.id).flatMap((a) => (a.type === "pick_skill" && isSkill(a.skill) ? [a.skill] : []));
      expect(offered.sort()).toEqual([...CHARACTER_SKILLS[p.character]].sort());
    }
  });

  it("refuses a skill off the character's list, leaving state unchanged", () => {
    const state = fresh();
    const before = JSON.stringify(state);
    expect(CHARACTER_SKILLS.chao).not.toContain("medic");
    expect(pick(state, "p0", "medic")).toMatchObject({ ok: false });
    expect(JSON.stringify(state)).toBe(before);
  });

  it("leaves no character without a full set of slots to fill", () => {
    for (const list of Object.values(CHARACTER_SKILLS)) expect(list.length).toBeGreaterThanOrEqual(SKILL_SLOTS);
  });

  it("does not include the removed Dreamer (oisif), Crazy Eye (crazy_eye), or Daunting (daunting) skills, and includes maintenance_agent", () => {
    expect(SKILLS as readonly string[]).not.toContain("oisif");
    expect(isSkill("oisif")).toBe(false);
    expect(SKILLS as readonly string[]).not.toContain("crazy_eye");
    expect(isSkill("crazy_eye")).toBe(false);
    expect(SKILLS as readonly string[]).not.toContain("daunting");
    expect(isSkill("daunting")).toBe(false);
    expect(SKILLS as readonly string[]).toContain("maintenance_agent");
    expect(isSkill("maintenance_agent")).toBe(true);
    expect(SKILLS.length).toBe(64);
  });

  it("marks fully implemented skills in SKILL_STATUS", () => {
    expect(skillStatus("biologist")).toBe("full");
    expect(skillStatus("pilot")).toBe("full");
    expect(skillStatus("robotics")).toBe("full");
  });
});
