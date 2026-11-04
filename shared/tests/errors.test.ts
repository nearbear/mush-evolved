// A refused action's error must not say why (issue #103). Some refusals turn on something the player can't see
// (another player's role, how many spores the Mush have taken today, whether a partner has already shared), and a
// reason code like "not_human" would hand that over. So applyAction and queueAction give one error for every
// illegal action. Each case below first checks that it hits the refusal it names, so a reordered check can't make
// the test pass by accident.
//
// This covers the error text only. That an action is refused at all can still give something away: a Mush whose
// spike on another player is refused learns that player is Mush. Closing that is a rule question, not this test's.

import { describe, expect, it } from "vitest";
import { ACTIONS, type ActionDef } from "../src/actions.ts";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { queueAction } from "../src/queue.ts";
import { applyAction, createGame, dayOf } from "../src/rules.ts";
import type { Action, GameState, PlayerId } from "../src/types.ts";
import { makeSeats, player } from "./support.ts";

const ILLEGAL = "illegal_action";
const config = { ...DEFAULT_CONFIG, mushCount: 1, startInventory: [], startItems: [], startSkills: [], maxAp: 99, startAp: 50 };

/** p0 and p1 are Mush with a spore each, p2 and p3 human; all in the laboratory but p3, in the refectory. */
function ship(): GameState {
  const s = createGame(makeSeats(4), config, 3);
  s.players.forEach((p, i) => {
    p.role = i < 2 ? "mush" : "human";
    p.spores = i < 2 ? 1 : 0;
    p.room = i < 3 ? "LABORATORY" : "REFECTORY";
  });
  return s;
}

/** p2 and p0 bonded both ways. */
function bonded(): GameState {
  const s = ship();
  s.bonds = { p0: ["p2"], p2: ["p0"] };
  return s;
}

const reason = (s: GameState, id: PlayerId, action: Action) =>
  (ACTIONS[action.type] as ActionDef<Action>).check(s, player(s, id), action);

/** Refused for `why`, with the same error whether done at once or queued. */
function expectRefused(s: GameState, id: PlayerId, action: Action, why: string): void {
  expect(reason(s, id, action)).toBe(why);
  expect(applyAction(s, id, action)).toEqual({ ok: false, error: ILLEGAL });
  expect(queueAction(s, id, action, 0)).toEqual({ ok: false, error: ILLEGAL });
}

describe("refused actions don't say why", () => {
  it("spiking a Mush looks the same as spiking someone who isn't there", () => {
    expectRefused(ship(), "p0", { type: "spike", target: "p1" }, "not_human");
    expectRefused(ship(), "p0", { type: "spike", target: "p3" }, "cant_see");
  });

  it("spiking as a human looks the same as spiking with no spores", () => {
    expectRefused(ship(), "p2", { type: "spike", target: "p3" }, "not_mush");
    const s = ship();
    player(s, "p0").spores = 0;
    expectRefused(s, "p0", { type: "spike", target: "p2" }, "no_spores");
  });

  it("the crew's daily spore cap is refused as at_capacity, a human as not_mush", () => {
    const capped = ship();
    capped.sporesToday = config.spores.perDay;
    expectRefused(capped, "p0", { type: "extract_spore" }, "at_capacity");
    expectRefused(ship(), "p2", { type: "extract_spore" }, "not_mush");
  });

  it("a partner who has already shared today looks the same as no bond", () => {
    const s = bonded();
    s.sharedOnDay = { p0: dayOf(s).day };
    for (const type of ["stt", "dtt"] as const) {
      expectRefused(s, "p2", { type, target: "p0" }, "cooldown");
      expectRefused(bonded(), "p2", { type, target: "p1" }, "not_bonded");
    }
  });

  it("an unknown action, an unknown player and a dead player get the same error", () => {
    const s = ship();
    const bogus = { type: "fly" } as unknown as Action;
    expect(applyAction(s, "p0", bogus)).toEqual({ ok: false, error: ILLEGAL });
    expect(queueAction(s, "p0", bogus, 0)).toEqual({ ok: false, error: ILLEGAL });
    expect(applyAction(s, "nobody", { type: "ready" })).toEqual({ ok: false, error: ILLEGAL });
    expect(queueAction(s, "nobody", { type: "ready" }, 0)).toEqual({ ok: false, error: ILLEGAL });
    player(s, "p2").alive = false;
    expect(applyAction(s, "p2", { type: "ready" })).toEqual({ ok: false, error: ILLEGAL });
  });
});
