import { describe, expect, it } from "vitest";
import { CHARACTERS } from "./characters.ts";
import { DEFAULT_CONFIG } from "./config.ts";
import { RESOURCE_IDS } from "./resources.ts";
import { createGame, viewFor } from "./rules.ts";
import type { Seat } from "./types.ts";

const seats: Seat[] = Array.from({ length: 4 }, (_, i) => ({ id: `p${i}`, name: `Player ${i}`, isBot: false, character: CHARACTERS[i]!.id }));

describe("extra resources", () => {
  it("start at zero for everyone", () => {
    const s = createGame(seats, DEFAULT_CONFIG, 1);
    for (const p of s.players) {
      expect(Object.keys(p.resources).sort()).toEqual([...RESOURCE_IDS].sort());
      expect(Object.values(p.resources).every((n) => n === 0)).toBe(true);
    }
  });

  it("appear only in your own view", () => {
    const s = createGame(seats, DEFAULT_CONFIG, 1);
    s.players[1]!.resources.cook = 7;
    const view = viewFor(s, "p0");
    expect(view.you.resources.cook).toBe(0);
    expect(JSON.stringify(view.players)).not.toContain("resources");
  });
});
