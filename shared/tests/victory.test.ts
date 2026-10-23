import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { killPlayer } from "../src/death.ts";
import { moderateName } from "../src/moderation.ts";
import { createGame, viewFor } from "../src/rules.ts";
import { endGame, winnerOnArrival } from "../src/victory.ts";
import type { GameState } from "../src/types.ts";
import { makeSeats, player } from "./support.ts";

const seats = makeSeats(4, "others");
const config = { ...DEFAULT_CONFIG, mushCount: 1, startItems: [], startSkills: [] };

/** p0 is Mush, the rest human (and bots). Names are unique so a test can look for them in a serialized view. */
function ship(): GameState {
  const s = createGame(seats, config, 3);
  s.players.forEach((p, i) => {
    p.role = i === 0 ? "mush" : "human";
    p.name = `account-${p.id}`;
  });
  return s;
}

describe("arriving at Sol or Eden", () => {
  it("Mush win while any Mush lives, humans win once none do", () => {
    const s = ship();
    expect(winnerOnArrival(s)).toBe("mush");
    killPlayer(s, player(s, "p0"));
    expect(winnerOnArrival(s)).toBe("humans");
  });

  it("records how the game ended next to who won", () => {
    const s = ship();
    expect([s.ending, viewFor(s, "p1").ending]).toEqual([null, null]);
    endGame(s, "humans", "eden");
    expect([s.phase, s.winner, s.ending]).toEqual(["ended", "humans", "eden"]);
    expect(viewFor(s, "p1")).toMatchObject({ winner: "humans", ending: "eden" });
  });

  it("a death that leaves no human ends it as humans_dead", () => {
    const s = ship();
    for (const id of ["p1", "p2", "p3"]) killPlayer(s, player(s, id));
    expect([s.winner, s.ending]).toEqual(["mush", "humans_dead"]);
  });
});

describe("the end screen reveal", () => {
  it("no view has anyone's name or the crew list while the game runs", () => {
    const s = ship();
    for (const id of ["p0", "p1", "p2", "p3"]) {
      const v = viewFor(s, id);
      expect(v.crew).toBeNull();
      expect(JSON.stringify(v)).not.toContain("account-");
    }
  });

  it("every view lists every seat's name, character, role and fate once it has ended", () => {
    const s = ship();
    killPlayer(s, player(s, "p2"));
    endGame(s, "mush", "sol");
    for (const id of ["p0", "p1", "p2", "p3"]) {
      expect(viewFor(s, id).crew).toEqual(
        s.players.map((p) => ({ id: p.id, name: `account-${p.id}`, isBot: p.isBot, ...(p.botKind && { botKind: p.botKind }), character: p.character, role: p.role, alive: p.alive })),
      );
    }
    expect(viewFor(s, "p1").crew?.find((c) => c.id === "p3")?.isBot).toBe(true);
    expect(viewFor(s, "p1").crew?.find((c) => c.id === "p2")?.alive).toBe(false);
  });

  it("names go through moderation before they are shown", () => {
    const s = ship();
    player(s, "p1").name = "shit​ head";
    player(s, "p2").name = "​";
    endGame(s, "humans", "sol");
    const crew = viewFor(s, "p0").crew!;
    expect(crew.find((c) => c.id === "p1")?.name).toBe("**** head");
    expect(crew.find((c) => c.id === "p2")?.name).toBeNull();
  });
});

describe("moderateName", () => {
  it("keeps a name on one line and removes links", () => {
    expect(moderateName("  Ada\nLovelace ")).toBe("Ada Lovelace");
    expect(moderateName("www.spam.example")).toBe("[link removed]");
  });
});
