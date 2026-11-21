import { describe, expect, it } from "vitest";
import { canLaunchExpedition } from "../src/expeditions.ts";
import { canFly } from "../src/patrol.ts";
import { addDisease, removeDisease, spreadByTouch } from "../src/diseases.ts";
import { consumed, cycleChanged, enteredRoom } from "../src/modifiers.ts";
import { createGame } from "../src/rules.ts";
import { makeSeats, player, testConfig } from "./support.ts";

const config = testConfig();

describe("Gastroenteris on a Mush", () => {
  it("costs a Mush nothing, but with bacterial_contact they can still vomit", () => {
    for (const bacterial of [false, true]) {
      const state = createGame(makeSeats(4), config, 3);
      const mush = state.players.find((p) => p.role === "mush")!;
      if (bacterial) mush.mushSkills.push("bacterial_contact");
      addDisease(state, mush, "gastroenteritis_disease");
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

  it("spreads by STT or DTT only for a disease with spreadByDTT (the fungal infection, not the tinnitus)", () => {
    const state = createGame(makeSeats(4), config, 3);
    const [a, b] = [player(state, "p0"), player(state, "p1")];
    addDisease(state, a, "fungal_infection_disease");
    addDisease(state, a, "extreme_tinnitus_disease");
    spreadByTouch(state, a, b);
    expect(b.modifiers).toContain("fungal_infection_disease");
    expect(b.modifiers).not.toContain("extreme_tinnitus_disease");
  });

  it("grounds a Pilot: no takeoff and no Icarus takeoff, until it is cured", () => {
    const state = createGame(makeSeats(4), config, 3);
    const pilot = state.players.find((p) => p.role === "human")!;
    pilot.skills.push("pilot");
    expect(canFly(pilot) && canLaunchExpedition(state, pilot)).toBe(true);
    addDisease(state, pilot, "gastroenteritis_disease");
    expect(canFly(pilot)).toBe(false); // takeoff (actions/takeoff.ts)
    expect(canLaunchExpedition(state, pilot)).toBe(false); // icarus_takeoff (actions/icarus_takeoff.ts)
    removeDisease(state, pilot, "gastroenteritis_disease");
    expect(canFly(pilot)).toBe(true);
  });

  it("costs a human 1 AP whenever they consume something, and a Mush nothing", () => {
    const state = createGame(makeSeats(4), config, 3);
    const human = state.players.find((p) => p.role === "human")!;
    const mush = state.players.find((p) => p.role === "mush")!;
    for (const p of [human, mush]) addDisease(state, p, "gastroenteritis_disease");
    const item = { id: "x", type: "coffee", at: { kind: "player", id: human.id } } as const;
    human.ap = mush.ap = 5;
    consumed(state, human, item);
    consumed(state, mush, item);
    expect(human.ap).toBe(4);
    expect(mush.ap).toBe(5);
  });
});
