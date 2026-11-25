import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { addDisease, vomit } from "../src/diseases.ts";
import { soil } from "../src/dirt.ts";
import { cycleChanged } from "../src/modifiers.ts";
import { createGame, viewFor } from "../src/rules.ts";
import type { GameConfig, GameState, PlayerState } from "../src/types.ts";
import { makeSeats, mustApply, pickSkill, player, testConfig } from "./support.ts";

// Owner, 2026-11-25, as eMush's super-dirty dirt: disease symptoms and coming back from an expedition get past the
// stainproof apron and the Stickler skill; an action's dirt doesn't.

const config = testConfig();

type Guard = "apron" | "stickler";
const GUARDS: Guard[] = ["apron", "stickler"];

function guarded(guard: Guard, game: GameState, p: PlayerState): void {
  if (guard === "apron") game.items.push({ id: "apron1", type: "apron", at: { kind: "player", id: p.id }, broken: false });
  else p.skills.push("stickler");
}

const humanGame = (cfg: GameConfig = config): GameState => {
  const s = createGame(makeSeats(4), cfg, 3);
  for (const p of s.players) p.role = "human";
  return s;
};

describe("super-dirty dirt", () => {
  for (const guard of GUARDS) {
    it(`soil: ${guard} blocks ordinary dirt but not super-dirty dirt`, () => {
      const s = humanGame();
      const p = player(s, "p0");
      guarded(guard, s, p);
      soil(s, p);
      expect(p.statuses).not.toContain("dirty");
      expect(s.log.at(-1)?.key).toBe(guard === "apron" ? "apronBlockedDirty" : "sticklerBlockedDirty");
      soil(s, p, { superDirty: true });
      expect(p.statuses).toContain("dirty");
      expect(s.log.at(-1)?.key).toBe("becomeDirty");
    });

    it(`a disease symptom (gastroenteritis at a cycle change) dirties a ${guard} carrier`, () => {
      const s = humanGame();
      const p = player(s, "p0");
      guarded(guard, s, p);
      addDisease(s, p, "gastroenteritis_disease");
      cycleChanged(s);
      expect(p.statuses).toContain("dirty");
    });

    it(`vomit dirties a ${guard} carrier`, () => {
      const s = humanGame();
      const p = player(s, "p0");
      for (const q of s.players) if (q !== p) q.room = "BRIDGE";
      p.room = "REFECTORY";
      guarded(guard, s, p);
      vomit(s, p);
      expect(p.statuses).toContain("dirty");
    });
  }

  it("super-dirty dirt fires the onDirty hooks (Open Air Brain kills by sepsis)", () => {
    const s = humanGame();
    const p = player(s, "p0");
    guarded("apron", s, p);
    addDisease(s, p, "open_air_brain_injury");
    soil(s, p, { superDirty: true });
    expect(p.alive).toBe(false);
  });

  it("an already-dirty player is left as is, with no new log", () => {
    const s = humanGame();
    const p = player(s, "p0");
    p.statuses.push("dirty");
    const logs = s.log.length;
    soil(s, p, { superDirty: true });
    expect(s.log.length).toBe(logs);
  });

  it("an action's dirt is still blocked by an apron or Stickler", () => {
    const cfg: GameConfig = { ...config, snoop: { ...DEFAULT_CONFIG.snoop, dirtyChance: 1, injuryChance: 0 } };
    for (const guard of GUARDS) {
      let s = createGame(makeSeats(3), cfg, 5);
      for (const p of s.players) p.role = "human";
      player(s, "p0").room = "STORAGE_FRONT";
      s = pickSkill(s, "p0", "metaliciste");
      player(s, "p0").ap = 5;
      guarded(guard, s, player(s, "p0"));
      const after = mustApply(s, "p0", { type: "snoop" });
      expect(player(after, "p0").statuses).not.toContain("dirty");
      expect(viewFor(after, "p0").log.map((e) => e.key)).toContain(guard === "apron" ? "apronBlockedDirty" : "sticklerBlockedDirty");
    }
  });
});
