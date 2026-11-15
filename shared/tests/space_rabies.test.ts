import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { damage } from "../src/death.ts";
import { addDisease } from "../src/diseases.ts";
import { attackWithHeldWeapon } from "../src/actions/attack.ts";
import { cycleChanged, enteredRoom } from "../src/modifiers.ts";
import { createGame } from "../src/rules.ts";
import type { GameConfig } from "../src/types.ts";
import { makeSeats, noHunters } from "./support.ts";

const config: GameConfig = { ...DEFAULT_CONFIG, mushCount: 1, preselection: null, startSkills: [], startInventory: [], startItems: [] };

describe("Space rabies", () => {
  it("adds 1 to all damage a human takes, but not a Mush's", () => {
    const state = createGame(makeSeats(4), noHunters(config), 4);
    const human = state.players.find((p) => p.role === "human")!;
    const mush = state.players.find((p) => p.role === "mush")!;
    for (const p of [human, mush]) addDisease(state, p, "space_rabies_disease");
    const [hh, mh] = [human.hp, mush.hp];
    damage(state, human, 1, "injury");
    damage(state, mush, 1, "injury");
    expect(human.hp).toBe(hh - 2);
    expect(mush.hp).toBe(mh - 1);
  });

  it("costs 2 (3 with the rise) at a cycle change and bites someone in the room for 2 (3 if they have it too)", () => {
    const state = createGame(makeSeats(4), noHunters(config), 4);
    const [sick, victim] = state.players.filter((p) => p.role === "human");
    sick!.room = victim!.room = "BRIDGE";
    for (const p of state.players) if (p !== sick && p !== victim) p.room = "REFECTORY";
    addDisease(state, sick!, "space_rabies_disease");
    const [a, b] = [sick!.hp, victim!.hp];
    cycleChanged(state);
    expect(sick!.hp).toBe(a - 3);
    expect(victim!.hp).toBe(b - 2);
    expect(state.log.some((e) => e.key === "bites")).toBe(true);
  });

  it("swings a carried weapon at someone in the room", () => {
    const state = createGame(makeSeats(4), noHunters(config), 4);
    const [sick, victim] = state.players.filter((p) => p.role === "human");
    sick!.room = victim!.room = "BRIDGE";
    state.items.push({ id: "w", type: "knife", at: { kind: "player", id: sick!.id } });
    for (let i = 0; i < 20; i++) attackWithHeldWeapon(state, sick!);
    expect(state.log.some((e) => e.key === "attacked")).toBe(true);
    expect(victim!.hp).toBeLessThan(victim!.maxHp);
  });

  it("on entering a room, now and then foams, and strikes someone with a carried weapon", () => {
    const state = createGame(makeSeats(4), noHunters(config), 4);
    const [sick, victim] = state.players.filter((p) => p.role === "human");
    sick!.room = victim!.room = "BRIDGE";
    state.items.push({ id: "w", type: "knife", at: { kind: "player", id: sick!.id } });
    addDisease(state, sick!, "space_rabies_disease");
    for (let i = 0; i < 200; i++) enteredRoom(state, sick!, { attackWithHeldWeapon });
    expect(state.log.some((e) => e.key === "foams")).toBe(true);
    expect(state.log.some((e) => e.key === "attacked" || e.key === "attackMissed")).toBe(true);
  });
});
