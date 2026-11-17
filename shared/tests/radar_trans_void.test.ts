import { describe, expect, it } from "vitest";
import { advanceNeron, callRebel, rollRebelGain } from "../src/comms.ts";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { PROJECT_COMPLETE, PROJECT_IDS, projectStatus } from "../src/projects.ts";
import { applyAction, createGame } from "../src/rules.ts";
import { addSignal, type Signal } from "../src/signals.ts";
import type { Action, GameState } from "../src/types.ts";
import { clone, costOf, makeSeats, must, mustApply, player, setProgress } from "./support.ts";

const config = DEFAULT_CONFIG;
const TERMINAL = "COMMAND_CENTER:COM_CENTER";
const contactSol: Action = { type: "contact_sol", equipment: TERMINAL };
const decodeWolf: Action = { type: "decode_rebel", equipment: TERMINAL, base: "WOLF" };
const workCore: Action = { type: "project", equipment: "NEXUS_ROOM:NERON_CORE", project: "RADAR_TRANS_VOID" };

function ship(linked = false): GameState {
  const s = createGame(makeSeats(3, "others"), structuredClone(config), 7);
  for (const p of s.players) p.room = "COMMAND_CENTER";
  s.titles.comms_officer = "p0";
  s.comms.linked = linked;
  return s;
}

function withMerchant(s: GameState): Signal {
  const m = addSignal(s, "merchant", s.cycle + config.merchants.stayCycles, {
    merchant: {
      kind: "transport",
      event: "HUMAN_VS_FUEL",
      deals: [{ give: [{ kind: "fuel", count: 1 }], receive: [{ kind: "item", item: "oxy_capsule", count: 2 }] }],
    },
  });
  m.step = "offers";
  return m;
}

describe("Spatial wave radar (RADAR_TRANS_VOID)", () => {
  it("is marked as fully implemented", () => {
    expect(projectStatus("RADAR_TRANS_VOID")).toBe("full");
  });

  it("pins the AP discount to 1", () => {
    expect(config.project.radarTransVoid.apDiscount).toBe(1);
  });

  it("reduces contact_sol cost by 1 AP once complete (from 2 to 1 AP), keeping comp-point free and antenna surcharge intact", () => {
    const s = ship(false);
    expect(costOf(s, "p0", contactSol)!.ap).toBe(config.comms.sol.cost.ap);

    // Incomplete project gives no discount
    s.projects.RADAR_TRANS_VOID = PROJECT_COMPLETE - 1;
    expect(costOf(s, "p0", contactSol)!.ap).toBe(config.comms.sol.cost.ap);

    // Complete project reduces cost by 1 AP
    s.projects.RADAR_TRANS_VOID = PROJECT_COMPLETE;
    expect(costOf(s, "p0", contactSol)!.ap).toBe(config.comms.sol.cost.ap - config.project.radarTransVoid.apDiscount);
    expect(costOf(s, "p0", contactSol)!.ap).toBe(1);

    const apBefore = player(s, "p0").ap;
    const after = must(applyAction(s, "p0", contactSol));
    expect(player(after, "p0").ap).toBe(apBefore - 1);

    // Computer point still pays for it at 0 AP
    const compGame = clone(s);
    player(compGame, "p0").resources.comp = 1;
    expect(costOf(compGame, "p0", contactSol)).toEqual({ ap: 0, mp: 0, paidBy: "comp" });

    // Broken Stellar antenna still adds its surcharge on top of the discounted cost
    const broken = clone(s);
    const antenna = broken.equipment.MOTOR_ROOM!.find((e) => e.id === "MOTOR_ROOM:STELLAR_ANTENNA")!;
    antenna.broken = true;
    expect(costOf(broken, "p0", contactSol)!.ap).toBe(
      config.comms.sol.cost.ap - config.project.radarTransVoid.apDiscount + config.antenna.brokenApSurcharge,
    );
  });

  it("reduces diplomacy trade (close_deal) cost by 1 AP once complete (from 2 to 1 AP)", () => {
    const s = ship(true);
    const m = withMerchant(s);
    const close: Action = { type: "close_deal", equipment: TERMINAL, signal: m.id, deal: 0 };

    expect(costOf(s, "p0", close)!.ap).toBe(config.merchants.deal.cost.ap);

    // Incomplete project gives no discount
    s.projects.RADAR_TRANS_VOID = PROJECT_COMPLETE - 1;
    expect(costOf(s, "p0", close)!.ap).toBe(config.merchants.deal.cost.ap);

    // Complete project reduces cost by 1 AP
    s.projects.RADAR_TRANS_VOID = PROJECT_COMPLETE;
    expect(costOf(s, "p0", close)!.ap).toBe(config.merchants.deal.cost.ap - config.project.radarTransVoid.apDiscount);
    expect(costOf(s, "p0", close)!.ap).toBe(1);

    const apBefore = player(s, "p0").ap;
    const after = must(applyAction(s, "p0", close));
    expect(player(after, "p0").ap).toBe(apBefore - 1);
  });

  it("discards the lower of the two rolls when decoding a rebel base, stacking with Rebel and Kivanç bonuses", () => {
    let sawHigher = false;
    for (let seed = 1; seed < 50; seed++) {
      const baseGame = ship(true);
      baseGame.rng = seed;
      const avgGain = rollRebelGain(clone(baseGame), player(baseGame, "p0"));

      const radarGame = clone(baseGame);
      radarGame.projects.RADAR_TRANS_VOID = PROJECT_COMPLETE;
      const radarGain = rollRebelGain(clone(radarGame), player(radarGame, "p0"));

      expect(radarGain).toBeGreaterThanOrEqual(avgGain);
      expect(radarGain).toBeLessThanOrEqual(config.comms.rebel.gainMax);
      if (radarGain > avgGain) sawHigher = true;

      // Stacks with Rebel skill and Kivanç Terzi
      player(radarGame, "p0").skills.push("rebel");
      expect(rollRebelGain(clone(radarGame), player(radarGame, "p0"))).toBe(radarGain * (1 + config.comms.rebel.rebelBonus));
      radarGame.comms.xyloph.push("KIVANC_TERZI_CONTACT");
      expect(rollRebelGain(clone(radarGame), player(radarGame, "p0"))).toBe(
        radarGain * (1 + config.comms.rebel.rebelBonus + config.comms.rebel.kivancBonus),
      );
    }
    expect(sawHigher).toBe(true);
  });

  it("applies the higher roll when executing decode_rebel", () => {
    const s = ship(true);
    callRebel(s, "WOLF");
    // Find a seed where the two rolls differ so radarGain > avgGain
    let chosenSeed = 1;
    for (let seed = 1; seed < 100; seed++) {
      const a = clone(s);
      a.rng = seed;
      const b = clone(a);
      b.projects.RADAR_TRANS_VOID = PROJECT_COMPLETE;
      if (rollRebelGain(b, player(b, "p0")) > rollRebelGain(a, player(a, "p0"))) {
        chosenSeed = seed;
        break;
      }
    }
    s.rng = chosenSeed;
    const withoutRadar = must(applyAction(clone(s), "p0", decodeWolf));
    const withRadarState = clone(s);
    withRadarState.projects.RADAR_TRANS_VOID = PROJECT_COMPLETE;
    const withRadar = must(applyAction(withRadarState, "p0", decodeWolf));

    const progWithout = withoutRadar.signals.list[0]!.rebel!.progress;
    const progWith = withRadar.signals.list[0]!.rebel!.progress;
    expect(progWith).toBeGreaterThan(progWithout);
  });

  it("activates when worked to 100% at the core or completed by a NERON update", () => {
    const s = ship(false);
    for (const p of s.players) p.room = "NEXUS_ROOM";
    setProgress(s, { project: "RADAR_TRANS_VOID" }, PROJECT_COMPLETE - 1);
    const done = mustApply(s, "p0", workCore);
    expect(done.projects.RADAR_TRANS_VOID).toBe(PROJECT_COMPLETE);
    for (const p of done.players) p.room = "COMMAND_CENTER";
    expect(costOf(done, "p0", contactSol)!.ap).toBe(1);

    const commsGame = ship(false);
    for (const id of PROJECT_IDS) if (id !== "RADAR_TRANS_VOID") commsGame.projects[id] = PROJECT_COMPLETE;
    commsGame.comms.neron.progress = 0;
    expect(advanceNeron(commsGame, 100)).toBe("RADAR_TRANS_VOID");
    expect(costOf(commsGame, "p0", contactSol)!.ap).toBe(1);
  });
});
