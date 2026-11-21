import { describe, expect, it } from "vitest";
import { ACTIONS } from "../src/actions.ts";
import { addDisease, diseaseStats } from "../src/diseases.ts";
import { analysisSectors, neronProgress, rebelGain } from "../src/modifiers.ts";
import { MIGRAINE_RELAY_MALUS, relayGainRange, tokenBase } from "../src/relay.ts";
import { createGame } from "../src/rules.ts";
import type { Action, GameState } from "../src/types.ts";
import { makeSeats, player, testConfig } from "./support.ts";

// Only what no other disease already does: the four diseases' other effects reuse hooks tested with Smallpox,
// Gastroenteritis, Tapeworm, Pink Eye, Space Rabies, Fungal Infection and Rejuvenation.

const config = testConfig();

const game = (): GameState => createGame(makeSeats(4), config, 3);
const human = (s: GameState) => s.players.find((p) => p.role === "human")!;
const mush = (s: GameState) => s.players.find((p) => p.role === "mush")!;

describe("new diseases: durations", () => {
  it("are the owner's", () => {
    const s = game();
    const range = (id: string) => [diseaseStats(s, id)?.durationMin, diseaseStats(s, id)?.durationMax];
    expect(range("sinus_storm_disease")).toEqual([8, 12]);
    expect(range("migraine_disease")).toEqual([8, 12]);
    expect(range("slight_nausea_disease")).toEqual([12, 20]);
    expect(range("food_poisoning_disease")).toEqual([8, 12]);
  });
});

describe("Migraine", () => {
  it("reveals 1 sector less per analysis", () => {
    const s = game();
    const p = human(s);
    const before = analysisSectors(s, p);
    addDisease(s, p, "migraine_disease");
    expect(analysisSectors(s, p)).toBe(before - 1);
  });

  it("halves a NERON update and a rebel decode, rounded down", () => {
    const s = game();
    const p = human(s);
    addDisease(s, p, "migraine_disease");
    expect(neronProgress(s, p, 25)).toBe(12);
    expect(rebelGain(s, p, 7)).toBe(3);
  });

  it("takes 2 off each relay contribution, never below 0", () => {
    const s = game();
    const p = human(s);
    const cfg = s.config.research.progress;
    const before = tokenBase(cfg, p, []);
    const range = relayGainRange(cfg, p, [], null);
    addDisease(s, p, "migraine_disease");
    expect(MIGRAINE_RELAY_MALUS).toBe(2);
    expect(tokenBase(cfg, p, [])).toBe(before - MIGRAINE_RELAY_MALUS);
    expect(relayGainRange(cfg, p, [], null).min).toBe(range.min - MIGRAINE_RELAY_MALUS);
    expect(tokenBase({ rate: 1, mod: 10, skillBoost: 0, relayPenalty: 0 }, p, [])).toBe(0);
  });

  it("costs a Mush nothing", () => {
    const s = game();
    const m = mush(s);
    const cfg = s.config.research.progress;
    const sectors = analysisSectors(s, m);
    const base = tokenBase(cfg, m, []);
    addDisease(s, m, "migraine_disease");
    expect([analysisSectors(s, m), neronProgress(s, m, 25), rebelGain(s, m, 7), tokenBase(cfg, m, [])]).toEqual([sectors, 25, 7, base]);
  });
});

describe("Food Poisoning", () => {
  const give = (s: GameState, to: string, type: string): string => {
    const id = `item-${s.nextItemId++}`;
    s.items.push({ id, type, at: { kind: "player", id: to } });
    return id;
  };
  const refusal = (s: GameState, id: string, item: string) =>
    ACTIONS.consume.check(s, player(s, id), { type: "consume", item } as Action);

  it("stops a human consuming food or a drug", () => {
    const s = game();
    const p = human(s);
    const food = give(s, p.id, "fruit_banana");
    const drug = give(s, p.id, Object.keys(s.drugs)[0]!);
    expect([refusal(s, p.id, food), refusal(s, p.id, drug)]).toEqual([null, null]);
    addDisease(s, p, "food_poisoning_disease");
    expect([refusal(s, p.id, food), refusal(s, p.id, drug)]).toEqual(["cant_eat", "cant_eat"]);
  });

  it("lets a Mush eat", () => {
    const s = game();
    const m = mush(s);
    const food = give(s, m.id, "fruit_banana");
    addDisease(s, m, "food_poisoning_disease");
    expect(refusal(s, m.id, food)).toBeNull();
  });
});
