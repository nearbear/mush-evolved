import { describe, expect, it } from "vitest";
import { startCharges } from "../src/charges.ts";
import { createGame } from "../src/rules.ts";
import type { GameState } from "../src/types.ts";
import { makeSeats, option, player, testConfig } from "./support.ts";

const base = testConfig();

/** p0 (carrying a knife and a blaster) shares the sick bay with p1; p1 has the given skills. */
function ship(skills: string[]): GameState {
  const s = createGame(makeSeats(3), base, 3);
  player(s, "p0").room = player(s, "p1").room = "SICK_BAY";
  player(s, "p2").room = "REFECTORY";
  player(s, "p1").skills = skills;
  for (const type of ["knife", "blaster"]) {
    const charges = startCharges(s.config, type);
    s.items.push({ id: type, type, at: { kind: "player", id: "p0" }, ...(charges !== undefined && { charges }) });
  }
  return s;
}

const chanceOf = (s: GameState, match: object) => option(s, "p0", match)?.chance;

describe("escape skill", () => {
  it("cuts a punch's chance by a quarter, relative", () => {
    expect(chanceOf(ship([]), { type: "punch", target: "p1" })).toBeCloseTo(0.6);
    expect(chanceOf(ship(["escape"]), { type: "punch", target: "p1" })).toBeCloseTo(0.45);
  });

  it("cuts a knife attack's chance, but not a blaster's", () => {
    expect(chanceOf(ship(["escape"]), { type: "attack", weapon: "knife", target: "p1" })).toBeCloseTo(0.45);
    expect(chanceOf(ship(["escape"]), { type: "attack", weapon: "blaster", target: "p1" })).toBeCloseTo(0.5);
  });

  it("only helps its own holder", () => {
    const s = ship(["escape"]);
    player(s, "p2").room = "SICK_BAY";
    expect(chanceOf(s, { type: "punch", target: "p2" })).toBeCloseTo(0.6);
  });
});
