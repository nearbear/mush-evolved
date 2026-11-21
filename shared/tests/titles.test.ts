import { describe, expect, it } from "vitest";
import { CHARACTERS, type CharacterId } from "../src/characters.ts";
import { killPlayer } from "../src/death.ts";
import { createGame, viewFor } from "../src/rules.ts";
import { SUCCESSION, TITLE_IDS, successor } from "../src/titles.ts";
import type { GameState, Seat } from "../src/types.ts";
import { player, testConfig } from "./support.ts";

const config = testConfig({ manualCycles: true });

/** One seat per character, `p-<character>`. */
function crew(...characters: CharacterId[]): Seat[] {
  return characters.map((character) => ({ id: `p-${character}`, name: character, isBot: false, character }));
}
const everyone = (): GameState => createGame(crew(...CHARACTERS.map((c) => c.id)), config, 1);
const systemKeys = (s: GameState) => s.chat.filter((m) => m.channel === "global" && m.system).map((m) => m.system);

describe("titles", () => {
  it("has the three titles, each line holding the whole crew once, plus Andie and Derek", () => {
    expect(TITLE_IDS).toEqual(["commander", "neron_admin", "comms_officer"]);
    for (const id of TITLE_IDS) {
      const line = SUCCESSION[id];
      expect(new Set(line).size).toBe(line.length);
      expect([...line].sort()).toEqual([...CHARACTERS.map((c) => c.id), "andie", "derek"].sort());
    }
    expect([SUCCESSION.commander[0], SUCCESSION.neron_admin[0], SUCCESSION.comms_officer[0]]).toEqual(["jinsu", "janice", "paola"]);
  });

  it("issues each title to the first in its line when the game is created, Mush or not", () => {
    const s = createGame(crew(...CHARACTERS.map((c) => c.id)), config, 1, { "p-janice": "mush" });
    expect(player(s, "p-janice").role).toBe("mush");
    expect(s.titles).toEqual({ commander: "p-jinsu", neron_admin: "p-janice", comms_officer: "p-paola" });
    expect(systemKeys(s)).toEqual([]);
  });

  it("skips people who aren't aboard, Andie and Derek included", () => {
    const s = createGame(crew("chao", "chun", "eleesha", "frieda"), config, 1);
    expect(s.titles).toEqual({ commander: "p-chao", neron_admin: "p-eleesha", comms_officer: "p-eleesha" });
  });

  it("passes a title to the next in line when its holder dies, announced in crew chat", () => {
    const s = everyone();
    killPlayer(s, player(s, "p-jinsu"), "injury");
    expect(s.titles.commander).toBe("p-chao");
    expect(s.titles.neron_admin).toBe("p-janice");
    expect(systemKeys(s)).toContainEqual({ key: "titlePassed", params: { name: "chao", title: "commander" } });
    // Crew chat only, not the room log.
    expect(s.log.some((e) => e.key.startsWith("title"))).toBe(false);
  });

  it("skips the dead and those not aboard", () => {
    const s = everyone();
    killPlayer(s, player(s, "p-chao"), "injury");
    killPlayer(s, player(s, "p-jinsu"), "injury");
    // Derek is next after Chao but isn't aboard.
    expect(s.titles.commander).toBe("p-gioele");
  });

  it("doesn't announce anything when a death changes no holder", () => {
    const s = everyone();
    killPlayer(s, player(s, "p-ian"), "injury");
    expect(systemKeys(s).filter((m) => m?.key.startsWith("title"))).toEqual([]);
  });

  it("leaves a title vacant when the whole line is dead", () => {
    const s = createGame(crew("chao", "chun"), config, 1);
    killPlayer(s, player(s, "p-chao"), "injury");
    expect(s.titles.commander).toBe("p-chun");
    killPlayer(s, player(s, "p-chun"), "injury");
    expect(s.titles).toEqual({ commander: null, neron_admin: null, comms_officer: null });
    expect(systemKeys(s)).toContainEqual({ key: "titleVacant", params: { title: "commander" } });
  });

  it("shows every player the same holders and the line as it stands aboard", () => {
    const s = createGame(crew("chao", "chun", "eleesha", "frieda"), config, 1);
    killPlayer(s, player(s, "p-chao"), "injury");
    const views = s.players.map((p) => viewFor(s, p.id).titles);
    for (const v of views) expect(v).toEqual(views[0]);
    expect(views[0]).toEqual([
      { id: "commander", holder: "frieda", line: ["chao", "frieda", "eleesha", "chun"] },
      { id: "neron_admin", holder: "eleesha", line: ["eleesha", "frieda", "chun", "chao"] },
      { id: "comms_officer", holder: "eleesha", line: ["eleesha", "chun", "frieda", "chao"] },
    ]);
  });
});

// Eligibility through a predicate, so inactivity (#145) is covered before the status exists.
describe("successor", () => {
  const line = ["a", "b", "c"];
  const people = line.map((character) => ({ id: `p-${character}`, character }));
  const eligibleExcept =
    (...out: string[]) =>
    (p: { character: string }) =>
      !out.includes(p.character);

  it("keeps an eligible holder", () => {
    expect(successor(line, people, "p-b", eligibleExcept())).toBe("p-b");
  });

  it("passes on when the holder goes inactive, skipping the ineligible", () => {
    expect(successor(line, people, "p-a", eligibleExcept("a", "b"))).toBe("p-c");
  });

  it("doesn't hand it back to a former holder who becomes eligible again", () => {
    // a lost it to b; a is back.
    expect(successor(line, people, "p-b", eligibleExcept())).toBe("p-b");
  });

  it("returns it to a former holder through succession once the current holder loses it", () => {
    expect(successor(line, people, "p-b", eligibleExcept("b"))).toBe("p-a");
  });

  it("is vacant when nobody is eligible, and goes to the first eligible once someone is", () => {
    expect(successor(line, people, "p-a", eligibleExcept("a", "b", "c"))).toBeNull();
    expect(successor(line, people, null, eligibleExcept("a"))).toBe("p-b");
  });
});
