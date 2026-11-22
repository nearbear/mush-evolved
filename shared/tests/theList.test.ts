import { describe, expect, it } from "vitest";
import { ITEM_TYPES, TABULATOR_ITEM } from "../src/items.ts";
import { applyAction, createGame, viewFor } from "../src/rules.ts";
import { DOCUMENT_ITEM } from "../src/lostAnalysis.ts";
import type { Action, GameState, ItemState } from "../src/types.ts";
import { DEFAULT_CONFIG, PRESELECTION } from "../src/config.ts";
import type { CharacterId } from "../src/characters.ts";
import { normalizeGame } from "../src/normalizeState.ts";
import { joinShip, selectMush } from "../src/preselection.ts";
import { guaranteedGroup, listSize, rollList } from "../src/theList.ts";
import { clone, costOf, makeSeats, must, nextCycle, offered, option, player, testConfig } from "./support.ts";

// THE List (owner, 2026-11-21, #266; docs/plans/archive/the-list.md): the tabulator item, spawned in front storage, the
// list's hidden state and rolls, and printing it.

const STORAGE = "STORAGE_FRONT";
const config = testConfig({ manualCycles: true });
const room = (id: string) => ({ kind: "room", id }) as const;
const put = (s: GameState, id: string, type: string, at: ItemState["at"]) => void s.items.push({ id, type, at });
const tab = (s: GameState) => s.items.find((i) => i.id === "tab")!;
const on = (s: GameState, id: string) => offered(s, id).filter((a) => "item" in a && a.item === "tab");

/** p0 (human) and p1 (Mush) in front storage with the tabulator on the floor, after selection. */
function ship(): GameState {
  const s = createGame(makeSeats(2), config, 5);
  s.preselection = false;
  for (const p of s.players) p.room = STORAGE;
  player(s, "p0").role = "human";
  player(s, "p1").role = "mush";
  put(s, "tab", TABULATOR_ITEM, room(STORAGE));
  return s;
}

describe("the tabulator", () => {
  it("starts in front storage, exactly one per ship", () => {
    const s = createGame(makeSeats(2), testConfig({ startItems: DEFAULT_CONFIG.startItems }), 5);
    const tabs = s.items.filter((i) => i.type === TABULATOR_ITEM);
    expect(tabs).toHaveLength(1);
    expect(tabs[0]!.at).toEqual(room(STORAGE));
  });

  it("pins eMush's 12% repair chance and its flags", () => {
    expect(ITEM_TYPES[TABULATOR_ITEM]).toMatchObject({
      canTake: false,
      canDrop: false,
      canHide: false,
      canBreak: true,
      canBreakOnCycleChange: true,
      canBeSabotaged: true,
      repairChance: 0.12,
    });
    expect(ITEM_TYPES[TABULATOR_ITEM]!.dismantle).toBeUndefined();
    expect(ITEM_TYPES[TABULATOR_ITEM]!.heavy).toBeFalsy();
  });

  it("can't be taken, dismantled or sent by tube", () => {
    const s = ship();
    put(s, "in", "input_tube", room(STORAGE));
    put(s, "out", "output_tube", room("LABORATORY"));
    const types = on(s, "p0").map((a) => a.type);
    expect(types).not.toContain("take");
    expect(types).not.toContain("dismantle");
    expect(types).not.toContain("tube_transfer");
    for (const action of [{ type: "take", item: "tab" }, { type: "dismantle", item: "tab" }, { type: "tube_transfer", item: "tab" }] as Action[]) {
      expect(applyAction(s, "p0", action).ok).toBe(false);
    }
    expect(tab(s).at).toEqual(room(STORAGE));
  });

  it("can't be dropped or hidden, even if it somehow ends up carried", () => {
    const s = ship();
    tab(s).at = { kind: "player", id: "p0" };
    const types = on(s, "p0").map((a) => a.type);
    expect(types).not.toContain("drop");
    expect(types).not.toContain("hide");
    expect(applyAction(s, "p0", { type: "drop", item: "tab" }).ok).toBe(false);
    expect(applyAction(s, "p0", { type: "hide", item: "tab" }).ok).toBe(false);
  });

  it("can be sabotaged by a Mush, and repaired once broken", () => {
    const s = ship();
    expect(offered(s, "p1")).toContainEqual({ type: "sabotage", item: "tab" });
    expect(offered(s, "p0")).not.toContainEqual({ type: "repair", item: "tab" });
    tab(s).broken = true;
    expect(offered(s, "p0")).toContainEqual({ type: "repair", item: "tab" });
  });

  it("can break in a cycle-change breakdown", () => {
    const s = ship();
    s.config = {
      ...s.config,
      incidents: {
        ...s.config.incidents,
        rollPoints: 1,
        catalog: Object.fromEntries(Object.entries(s.config.incidents.catalog).map(([id, c]) => [id, { ...c, weight: id === "equipment_breakdown" ? 1 : 0 }])) as typeof s.config.incidents.catalog,
      },
    };
    for (const list of Object.values(s.equipment)) for (const e of list) e.broken = true;
    s.incidentPoints = 2;
    expect(nextCycle(s).items.find((i) => i.id === "tab")?.broken).toBe(true);
  });
});

/** 16 seats (p1 is Chun), selected at launch with p3 and p5 as the starting Mush. */
function crew(seed = 5): GameState {
  const s = createGame(makeSeats(16), { ...config, mushCount: 2 }, seed, { p3: "mush", p5: "mush" });
  expect(s.players.filter((p) => p.role === "mush").map((p) => p.id)).toEqual(["p3", "p5"]);
  return s;
}
const char = (s: GameState, id: string) => player(s, id).character;
const days = (s: GameState, n: number) => void (s.cycle += n * s.config.cyclesPerDay);

describe("THE List's state", () => {
  it("pins eMushpedia's 8 names", () => {
    expect(DEFAULT_CONFIG.theList.startNames).toBe(8);
  });

  it("records the starting Mush bodies and the cycle at selection, launched without pre-selection", () => {
    const s = crew();
    expect(s.theList).toMatchObject({ startingMush: [char(s, "p3"), char(s, "p5")], selectedAt: s.cycle, printed: false });
  });

  it("records nothing before selection in pre-selection, then the Mush chosen", () => {
    const rules = { ...PRESELECTION, seats: 8 };
    let s = createGame([], { ...config, preselection: rules }, 7);
    for (const seat of makeSeats(6)) s = must(joinShip(s, seat));
    expect(s.theList).toMatchObject({ startingMush: [], selectedAt: null });
    s = clone(s);
    s.cycle += 3;
    selectMush(s);
    expect(s.theList.startingMush).toEqual(s.players.filter((p) => p.role === "mush").map((p) => p.character));
    expect(s.theList.startingMush).toHaveLength(1);
    expect(s.theList.selectedAt).toBe(s.cycle);
  });

  it("has 8 names on selection day, one fewer per whole day, never below 1", () => {
    const s = crew();
    expect(listSize(s)).toBe(8);
    s.cycle += s.config.cyclesPerDay - 1;
    expect(listSize(s)).toBe(8);
    s.cycle += 1;
    expect(listSize(s)).toBe(7);
    days(s, 5);
    expect(listSize(s)).toBe(2);
    days(s, 1);
    expect(listSize(s)).toBe(1);
    days(s, 10);
    expect(listSize(s)).toBe(1);
  });

  it("is capped at the living names other than Chun", () => {
    const s = crew();
    for (const p of s.players) if (!["p1", "p2", "p3", "p4"].includes(p.id)) p.alive = false;
    expect(listSize(s)).toBe(3); // p2, p3, p4; Chun (p1) is never filler
    const list = rollList(s);
    expect([...list].sort()).toEqual([char(s, "p2"), char(s, "p3"), char(s, "p4")].sort());
  });

  it("guarantees a living starting Mush first, then a converted Mush, then Chun, then nobody", () => {
    const s = crew();
    expect(guaranteedGroup(s)).toEqual([char(s, "p3"), char(s, "p5")]);
    player(s, "p3").alive = false;
    expect(guaranteedGroup(s)).toEqual([char(s, "p5")]);
    // A converted Mush only once no starting Mush is left; Chun after them.
    player(s, "p1").role = "mush";
    player(s, "p7").role = "mush";
    expect(guaranteedGroup(s)).toEqual([char(s, "p5")]);
    player(s, "p5").alive = false;
    expect(guaranteedGroup(s)).toEqual([char(s, "p7")]);
    player(s, "p7").alive = false;
    expect(guaranteedGroup(s)).toEqual(["chun"]);
    days(s, 7);
    expect(rollList(s)).toEqual(["chun"]);
    player(s, "p1").role = "human";
    expect(guaranteedGroup(s)).toEqual([]);
    expect(listSize(s)).toBe(0);
    expect(rollList(s)).toEqual([]);
  });

  it("a starting Mush body cured or emptied by a Transfer no longer counts as one", () => {
    const s = crew();
    player(s, "p3").role = "human";
    expect(guaranteedGroup(s)).toEqual([char(s, "p5")]);
  });

  it("names the guaranteed Mush with distinct living filler, never Chun or the dead, and reshuffles", () => {
    const places = new Set<number>();
    for (let seed = 1; seed <= 40; seed++) {
      const s = crew(seed);
      player(s, "p9").alive = false;
      days(s, 2);
      const list = rollList(s);
      expect(list).toHaveLength(6);
      expect(new Set(list).size).toBe(6);
      expect(list.filter((c) => c === char(s, "p3") || c === char(s, "p5")).length).toBeGreaterThanOrEqual(1);
      expect(list).not.toContain("chun");
      expect(list).not.toContain(char(s, "p9"));
      places.add(list.findIndex((c) => c === char(s, "p3") || c === char(s, "p5")));
    }
    expect(places.size).toBeGreaterThan(1);
  });

  it("rolls only on its own stream, and repeats for the same seed", () => {
    const a = crew(9);
    const b = crew(9);
    const rng = a.rng;
    const list = rollList(a);
    expect(rollList(b)).toEqual(list);
    expect(a.rng).toEqual(rng);
    expect(a.theList.rng).not.toEqual(crew(9).theList.rng);
    expect(a.theList.printed).toBe(false);
  });

  it("is derived for a game stored before it existed, and loads unchanged once stored", () => {
    const s = crew();
    s.cycle += 5;
    const { config: _c, theList: _l, ...raw } = clone(s);
    const loaded = normalizeGame(raw, {}).theList;
    expect(loaded).toMatchObject({ startingMush: [char(s, "p3"), char(s, "p5")] as CharacterId[], selectedAt: 1, printed: false });
    const { config: _c2, ...stored } = clone(s);
    expect(normalizeGame(stored, {}).theList).toEqual(s.theList);
  });
});

/** `crew()` with p0 a Tracker and p2 not, both in front storage with the tabulator. */
function printShop(seed = 5): GameState {
  const s = crew(seed);
  for (const id of ["p0", "p2"]) player(s, id).room = STORAGE;
  player(s, "p0").skills = ["hunt"];
  player(s, "p2").skills = [];
  put(s, "tab", TABULATOR_ITEM, room(STORAGE));
  return s;
}
const PRINT = { type: "print_list", item: "tab" } as const;
const printed = (s: GameState) => s.items.find((i) => i.type === DOCUMENT_ITEM)!;
const lacks = (s: GameState, id: string) => option(s, id, PRINT)?.lacks;

describe("printing THE List", () => {
  it("is free (pinned at the original's 0 AP) and offered only to a Tracker at the tabulator", () => {
    const s = printShop();
    expect(DEFAULT_CONFIG.theList.cost.ap).toBe(0);
    expect(offered(s, "p0")).toContainEqual(PRINT);
    expect(costOf(s, "p0", PRINT)).toEqual({ ap: 0, mp: 0 });
    expect(option(s, "p2", PRINT)).toBeUndefined();
    expect(applyAction(s, "p2", PRINT).ok).toBe(false);
    player(s, "p0").room = "BRIDGE";
    expect(option(s, "p0", PRINT)).toBeUndefined();
  });

  it("is offered to Stephen once Apprentice copied Tracker", () => {
    const s = printShop();
    player(s, "p2").skills = ["apprentice"];
    player(s, "p0").skills = ["hunt"];
    const next = must(applyAction(s, "p2", { type: "apprenticeship", target: "p0", skill: "hunt" }));
    expect(offered(next, "p2")).toContainEqual(PRINT);
  });

  it("hands the printer a document naming today's list, logs it publicly, and spends the one print", () => {
    const s = printShop();
    days(s, 3);
    const expected = rollList(clone(s));
    const next = must(applyAction(s, "p0", PRINT));
    const doc = printed(next);
    expect(doc.at).toEqual({ kind: "player", id: "p0" });
    expect(doc.document).toEqual({ kind: "the_list", characters: expected });
    expect(expected).toHaveLength(5);
    expect(next.theList.printed).toBe(true);
    expect(next.log.at(-1)).toMatchObject({ key: "theListPrinted", params: { name: char(s, "p0") }, room: STORAGE });
    expect(next.rng).toEqual(s.rng);
  });

  it("drops the document on the floor when the printer's hands are full", () => {
    const s = printShop();
    for (let i = 0; i < 10; i++) put(s, `junk${i}`, "metal_scraps", { kind: "player", id: "p0" });
    expect(printed(must(applyAction(s, "p0", PRINT))).at).toEqual(room(STORAGE));
  });

  it("prints an empty list when no Mush is left, and that spends the print", () => {
    const s = printShop();
    for (const id of ["p3", "p5"]) player(s, id).alive = false;
    const next = must(applyAction(s, "p0", PRINT));
    expect(printed(next).document).toEqual({ kind: "the_list", characters: [] });
    expect(next.theList.printed).toBe(true);
  });

  it("is disabled with a reason after the print, also once the list is torn", () => {
    let s = must(applyAction(printShop(), "p0", PRINT));
    expect(lacks(s, "p0")).toEqual(["listPrinted"]);
    expect(applyAction(s, "p0", PRINT).ok).toBe(false);
    s = must(applyAction(s, "p0", { type: "tear", item: printed(s).id }));
    expect(lacks(s, "p0")).toEqual(["listPrinted"]);
    expect(applyAction(s, "p0", PRINT).ok).toBe(false);
  });

  it("is disabled with a reason on a broken tabulator", () => {
    const s = printShop();
    tab(s).broken = true;
    expect(lacks(s, "p0")).toEqual(["broken"]);
    expect(applyAction(s, "p0", PRINT).ok).toBe(false);
  });

  it("is disabled with a reason before Mush selection", () => {
    const s = ship();
    s.preselection = true;
    s.theList.selectedAt = null;
    player(s, "p0").skills = ["hunt"];
    expect(lacks(s, "p0")).toEqual(["mushNotSelected"]);
    expect(applyAction(s, "p0", PRINT).ok).toBe(false);
  });

  it("shows the names to whoever sees the document, and never the list's state", () => {
    const next = must(applyAction(printShop(), "p0", PRINT));
    const doc = printed(next);
    const mine = viewFor(next, "p0").inventory.find((i) => i.id === doc.id)!;
    expect(mine.document).toEqual(doc.document);
    for (const id of ["p0", "p2", "p3"]) for (const field of ["startingMush", "selectedAt", "printed\""]) expect(JSON.stringify(viewFor(next, id))).not.toContain(field);
  });
});
