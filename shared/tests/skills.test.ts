import { describe, expect, it } from "vitest";
import { CHARACTERS } from "../src/characters.ts";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { actionFailed } from "../src/modifiers.ts";
import { legalActions } from "../src/rules.ts";
import { applyAction, createGame, viewFor } from "../src/rules.ts";
import { parseGameMessage } from "../src/protocol.ts";
import { SKILLS, SKILL_SLOTS } from "../src/skills.ts";
import type { GameConfig, GameState, Seat } from "../src/types.ts";

const seats: Seat[] = Array.from({ length: 4 }, (_, i) => ({
  id: `p${i}`,
  name: `Player ${i}`,
  isBot: i > 0,
  character: CHARACTERS[i]!.id,
}));

const config: GameConfig = { ...DEFAULT_CONFIG, startInventory: [], startItems: [], startSkills: ["creative"] };

/** Everyone starts in the same room; p0 carries a camera to dismantle (3 AP). */
function withCamera(dismantleOdds: number, creativeRefundOdds: number): GameState {
  const state = createGame(seats, { ...config, dismantle: { ...config.dismantle, successChance: dismantleOdds }, creative: { refundOdds: creativeRefundOdds } }, 42);
  state.items.push({ id: "item-camera", type: "camera", at: { kind: "player", id: "p0" } });
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
    before.players[0]!.skills = [];
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
      const state = createGame(seats, { ...config, dismantle: { ...config.dismantle, successChance: 0 } }, seed);
      state.items.push({ id: "item-camera", type: "camera", at: { kind: "player", id: "p0" } });
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
    const result = pick(before, "p0", "medic");
    if (!result.ok) throw new Error(result.error);
    const p = result.state.players[0]!;
    expect(p.skills).toEqual(["medic"]);
    expect([p.ap, p.mp]).toEqual([before.players[0]!.ap, before.players[0]!.mp]);
    expect(before.players[0]!.skills).toEqual([]); // the input state is untouched
  });

  it("offers every skill you lack while a slot is free, and none once full", () => {
    let state = fresh();
    const offered = () => legalActions(state, "p0").filter((a) => a.type === "pick_skill");
    expect(offered()).toHaveLength(SKILLS.length);
    for (const skill of SKILLS.slice(0, SKILL_SLOTS)) {
      const r = pick(state, "p0", skill);
      if (!r.ok) throw new Error(r.error);
      state = r.state;
    }
    expect(offered()).toHaveLength(0);
    expect(pick(state, "p0", SKILLS[SKILL_SLOTS]!).ok).toBe(false);
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
  /** Four people in one room, p0 with Logistics; the cycle is advanced by everyone readying up. */
  function cycle(setup: (s: GameState) => void): GameState {
    const state = createGame(seats, { ...config, startSkills: [] }, 7);
    state.players[0]!.skills = ["logistics"];
    for (const p of state.players) p.ap = 0;
    setup(state);
    let s = state;
    for (const p of state.players.filter((o) => o.alive)) {
      const r = applyAction(s, p.id, { type: "ready" });
      if (!r.ok) throw new Error(r.error);
      s = r.state;
    }
    return s;
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

  it("adds 2 AP to a coffee's own 2", () => {
    expect(drink([], 0).players[0]!.ap).toBe(2);
    expect(drink(["caffeinomaniac"], 0).players[0]!.ap).toBe(4);
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
