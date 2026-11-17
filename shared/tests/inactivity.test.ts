import { describe, expect, it } from "vitest";
import { CHARACTERS } from "../src/characters.ts";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { inactivityOf } from "../src/inactivity.ts";
import { dailyMoraleLoss } from "../src/modifiers.ts";
import { applyInput } from "../src/replay.ts";
import { applyAction, createGame, viewFor } from "../src/rules.ts";
import { overheadStatuses, STATUS_PUBLIC } from "../src/statuses.ts";
import type { GameState, PlayerId, Seat } from "../src/types.ts";
import { makeSeats, must, mustApply, noHunters, noIncidents, offered, option, pickSkill, player } from "./support.ts";

const config = noIncidents(noHunters({ ...DEFAULT_CONFIG, mushCount: 1, startInventory: [], startItems: [], startSkills: [] }));
const { inactiveAfterHours, superAfterHours } = config.inactivity;
const HOUR = 3_600_000;
/** The server time everyone in a fresh ship() was last seen. */
const T0 = 1_000_000_000_000;
/** `hours` after T0, in server ms. */
const h = (hours: number) => T0 + hours * HOUR;

/** p0 to p3 (Andie isn't aboard, so the crew's first characters), all in one room, all seen at T0. */
function ship(seats: Seat[] = makeSeats(4)): GameState {
  const s = createGame(seats, config, 7);
  for (const p of s.players) p.room = "LABORATORY";
  return must(seen(s, T0, ...s.players.map((p) => p.id)));
}

/** A clock cycle change at server time `at`, with everyone's AP gauge full (unless `ap` says otherwise). */
function cycleAt(s: GameState, at: number, ap = (_id: PlayerId) => s.config.maxAp): GameState {
  for (const p of s.players) p.ap = ap(p.id);
  return must(applyInput(s, { type: "cycle", at }));
}

const status = (s: GameState, id: PlayerId) => inactivityOf(player(s, id));
const seen = (s: GameState, at: number, ...players: PlayerId[]) => applyInput(s, { type: "seen", players, at });

describe("inactivity", () => {
  it("starts counting from the first clock cycle for a player the server hasn't reported yet", () => {
    let s = createGame(makeSeats(2), config, 7);
    expect(s.players.map((p) => [p.lastSeenAt, p.inactivity])).toEqual([[undefined, undefined], [undefined, undefined]]);
    s = cycleAt(s, T0);
    expect(s.players.map((p) => [p.lastSeenAt, p.inactivity])).toEqual([[T0, undefined], [T0, undefined]]);
    expect(status(cycleAt(s, h(inactiveAfterHours)), "p0")).toBe("inactive");
  });

  it("makes a player inactive at the first cycle change 24 hours after they were last seen, with a full AP gauge", () => {
    const s = ship();
    expect(status(cycleAt(s, h(inactiveAfterHours) - 1), "p0")).toBeNull();
    expect(status(cycleAt(s, h(inactiveAfterHours)), "p0")).toBe("inactive");
  });

  it("counts hours, not cycles", () => {
    // Eight cycle changes inside the 24 hours do nothing; a single one after them is enough.
    let s = ship();
    for (let i = 1; i <= 8; i++) s = cycleAt(s, h(i * 3) - 1);
    expect(status(s, "p0")).toBeNull();
    expect(status(cycleAt(ship(), h(inactiveAfterHours + 5)), "p0")).toBe("inactive");
  });

  it("needs a full AP gauge at the cycle change, checked after the AP gain", () => {
    const s = cycleAt(ship(), h(inactiveAfterHours), (id) => (id === "p1" ? 0 : config.maxAp));
    expect(status(s, "p0")).toBe("inactive");
    expect(status(s, "p1")).toBeNull();
    // One short of full, then the cycle's gain fills it.
    const t = cycleAt(ship(), h(inactiveAfterHours), () => config.maxAp - 1);
    expect(status(t, "p0")).toBe("inactive");
  });

  it("makes them super inactive at the first cycle change 48 hours after they were last seen", () => {
    let s = cycleAt(ship(), h(inactiveAfterHours));
    s = cycleAt(s, h(superAfterHours) - 1);
    expect(status(s, "p0")).toBe("inactive");
    s = cycleAt(s, h(superAfterHours));
    expect(status(s, "p0")).toBe("super_inactive");
  });

  it("goes straight to super inactive when the AP gauge only fills after 48 hours", () => {
    let s = cycleAt(ship(), h(inactiveAfterHours), () => 0);
    expect(status(s, "p0")).toBeNull();
    s = cycleAt(s, h(superAfterHours));
    expect(status(s, "p0")).toBe("super_inactive");
  });

  it("never makes a bot or the dead inactive", () => {
    const start = ship(makeSeats(4, "others"));
    player(start, "p0").alive = false;
    const s = cycleAt(start, h(superAfterHours + 1));
    expect(s.players.map((p) => p.inactivity)).toEqual([undefined, undefined, undefined, undefined]);
  });

  it("never makes anyone inactive on a cycle that everyone ended by being ready (single player)", () => {
    let s = createGame(makeSeats(2), { ...config, manualCycles: true }, 3);
    for (const p of s.players) p.lastSeenAt = 0;
    const cycle = s.cycle;
    for (const id of ["p0", "p1"]) s = must(applyAction(s, id, { type: "ready" }));
    expect(s.cycle).toBe(cycle + 1);
    expect(s.players.map((p) => p.inactivity)).toEqual([undefined, undefined]);
  });

  it("clears either status at once when the player connects, and counts again from then", () => {
    for (const hours of [inactiveAfterHours, superAfterHours]) {
      const away = cycleAt(ship(), h(hours));
      expect(status(away, "p0")).not.toBeNull();
      const s = must(seen(away, h(hours + 1), "p0"));
      expect(status(s, "p0")).toBeNull();
      expect(player(s, "p0").lastSeenAt).toBe(h(hours + 1));
      expect(status(s, "p1"), "only the player who connected").not.toBeNull();
      expect(status(cycleAt(s, h(hours + inactiveAfterHours)), "p0")).toBeNull();
      expect(status(cycleAt(s, h(hours + 1 + inactiveAfterHours)), "p0")).toBe("inactive");
    }
  });

  it("keeps a player connected through every cycle change active, and refuses a seen that changes nothing", () => {
    let s = ship();
    for (let at = h(3); at <= h(superAfterHours * 2); at += 3 * HOUR) s = cycleAt(must(seen(s, at, "p0")), at);
    expect(status(s, "p0")).toBeNull();
    expect(status(s, "p1")).toBe("super_inactive");
    expect(seen(s, h(superAfterHours * 2), "p0")).toEqual({ ok: false, error: "unchanged" });
  });

  it("makes a banned player's seat inactive at once, without the thresholds", () => {
    const s = must(applyInput(ship(), { type: "inactivate", player: "p0" }));
    expect(status(s, "p0")).toBe("inactive");
    expect(applyInput(s, { type: "inactivate", player: "p0" })).toEqual({ ok: false, error: "unchanged" });
  });

  it("is not announced, in the log or in chat", () => {
    const before = ship();
    const after = cycleAt(before, h(inactiveAfterHours));
    expect(status(after, "p0")).toBe("inactive");
    // Only a title changing hands is announced (crew chat); the log gets nothing.
    expect(after.log).toEqual(before.log);
    const back = must(seen(after, h(inactiveAfterHours + 1), "p0"));
    expect(back.log).toEqual(after.log);
  });

  it("is a public status, the same for a human and a Mush, floating over the head", () => {
    const s = cycleAt(ship(), h(inactiveAfterHours));
    for (const id of ["p0", "p1", "p2", "p3"] as const) {
      const other = id === "p0" ? "p1" : "p0";
      expect(viewFor(s, other).players.find((p) => p.id === id)!.statuses).toContain("inactive");
      expect(viewFor(s, id).statuses).toContain("inactive");
    }
    expect([STATUS_PUBLIC.inactive, STATUS_PUBLIC.super_inactive]).toEqual([true, true]);
    expect(overheadStatuses(["inactive", "super_inactive"])).toEqual(["inactive", "super_inactive"]);
    // What the rules keep about it never goes out.
    const json = JSON.stringify(viewFor(s, "p0"));
    expect(json).not.toContain("lastSeenAt");
    expect(json).not.toContain(String(T0));
    expect(json).not.toContain('"inactivity"');
  });
});

describe("inactivity and titles", () => {
  const everyone = (): GameState => {
    const seats = CHARACTERS.map((c) => ({ id: `p-${c.id}`, name: c.id, isBot: false, character: c.id }));
    const s = createGame(seats, config, 1);
    return must(seen(s, T0, ...s.players.map((p) => p.id)));
  };
  const others = (s: GameState) => s.players.filter((p) => p.id !== "p-jinsu").map((p) => p.id);

  it("passes the title on when its holder goes inactive, and doesn't give it back on their return", () => {
    let s = everyone();
    expect(s.titles.commander).toBe("p-jinsu");
    // Everyone else is still connected; Jin Su isn't.
    s = cycleAt(must(seen(s, h(inactiveAfterHours), ...others(s))), h(inactiveAfterHours));
    expect(status(s, "p-jinsu")).toBe("inactive");
    expect(s.titles.commander).toBe("p-chao");
    expect(s.chat.some((m) => m.system?.key === "titlePassed" && m.system.params?.name === "chao")).toBe(true);
    s = must(seen(s, h(inactiveAfterHours + 1), "p-jinsu"));
    expect(s.titles.commander).toBe("p-chao");
  });

  it("passes it on at once for a ban", () => {
    const s = must(applyInput(everyone(), { type: "inactivate", player: "p-janice" }));
    expect(s.titles.neron_admin).toBe("p-raluca");
  });

  it("gives a vacant title to a player who comes back", () => {
    let s = createGame(makeSeats(2), config, 1);
    const holder = s.titles.commander!;
    for (const id of ["p0", "p1"]) s = must(applyInput(s, { type: "inactivate", player: id }));
    expect(s.titles.commander).toBeNull();
    s = must(seen(s, T0, holder));
    expect(s.titles.commander).toBe(holder);
  });
});

describe("inactivity and Transfer", () => {
  it("offers no Transfer onto an inactive player, and refuses one", () => {
    // p0 is a Mush with Transfer; p1 is contaminated and has gone inactive.
    let s = createGame(makeSeats(4), config, 5, { p0: "mush" });
    for (const p of s.players) p.room = "LABORATORY";
    player(s, "p0").mushSkills.push("transfert");
    s.contamination.p1 = 1;
    const transfer = { type: "body_transfer", target: "p1" } as const;
    expect(offered(s, "p0")).toContainEqual(transfer);
    s = must(applyInput(s, { type: "inactivate", player: "p1" }));
    expect(offered(s, "p0")).not.toContainEqual(transfer);
    expect(applyAction(s, "p0", transfer).ok).toBe(false);
    // Back again, and the Transfer is possible.
    s = must(seen(s, T0, "p1"));
    expect(offered(s, "p0")).toContainEqual(transfer);
  });

  it("keeps each player's last connection with their mind, not the body", () => {
    // p0 (the Mush) was seen recently; p1, the victim, 20 hours ago.
    let s = ship();
    s = must(seen(s, h(20), "p0"));
    for (const p of s.players) p.role = p.id === "p0" ? "mush" : "human";
    player(s, "p0").mushSkills.push("transfert");
    s.contamination.p1 = 1;
    s = mustApply(s, "p0", { type: "body_transfer", target: "p1" });
    // The victim now plays p0's body and carries their own old time; the Mush, in p1's body, their recent one.
    expect(player(s, "p0").lastSeenAt).toBe(T0);
    expect(player(s, "p1").lastSeenAt).toBe(h(20));
    // So at 24 hours the victim goes inactive in their new body, and the Mush doesn't.
    s = cycleAt(s, h(24));
    expect([status(s, "p0"), status(s, "p1")]).toEqual(["inactive", null]);
  });
});

describe("inactivity's effects", () => {
  it("ends the Outcast status", () => {
    let s = pickSkill(ship(), "p0", "juge");
    s = mustApply(s, "p0", { type: "anathema", target: "p1" });
    expect(viewFor(s, "p1").statuses).toContain("outcast");
    s = must(applyInput(s, { type: "inactivate", player: "p1" }));
    expect(player(s, "p1").outcastBy).toBeUndefined();
    expect(viewFor(s, "p1").statuses).not.toContain("outcast");
  });

  it("makes a punch on an inactive target land 90% of the time", () => {
    const s = must(applyInput(ship(), { type: "inactivate", player: "p1" }));
    expect(option(s, "p0", { type: "punch", target: "p1" })!.chance).toBe(config.punch.inactiveTargetSuccessChance);
    expect(option(s, "p0", { type: "punch", target: "p2" })!.chance).toBe(config.punch.successChance);
  });

  it("makes Logistics skip super inactive crew, but not plain inactive ones", () => {
    // p0 has Logistics and stays connected; p1, the only roommate who could take the AP, is away `hours`.
    const give = (hours: number) => {
      let s = pickSkill(ship(makeSeats(2)), "p0", "logistics");
      s = cycleAt(must(seen(s, h(hours), "p0")), h(hours));
      expect(status(s, "p1")).not.toBeNull();
      const before = s.log.length;
      s = cycleAt(must(seen(s, h(hours + 3), "p0")), h(hours + 3), (id) => (id === "p1" ? 0 : config.maxAp));
      return { status: status(s, "p1"), gave: s.log.slice(before).some((e) => e.key === "logisticsGave") };
    };
    expect(give(inactiveAfterHours)).toEqual({ status: "inactive", gave: true });
    expect(give(superAfterHours)).toEqual({ status: "super_inactive", gave: false });
  });

  it("keeps an inactive player's passive effects, and hunger goes on", () => {
    // Seat p1 is Chun, with Mankind's Only Hope.
    let s = must(applyInput(ship(), { type: "inactivate", player: "p1" }));
    expect(dailyMoraleLoss(s)).toBe(config.moralePerDay - config.mankindOnlyHope.moraleLossCut);
    const human = s.players.find((p) => p.role === "human" && p.id !== "p1")!.id;
    s = must(applyInput(s, { type: "inactivate", player: human }));
    player(s, human).satiety = 2;
    s = cycleAt(s, h(1), () => 0);
    expect(player(s, human).satiety).toBeLessThan(2);
  });
});
