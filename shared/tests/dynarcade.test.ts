import { describe, expect, it } from "vitest";
import { ACTIONS } from "../src/actions.ts";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { DYNARCADE_EQUIPMENT } from "../src/equipment.ts";
import { PROJECT_COMPLETE } from "../src/projects.ts";
import { applyAction, createGame, viewFor } from "../src/rules.ts";
import type { Action, GameState } from "../src/types.ts";
import { costOf, makeSeats, mustApply, offered, option, player, setProgress } from "./support.ts";

const BAY = "SPACESHIP_BAY_AA";
const DYNARCADE_ID = `${BAY}:${DYNARCADE_EQUIPMENT}`;
const work: Action = { type: "project", equipment: "NEXUS_ROOM:NERON_CORE", project: "CALL_OF_DIRTY" };
const play: Action = { type: "play_arcade", equipment: DYNARCADE_ID };

function ship(progress = PROJECT_COMPLETE - 1): GameState {
  const s = createGame(makeSeats(3, "others"), DEFAULT_CONFIG, 7);
  s.players[0]!.room = "NEXUS_ROOM";
  s.players[1]!.room = BAY;
  s.players[2]!.room = BAY;
  setProgress(s, { project: "CALL_OF_DIRTY" }, progress);
  return s;
}

function builtShip(seed = 7): GameState {
  const s = ship(PROJECT_COMPLETE - 1);
  s.rng = seed;
  return mustApply(s, "p0", work);
}

describe("Dynarcade project (CALL_OF_DIRTY)", () => {
  it("pins the confirmed config numbers", () => {
    const d = DEFAULT_CONFIG.project.dynarcade;
    expect([d.room, d.cost.ap, d.successChance, d.failureMultiplier, d.morale, d.injuryChance]).toEqual([
      "SPACESHIP_BAY_AA", 1, 0.33, 1.5, 2, 0.33,
    ]);
  });

  it("hides the Dynarcade from starting equipment until CALL_OF_DIRTY completes", () => {
    const s = ship(0);
    expect(s.equipment[BAY]!.some((e) => e.type === DYNARCADE_EQUIPMENT)).toBe(false);
    expect(viewFor(s, "p1").roomEquipment.some((e) => e.type === DYNARCADE_EQUIPMENT)).toBe(false);
    expect(offered(s, "p1")).not.toContainEqual(play);
    expect(applyAction(s, "p1", play)).toEqual({ ok: false, error: "illegal_action" });

    const partial = mustApply(s, "p0", work);
    expect(partial.equipment[BAY]!.some((e) => e.type === DYNARCADE_EQUIPMENT)).toBe(false);

    const done = builtShip();
    expect(done.equipment[BAY]!.filter((e) => e.type === DYNARCADE_EQUIPMENT)).toEqual([{ id: DYNARCADE_ID, type: DYNARCADE_EQUIPMENT }]);
    expect(viewFor(done, "p1").roomEquipment.some((e) => e.id === DYNARCADE_ID)).toBe(true);
    expect(offered(done, "p1")).toContainEqual(play);
  });

  it("costs 1 AP, gives +2 morale on win, raises odds x1.5 per consecutive miss, and logs privately", () => {
    const base = builtShip();
    const p1Before = player(base, "p1");
    p1Before.morale = 4;

    expect(costOf(base, "p1", play)).toEqual({ ap: DEFAULT_CONFIG.project.dynarcade.cost.ap, mp: 0 });
    expect(option(base, "p1", play)).toMatchObject({
      chance: DEFAULT_CONFIG.project.dynarcade.successChance,
      injury: DEFAULT_CONFIG.project.dynarcade.injuryChance,
    });

    // Force a miss then a win by adjusting config for deterministic checks, and check real streak math.
    const missConfig = { ...base.config, project: { ...base.config.project, dynarcade: { ...base.config.project.dynarcade, successChance: 0, injuryChance: 0 } } };
    const missed = mustApply({ ...base, config: missConfig }, "p1", play);
    expect(player(missed, "p1").ap).toBe(p1Before.ap - DEFAULT_CONFIG.project.dynarcade.cost.ap);
    expect(player(missed, "p1").morale).toBe(4);
    expect(missed.failureStreaks.p1?.play_arcade).toBe(1);
    expect(missed.log.at(-1)).toMatchObject({ key: "playArcadeLose", visibleTo: ["p1"] });
    // Roommate p2 does not see p1's private Dynarcade log.
    expect(viewFor(missed, "p2").log.some((e) => e.key === "playArcadeLose")).toBe(false);

    // Next attempt's chance reflects the x1.5 streak multiplier.
    const withStreak = { ...missed, config: base.config };
    expect(ACTIONS.play_arcade.chance(withStreak, player(withStreak, "p1"), play)).toBeCloseTo(
      DEFAULT_CONFIG.project.dynarcade.successChance * DEFAULT_CONFIG.project.dynarcade.failureMultiplier,
    );

    // Winning restores morale, resets the streak, and logs privately.
    const winConfig = { ...base.config, project: { ...base.config.project, dynarcade: { ...base.config.project.dynarcade, successChance: 1, injuryChance: 0 } } };
    const won = mustApply({ ...missed, config: winConfig }, "p1", play);
    expect(player(won, "p1").morale).toBe(4 + DEFAULT_CONFIG.project.dynarcade.morale);
    expect(won.failureStreaks.p1?.play_arcade).toBeUndefined();
    expect(won.log.at(-1)).toMatchObject({ key: "playArcadeWin", visibleTo: ["p1"] });
    expect(viewFor(won, "p2").log.some((e) => e.key === "playArcadeWin")).toBe(false);
  });

  it("can injure the player (2 HP) at injuryChance", () => {
    const base = builtShip();
    const hpBefore = player(base, "p1").hp;
    const hurtConfig = { ...base.config, project: { ...base.config, dynarcade: { ...base.config.project.dynarcade, successChance: 0, injuryChance: 1 } } };
    const after = mustApply({ ...base, config: hurtConfig }, "p1", play);
    expect(player(after, "p1").hp).toBe(hpBefore - 2);
    expect(after.log.some((e) => e.key === "randomInjury" && e.visibleTo.includes("p1"))).toBe(true);
  });

  it("lets Mush play, refuses when broken, and refuses outside Alpha Bay 2", () => {
    const s = builtShip();
    s.players[1]!.role = "mush";
    expect(offered(s, "p1")).toContainEqual(play);

    const broken = structuredClone(s);
    broken.equipment[BAY]!.find((e) => e.id === DYNARCADE_ID)!.broken = true;
    expect(offered(broken, "p1")).not.toContainEqual(play);
    expect(applyAction(broken, "p1", play)).toEqual({ ok: false, error: "illegal_action" });

    // p0 is in NEXUS_ROOM, not Alpha Bay 2.
    expect(offered(s, "p0")).not.toContainEqual(play);
    expect(applyAction(s, "p0", play)).toEqual({ ok: false, error: "illegal_action" });

    // Not enough AP leaves state unchanged.
    const brokeAp = { ...s, players: s.players.map((p) => (p.id === "p1" ? { ...p, ap: 0 } : p)) };
    expect(applyAction(brokeAp, "p1", play).ok).toBe(false);
  });
});
