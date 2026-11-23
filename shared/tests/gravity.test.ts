// The Gravity Simulator's restart, alert and no-gravity effects (owner, 2026-11-22, gravity.ts).
import { describe, expect, it } from "vitest";
import { breakEquipment } from "../src/breakage.ts";
import { GRAVITY_SIMULATOR, noGravity } from "../src/gravity.ts";
import { INCIDENT_IDS, type IncidentId } from "../src/incidents.ts";
import { MICROWAVE_ITEM, SUPPORT_DRONE_ITEM } from "../src/items.ts";
import { mpGain, movementRules } from "../src/modifiers.ts";
import { normalizeGame } from "../src/normalizeState.ts";
import { PROJECT_COMPLETE } from "../src/projects.ts";
import { ReportEquipmentAction } from "../src/actions/report.ts";
import { applyAction, createGame, viewFor } from "../src/rules.ts";
import type { Equipment, GameConfig, GameState } from "../src/types.ts";
import { makeSeats, mustApply, nextCycle, offered, player, testConfig } from "./support.ts";

const LAB = "LABORATORY";

/** Repairs always succeed. */
const sureRepairs = (config: GameConfig): GameConfig => ({
  ...config,
  drones: { ...config.drones, maxChance: 1 },
  repair: { ...config.repair, chance: Object.fromEntries(Object.keys(config.repair.chance).map((k) => [k, 1])) },
});

/** A ship of 3 in the laboratory, where the Gravity Simulator is. */
function ship(config: GameConfig = sureRepairs(testConfig())): GameState {
  const s = createGame(makeSeats(3), config, 3);
  for (const p of s.players) p.room = LAB;
  return s;
}

const simulator = (s: GameState): Equipment => s.equipment[LAB]!.find((e) => e.type === GRAVITY_SIMULATOR)!;
const repair = (s: GameState) => ({ type: "repair" as const, equipment: simulator(s).id });
const restarted = (s: GameState) => s.chat.filter((m) => m.channel === "global" && m.system?.key === "gravityRestarted");

/** A broken simulator, repaired by p0. */
function repaired(): GameState {
  const s = ship();
  breakEquipment(s, simulator(s));
  return mustApply(s, "p0", repair(s));
}

describe("Gravity Simulator: restart", () => {
  it("is in the laboratory and starts working, with gravity", () => {
    const s = ship();
    expect(simulator(s).broken).toBeUndefined();
    expect(s.gravityRestarting).toBe(false);
    expect(noGravity(s)).toBe(false);
  });

  it("a Repair clears broken but gravity restarts until the next cycle change", () => {
    const s = repaired();
    expect(simulator(s).broken).toBeUndefined();
    expect(s.gravityRestarting).toBe(true);
    expect(noGravity(s)).toBe(true);
  });

  it("a drone's repair at the cycle change restarts it for the whole next cycle", () => {
    const s = ship();
    for (const p of s.players) p.room = "REFECTORY";
    s.items.push({
      id: `drone-${s.nextItemId++}`,
      type: SUPPORT_DRONE_ITEM,
      at: { kind: "room", id: LAB },
      drone: { name: "Robbie", serial: 42, upgrades: [], failures: { repair: 0, extinguish: 0, shoot: 0 } },
    });
    breakEquipment(s, simulator(s));
    const after = nextCycle(s);
    expect(simulator(after).broken).toBeUndefined();
    expect(after.gravityRestarting).toBe(true);
    expect(restarted(after)).toEqual([]);
  });

  it("each conversion still gives the penalty during the restart; the cycle-change gain is full", () => {
    const base = ship();
    const s = repaired();
    const p = player(base, "p0");
    const penalty = base.config.gravitySimulator.brokenMpPenalty;
    expect(movementRules(s, p).mpPerConversion).toBe(movementRules(base, p).mpPerConversion - penalty);
    expect(mpGain(s, p)).toBe(mpGain(base, p));
    const mp = player(s, "p1").mp;
    const after = nextCycle(s);
    expect(player(after, "p1").mp).toBe(Math.min(player(after, "p1").maxMp, mp + mpGain(base, p)));
  });

  it("ends at the next cycle change: gravity is back and NERON says so once, in global chat", () => {
    const s = repaired();
    expect(restarted(s)).toEqual([]);
    const once = nextCycle(s);
    expect(once.gravityRestarting).toBe(false);
    expect(noGravity(once)).toBe(false);
    expect(restarted(once)).toHaveLength(1);
    expect(restarted(once)[0]!.system).toEqual({ key: "gravityRestarted" });
    expect(movementRules(once, player(once, "p0")).mpPerConversion).toBe(movementRules(ship(), player(ship(), "p0")).mpPerConversion);
    expect(restarted(nextCycle(once))).toHaveLength(1);
  });

  it("breaking it again during the restart ends the restart: the ordinary broken penalty applies, and no NERON line", () => {
    const s = repaired();
    breakEquipment(s, simulator(s));
    expect(s.gravityRestarting).toBe(false);
    const base = ship();
    expect(mpGain(s, player(s, "p0"))).toBe(mpGain(base, player(base, "p0")) - base.config.gravitySimulator.brokenMpPenalty);
    expect(restarted(nextCycle(s))).toEqual([]);
  });

  it("a game stored before the restart loads with nothing restarting", () => {
    const stored = JSON.parse(JSON.stringify(ship())) as Partial<GameState>;
    delete stored.gravityRestarting;
    expect(normalizeGame(stored, {}).gravityRestarting).toBe(false);
  });
});

describe("Gravity Simulator: heavy items and tremors without gravity", () => {
  /** p0 carries a microwave (heavy). */
  function carrying(s: GameState): GameState {
    s.items.push({ id: `mw-${s.nextItemId++}`, type: MICROWAVE_ITEM, at: { kind: "player", id: "p0" } });
    return s;
  }

  it("a heavy item adds MP to moves with gravity, and nothing while broken or restarting", () => {
    const light = ship();
    const withGravity = carrying(ship());
    const extra = withGravity.config.heavy.mpPenalty;
    expect(movementRules(withGravity, player(withGravity, "p0")).mpPerMove).toBe(movementRules(light, player(light, "p0")).mpPerMove + extra);

    const broken = carrying(ship());
    breakEquipment(broken, simulator(broken));
    expect(movementRules(broken, player(broken, "p0")).mpPerMove).toBe(movementRules(light, player(light, "p0")).mpPerMove);

    const restarting = carrying(repaired());
    expect(movementRules(restarting, player(restarting, "p0")).mpPerMove).toBe(movementRules(light, player(light, "p0")).mpPerMove);
  });

  /** Only tremors, every cycle change. */
  const tremors = (config: GameConfig): GameConfig => ({
    ...config,
    incidents: {
      ...config.incidents,
      rollPoints: 1,
      catalog: Object.fromEntries(
        INCIDENT_IDS.map((i: IncidentId) => [i, { ...config.incidents.catalog[i], weight: i === "tremor" ? 1 : 0 }]),
      ) as GameConfig["incidents"]["catalog"],
    },
  });
  const keys = (s: GameState) => s.log.filter((e) => e.key.startsWith("tremor")).map((e) => e.key);

  it("a tremor's line depends on gravity; the damage doesn't", () => {
    const withGravity = ship(tremors(sureRepairs(testConfig())));
    withGravity.incidentPoints = 1;
    expect(keys(nextCycle(withGravity))).toEqual(["tremor"]);

    const broken = ship(tremors(sureRepairs(testConfig())));
    broken.incidentPoints = 1;
    breakEquipment(broken, simulator(broken));
    const after = nextCycle(broken);
    expect(keys(after)).toEqual(["tremorNoGravity"]);
    for (const p of after.players) expect(player(broken, p.id).hp - p.hp).toBeGreaterThanOrEqual(1);
  });

  it("a restart that ends at this cycle change gives that cycle change's tremor gravity", () => {
    const s = ship(tremors(sureRepairs(testConfig())));
    breakEquipment(s, simulator(s));
    const fixed = mustApply(s, "p0", repair(s));
    fixed.incidentPoints = 1;
    expect(keys(nextCycle(fixed))).toEqual(["tremor"]);
  });
});

describe("Gravity Simulator: never reported, always on the alert bar", () => {
  it("report_equipment is never offered for it, and is rejected as already reported", () => {
    const s = ship();
    breakEquipment(s, simulator(s));
    expect(offered(s, "p0")).not.toContainEqual({ type: "report_equipment", equipment: simulator(s).id });
    expect(applyAction(s, "p0", { type: "report_equipment", equipment: simulator(s).id }).ok).toBe(false);
    expect(new ReportEquipmentAction().validate(s, player(s, "p0"), { type: "report_equipment", equipment: simulator(s).id })).toBe("already_reported");
  });

  it("the Anomaly detector doesn't locate it either, but it counts as broken", () => {
    const s = ship();
    s.projects.EQUIPMENT_SENSOR = PROJECT_COMPLETE;
    breakEquipment(s, simulator(s));
    expect(viewFor(s, "p0").alerts).toMatchObject({ broken: 1, reports: [], gravity: "broken" });
  });

  it("alerts.gravity: broken, restarting, then null, for the living; null for the dead", () => {
    const s = ship();
    expect(viewFor(s, "p0").alerts.gravity).toBeNull();
    breakEquipment(s, simulator(s));
    expect(viewFor(s, "p0").alerts.gravity).toBe("broken");
    const fixed = mustApply(s, "p0", repair(s));
    expect(viewFor(fixed, "p1").alerts.gravity).toBe("restarting");
    expect(viewFor(nextCycle(fixed), "p1").alerts.gravity).toBeNull();
    player(fixed, "p2").alive = false;
    expect(viewFor(fixed, "p2").alerts).toEqual({ fires: 0, broken: 0, reports: [], gravity: null });
  });
});
