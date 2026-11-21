import { describe, expect, it } from "vitest";
import { damage } from "../src/death.ts";
import { addDisease, diseaseStats, spreadByTouch } from "../src/diseases.ts";
import { enteredRoom } from "../src/modifiers.ts";
import { createGame } from "../src/rules.ts";
import type { GameState } from "../src/types.ts";
import { makeSeats, player, testConfig } from "./support.ts";

const config = testConfig();

const game = (): GameState => createGame(makeSeats(4), config, 3);
const human = (s: GameState) => s.players.find((p) => p.role === "human")!;
const mush = (s: GameState) => s.players.find((p) => p.role === "mush")!;

describe("Syphilis", () => {
  it("has the owner's numbers", () => {
    expect(diseaseStats(game(), "syphilis_disease")).toMatchObject({ durationMin: 20, durationMax: 32, spreadByDTT: true });
  });

  it("takes 3 off max health and max morale", () => {
    const s = game();
    const p = human(s);
    const [hp, morale] = [p.maxHp, p.maxMorale];
    addDisease(s, p, "syphilis_disease");
    expect([p.maxHp, p.maxMorale]).toEqual([hp - 3, morale - 3]);
  });

  it("makes every loss of health 2 bigger", () => {
    const s = game();
    const p = human(s);
    addDisease(s, p, "syphilis_disease");
    const before = p.hp;
    damage(s, p, 1, "injury");
    expect(p.hp).toBe(before - 3);
  });

  it("spreads by STT or DTT", () => {
    const s = game();
    const [a, b] = [player(s, "p0"), player(s, "p1")];
    addDisease(s, a, "syphilis_disease");
    spreadByTouch(s, a, b);
    expect(b.modifiers).toContain("syphilis_disease");
  });

  it("makes its holder sneeze on entering a room, about 16% of the time", () => {
    const s = game();
    const p = human(s);
    addDisease(s, p, "syphilis_disease");
    const tries = 400;
    for (let i = 0; i < tries; i++) enteredRoom(s, p);
    const n = s.log.filter((e) => e.key === "sneezes").length;
    expect(n).toBeGreaterThan(tries * 0.08);
    expect(n).toBeLessThan(tries * 0.24);
  });

  it("costs a Mush nothing", () => {
    const s = game();
    const m = mush(s);
    const [hp, morale] = [m.maxHp, m.maxMorale];
    addDisease(s, m, "syphilis_disease");
    expect([m.maxHp, m.maxMorale]).toEqual([hp, morale]);
    const before = m.hp;
    damage(s, m, 1, "injury");
    expect(m.hp).toBe(before - 1);
    for (let i = 0; i < 100; i++) enteredRoom(s, m);
    expect(s.log.some((e) => e.key === "sneezes")).toBe(false);
  });
});
