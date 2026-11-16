import { describe, expect, it } from "vitest";
import { advanceNeron } from "../src/comms.ts";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { addDisease } from "../src/diseases.ts";
import { PROJECT_COMPLETE, PROJECT_IDS, projectStatus } from "../src/projects.ts";
import { createGame, viewFor } from "../src/rules.ts";
import type { Action, GameState } from "../src/types.ts";
import { makeSeats, mustApply, noIncidents, player, setProgress } from "./support.ts";

const config = {
  ...DEFAULT_CONFIG,
  maxAp: 99,
  startAp: 10,
  shower: { ...DEFAULT_CONFIG.shower, injuryChance: 0 },
};
const shower: Action = { type: "shower", equipment: "BEDROOM_A:SHOWER" };
const workCore = (project: string): Action => ({ type: "project", equipment: "NEXUS_ROOM:NERON_CORE", project });

function game(seed = 1): GameState {
  const s = noIncidents(createGame(makeSeats(4, "others"), structuredClone(config), seed));
  for (const p of s.players) {
    p.role = p.id === "p0" ? "mush" : "human";
    p.room = "BEDROOM_A";
  }
  return s;
}

describe("Thalasso (THALASSO)", () => {
  it("is fully implemented with 25% independent rolls for +1 HP, +1 morale, +2 MP", () => {
    expect(projectStatus("THALASSO")).toBe("full");
    expect(DEFAULT_CONFIG.project.thalasso).toEqual({ chance: 0.25, hp: 1, morale: 1, mp: 2 });
  });

  it("does nothing until THALASSO is complete", () => {
    for (const progress of [0, PROJECT_COMPLETE - 1]) {
      for (let seed = 1; seed <= 30; seed++) {
        const s = game(seed);
        if (progress > 0) s.projects.THALASSO = progress;
        const p = player(s, "p1");
        p.hp = 5;
        p.morale = 3;
        p.mp = 2;
        const after = mustApply(s, "p1", shower);
        const pAfter = player(after, "p1");
        expect(pAfter.hp).toBe(5);
        expect(pAfter.morale).toBe(3);
        expect(pAfter.mp).toBe(2);
      }
    }
  });

  it("rolls each boon independently at 25% so 0, 1, 2, or all 3 can trigger on one shower", () => {
    let hpHits = 0;
    let moraleHits = 0;
    let mpHits = 0;
    const boonCounts = new Set<number>();
    const runs = 200;

    for (let seed = 1; seed <= runs; seed++) {
      const s = game(seed);
      s.projects.THALASSO = PROJECT_COMPLETE;
      const p = player(s, "p1");
      p.hp = 5;
      p.morale = 3;
      p.mp = 2;

      const after = mustApply(s, "p1", shower);
      const pAfter = player(after, "p1");
      const gotHp = pAfter.hp - 5;
      const gotMorale = pAfter.morale - 3;
      const gotMp = pAfter.mp - 2;

      expect([0, config.project.thalasso.hp]).toContain(gotHp);
      expect([0, config.project.thalasso.morale]).toContain(gotMorale);
      expect([0, config.project.thalasso.mp]).toContain(gotMp);

      let count = 0;
      if (gotHp > 0) {
        hpHits += 1;
        count += 1;
      }
      if (gotMorale > 0) {
        moraleHits += 1;
        count += 1;
      }
      if (gotMp > 0) {
        mpHits += 1;
        count += 1;
      }
      boonCounts.add(count);
    }

    expect(hpHits).toBeGreaterThan(25);
    expect(moraleHits).toBeGreaterThan(25);
    expect(mpHits).toBeGreaterThan(25);
    expect(boonCounts.has(0)).toBe(true);
    expect(boonCounts.has(1)).toBe(true);
    expect(boonCounts.has(2)).toBe(true);
    expect(boonCounts.has(3)).toBe(true);
  });

  it("caps HP, morale, and MP at the player's maximums", () => {
    for (let seed = 1; seed <= 100; seed++) {
      const s = game(seed);
      s.projects.THALASSO = PROJECT_COMPLETE;
      const p = player(s, "p1");
      p.hp = p.maxHp;
      p.morale = p.maxMorale;
      p.mp = p.maxMp - 1;

      const after = mustApply(s, "p1", shower);
      const pAfter = player(after, "p1");
      expect(pAfter.hp).toBe(pAfter.maxHp);
      expect(pAfter.morale).toBe(pAfter.maxMorale);
      expect(pAfter.mp).toBeLessThanOrEqual(pAfter.maxMp);
    }
  });

  it("logs triggered boons privately to the showering player and never leaks them to others", () => {
    let sawAllThree = false;
    for (let seed = 1; seed <= 300; seed++) {
      const s = game(seed);
      s.projects.THALASSO = PROJECT_COMPLETE;
      const p = player(s, "p1");
      p.hp = 5;
      p.morale = 3;
      p.mp = 2;

      const after = mustApply(s, "p1", shower);
      const pAfter = player(after, "p1");
      const actorLog = viewFor(after, "p1").log;
      const otherLog = viewFor(after, "p2").log;

      expect(actorLog.some((e) => e.key === "thalassoHp")).toBe(pAfter.hp > 5);
      expect(actorLog.some((e) => e.key === "gainMorale")).toBe(pAfter.morale > 3);
      expect(actorLog.some((e) => e.key === "thalassoMp")).toBe(pAfter.mp > 2);

      expect(otherLog.some((e) => e.key === "thalassoHp" || e.key === "gainMorale" || e.key === "thalassoMp")).toBe(false);

      if (pAfter.hp > 5 && pAfter.morale > 3 && pAfter.mp > 2) {
        sawAllThree = true;
        break;
      }
    }
    expect(sawAllThree).toBe(true);
  });

  it("gives no boons to Mush players, even with Water Resistant", () => {
    for (let seed = 1; seed <= 80; seed++) {
      const s = game(seed);
      s.projects.THALASSO = PROJECT_COMPLETE;
      const mush = player(s, "p0");
      mush.skills = ["water_resistant"];
      mush.hp = 5;
      mush.morale = 3;
      mush.mp = 2;

      const after = mustApply(s, "p0", shower);
      const mAfter = player(after, "p0");
      expect(mAfter.hp).toBe(5);
      expect(mAfter.morale).toBe(3);
      expect(mAfter.mp).toBe(2);
      const log = viewFor(after, "p0").log;
      expect(log.some((e) => e.key === "thalassoHp" || e.key === "gainMorale" || e.key === "thalassoMp")).toBe(false);
    }
  });

  it("does not grant boons if a skin-inflammation shower kills the human", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const s = game(seed);
      s.projects.THALASSO = PROJECT_COMPLETE;
      const p = player(s, "p1");
      p.hp = 3;
      p.morale = 3;
      p.mp = 2;
      addDisease(s, p, "skin_inflammation_disease");

      const after = mustApply(s, "p1", shower);
      const pAfter = player(after, "p1");
      expect(pAfter.alive).toBe(false);
      expect(pAfter.hp).toBe(0);
      expect(pAfter.morale).toBe(3);
      expect(pAfter.mp).toBe(2);
    }
  });

  it("activates when worked to 100% at the core or completed by a NERON update", () => {
    const s = game();
    player(s, "p1").room = "NEXUS_ROOM";
    s.projectDeck = ["THALASSO", ...s.projectDeck.filter((id) => id !== "THALASSO")];
    setProgress(s, { project: "THALASSO" }, PROJECT_COMPLETE - 1);

    const done = mustApply(s, "p1", workCore("THALASSO"));
    expect(done.projects.THALASSO).toBe(PROJECT_COMPLETE);

    const commsGame = game();
    for (const id of PROJECT_IDS) if (id !== "THALASSO") commsGame.projects[id] = PROJECT_COMPLETE;
    commsGame.comms.neron.progress = 0;
    expect(advanceNeron(commsGame, 100)).toBe("THALASSO");
    expect(commsGame.projects.THALASSO).toBe(PROJECT_COMPLETE);
  });
});
