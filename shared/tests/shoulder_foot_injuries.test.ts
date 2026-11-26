import { describe, expect, it } from "vitest";
import { addDisease, removeDisease } from "../src/diseases.ts";
import { MICROWAVE_ITEM } from "../src/itemIds.ts";
import { actionSuccessRate, movementRules } from "../src/modifiers.ts";
import { applyAction, createGame } from "../src/rules.ts";
import type { Action, GameState, ItemState } from "../src/types.ts";
import type { ActionTag } from "../src/actions/action.ts";
import { costOf, makeSeats, noCharacterModifiers, option, player, testConfig } from "./support.ts";

const BRUISED = "bruised_shoulder_injury";
const BROKEN = "broken_shoulder_injury";
const SHATTERED = "shattered_shoulder_injury";
const FOOT = "mashed_foot_injury";
const ROOM = "LABORATORY";
const config = noCharacterModifiers(testConfig());

function ship(): GameState {
  const s = createGame(makeSeats(3, "others"), config, 7);
  for (const p of s.players) p.room = ROOM;
  return s;
}

const shotRates = (s: GameState) => {
  const actor = player(s, "p0");
  const rate = (action: Action, tags: ActionTag[] = []) => actionSuccessRate(0.6, { state: s, actor, action, tags });
  return [
    rate({ type: "turret_attack" } as Action, ["shoot"]),
    rate({ type: "patrol_attack", equipment: "x", hunter: "h" } as Action),
    rate({ type: "attack", weapon: "w", target: "t" } as Action, ["aggressive"]),
    rate({ type: "attack", weapon: "w", target: "t" } as Action, ["aggressive", "melee"]),
    rate({ type: "repair" } as unknown as Action),
  ];
};

describe.each([
  [BRUISED, 1, 0.9],
  [BROKEN, 2, 0.8],
  [SHATTERED, 3, 0.6],
] as const)("%s", (injury, hpLoss, factor) => {
  it(`lowers max health by ${hpLoss} and multiplies every shot by ${factor}, not melee or anything else`, () => {
    const s = ship();
    const p0 = player(s, "p0");
    const max = p0.maxHp;
    addDisease(s, p0, injury);
    expect(p0.maxHp).toBe(max - hpLoss);
    const [turret, patrol, gun, melee, other] = shotRates(s);
    for (const shot of [turret, patrol, gun]) expect(shot).toBeCloseTo(0.6 * factor);
    expect([melee, other]).toEqual([0.6, 0.6]);
    removeDisease(s, p0, injury);
    expect(p0.maxHp).toBe(max);
  });
});

describe("broken shoulder injury", () => {
  const microwave = (at: ItemState["at"]): ItemState => ({ id: "mw", type: MICROWAVE_ITEM, at });

  it("refuses taking a heavy item, but not a light one", () => {
    const s = ship();
    s.items.push(microwave({ kind: "room", id: ROOM }), { id: "light", type: "apron", at: { kind: "room", id: ROOM } });
    expect(option(s, "p0", { type: "take", item: "mw" })).toBeDefined();
    addDisease(s, player(s, "p0"), BROKEN);
    expect(option(s, "p0", { type: "take", item: "mw" })).toBeUndefined();
    expect(applyAction(s, "p0", { type: "take", item: "mw" }).ok).toBe(false);
    expect(option(s, "p0", { type: "take", item: "light" })).toBeDefined();
  });

  it("drops heavy items carried when it starts, with a public line, and keeps light ones", () => {
    const s = ship();
    s.items.push(microwave({ kind: "player", id: "p0" }), { id: "light", type: "apron", at: { kind: "player", id: "p0" } });
    addDisease(s, player(s, "p0"), BROKEN);
    expect(s.items.find((i) => i.id === "mw")!.at).toEqual({ kind: "room", id: ROOM });
    expect(s.items.find((i) => i.id === "light")!.at).toEqual({ kind: "player", id: "p0" });
    expect(s.log.some((e) => e.key === "dropped" && e.params?.item === MICROWAVE_ITEM)).toBe(true);
  });

  it("drops them too when a Bruised Shoulder upgrades to it", () => {
    const s = ship();
    s.items.push(microwave({ kind: "player", id: "p0" }));
    addDisease(s, player(s, "p0"), BRUISED);
    expect(s.items.find((i) => i.id === "mw")!.at.kind).toBe("player");
    addDisease(s, player(s, "p0"), BRUISED);
    expect(player(s, "p0").statuses).toContain(BROKEN);
    expect(s.items.find((i) => i.id === "mw")!.at).toEqual({ kind: "room", id: ROOM });
  });
});

describe("mashed foot injury", () => {
  it("adds 1 MP to each move, and lowers max health by 1 and max MP by 3", () => {
    const s = ship();
    const p0 = player(s, "p0");
    const [move, hp, mp] = [movementRules(s, p0).mpPerMove, p0.maxHp, p0.maxMp];
    addDisease(s, p0, FOOT);
    expect(movementRules(s, p0).mpPerMove).toBe(move + 1);
    expect(movementRules(s, p0).mpCap).toBe(mp - 3);
    expect([p0.maxHp, p0.maxMp]).toEqual([hp - 1, mp - 3]);
    removeDisease(s, p0, FOOT);
    expect([p0.maxHp, p0.maxMp]).toEqual([hp, mp]);
  });
});

describe("shattered shoulder injury", () => {
  const microwave = (at: ItemState["at"]): ItemState => ({ id: "mw", type: MICROWAVE_ITEM, at });
  const shoulders = (s: GameState) => player(s, "p0").modifiers.filter((m) => [BRUISED, BROKEN, SHATTERED].includes(m));

  it("upgrades a second Broken Shoulder, and no lower shoulder joins it", () => {
    const s = ship();
    addDisease(s, player(s, "p0"), BROKEN);
    addDisease(s, player(s, "p0"), BROKEN);
    expect(shoulders(s)).toEqual([SHATTERED]);
    addDisease(s, player(s, "p0"), BRUISED);
    addDisease(s, player(s, "p0"), BROKEN);
    expect(shoulders(s)).toEqual([SHATTERED]);
  });

  it("costs 2 more AP on actions that cost AP, refuses heavy items and drops those carried", () => {
    const plain = ship();
    const s = ship();
    s.items.push(microwave({ kind: "player", id: "p0" }));
    const search = (state: GameState) => costOf(state, "p0", { type: "search" })?.ap;
    addDisease(s, player(s, "p0"), SHATTERED);
    expect(search(s)).toBe(search(plain)! + 2);
    expect(s.items.find((i) => i.id === "mw")!.at).toEqual({ kind: "room", id: ROOM });
    expect(option(s, "p0", { type: "take", item: "mw" })).toBeUndefined();
  });
});
