import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { MODIFIERS } from "../src/modifiers.ts";
import { convert } from "../src/infection.ts";
import { applyAction, createGame, viewFor } from "../src/rules.ts";
import type { GameState } from "../src/types.ts";
import { costOf, makeSeats, option, player } from "./support.ts";

const base = { ...DEFAULT_CONFIG, mushCount: 1, startInventory: [], startItems: [], startSkills: [], punch: { ...DEFAULT_CONFIG.punch, successChance: 1 } };
const PUNCH = base.punch.cost.ap;

/** p0 and p1 in the sick bay, p2 in the refectory. */
function ship(): GameState {
  const s = createGame(makeSeats(3), base, 3);
  player(s, "p0").room = player(s, "p1").room = "SICK_BAY";
  player(s, "p2").room = "REFECTORY";
  return s;
}

afterEach(() => {
  delete MODIFIERS.test_brute;
  delete MODIFIERS.test_discount;
});

describe("actionCost hook", () => {
  it("changes the price the view shows, what is checked, and what is paid", () => {
    MODIFIERS.test_brute = { actionCost: (c, { tags }) => (tags.includes("aggressive") ? { ...c, ap: c.ap + 2 } : c) };
    const s = ship();
    player(s, "p0").modifiers.push("test_brute");
    expect(costOf(s, "p0", { type: "punch", target: "p1" })).toEqual({ ap: PUNCH + 2, mp: 0 });
    // Bonding has no aggressive tag, so its price is unchanged.
    expect(costOf(s, "p0", { type: "bond" })).toEqual({ ap: base.bond.cost.ap, mp: 0 });

    player(s, "p0").ap = PUNCH + 1;
    expect(option(s, "p0", { type: "punch", target: "p1" })?.lacks).toEqual(["ap"]);
    expect(applyAction(s, "p0", { type: "punch", target: "p1" }).ok).toBe(false);

    player(s, "p0").ap = PUNCH + 2;
    const r = applyAction(s, "p0", { type: "punch", target: "p1" });
    if (!r.ok) throw new Error(r.error);
    expect(player(r.state, "p0").ap).toBe(0);
  });

  it("only applies to the holder's own actions", () => {
    MODIFIERS.test_brute = { actionCost: (c) => ({ ...c, ap: c.ap + 2 }) };
    const s = ship();
    player(s, "p0").modifiers.push("test_brute");
    expect(costOf(s, "p1", { type: "punch", target: "p0" })).toEqual({ ap: PUNCH, mp: 0 });
  });

  it("never pushes a price below 0", () => {
    MODIFIERS.test_discount = { actionCost: (c) => ({ ap: c.ap - 5, mp: c.mp - 5 }) };
    const s = ship();
    player(s, "p0").modifiers.push("test_discount");
    expect(costOf(s, "p0", { type: "punch", target: "p1" })).toEqual({ ap: 0, mp: 0 });
  });
});

describe("Pacifist (room effect)", () => {
  const SURCHARGE = base.pacifist.aggressiveApSurcharge;
  /** p0 and Ian (p1) in the sick bay, p2 in the refectory. */
  function withIan(): GameState {
    const seats = makeSeats(3);
    seats[1] = { ...seats[1]!, character: "ian" };
    const s = createGame(seats, base, 3);
    player(s, "p0").room = player(s, "p1").room = "SICK_BAY";
    player(s, "p2").room = "REFECTORY";
    return s;
  }

  it("is a modifier Ian starts with", () => {
    const s = withIan();
    expect(player(s, "p1").modifiers).toContain("pacifist");
    expect(player(s, "p0").modifiers).not.toContain("pacifist");
  });

  it("makes aggressive actions in his room cost more, his own too, and nothing else", () => {
    const s = withIan();
    expect(costOf(s, "p0", { type: "punch", target: "p1" })).toEqual({ ap: PUNCH + SURCHARGE, mp: 0 });
    expect(costOf(s, "p1", { type: "punch", target: "p0" })).toEqual({ ap: PUNCH + SURCHARGE, mp: 0 });
    expect(costOf(s, "p0", { type: "bond" })).toEqual({ ap: base.bond.cost.ap, mp: 0 });
  });

  it("is what gets paid", () => {
    const s = withIan();
    const r = applyAction(s, "p0", { type: "punch", target: "p1" });
    if (!r.ok) throw new Error(r.error);
    expect(player(r.state, "p0").ap).toBe(player(s, "p0").ap - PUNCH - SURCHARGE);
  });

  it("only works in his room, and not once he is dead", () => {
    const s = withIan();
    player(s, "p0").room = "REFECTORY";
    expect(costOf(s, "p0", { type: "punch", target: "p2" })).toEqual({ ap: PUNCH, mp: 0 });
    const dead = withIan();
    player(dead, "p2").room = "SICK_BAY";
    player(dead, "p1").alive = false;
    expect(costOf(dead, "p0", { type: "punch", target: "p2" })).toEqual({ ap: PUNCH, mp: 0 });
  });

  it("stacks with another holder in the room", () => {
    const s = withIan();
    player(s, "p0").modifiers.push("pacifist");
    expect(costOf(s, "p0", { type: "punch", target: "p1" })).toEqual({ ap: PUNCH + 2 * SURCHARGE, mp: 0 });
  });

  it("stays when Ian is converted, so the price doesn't out him", () => {
    const s = withIan();
    convert(s, player(s, "p1"));
    expect(costOf(s, "p0", { type: "punch", target: "p1" })).toEqual({ ap: PUNCH + SURCHARGE, mp: 0 });
  });

  it("is private: nobody else's view names it", () => {
    const s = withIan();
    for (const id of ["p0", "p2"]) expect(JSON.stringify(viewFor(s, id))).not.toContain("pacifist");
  });
});
