import { describe, expect, it } from "vitest";
import { createChannel, sendChat } from "../src/chat.ts";
import { addDisease, removeDisease } from "../src/diseases.ts";
import { ITRACKIE_ITEM } from "../src/itemIds.ts";
import { actionSuccessRate } from "../src/modifiers.ts";
import { createGame } from "../src/rules.ts";
import type { Action, GameState } from "../src/types.ts";
import type { ActionTag } from "../src/actions/action.ts";
import { makeSeats, nextCycle, noCharacterModifiers, option, player, testConfig } from "./support.ts";

const ARM = "busted_arm_joint_injury";
const LUNG = "punctured_lung_injury";
const TURRET_ROOM = "LASER_TURRET_A_0";
const config = noCharacterModifiers(testConfig({ startInventory: [ITRACKIE_ITEM] }));

function ship(): GameState {
  const s = createGame(makeSeats(3, "others"), config, 7);
  player(s, "p0").room = TURRET_ROOM;
  s.hunters.list.push({ id: "h1", hp: 100, hitChance: s.config.hunters.types.hunter.hitChance, target: null, type: "hunter", countdown: null });
  return s;
}

const turret = { type: "turret_attack" } as const;
const moveCost = (s: GameState) => option(s, "p0", (a) => a.type === "move")!.cost.ap;

describe.each([ARM, LUNG])("%s", (injury) => {
  it("adds 2 AP to actions that cost AP, but not to moving", () => {
    const s = ship();
    const [base, move] = [option(s, "p0", turret)!.cost.ap, moveCost(s)];
    addDisease(s, player(s, "p0"), injury);
    expect(option(s, "p0", turret)!.cost.ap).toBe(base + 2);
    expect(moveCost(s)).toBe(move);
  });
});

describe("busted arm joint injury", () => {
  it("lowers max health by 4 while you have it", () => {
    const s = ship();
    const p0 = player(s, "p0");
    const max = p0.maxHp;
    addDisease(s, p0, ARM);
    expect(p0.maxHp).toBe(max - 4);
    removeDisease(s, p0, ARM);
    expect(p0.maxHp).toBe(max);
  });

  it("takes a fifth off every shot (turret, patrol ship, gun), not a melee blow or anything else", () => {
    const s = ship();
    const base = option(s, "p0", turret)!.chance;
    addDisease(s, player(s, "p0"), ARM);
    expect(option(s, "p0", turret)!.chance).toBeCloseTo(base * 0.8);
    const actor = player(s, "p0");
    const rate = (action: Action, tags: ActionTag[] = []) => actionSuccessRate(0.6, { state: s, actor, action, tags });
    expect(rate({ type: "patrol_attack", equipment: "x", hunter: "h" } as Action)).toBeCloseTo(0.48);
    expect(rate({ type: "attack", weapon: "w", target: "t" } as Action, ["aggressive"])).toBeCloseTo(0.48);
    expect(rate({ type: "attack", weapon: "w", target: "t" } as Action, ["aggressive", "melee"])).toBeCloseTo(0.6);
    expect(rate({ type: "repair" } as unknown as Action)).toBeCloseTo(0.6);
  });
});

describe("punctured lung injury", () => {
  it("lowers max health by 2 and costs 2 health at each cycle change", () => {
    const s = ship();
    const p0 = player(s, "p0");
    const max = p0.maxHp;
    addDisease(s, p0, LUNG);
    expect(p0.maxHp).toBe(max - 2);
    p0.hp = 5;
    player(s, "p1").hp = 5;
    const r = nextCycle(s);
    expect(player(r, "p0").hp).toBe(3);
    expect(player(r, "p1").hp).toBe(5);
  });

  it("mutes: no talking action, chat post or new private channel", () => {
    const s = ship();
    for (const p of s.players) p.room = "LABORATORY";
    player(s, "p0").skills = ["shrink"];
    expect(option(s, "p0", { type: "comfort", target: "p1" })).toBeDefined();
    addDisease(s, player(s, "p0"), LUNG);
    expect(option(s, "p0", { type: "comfort", target: "p1" })).toBeUndefined();
    expect(sendChat(s, "p0", "global", "hello")).toEqual({ ok: false, error: "cant_speak" });
    expect(createChannel(s, "p0")).toEqual({ ok: false, error: "cant_speak" });
  });
});
