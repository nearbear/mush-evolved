import { describe, expect, it } from "vitest";
import { CHARACTERS } from "../src/characters.ts";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { applyAction, createGame, viewFor } from "../src/rules.ts";
import type { GameState, PlayerId, Seat } from "../src/types.ts";

const seats: Seat[] = Array.from({ length: 3 }, (_, i) => ({ id: `p${i}`, name: `Player ${i}`, isBot: false, character: CHARACTERS[i]!.id }));
const base = { ...DEFAULT_CONFIG, mushCount: 1, startInventory: [], startItems: [], startSkills: [] };
const player = (s: GameState, id: PlayerId) => s.players.find((p) => p.id === id)!;

/** p0 in the refectory with 10 MP; `carry` heavy freezers in their inventory. */
function ship(carry: number, skills: string[] = []): GameState {
  const s = createGame(seats, base, 3);
  const p = player(s, "p0");
  p.room = "REFECTORY";
  p.mp = 10;
  p.skills = skills;
  for (let i = 0; i < carry; i++) s.items.push({ id: `f${i}`, type: "freezer", at: { kind: "player", id: "p0" } });
  return s;
}
const mpSpent = (s: GameState) => {
  const to = viewFor(s, "p0").legalActions.find((a) => a.type === "move")!;
  const r = applyAction(s, "p0", to);
  if (!r.ok) throw new Error(r.error);
  return 10 - player(r.state, "p0").mp;
};

describe("heavy items", () => {
  it("the freezer spawns in the refectory", () => {
    const s = createGame(seats, DEFAULT_CONFIG, 3);
    expect(s.items.some((i) => i.type === "freezer" && i.at.kind === "room" && i.at.id === "REFECTORY")).toBe(true);
  });

  it("a move costs 1 MP with nothing heavy and 3 with a heavy item", () => {
    expect(mpSpent(ship(0))).toBe(1);
    expect(mpSpent(ship(1))).toBe(3);
  });

  it("the penalty does not stack", () => {
    expect(mpSpent(ship(3))).toBe(3);
  });

  it("sturdy removes the penalty", () => {
    expect(mpSpent(ship(1, ["sturdy"]))).toBe(1);
  });

  it("a heavy item on the floor costs nothing", () => {
    const s = ship(1);
    s.items[0]!.at = { kind: "room", id: "REFECTORY" };
    expect(mpSpent(s)).toBe(1);
  });

  it("converts AP when MP can't cover the penalty", () => {
    const s = ship(1);
    player(s, "p0").mp = 2;
    const to = viewFor(s, "p0").legalActions.find((a) => a.type === "move")!;
    const r = applyAction(s, "p0", to);
    if (!r.ok) throw new Error(r.error);
    expect(player(r.state, "p0").ap).toBe(base.startAp - 1);
    expect(player(r.state, "p0").mp).toBe(2);
  });
});

describe("sturdy punch", () => {
  const hp = (skills: string[]) => {
    const s = createGame(seats, base, 3);
    player(s, "p0").room = player(s, "p1").room = "SICK_BAY";
    player(s, "p0").skills = skills;
    const r = applyAction(s, "p0", { type: "punch", target: "p1" });
    if (!r.ok) throw new Error(r.error);
    return base.startHp - player(r.state, "p1").hp;
  };
  it("adds 1 damage", () => {
    expect(hp([])).toBe(2);
    expect(hp(["sturdy"])).toBe(3);
  });
});
