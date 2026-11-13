import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { DRUG_ITEMS } from "../src/items.ts";
import { RESEARCH_COMPLETE } from "../src/research.ts";
import { applyAction, createGame } from "../src/rules.ts";
import type { Action, GameConfig, GameState, PlayerId } from "../src/types.ts";
import { makeSeats, mustApply, nextCycle, offered, player, setProgress, stockLab } from "./support.ts";

const MEDLAB = "SICK_BAY";
const DISP = `${MEDLAB}:DRUG_DISP`;
const base: GameConfig = { ...DEFAULT_CONFIG, mushCount: 1, startInventory: [], startItems: [], startSkills: [], hunters: { ...DEFAULT_CONFIG.hunters, waveChance: 0 } };
const take = (drug: string): Action => ({ type: "dispense_drug", equipment: DISP, drug });
const drugsOffered = (s: GameState, id: PlayerId) => offered(s, id).flatMap((a) => (a.type === "dispense_drug" ? [a.drug] : []));

/** Four humans in the medlab with the dispenser built, a plain one, a Nurse, a Biologist and both. */
function ship(): GameState {
  const s = createGame(makeSeats(4), base, 5);
  s.preselection = false;
  s.equipment[MEDLAB] = [...(s.equipment[MEDLAB] ?? []), { id: DISP, type: "DRUG_DISP" }];
  s.drugDispenser = { list: DRUG_ITEMS.toReversed(), used: false };
  const skills: Record<string, string[]> = { p0: [], p1: ["first_aid"], p2: ["biologist"], p3: ["first_aid", "biologist"] };
  for (const p of s.players) {
    p.role = "human";
    p.room = MEDLAB;
    p.ap = 5;
    p.skills = skills[p.id] as typeof p.skills;
  }
  return s;
}

describe("Drug Dispenser", () => {
  it("is built, with a list, when its research completes", () => {
    const s = ship();
    s.equipment[MEDLAB] = s.equipment[MEDLAB]!.filter((e) => e.id !== DISP);
    s.drugDispenser = { list: [], used: false };
    for (const p of s.players) p.room = "LABORATORY";
    stockLab(s, "LABORATORY", "DRUG_DISPENSER");
    setProgress(s, { research: "DRUG_DISPENSER" }, RESEARCH_COMPLETE - 1);
    const done = mustApply(s, "p0", { type: "research", equipment: "LABORATORY:RESEARCH_LAB", research: "DRUG_DISPENSER" });
    expect(done.drugDispenser.list.toSorted()).toEqual([...DRUG_ITEMS].toSorted());
  });

  it("offers the first 1, +1 Nurse, +2 Biologist, stacking, of the same list", () => {
    const s = ship();
    const list = s.drugDispenser.list;
    expect([0, 1, 2, 3].map((i) => drugsOffered(s, `p${i}`))).toEqual([list.slice(0, 1), list.slice(0, 2), list.slice(0, 3), list.slice(0, 4)]);
  });

  it("makes the chosen drug from nothing, once per reset, for anyone", () => {
    let s = ship();
    const chosen = s.drugDispenser.list[1]!;
    const before = s.items.length;
    s = mustApply(s, "p1", take(chosen));
    expect(s.items.length).toBe(before + 1);
    expect(s.items.some((i) => i.type === chosen && i.at.kind === "player" && i.at.id === "p1")).toBe(true);
    expect(drugsOffered(s, "p3")).toEqual([]);
    expect(applyAction(s, "p3", take(s.drugDispenser.list[0]!))).toMatchObject({ ok: false });
  });

  it("a Skilful counts as a Biologist: 3 options, and not 5 with both", () => {
    const s = ship();
    player(s, "p0").skills = ["skilful"];
    player(s, "p3").skills = ["first_aid", "biologist", "skilful"];
    expect(drugsOffered(s, "p0")).toEqual(s.drugDispenser.list.slice(0, 3));
    expect(drugsOffered(s, "p3")).toEqual(s.drugDispenser.list.slice(0, 4));
  });

  it("refuses a drug beyond your options, or from another room, and leaves the state alone", () => {
    const s = ship();
    expect(applyAction(s, "p0", take(s.drugDispenser.list[1]!))).toMatchObject({ ok: false });
    player(s, "p3").room = "REFECTORY";
    expect(drugsOffered(s, "p3")).toEqual([]);
    expect(s.drugDispenser.used).toBe(false);
  });

  it("resets with a new list on cycles 1 and 4 of the day only", () => {
    let s = ship();
    s.cycle = 1;
    s = mustApply(s, "p0", take(s.drugDispenser.list[0]!));
    const resetCycles = DEFAULT_CONFIG.drugDispenser.resetCycles;
    expect(resetCycles).toEqual([1, 4]);
    let resets = 0;
    for (let i = 0; i < DEFAULT_CONFIG.cyclesPerDay; i++) {
      const used = s.drugDispenser.used;
      s = nextCycle(s);
      const cycleOfDay = ((s.cycle - 1) % DEFAULT_CONFIG.cyclesPerDay) + 1;
      if (resetCycles.includes(cycleOfDay)) {
        resets++;
        expect(s.drugDispenser.used).toBe(false);
        expect(s.drugDispenser.list.toSorted()).toEqual([...DRUG_ITEMS].toSorted());
      } else {
        expect(s.drugDispenser.used).toBe(used);
      }
    }
    expect(resets).toBe(2);
  });
});
