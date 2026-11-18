import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { addDisease, removeDisease } from "../src/diseases.ts";
import { createGame } from "../src/rules.ts";
import type { GameState } from "../src/types.ts";
import { costOf, makeSeats, noHunters, noIncidents, player, withoutDrugs } from "./support.ts";

const BURNT_HAND = "burnt_hand_injury";
const config = noIncidents(noHunters({ ...DEFAULT_CONFIG, characterModifiers: {}, mushCount: 1, startInventory: [], startItems: [] }));

/** p0 and p1 in the lab; p0 holds a medikit. */
function ship(): GameState {
  const s = withoutDrugs(createGame(makeSeats(3), config, 1));
  for (const id of ["p0", "p1"]) player(s, id).room = "LABORATORY";
  s.items.push({ id: "kit", type: "medikit", at: { kind: "player", id: "p0" } });
  return s;
}

const burnt = (): GameState => {
  const s = ship();
  addDisease(s, player(s, "p0"), BURNT_HAND);
  return s;
};

describe("burnt hand injury", () => {
  it("makes an action that costs AP cost 1 more", () => {
    expect(costOf(ship(), "p0", { type: "heal", target: "p1" })?.ap).toBe(config.heal.cost.apOther);
    expect(costOf(burnt(), "p0", { type: "heal", target: "p1" })?.ap).toBe(config.heal.cost.apOther + 1);
  });

  it("leaves a free action free, including one paid by a skill point", () => {
    const s = burnt();
    player(s, "p0").resources.heal = 1;
    expect(costOf(s, "p0", { type: "heal", target: "p1" })?.ap).toBe(0);
  });

  it("doesn't change what moving costs, even when moving converts AP", () => {
    const plain = ship();
    const s = burnt();
    for (const state of [plain, s]) player(state, "p0").mp = 0;
    const door = (state: GameState) => costOf(state, "p0", { type: "move" });
    expect(door(s)).toEqual(door(plain));
  });

  it("lowers max HP by 1 while you have it", () => {
    const s = ship();
    const p0 = player(s, "p0");
    const max = p0.maxHp;
    addDisease(s, p0, BURNT_HAND);
    expect(p0.maxHp).toBe(max - 1);
    removeDisease(s, p0, BURNT_HAND);
    expect(p0.maxHp).toBe(max);
  });
});
