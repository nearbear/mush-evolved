import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { SPORE_SUCKER_ITEM } from "../src/items.ts";
import { addDisease } from "../src/diseases.ts";
import { applyAction, createGame, viewFor } from "../src/rules.ts";
import type { GameConfig, GameState } from "../src/types.ts";
import { makeSeats, mustApply, nextCycle, noHunters, noIncidents, offered, option, player, withoutDrugs } from "./support.ts";

const base = noIncidents(noHunters({ ...DEFAULT_CONFIG, characterModifiers: {}, mushCount: 1, startInventory: [], startItems: [] }));
const clean: GameConfig = { ...base, sporeSucker: { ...base.sporeSucker, dirtyChance: 0 } };
const use = { type: "remove_spore" as const, item: "sucker" };
const STIFF_NECK = "stiff_neck_injury";

/** p0 and p1 human, p2 Mush, all in the lab; p0 carries the Spore Sucker and has 2 contamination. */
function ship(config: GameConfig = clean): GameState {
  const s = withoutDrugs(createGame(makeSeats(3), config, 1));
  s.players.forEach((p, i) => {
    p.room = "LABORATORY";
    p.role = i === 2 ? "mush" : "human";
  });
  s.contamination = { p0: 2 };
  s.items.push({ id: "sucker", type: SPORE_SUCKER_ITEM, at: { kind: "player", id: "p0" } });
  return s;
}

describe("spore sucker", () => {
  it("uses the owner's numbers", () => {
    const { cost, effect, dirtyChance } = DEFAULT_CONFIG.sporeSucker;
    expect([cost.ap, effect.damage, dirtyChance]).toEqual([1, 3, 0.25]);
  });

  it("removes one spore from a contaminated human, costs its AP, deals its damage and gives Stiff Neck", () => {
    const s = ship();
    const before = player(s, "p0");
    const r = mustApply(s, "p0", use);
    const p0 = player(r, "p0");
    expect(r.contamination.p0).toBe(1);
    expect(p0.ap).toBe(before.ap - clean.sporeSucker.cost.ap);
    expect(p0.hp).toBe(before.hp - clean.sporeSucker.effect.damage);
    expect(p0.modifiers).toContain(STIFF_NECK);
  });

  it("works from the floor too, and isn't used up", () => {
    const s = ship();
    s.items.find((i) => i.id === "sucker")!.at = { kind: "room", id: "LABORATORY" };
    const r = mustApply(s, "p1", use);
    expect(r.items.some((i) => i.id === "sucker")).toBe(true);
  });

  it("gives the same private log line whether or not a spore came out, and nobody else sees it", () => {
    const withSpore = mustApply(ship(), "p0", use);
    const s = ship();
    s.contamination = {};
    const without = mustApply(s, "p0", use);
    const line = (st: GameState) => st.log.filter((e) => e.key === "sporeSuckerUsed").map(({ key, params, room, visibleTo }) => ({ key, params, room, visibleTo }));
    expect(line(withSpore)).toEqual(line(without));
    expect(line(without)).toHaveLength(1);
    expect(without.contamination.p0).toBeUndefined();
    const others = JSON.stringify([viewFor(withSpore, "p1"), viewFor(withSpore, "p2")]);
    expect(others).not.toContain("sporeSuckerUsed");
  });

  it("leaves a Mush's spores alone but still hurts them", () => {
    const s = ship();
    s.items.find((i) => i.id === "sucker")!.at = { kind: "player", id: "p2" };
    player(s, "p2").spores = 2;
    const hp = player(s, "p2").hp;
    const r = mustApply(s, "p2", use);
    expect(player(r, "p2").spores).toBe(2);
    expect(player(r, "p2").hp).toBe(hp - clean.sporeSucker.effect.damage);
    expect(player(r, "p2").modifiers).toContain(STIFF_NECK);
  });

  it("can kill", () => {
    const s = ship();
    player(s, "p0").hp = clean.sporeSucker.effect.damage;
    expect(player(mustApply(s, "p0", use), "p0").alive).toBe(false);
  });

  it("is shown disabled while you have Stiff Neck, refused with the state unchanged, and usable once it wears off", () => {
    let s = ship();
    addDisease(s, player(s, "p0"), STIFF_NECK);
    expect(offered(s, "p0")).not.toContainEqual(use);
    expect(option(s, "p0", use)).toBeDefined();
    const before = JSON.stringify(s);
    expect(applyAction(s, "p0", use).ok).toBe(false);
    expect(JSON.stringify(s)).toBe(before);
    for (let i = 0; i < 4; i++) s = nextCycle(s);
    expect(offered(s, "p0")).toContainEqual(use);
  });

  it("is not offered without a reachable sucker", () => {
    const s = ship();
    s.items = s.items.filter((i) => i.id !== "sucker");
    expect(offered(s, "p0")).not.toContainEqual(use);
  });

  it("can make you dirty", () => {
    const s = ship({ ...base, sporeSucker: { ...base.sporeSucker, dirtyChance: 1 } });
    expect(player(mustApply(s, "p0", use), "p0").statuses).toContain("dirty");
  });
});
