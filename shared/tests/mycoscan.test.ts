import { describe, expect, it } from "vitest";
import { MYCOSCAN_EQUIPMENT } from "../src/actions/check_spores.ts";
import { RESEARCH_COMPLETE } from "../src/research.ts";
import { applyAction, createGame, viewFor } from "../src/rules.ts";
import type { Action, GameConfig, GameState, PlayerId } from "../src/types.ts";
import { clone, costOf, makeSeats, mustApply, nextCycle, nextDay, offered, player, setProgress, stockLab, testConfig } from "./support.ts";

const LAB = "LABORATORY";
const SCANNER = `${LAB}:${MYCOSCAN_EQUIPMENT}`;
const check: Action = { type: "check_spores", equipment: SCANNER };
const base: GameConfig = testConfig({ research: { spoilChance: 0 } });

/** p0 human, p1 Mush, both in the lab; p2 human elsewhere. `scanner`: the MycoScan is already built. */
function ship(scanner = true): GameState {
  const s = createGame(makeSeats(3), base, 5);
  s.preselection = false;
  for (const p of s.players) {
    p.role = "human";
    p.ap = 5;
    p.room = LAB;
  }
  player(s, "p1").role = "mush";
  player(s, "p2").room = "REFECTORY";
  if (scanner) s.equipment[LAB]!.push({ id: SCANNER, type: MYCOSCAN_EQUIPMENT });
  return s;
}

const offersCheck = (s: GameState, id: PlayerId) => offered(s, id).some((a) => a.type === "check_spores");
const lastLine = (s: GameState, id: PlayerId) => viewFor(s, id).log.at(-1);

describe("MycoScan", () => {
  it("is built in the lab when the MYCOSCAN research completes", () => {
    let s = ship(false);
    expect(s.equipment[LAB]!.some((e) => e.type === MYCOSCAN_EQUIPMENT)).toBe(false);
    expect(offersCheck(s, "p0")).toBe(false);
    stockLab(s, LAB, "MYCOSCAN");
    setProgress(s, { research: "MYCOSCAN" }, RESEARCH_COMPLETE - 1);
    s = mustApply(s, "p0", { type: "research", equipment: `${LAB}:RESEARCH_LAB`, research: "MYCOSCAN" });
    expect(s.research.MYCOSCAN).toBe(RESEARCH_COMPLETE);
    expect(s.equipment[LAB]!.filter((e) => e.type === MYCOSCAN_EQUIPMENT)).toEqual([{ id: SCANNER, type: MYCOSCAN_EQUIPMENT }]);
    expect(viewFor(s, "p0").log.map((e) => e.key)).toContain("mycoscanBuilt");
    expect(offersCheck(s, "p0")).toBe(true);
  });

  it("tells a human their contamination level, privately and for free", () => {
    const s = ship();
    s.contamination.p0 = 2;
    expect(costOf(s, "p0", check)).toEqual({ ap: base.checkSpores.cost.ap, mp: 0 });
    const after = mustApply(s, "p0", check);
    expect(player(after, "p0").ap).toBe(5 - base.checkSpores.cost.ap);
    expect(lastLine(after, "p0")).toMatchObject({ key: "sporesChecked", params: { level: 2 } });
    for (const id of ["p1", "p2"]) {
      const view = JSON.stringify(viewFor(after, id));
      expect(view).not.toContain("sporesChecked");
      expect(view).not.toContain("mycoscannedToday");
    }
  });

  it("reads 0 for a clean human and for a Mush, even one carrying spores", () => {
    const s = ship();
    player(s, "p1").spores = 2;
    expect(lastLine(mustApply(s, "p0", check), "p0")?.params).toEqual({ level: 0 });
    expect(lastLine(mustApply(s, "p1", check), "p1")?.params).toEqual({ level: 0 });
  });

  it("works once a day per character, and again the next day", () => {
    let s = mustApply(ship(), "p0", check);
    expect(offersCheck(s, "p0")).toBe(false);
    expect(offersCheck(s, "p1")).toBe(true);
    const before = clone(s);
    expect(applyAction(s, "p0", check).ok).toBe(false);
    expect(s).toEqual(before);
    s = nextCycle(s);
    expect(offersCheck(s, "p0")).toBe(false);
    s = nextDay(s);
    player(s, "p0").room = LAB;
    expect(offersCheck(s, "p0")).toBe(true);
  });

  it("needs a working MycoScan in your room", () => {
    const s = ship();
    player(s, "p0").room = "REFECTORY";
    expect(offersCheck(s, "p0")).toBe(false);
    expect(applyAction(s, "p0", check).ok).toBe(false);
    player(s, "p0").room = LAB;
    s.equipment[LAB]!.find((e) => e.id === SCANNER)!.broken = true;
    expect(offersCheck(s, "p0")).toBe(false);
    expect(applyAction(s, "p0", check).ok).toBe(false);
  });

  it("can be used in pre-selection, where everyone reads 0", () => {
    const s = ship();
    s.preselection = true;
    expect(lastLine(mustApply(s, "p0", check), "p0")?.params).toEqual({ level: 0 });
  });
});
