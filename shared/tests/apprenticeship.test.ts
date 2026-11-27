import { describe, expect, it } from "vitest";
import { applyAction, createGame } from "../src/rules.ts";
import type { Action, GameState } from "../src/types.ts";
import { clone, costOf, must, offered, player, testConfig } from "./support.ts";
import { makeSeats } from "./support.ts";

const base = testConfig();
const learn = (target: string, skill: string): Action => ({ type: "apprenticeship", target, skill });

/** p0 (Apprentice) with p1 (Cook, Sturdy) in the laboratory; p2 (Pilot) in the refectory. */
function ship(): GameState {
  const s = createGame(makeSeats(3), base, 5);
  for (const id of ["p0", "p1"]) player(s, id).room = "LABORATORY";
  player(s, "p2").room = "REFECTORY";
  player(s, "p0").skills = ["apprentice"];
  player(s, "p1").skills = ["cook", "sturdy"];
  player(s, "p2").skills = ["pilot"];
  return s;
}

describe("Apprentice skill", () => {
  it("works from the book slot too, and the copy takes that slot", () => {
    const s = ship();
    player(s, "p0").skills = [];
    player(s, "p0").bookSkill = "apprentice";
    const after = must(applyAction(s, "p0", learn("p1", "cook")));
    expect(player(after, "p0").bookSkill).toBe("cook");
    expect(player(after, "p0").skills).toEqual([]);
  });

  it("offers each skill of a roommate, and costs the configured AP", () => {
    const s = ship();
    expect(offered(s, "p0").filter((a) => a.type === "apprenticeship")).toEqual([learn("p1", "cook"), learn("p1", "sturdy")]);
    expect(costOf(s, "p0", learn("p1", "cook"))?.ap).toBe(base.apprenticeship.cost.ap);
  });

  it("copies the skill in place of Apprentice, so it works once", () => {
    const s = must(applyAction(ship(), "p0", learn("p1", "cook")));
    expect(player(s, "p0").skills).toEqual(["cook"]);
    expect(player(s, "p0").ap).toBe(ship().players[0].ap - base.apprenticeship.cost.ap);
    expect(offered(s, "p0").some((a) => a.type === "apprenticeship")).toBe(false);
    expect(applyAction(s, "p0", learn("p1", "sturdy")).ok).toBe(false);
  });

  it("can't be picked again once used, even with a free slot", () => {
    const s = must(applyAction(ship(), "p0", learn("p1", "cook")));
    expect(player(s, "p0").skills.length).toBeLessThan(3);
    expect(offered(s, "p0")).not.toContainEqual({ type: "pick_skill", skill: "apprentice" });
    expect(applyAction(s, "p0", { type: "pick_skill", skill: "apprentice" }).ok).toBe(false);
    expect(player(ship(), "p0").apprenticeUsed).toBeUndefined();
  });

  it("is private: nothing in the room's history", () => {
    const s = ship();
    const after = must(applyAction(s, "p0", learn("p1", "cook")));
    expect(after.log.length).toBe(s.log.length);
  });

  it("refuses skills nobody here has, ones you own, and non-Apprentices; state stays unchanged", () => {
    const s = ship();
    const before = JSON.stringify(s);
    expect(applyAction(s, "p0", learn("p1", "pilot")).ok).toBe(false); // p2 is elsewhere
    expect(applyAction(s, "p0", learn("p2", "pilot")).ok).toBe(false);
    expect(applyAction(s, "p1", learn("p0", "apprentice")).ok).toBe(false); // p1 lacks the skill
    const owned = clone(s);
    player(owned, "p0").skills.push("cook");
    expect(applyAction(owned, "p0", learn("p1", "cook")).ok).toBe(false);
    const dead = clone(s);
    player(dead, "p1").alive = false;
    expect(applyAction(dead, "p0", learn("p1", "cook")).ok).toBe(false);
    expect(JSON.stringify(s)).toBe(before);
  });

  it("can copy a roommate's book skill", () => {
    const s = ship();
    player(s, "p1").skills = [];
    player(s, "p1").bookSkill = "pilot";
    expect(offered(s, "p0")).toContainEqual(learn("p1", "pilot"));
  });
});
