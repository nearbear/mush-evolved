import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { canLaunchExpedition } from "../src/expeditions.ts";
import { canFly } from "../src/patrol.ts";
import { addDisease, removeDisease, spreadByTouch } from "../src/diseases.ts";
import { cycleChanged, enteredRoom } from "../src/modifiers.ts";
import { createGame } from "../src/rules.ts";
import type { GameConfig } from "../src/types.ts";
import { makeSeats, noHunters, player } from "./support.ts";

const config: GameConfig = { ...DEFAULT_CONFIG, mushCount: 1, preselection: null, startSkills: [], startInventory: [], startItems: [] };

describe("Gastroenteris on a Mush", () => {
  it("costs a Mush nothing, but with bacterial_contact they can still vomit", () => {
    for (const bacterial of [false, true]) {
      const state = createGame(makeSeats(4), noHunters(config), 3);
      const mush = state.players.find((p) => p.role === "mush")!;
      if (bacterial) mush.mushSkills.push("bacterial_contact");
      addDisease(state, mush, "gastroenteris_disease");
      expect(mush.diseaseTrackers).toHaveLength(1);
      mush.mp = 5;
      cycleChanged(state);
      expect(mush.mp).toBe(5);
      // Alone in a room, so a vomit is on themselves; 100 entries make the 16% roll certain enough to see it.
      for (const p of state.players) if (p !== mush) p.room = "BRIDGE";
      for (let i = 0; i < 100; i++) enteredRoom(state, mush);
      expect(state.log.some((e) => e.key === "vomitSelf")).toBe(bacterial);
    }
  });

  it("spreads by STT or DTT only for a disease with spreadByDTT (the fungal infection)", () => {
    const state = createGame(makeSeats(4), noHunters(config), 3);
    const [a, b] = [player(state, "p0"), player(state, "p1")];
    addDisease(state, a, "fungal_infection_disease");
    addDisease(state, a, "gastroenteris_disease");
    spreadByTouch(state, a, b);
    expect(b.modifiers).toContain("fungal_infection_disease");
    expect(b.modifiers).not.toContain("gastroenteris_disease");
  });

  it("grounds a Pilot: no takeoff and no Icarus takeoff, until it is cured", () => {
    const state = createGame(makeSeats(4), noHunters(config), 3);
    const pilot = state.players.find((p) => p.role === "human")!;
    pilot.skills.push("pilot");
    expect(canFly(pilot) && canLaunchExpedition(state, pilot)).toBe(true);
    addDisease(state, pilot, "gastroenteris_disease");
    expect(canFly(pilot)).toBe(false); // takeoff (actions/takeoff.ts)
    expect(canLaunchExpedition(state, pilot)).toBe(false); // icarus_takeoff (actions/icarus_takeoff.ts)
    removeDisease(state, pilot, "gastroenteris_disease");
    expect(canFly(pilot)).toBe(true);
  });
});
