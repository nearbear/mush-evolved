import { describe, expect, it } from "vitest";
import { addDisease } from "../src/diseases.ts";
import { enteredRoom } from "../src/modifiers.ts";
import { createGame } from "../src/rules.ts";
import type { GameState } from "../src/types.ts";
import { costOf, makeSeats, noCharacterModifiers, player, testConfig, withoutDrugs } from "./support.ts";

const BULLET = "lodged_bullet_injury";
const config = noCharacterModifiers(testConfig());

/** p0 and p1 in the lab; p0 holds a medikit. */
function ship(): GameState {
  const s = withoutDrugs(createGame(makeSeats(3), config, 1));
  for (const id of ["p0", "p1"]) player(s, id).room = "LABORATORY";
  player(s, "p0").role = "human";
  s.items.push({ id: "kit", type: "medikit", at: { kind: "player", id: "p0" } });
  return s;
}

describe("lodged bullet injury", () => {
  it("is an injury a bullet's random injury can give", () => {
    expect(config.diseases.allInjuries).toContain(BULLET);
    expect(config.diseases.bulletInjuries).toContain(BULLET);
  });

  it("costs 1 more AP on actions that cost AP, leaves moves alone, and lowers max HP by 2", () => {
    const plain = ship();
    const s = ship();
    const max = player(s, "p0").maxHp;
    addDisease(s, player(s, "p0"), BULLET);
    expect(player(s, "p0").maxHp).toBe(max - 2);
    expect(costOf(s, "p0", { type: "heal", target: "p1" })?.ap).toBe(config.heal.cost.apOther + 1);
    for (const state of [plain, s]) player(state, "p0").mp = 0;
    expect(costOf(s, "p0", { type: "move" })).toEqual(costOf(plain, "p0", { type: "move" }));
  });

  it("foams from the mouth on every room entered", () => {
    const s = ship();
    addDisease(s, player(s, "p0"), BULLET);
    for (let i = 0; i < 3; i++) enteredRoom(s, player(s, "p0"));
    expect(s.log.filter((e) => e.key === "foams").length).toBe(3);
  });
});
