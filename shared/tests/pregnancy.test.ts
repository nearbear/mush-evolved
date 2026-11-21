import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { killPlayer } from "../src/death.ts";
import { swapMinds } from "../src/mind.ts";
import { createGame, viewFor } from "../src/rules.ts";
import { overheadStatuses } from "../src/statuses.ts";
import type { Action, GameState, PlayerId } from "../src/types.ts";
import { makeSeats, mustApply, nextDay, noCharacterModifiers, player, testConfig } from "./support.ts";

const seats = makeSeats(4);

function ship(overrides: Parameters<typeof testConfig>[0] = {}, seed = 3): GameState {
  const cfg = noCharacterModifiers(testConfig({ startMp: 0, ...overrides }));
  const s = createGame(seats, cfg, seed);
  s.players.forEach((p, i) => {
    p.role = i === 2 ? "mush" : "human";
    p.alpha = i === 2;
  });
  return s;
}

const bondBoth = (s: GameState, a: PlayerId, b: PlayerId) =>
  mustApply(mustApply(s, a, { type: "bond", target: b }), b, { type: "bond", target: a });
const dtt = (target: PlayerId): Action => ({ type: "dtt", target });
const stt = (target: PlayerId): Action => ({ type: "stt", target });

describe("pregnancy", () => {
  it("pins the default pregnancy numbers", () => {
    const { chance, deathMoraleLoss, mushExtraSpore } = DEFAULT_CONFIG.share.pregnancy;
    expect([chance, deathMoraleLoss, mushExtraSpore]).toEqual([0.08, 2, 1]);
  });

  it("rolls independently for each non-pregnant partner on DTT (everyone eligible, including Mush)", () => {
    let s = bondBoth(ship({ share: { pregnancy: { chance: 1 } } }), "p0", "p1");
    s = mustApply(s, "p0", dtt("p1"));
    expect(player(s, "p0").statuses).toContain("pregnant");
    expect(player(s, "p1").statuses).toContain("pregnant");

    // Mush can also get pregnant.
    let sMush = bondBoth(ship({ share: { pregnancy: { chance: 1 } } }), "p2", "p3");
    sMush = mustApply(sMush, "p2", dtt("p3"));
    expect(player(sMush, "p2").statuses).toContain("pregnant");
    expect(player(sMush, "p3").statuses).toContain("pregnant");

    // Never triggers when chance is 0.
    let sNone = bondBoth(ship({ share: { pregnancy: { chance: 0 } } }), "p0", "p1");
    sNone = mustApply(sNone, "p0", dtt("p1"));
    expect(player(sNone, "p0").statuses).not.toContain("pregnant");
    expect(player(sNone, "p1").statuses).not.toContain("pregnant");
  });

  it("never triggers on STT", () => {
    let s = bondBoth(ship({ share: { pregnancy: { chance: 1 } } }), "p0", "p1");
    s = mustApply(s, "p0", stt("p1"));
    expect(player(s, "p0").statuses).not.toContain("pregnant");
    expect(player(s, "p1").statuses).not.toContain("pregnant");
  });

  it("skips a partner who is already pregnant, while still rolling for the other", () => {
    let s = bondBoth(ship({ share: { pregnancy: { chance: 1 } } }), "p0", "p1");
    player(s, "p0").statuses.push("pregnant");
    s = mustApply(s, "p0", dtt("p1"));
    expect(player(s, "p0").statuses.filter((id) => id === "pregnant")).toHaveLength(1);
    expect(player(s, "p1").statuses).toContain("pregnant");
    // p0 only receives partnerBecamePregnant for p1, not a duplicate becamePregnant.
    expect(viewFor(s, "p0").log.filter((e) => e.key === "becamePregnant")).toHaveLength(0);
    expect(viewFor(s, "p0").log.filter((e) => e.key === "partnerBecamePregnant")).toHaveLength(1);
  });

  it("is a public status (roommates & overhead) with private logs to both partners only", () => {
    let s = bondBoth(ship({ share: { pregnancy: { chance: 1 } } }), "p0", "p1");
    s = mustApply(s, "p0", dtt("p1"));

    // Public to roommates and floated overhead.
    expect(viewFor(s, "p0").statuses).toContain("pregnant");
    expect(viewFor(s, "p3").players.find((p) => p.id === "p0")!.statuses).toContain("pregnant");
    expect(overheadStatuses(["pregnant"])).toEqual(["pregnant"]);

    // Hidden from people in other rooms.
    player(s, "p3").room = "SICK_BAY";
    expect(viewFor(s, "p3").players.find((p) => p.id === "p0")!.statuses).toEqual([]);

    // Logs are private to the two partners only.
    expect(viewFor(s, "p0").log).toContainEqual(expect.objectContaining({ key: "becamePregnant" }));
    expect(viewFor(s, "p0").log).toContainEqual(expect.objectContaining({ key: "partnerBecamePregnant", params: { name: player(s, "p1").character } }));
    expect(viewFor(s, "p1").log).toContainEqual(expect.objectContaining({ key: "becamePregnant" }));
    expect(viewFor(s, "p1").log).toContainEqual(expect.objectContaining({ key: "partnerBecamePregnant", params: { name: player(s, "p0").character } }));
    expect(JSON.stringify(viewFor(s, "p3").log)).not.toMatch(/Pregnant/);
  });

  it("gives a human an extra spore when made pregnant by a Mush", () => {
    const s0 = bondBoth(ship({ share: { pregnancy: { chance: 1 } } }), "p0", "p2");
    const { mushExtraSpore } = s0.config.share.pregnancy;
    const s = mustApply(s0, "p0", dtt("p2"));
    expect(player(s, "p0").statuses).toContain("pregnant");
    expect(s.contamination["p0"]).toBe(1 + mushExtraSpore);

    // If already pregnant, a subsequent DTT with a Mush adds only the normal 1 spore.
    const s2 = mustApply(nextDay(s), "p0", dtt("p2"));
    // 1 + mushExtraSpore (2) + 1 = 3 => converts to Mush at default capacity 3.
    expect(player(s2, "p0").role).toBe("mush");
  });

  it("costs every living crewmate morale when a pregnant crewmate dies (but not when traded)", () => {
    const s = ship({ share: { pregnancy: { chance: 1 } } });
    const loss = s.config.share.pregnancy.deathMoraleLoss;
    player(s, "p0").statuses.push("pregnant");
    const before = Object.fromEntries(s.players.map((p) => [p.id, p.morale]));

    killPlayer(s, player(s, "p0"), "assassinated");
    expect(player(s, "p0").alive).toBe(false);
    // Every living crewmate (human and Mush alike) loses deathMoraleLoss morale.
    for (const id of ["p1", "p2", "p3"]) {
      expect(player(s, id).morale).toBe(Math.max(0, before[id]! - loss));
      expect(viewFor(s, id).log).toContainEqual(expect.objectContaining({ key: "pregnantDeathMoraleLoss", params: { amount: loss } }));
    }

    // Traded away does not trigger the death morale penalty.
    const sTraded = ship();
    player(sTraded, "p0").statuses.push("pregnant");
    const beforeTraded = player(sTraded, "p1").morale;
    killPlayer(sTraded, player(sTraded, "p0"), "traded");
    expect(player(sTraded, "p1").morale).toBe(beforeTraded);
  });

  it("stays with the body across Body Transfer", () => {
    const s = ship();
    player(s, "p0").statuses.push("pregnant");
    swapMinds(s, player(s, "p2"), player(s, "p0"));
    expect(player(s, "p0").statuses).toContain("pregnant");
    expect(player(s, "p2").statuses).not.toContain("pregnant");
  });
});
