import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { RESOURCE_IDS } from "../src/resources.ts";
import { createGame, viewFor } from "../src/rules.ts";
import { makeSeats } from "./support.ts";

const seats = makeSeats(4);

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
