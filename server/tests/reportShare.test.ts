import { applyInput, DEFAULT_CONFIG, startGame, viewFor, type GameState } from "@mush2/shared";
import { describe, expect, it } from "vitest";
import { GoalBot } from "../src/bots.ts";
import type { BotMemory } from "../src/bots/goals/types.ts";
import { newFireMemory } from "../src/bots/fireShare.ts";
import { formatItemLine, newItemMemory, observeItems, parseItemLine, roomsHolding, SHARED_ITEMS } from "../src/bots/itemShare.ts";
import { newJumpMemory } from "../src/bots/planetShare.ts";
import { exploredOn, exploredSectors, formatReportShare, newReportMemory, observeReports, parseReportShare } from "../src/bots/reportShare.ts";
import { newExpeditionEndMemory } from "../src/bots/expeditionShare.ts";
import { newMoraleMemory } from "../src/bots/moraleShare.ts";
import { newTankMemory } from "../src/bots/tankShare.ts";
import { newFuelMemory } from "../src/bots/fuelShare.ts";
import { newBedMemory } from "../src/bots/bedShare.ts";
import { seats } from "../src/testing/fakes.ts";

const config = { ...DEFAULT_CONFIG, manualCycles: true };
const freshGame = (): GameState => startGame({ seats: seats(0), config, seed: 1, rulesVersion: "test" });

const makeMemory = (): BotMemory => ({
  reserve: 2,
  scripted: true,
  language: "en",
  ended: new Set(),
  today: new Set(),
  once: new Set(),
  visited: new Set(),
  shrinks: new Set(),
  fullBeds: new Map(),
  beds: newBedMemory(),
  lastExpedition: null,
  asteroidsOnly: null,
  items: newItemMemory(),
  fires: newFireMemory(),
  tanks: newTankMemory(),
  morale: newMoraleMemory(),
  expeditionEnd: newExpeditionEndMemory(),
  fuel: newFuelMemory(),
  combustion: null,
  holdSince: null,
  jump: newJumpMemory(),
  reports: newReportMemory(),
  heading: null,
  cancelHold: false,
  justJumped: false,
  failedReason: null,
  roll: () => 0,
});

describe("expedition gear sharing (itemShare.ts)", () => {
  const gear = ["space_suit", "rope", "quad_compass", "white_flag", "drill"] as const;

  it("includes expedition gear in SHARED_ITEMS and parses its lines", () => {
    for (const type of gear) {
      expect(SHARED_ITEMS).toContain(type);
      expect(parseItemLine(formatItemLine({ type, room: "LABORATORY", present: true }))).toEqual({ type, room: "LABORATORY", present: true });
      expect(parseItemLine(formatItemLine({ type, room: "CORRIDOR_A", present: false }))).toEqual({ type, room: "CORRIDOR_A", present: false });
    }
  });

  it("shares and learns where expedition gear lies", () => {
    const game = freshGame();
    const botA = game.players[0]!.id;
    const botB = game.players[1]!.id;
    const room = "CORRIDOR_A";
    game.items = game.items.filter((i) => i.at.kind !== "room" || (i.at.id !== room && i.at.id !== "REFECTORY"));
    game.items.push({ id: "suit-1", type: "space_suit", at: { kind: "room", id: room } });
    game.players[0]!.room = room;
    game.players[1]!.room = "REFECTORY";

    const memA = makeMemory();
    const post = observeItems(viewFor(game, botA), memA);
    expect(post).toEqual({ type: "chat", channel: "global", text: `Item: space_suit in ${room}` });
    expect(roomsHolding(memA, "space_suit")).toEqual([room]);

    const said = applyInput(game, { ...post!, by: botA });
    expect(said.ok).toBe(true);
    if (!said.ok) return;

    const memB = makeMemory();
    expect(observeItems(viewFor(said.state, botB), memB)).toBeNull();
    expect(roomsHolding(memB, "space_suit")).toEqual([room]);
  });
});

describe("expedition report sharing (reportShare.ts)", () => {
  it("formats and parses shared expedition reports in the bots' format", () => {
    const text = formatReportShare("Fugunys", ["OXYGEN", "FOREST", "HYDROCARBON"]);
    expect(text).toBe("Planet: Fugunys\nExplored: OXYGEN, FOREST, HYDROCARBON");
    expect(parseReportShare(text)).toEqual({ planet: "Fugunys", explored: ["OXYGEN", "FOREST", "HYDROCARBON"] });

    const empty = formatReportShare("Fugunys", []);
    expect(empty).toBe("Planet: Fugunys\nExplored: none");
    expect(parseReportShare(empty)).toEqual({ planet: "Fugunys", explored: [] });

    for (const bad of ["Planet: Fugunys", "Planet: \nExplored: none", "Planet: Fugunys\nExplored: NOT_A_TAG", "Planet: Fugunys\nExplored: none\nextra"]) {
      expect(parseReportShare(bad)).toBeNull();
    }
  });

  it("extracts explored sectors while skipping landing and again events", () => {
    const explored = exploredSectors([
      { sector: "LANDING", kind: "nothing" },
      { sector: "FOREST", kind: "again" },
      { sector: "OXYGEN", kind: "oxygen", amount: 2 },
      { sector: "FOREST", kind: "nothing" },
    ]);
    expect(explored).toEqual(["OXYGEN", "FOREST"]);
  });

  it("shares a finished expedition report once and folds sharedReports into BotMemory for the Commander", () => {
    const game = freshGame();
    const crewId = game.players[0]!.id;
    const commanderId = game.players[1]!.id;
    game.titles.commander = commanderId;
    game.expeditions.push({
      id: "ex-1",
      members: [crewId],
      crew: [game.players[0]!.character],
      planet: "Fugunys",
      events: [
        { sector: "LANDING", kind: "nothing" },
        { sector: "OXYGEN", kind: "oxygen", amount: 2 },
        { sector: "FOREST", kind: "nothing" },
      ],
    });
    game.nextExpeditionId = 2;

    // Still away: nothing to share yet.
    const awayGame = structuredClone(game);
    awayGame.expedition = { report: "ex-1", planet: "p-1", sectors: [1], nextAt: 999999, carried: {}, sabotaged: false, sabotageNext: false, hp: {}, ship: null };
    const crewMem = makeMemory();
    expect(observeReports(viewFor(awayGame, crewId), crewMem)).toBeNull();

    // Returned: shares once, doesn't repeat.
    const post = observeReports(viewFor(game, crewId), crewMem);
    expect(post).toEqual({
      type: "shareReport",
      report: "ex-1",
      text: "Planet: Fugunys\nExplored: OXYGEN, FOREST",
    });
    expect(observeReports(viewFor(game, crewId), crewMem)).toBeNull();

    const shared = applyInput(game, { ...post!, by: crewId });
    expect(shared.ok).toBe(true);
    if (!shared.ok) return;

    // Commander reads view.sharedReports and updates BotMemory without double-counting.
    const cmdMem = makeMemory();
    expect(observeReports(viewFor(shared.state, commanderId), cmdMem)).toBeNull();
    expect(exploredOn(cmdMem, "Fugunys")).toEqual(["OXYGEN", "FOREST"]);
    expect(observeReports(viewFor(shared.state, commanderId), cmdMem)).toBeNull();
    expect(exploredOn(cmdMem, "Fugunys")).toEqual(["OXYGEN", "FOREST"]);

    // A second expedition to the same planet appends its explored sectors; human free text is ignored.
    let next = applyInput(shared.state, {
      type: "shareReport",
      report: "ex-1",
      text: "weird bugs out there",
      by: crewId,
    });
    expect(next.ok).toBe(true);
    if (!next.ok) return;
    next.state.expeditions.push({
      id: "ex-2",
      members: [crewId],
      crew: [game.players[0]!.character],
      planet: "Fugunys",
      events: [{ sector: "HYDROCARBON", kind: "fuel", amount: 2 }],
    });
    const second = applyInput(next.state, {
      type: "shareReport",
      report: "ex-2",
      text: "Planet: Fugunys\nExplored: HYDROCARBON",
      by: crewId,
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    observeReports(viewFor(second.state, commanderId), cmdMem);
    expect(exploredOn(cmdMem, "Fugunys")).toEqual(["OXYGEN", "FOREST", "HYDROCARBON"]);
  });

  it("integrates with GoalBot decideAction, snapshot, and restore", async () => {
    const game = freshGame();
    const crewId = game.players[0]!.id;
    const commanderId = game.players[1]!.id;
    game.titles.commander = commanderId;
    game.expeditions.push({
      id: "ex-1",
      members: [crewId],
      crew: [game.players[0]!.character],
      planet: "Pilulune",
      events: [{ sector: "RUINS", kind: "nothing" }],
    });

    const crewBot = new GoalBot(1, 2, []);
    await crewBot.decideAction(viewFor(game, crewId));
    const social = crewBot.takeSocial();
    expect(social).toEqual({
      type: "shareReport",
      report: "ex-1",
      text: "Planet: Pilulune\nExplored: RUINS",
    });

    const shared = applyInput(game, { ...social!, by: crewId });
    expect(shared.ok).toBe(true);
    if (!shared.ok) return;

    const cmdBot = new GoalBot(2, 2, []);
    await cmdBot.decideAction(viewFor(shared.state, commanderId));
    const mem = (cmdBot as unknown as { memory: BotMemory }).memory;
    expect(exploredOn(mem, "Pilulune")).toEqual(["RUINS"]);

    const stored = structuredClone(cmdBot.snapshot());
    const restored = new GoalBot(9, 2, []);
    expect(restored.restore(stored)).toBe(true);
    expect(restored.snapshot()).toEqual(cmdBot.snapshot());
    expect(exploredOn((restored as unknown as { memory: BotMemory }).memory, "Pilulune")).toEqual(["RUINS"]);

    // Older snapshot without `reports` restores with empty `reports`.
    const { reports: _, ...older } = stored;
    const filled = new GoalBot(9, 2, []);
    expect(filled.restore(older)).toBe(true);
    expect(exploredOn((filled as unknown as { memory: BotMemory }).memory, "Pilulune")).toEqual([]);
  });
});
