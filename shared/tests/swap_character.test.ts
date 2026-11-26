import { describe, expect, it } from "vitest";
import { bodyOf } from "../src/mind.ts";
import { applyAction, createGame, setCheat } from "../src/rules.ts";
import type { GameState } from "../src/types.ts";
import { makeSeats, must, offered, player, testConfig } from "./support.ts";

const seats = makeSeats(3);
const fresh = () => createGame(seats, testConfig(), 7);
const withCheat = (s: GameState, id: string) => must(setCheat(s, id, "swapCharacter", true));

describe("swapCharacter cheat", () => {
  it("offers swap_character only with the cheat on, for every other living crewmate", () => {
    const [a, b, c] = seats.map((x) => x.id);
    let s = fresh();
    expect(offered(s, a!).some((x) => x.type === "swap_character")).toBe(false);
    s = withCheat(s, a!);
    player(s, c!).alive = false;
    const targets = offered(s, a!).flatMap((x) => (x.type === "swap_character" ? [x.crewmate] : []));
    expect(targets).toEqual([b]);
  });

  it("moves only the seats: you take over their character whole, role included, and the cheat comes with you", () => {
    const [a, b] = seats.map((x) => x.id);
    let s = withCheat(fresh(), a!);
    player(s, b!).role = "mush";
    player(s, b!).spores = 2;
    player(s, b!).room = "bridge";
    const [bodyA, bodyB] = [structuredClone(player(s, a!)), structuredClone(player(s, b!))];
    s = must(applyAction(s, a!, { type: "swap_character", crewmate: b! }));
    // Seat a now plays body b, which is unchanged apart from the seat fields.
    expect(bodyOf(s, a!)).toBe(b);
    expect(bodyOf(s, b!)).toBe(a);
    const nowB = player(s, b!);
    expect(nowB).toMatchObject({ role: "mush", spores: 2, room: "bridge", character: bodyB.character, hp: bodyB.hp, name: bodyA.name, mind: a, cheats: ["swapCharacter"] });
    expect(player(s, a!)).toMatchObject({ role: bodyA.role, character: bodyA.character, name: bodyB.name, mind: b, cheats: [] });
    // Unlimited: swap straight back.
    s = must(applyAction(s, b!, { type: "swap_character", crewmate: a! }));
    expect(bodyOf(s, a!)).toBe(a);
    expect(player(s, a!).cheats).toEqual(["swapCharacter"]);
  });

  it("refuses without the cheat", () => {
    const [a, b] = seats.map((x) => x.id);
    expect(applyAction(fresh(), a!, { type: "swap_character", crewmate: b! }).ok).toBe(false);
  });
});
