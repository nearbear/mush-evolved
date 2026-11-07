import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { SUPER_CALC_EQUIPMENT } from "../src/equipment.ts";
import { RESEARCH_COMPLETE, RESEARCH_STATUS } from "../src/research.ts";
import { applyAction, createGame, viewFor } from "../src/rules.ts";
import type { Action, GameConfig, GameState, PlayerId } from "../src/types.ts";
import { makeSeats, mustApply, offered, player, setProgress, stockLab } from "./support.ts";

const LAB = "LABORATORY";
const NEXUS = "NEXUS_ROOM";
const SUPER_CALC_ID = `${NEXUS}:${SUPER_CALC_EQUIPMENT}`;
const accessSuperCalc: Action = { type: "access", equipment: SUPER_CALC_ID };
const base: GameConfig = { ...DEFAULT_CONFIG, mushCount: 1, startInventory: [], startItems: [], startSkills: [], research: { ...DEFAULT_CONFIG.research, spoilChance: 0 } };

function ship(built = false): GameState {
  const s = createGame(makeSeats(3), base, 7);
  s.preselection = false;
  for (const p of s.players) {
    p.role = "human";
    p.ap = 10;
    p.room = LAB;
  }
  player(s, "p1").room = NEXUS;
  player(s, "p2").room = "REFECTORY";
  if (built) s.equipment[NEXUS]!.push({ id: SUPER_CALC_ID, type: SUPER_CALC_EQUIPMENT });
  return s;
}

const offersAccess = (s: GameState, id: PlayerId) => offered(s, id).some((a) => a.type === "access" && a.equipment === SUPER_CALC_ID);

describe("Super Calculator", () => {
  it("is partly implemented", () => {
    expect(RESEARCH_STATUS.SUPER_CALC).toBe("partial");
  });

  it("is not in the Nexus starting equipment", () => {
    const s = ship(false);
    expect(s.equipment[NEXUS]!.some((e) => e.type === SUPER_CALC_EQUIPMENT)).toBe(false);
    expect(offersAccess(s, "p1")).toBe(false);
  });

  it("requires super_map in the lab before research can be worked on", () => {
    const s = ship(false);
    const workAction: Action = { type: "research", equipment: `${LAB}:RESEARCH_LAB`, research: "SUPER_CALC" };
    expect(applyAction(s, "p0", workAction).ok).toBe(false);

    stockLab(s, LAB, "SUPER_CALC");
    expect(applyAction(s, "p0", workAction).ok).toBe(true);
  });

  it("is built in the Nexus when SUPER_CALC research completes and does not consume super_map", () => {
    let s = ship(false);
    stockLab(s, LAB, "SUPER_CALC");
    setProgress(s, { research: "SUPER_CALC" }, RESEARCH_COMPLETE - 1);
    const mapItemsBefore = s.items.filter((i) => i.type === "super_map").length;

    s = mustApply(s, "p0", { type: "research", equipment: `${LAB}:RESEARCH_LAB`, research: "SUPER_CALC" });
    expect(s.research.SUPER_CALC).toBe(RESEARCH_COMPLETE);
    expect(s.equipment[NEXUS]!.filter((e) => e.type === SUPER_CALC_EQUIPMENT)).toEqual([{ id: SUPER_CALC_ID, type: SUPER_CALC_EQUIPMENT }]);

    // super_map is kept
    expect(s.items.filter((i) => i.type === "super_map").length).toBe(mapItemsBefore);

    // Offers access in the Nexus
    expect(offersAccess(s, "p1")).toBe(true);
    // Not offered outside the Nexus
    expect(offersAccess(s, "p0")).toBe(false);
    expect(offersAccess(s, "p2")).toBe(false);
  });

  it("is visible in roomEquipment only in the Nexus", () => {
    const s = ship(true);
    expect(viewFor(s, "p1").roomEquipment.some((e) => e.id === SUPER_CALC_ID)).toBe(true);
    expect(viewFor(s, "p0").roomEquipment.some((e) => e.id === SUPER_CALC_ID)).toBe(false);
    expect(viewFor(s, "p2").roomEquipment.some((e) => e.id === SUPER_CALC_ID)).toBe(false);
  });

  it("can be accessed in the Nexus, but refuses access when broken", () => {
    let s = ship(true);
    expect(applyAction(s, "p1", accessSuperCalc).ok).toBe(true);

    const calc = s.equipment[NEXUS]!.find((e) => e.id === SUPER_CALC_ID)!;
    calc.broken = true;

    expect(applyAction(s, "p1", accessSuperCalc).ok).toBe(false);
    expect(offersAccess(s, "p1")).toBe(false);

    // Repair action is offered on the broken calculator
    const repairs = offered(s, "p1").filter((a) => a.type === "repair" && a.equipment === SUPER_CALC_ID);
    expect(repairs.length).toBeGreaterThan(0);
  });
});
