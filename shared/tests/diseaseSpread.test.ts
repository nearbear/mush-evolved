import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { addDisease, diseaseStats, spreadAtCycle, spreadOnEncounter } from "../src/diseases.ts";
import { createGame } from "../src/rules.ts";
import type { DiseaseStats, GameConfig, GameState } from "../src/types.ts";
import { makeSeats, player, testConfig } from "./support.ts";

const base = testConfig();

/** Every disease that spreads in rooms, from config.ts: each one goes through the same two functions. */
const ROOM_SPREADERS = DEFAULT_CONFIG.diseases.allDiseaseStats.filter((d) => d.roomSpread != null || d.cycleSpread != null).map((d) => d.label!);

/** The config with `spread` set on every disease's stats (replaced, not edited: the stats objects are shared). */
const withSpread = (spread: Partial<DiseaseStats>): GameConfig => ({
  ...base,
  diseases: { ...base.diseases, allDiseaseStats: base.diseases.allDiseaseStats.map((d) => (d.roomSpread != null || d.cycleSpread != null ? { ...d, ...spread } : d)) },
});

/** p0 carries `disease`; p0 and p1 share the front corridor; p2 is on the bridge. */
function ship(config: GameConfig, disease: string): GameState {
  const s = createGame(makeSeats(3), config, 1);
  for (const p of s.players) p.room = "FRONT_CORRIDOR";
  player(s, "p2").room = "BRIDGE";
  addDisease(s, player(s, "p0"), disease);
  return s;
}

describe("disease spread in rooms", () => {
  it("covers the owner's room spreaders, Gastroenteritis and Skin inflammation included (owner, 2026-11-20)", () => {
    expect(ROOM_SPREADERS).toEqual(expect.arrayContaining(["cold_disease", "flu_disease", "rubella_disease", "gastroenteritis_disease", "skin_inflammation_disease"]));
    const s = createGame(makeSeats(3), base, 1);
    const odds = (id: string) => [diseaseStats(s, id)?.roomSpread, diseaseStats(s, id)?.cycleSpread];
    expect(odds("gastroenteritis_disease")).toEqual([0.02, 0.04]);
    expect(odds("skin_inflammation_disease")).toEqual([0.02, 0.02]);
  });

  it.each(ROOM_SPREADERS)("%s spreads to the others in the room at a cycle change, not to other rooms", (disease) => {
    const s = ship(withSpread({ cycleSpread: 1 }), disease);
    spreadAtCycle(s, player(s, "p0"));
    expect(player(s, "p1").modifiers).toContain(disease);
    expect(player(s, "p2").modifiers).not.toContain(disease);
  });

  it.each(ROOM_SPREADERS)("%s spreads both ways on an encounter", (disease) => {
    for (const carrierFirst of [true, false]) {
      const s = ship(withSpread({ roomSpread: 1 }), disease);
      const [sick, healthy] = [player(s, "p0"), player(s, "p1")];
      if (carrierFirst) spreadOnEncounter(s, sick, healthy);
      else spreadOnEncounter(s, healthy, sick);
      expect(healthy.modifiers).toContain(disease);
    }
  });

  it("never spreads to the dead, and a disease without the chance doesn't spread", () => {
    const s = ship(withSpread({ cycleSpread: 1 }), "cold_disease");
    player(s, "p1").alive = false;
    spreadAtCycle(s, player(s, "p0"));
    expect(player(s, "p1").modifiers).not.toContain("cold_disease");
    const quiet = ship(withSpread({ cycleSpread: 1, roomSpread: 1 }), "migraine_disease");
    spreadAtCycle(quiet, player(quiet, "p0"));
    spreadOnEncounter(quiet, player(quiet, "p0"), player(quiet, "p1"));
    expect(player(quiet, "p1").modifiers).not.toContain("migraine_disease");
  });

  it("trades different diseases both ways in one encounter", () => {
    const s = ship(withSpread({ roomSpread: 1 }), "cold_disease");
    addDisease(s, player(s, "p1"), "flu_disease");
    const [a, b] = [player(s, "p0"), player(s, "p1")];
    spreadOnEncounter(s, a, b);
    expect(a.modifiers).toEqual(expect.arrayContaining(["cold_disease", "flu_disease"]));
    expect(b.modifiers).toEqual(expect.arrayContaining(["cold_disease", "flu_disease"]));
  });

  it("lets a Mush spread at a cycle change", () => {
    const s = ship(withSpread({ cycleSpread: 1 }), "gastroenteritis_disease");
    player(s, "p0").role = "mush";
    player(s, "p1").role = "human";
    spreadAtCycle(s, player(s, "p0"));
    expect(player(s, "p1").modifiers).toContain("gastroenteritis_disease");
  });
});
