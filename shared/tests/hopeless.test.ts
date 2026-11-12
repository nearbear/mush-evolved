import { describe, expect, it } from "vitest";
import { gainMorale } from "../src/adjustStats.ts";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { newItemId } from "../src/items.ts";
import { createGame, viewFor } from "../src/rules.ts";
import { isHopeless } from "../src/statuses.ts";
import type { GameState } from "../src/types.ts";
import { makeSeats, mustApply, nextCycle, noHunters, noIncidents, player } from "./support.ts";

// Morale at 0 (owner, 2026-11-11): Hopeless, private, ended by any morale gain; a human still Hopeless when a cycle
// ends dies, a Mush never does, and each such death costs every living player `hopeless.deathMorale`.
// Seats: p0 human, p1 (Chun) human, p2 Mush. No incidents: a panic attack would move morale under the tests.
const config = noIncidents(noHunters({ ...DEFAULT_CONFIG, mushCount: 1, startInventory: [], startItems: [] }));
function ship(): GameState {
  const s = createGame(makeSeats(3), config, 5);
  for (const p of s.players) {
    p.role = p.id === "p2" ? "mush" : "human";
    p.room = "LABORATORY";
  }
  return s;
}
const give = (s: GameState, id: string, type: string): string => {
  const item = { id: newItemId(s), type, at: { kind: "player", id } as const };
  s.items.push(item);
  return item.id;
};

describe("Hopeless", () => {
  it("costs 1 morale per death", () => {
    expect(config.hopeless.deathMorale).toBe(1);
  });

  it("is the status of a living player at 0 morale, Mush included, and any gain ends it", () => {
    const s = ship();
    for (const id of ["p0", "p2"]) {
      player(s, id).morale = 0;
      expect(isHopeless(player(s, id))).toBe(true);
      expect(viewFor(s, id).statuses).toContain("hopeless");
    }
    gainMorale(s, player(s, "p0"), 1);
    expect(viewFor(s, "p0").statuses).not.toContain("hopeless");
  });

  it("is private: no one else sees it, even in the same room", () => {
    const s = ship();
    for (const p of s.players) p.morale = 0;
    for (const viewer of ["p0", "p1", "p2"]) {
      for (const other of viewFor(s, viewer).players.filter((o) => o.id !== viewer)) expect(other.statuses).not.toContain("hopeless");
    }
  });

  it("kills a human still Hopeless when the cycle ends", () => {
    const s0 = ship();
    player(s0, "p0").morale = 0;
    const s = nextCycle(s0);
    expect(player(s, "p0").alive).toBe(false);
  });

  it("spares a human whose morale rose before the cycle ended", () => {
    const s0 = ship();
    player(s0, "p0").morale = 0;
    gainMorale(s0, player(s0, "p0"), 1);
    expect(player(nextCycle(s0), "p0").alive).toBe(true);
  });

  it("never kills a Mush", () => {
    const s0 = ship();
    player(s0, "p2").morale = 0;
    const s = nextCycle(s0);
    expect(player(s, "p2").alive).toBe(true);
    expect(isHopeless(player(s, "p2"))).toBe(true);
  });

  it("gives a full cycle to anyone a cycle change takes to 0", () => {
    const s0 = ship();
    s0.cycle = s0.config.cyclesPerDay; // the day's last cycle: the next change is a day end
    const loss = s0.config.moralePerDay - s0.config.mankindOnlyHope.moraleLossCut;
    player(s0, "p0").morale = loss;
    const s1 = nextCycle(s0);
    expect(player(s1, "p0")).toMatchObject({ alive: true, morale: 0 });
    expect(player(nextCycle(s1), "p0").alive).toBe(false);
  });

  it("costs every living player, Mush included, deathMorale per death, at most one cycle down the chain", () => {
    const s0 = ship();
    const extra = createGame(makeSeats(5), config, 5).players.slice(3);
    for (const p of extra) {
      p.role = "human";
      s0.players.push(p);
    }
    player(s0, "p0").morale = 0;
    player(s0, "p3").morale = 0;
    player(s0, "p1").morale = 2; // two deaths take Chun to 0: Hopeless, but alive until the next cycle ends
    const mushBefore = player(s0, "p2").morale;
    const s1 = nextCycle(s0);
    expect(s1.players.filter((p) => !p.alive).map((p) => p.id)).toEqual(["p0", "p3"]);
    const cost = 2 * config.hopeless.deathMorale;
    expect(player(s1, "p2").morale).toBe(mushBefore - cost);
    expect(player(s1, "p1")).toMatchObject({ alive: true, morale: 0 });
    expect(player(nextCycle(s1), "p1").alive).toBe(false);
  });
});

describe("Mush and consumables' morale", () => {
  it("a Mush gains a banana's morale and loses a raw ration's, but nothing else", () => {
    const s0 = ship();
    const mush = player(s0, "p2");
    mush.morale = 5;
    const ap = mush.ap;
    const banana = give(s0, "p2", "fruit_banana");
    const s1 = mustApply(s0, "p2", { type: "consume", item: banana });
    expect(player(s1, "p2")).toMatchObject({ morale: 6, ap });
    player(s1, "p2").satiety = 0;
    const raw = give(s1, "p2", "uncooked_ration");
    expect(player(mustApply(s1, "p2", { type: "consume", item: raw }), "p2")).toMatchObject({ morale: 5, ap });
  });

  it("a Mush gets a drug's morale effect, like a human", () => {
    const s0 = ship();
    const type = Object.keys(s0.drugs)[0]!;
    s0.drugs[type] = { ...s0.drugs[type]!, morale: 2, ap: 3 };
    for (const id of ["p0", "p2"]) player(s0, id).morale = 5;
    const ap = player(s0, "p2").ap;
    const forMush = give(s0, "p2", type);
    const forHuman = give(s0, "p0", type);
    const s = mustApply(mustApply(s0, "p2", { type: "consume", item: forMush }), "p0", { type: "consume", item: forHuman });
    expect(player(s, "p2")).toMatchObject({ morale: 7, ap });
    expect(player(s, "p0").morale).toBe(7);
  });
});
