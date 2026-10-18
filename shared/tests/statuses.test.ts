import { describe, expect, it } from "vitest";
import { CHARACTERS } from "../src/characters.ts";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { MODIFIERS } from "../src/modifiers.ts";
import { applyAction, createGame, legalIn, viewFor } from "../src/rules.ts";
import type { Action, GameState, PlayerId, Seat } from "../src/types.ts";

const seats: Seat[] = Array.from({ length: 4 }, (_, i) => ({ id: `p${i}`, name: `Player ${i}`, isBot: false, character: CHARACTERS[i]!.id }));
const config = { ...DEFAULT_CONFIG, mushCount: 1, startInventory: [], startItems: [], maxAp: 99, startAp: 50 };

/** p0 is Mush, the rest human. All in one room. */
function ship(): GameState {
  const s = createGame(seats, config, 3);
  s.players.forEach((p, i) => {
    p.role = i === 0 ? "mush" : "human";
    p.satietyZeroSince = i === 0 ? null : 1;
  });
  return s;
}
const player = (s: GameState, id: PlayerId) => s.players.find((p) => p.id === id)!;
function mustApply(state: GameState, id: PlayerId, action: Action): GameState {
  const r = applyAction(state, id, action);
  if (!r.ok) throw new Error(r.error);
  return r.state;
}
function nextCycle(s: GameState): GameState {
  for (const { id } of s.players) if (s.players.find((p) => p.id === id)!.alive) s = mustApply(s, id, { type: "ready" });
  return s;
}
function give(s: GameState, id: PlayerId, type: string): string {
  const itemId = `t${s.items.length}`;
  s.items.push({ id: itemId, type, at: { kind: "player", id } });
  return itemId;
}
const eat = (s: GameState, id: PlayerId, type: string) => mustApply(s, id, { type: "consume", item: give(s, id, type) });

describe("dirty", () => {
  it("is applied by extracting a spore, and visible to others in the room", () => {
    let s = ship();
    expect(viewFor(s, "p1").players.find((p) => p.id === "p0")!.statuses).toEqual([]);
    s = mustApply(s, "p0", { type: "extract_spore" });
    expect(viewFor(s, "p0").statuses).toContain("dirty");
    expect(viewFor(s, "p1").players.find((p) => p.id === "p0")!.statuses).toEqual(["dirty"]);
  });

  it("is not shown for people in other rooms", () => {
    let s = ship();
    s = mustApply(s, "p0", { type: "extract_spore" });
    player(s, "p0").room = "CORRIDOR_A";
    expect(viewFor(s, "p1").players.find((p) => p.id === "p0")!.statuses).toEqual([]);
  });
});

describe("satiety", () => {
  it("starts at 0 for humans, rises when eating, and falls 1 per cycle, never below 0", () => {
    let s = ship();
    expect(player(s, "p1").satiety).toBe(0);
    s = eat(s, "p1", "cooked_ration");
    expect(player(s, "p1").satiety).toBe(4);
    s = nextCycle(s);
    expect(player(s, "p1").satiety).toBe(3);
    for (let i = 0; i < 5; i++) s = nextCycle(s);
    expect(player(s, "p1").satiety).toBe(0);
  });

  it("makes coffee give 1 satiety", () => {
    expect(player(eat(ship(), "p1", "coffee"), "p1").satiety).toBe(1);
  });

  it("can drop faster through the satietyPerCycle modifier", () => {
    MODIFIERS["test_fast_metabolism"] = { satietyPerCycle: (n) => n + 1 };
    try {
      let s = eat(ship(), "p1", "cooked_ration");
      player(s, "p1").modifiers.push("test_fast_metabolism");
      s = nextCycle(s);
      expect(player(s, "p1").satiety).toBe(2);
    } finally {
      delete MODIFIERS["test_fast_metabolism"];
    }
  });

  it("gives Mush no satiety, no hunger, and lets them eat", () => {
    let s = eat(ship(), "p0", "cooked_ration");
    expect(player(s, "p0").satiety).toBe(0);
    s = eat(s, "p0", "cooked_ration");
    for (let i = 0; i < 30; i++) s = nextCycle(s);
    expect(viewFor(s, "p0").statuses).toEqual([]);
    expect(player(s, "p0").hp).toBe(config.startHp);
  });
});

describe("full belly", () => {
  it("starts at 3 satiety, blocks eating, and is private", () => {
    let s = eat(ship(), "p1", "cooked_ration");
    expect(viewFor(s, "p1").statuses).toContain("full_belly");
    const id = give(s, "p1", "coffee");
    expect(applyAction(s, "p1", { type: "consume", item: id }).ok).toBe(false);
    expect(legalIn(viewFor(s, "p1"))).not.toContainEqual({ type: "consume", item: id });
    expect(viewFor(s, "p2").players.find((p) => p.id === "p1")!.statuses).toEqual([]);
    s = nextCycle(s); // 3 satiety: still full
    expect(viewFor(s, "p1").statuses).toContain("full_belly");
    s = nextCycle(s); // 2: eating allowed again
    expect(viewFor(s, "p1").statuses).not.toContain("full_belly");
    expect(applyAction(s, "p1", { type: "consume", item: id }).ok).toBe(true);
  });
});

describe("hungry", () => {
  it("starts exactly 24 cycles after satiety reaches 0, is private, and costs 1 HP per cycle", () => {
    let s = ship(); // 0 satiety since cycle 1
    for (let i = 0; i < 22; i++) s = nextCycle(s); // cycle 23
    expect(viewFor(s, "p1").statuses).not.toContain("hungry");
    s = nextCycle(s); // cycle 24
    expect(viewFor(s, "p1").statuses).not.toContain("hungry");
    s = nextCycle(s); // cycle 25
    expect(viewFor(s, "p1").statuses).toContain("hungry");
    expect(player(s, "p1").hp).toBe(config.startHp - 1);
    expect(viewFor(s, "p2").players.find((p) => p.id === "p1")!.statuses).toEqual([]);
    s = nextCycle(s);
    expect(player(s, "p1").hp).toBe(config.startHp - 2);
  });

  it("is cured by any consumable, and the count restarts when satiety returns to 0", () => {
    let s = ship();
    for (let i = 0; i < 24; i++) s = nextCycle(s); // cycle 25: hungry
    s = eat(s, "p1", "coffee"); // satiety 1
    expect(viewFor(s, "p1").statuses).not.toContain("hungry");
    s = nextCycle(s); // back to 0 on cycle 26
    expect(player(s, "p1").satietyZeroSince).toBe(26);
    expect(viewFor(s, "p1").statuses).not.toContain("hungry");
    const hp = player(s, "p1").hp;
    for (let i = 0; i < 23; i++) s = nextCycle(s);
    expect(player(s, "p1").hp).toBe(hp);
    s = nextCycle(s); // cycle 50 = 26 + 24
    expect(viewFor(s, "p1").statuses).toContain("hungry");
  });

  it("kills at 0 HP", () => {
    let s = ship();
    player(s, "p1").hp = 1;
    for (let i = 0; i < 28; i++) s = nextCycle(s);
    expect(player(s, "p1").hp).toBe(0);
    expect(player(s, "p1").alive).toBe(false);
  });
});

describe("status hidden information", () => {
  it("other players' views carry no satiety and no private status", () => {
    let s = eat(ship(), "p1", "cooked_ration");
    const v = viewFor(s, "p2");
    expect(JSON.stringify(v.players)).not.toMatch(/full_belly|satiety/);
    expect(v.statuses).toEqual([]);
  });
});
