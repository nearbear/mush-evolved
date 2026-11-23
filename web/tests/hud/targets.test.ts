import type {
  Action,
  ActionOption,
  EquipmentView,
  ItemView,
  OtherPlayerView,
  PlayerView,
  Target,
  YouView,
} from "@mush2/shared";
import { describe, expect, it } from "vitest";
import { sampleView } from "../../src/designKit/sampleView.ts";
import { attackWeapon, optionsOn, resolveTarget, sameTarget } from "../../src/hud/targets.ts";

function mockView(overrides: Partial<PlayerView> = {}): PlayerView {
  return {
    you: {
      id: "p0",
      character: "jinsu",
      room: "bridge",
      alive: true,
      ap: 10,
      mp: 10,
      role: "human",
      skills: [],
      titles: [],
      current: null,
      queue: [],
    } as unknown as YouView,
    players: [],
    roomEquipment: [],
    inventory: [],
    roomItems: [],
    actions: [],
    ...overrides,
  } as unknown as PlayerView;
}

describe("sameTarget", () => {
  it("returns false if either target is null or undefined", () => {
    expect(sameTarget(null, null)).toBe(false);
    expect(sameTarget({ kind: "player", id: "p0" }, null)).toBe(false);
    expect(sameTarget(null, { kind: "player", id: "p0" })).toBe(false);
  });

  it("returns false if target kinds differ", () => {
    expect(sameTarget({ kind: "player", id: "p0" }, { kind: "equipment", id: "p0" })).toBe(false);
    expect(sameTarget({ kind: "item", id: "x" }, { kind: "player", id: "x" })).toBe(false);
    expect(sameTarget({ kind: "equipment", id: "eq1" }, { kind: "item", id: "eq1" })).toBe(false);
  });

  it("returns false if target ids differ", () => {
    expect(sameTarget({ kind: "player", id: "p0" }, { kind: "player", id: "p1" })).toBe(false);
    expect(sameTarget({ kind: "item", id: "item-1" }, { kind: "item", id: "item-2" })).toBe(false);
    expect(sameTarget({ kind: "equipment", id: "eq-a" }, { kind: "equipment", id: "eq-b" })).toBe(false);
  });

  it("returns true when kind and id match", () => {
    expect(sameTarget({ kind: "player", id: "p0" }, { kind: "player", id: "p0" })).toBe(true);
    expect(sameTarget({ kind: "equipment", id: "terminal-1" }, { kind: "equipment", id: "terminal-1" })).toBe(true);
    expect(sameTarget({ kind: "item", id: "wrench-1" }, { kind: "item", id: "wrench-1" })).toBe(true);
  });
});

describe("resolveTarget", () => {
  describe("player", () => {
    it("resolves the current player (you)", () => {
      const view = mockView();
      const resolved = resolveTarget(view, { kind: "player", id: "p0" });
      expect(resolved).toEqual({ kind: "player", person: view.you });
    });

    it("resolves another player present in the same room", () => {
      const other = { id: "p1", character: "frieda", room: "bridge" } as OtherPlayerView;
      const view = mockView({ players: [other] });
      const resolved = resolveTarget(view, { kind: "player", id: "p1" });
      expect(resolved).toEqual({ kind: "player", person: other });
    });

    it("returns null for a player not in the view (different room or non-existent)", () => {
      const other = { id: "p1", character: "frieda", room: "bridge" } as OtherPlayerView;
      const view = mockView({ players: [other] });
      expect(resolveTarget(view, { kind: "player", id: "p2" })).toBeNull();
      expect(resolveTarget(view, { kind: "player", id: "" })).toBeNull();
    });
  });

  describe("equipment", () => {
    it("resolves equipment in the room", () => {
      const equipment = { id: "COMM_CENTER", type: "COMMUNICATIONS_CENTER" } as EquipmentView;
      const view = mockView({ roomEquipment: [equipment] });
      const resolved = resolveTarget(view, { kind: "equipment", id: "COMM_CENTER" });
      expect(resolved).toEqual({ kind: "equipment", equipment });
    });

    it("returns null for equipment not in the room", () => {
      const equipment = { id: "COMM_CENTER", type: "COMMUNICATIONS_CENTER" } as EquipmentView;
      const view = mockView({ roomEquipment: [equipment] });
      expect(resolveTarget(view, { kind: "equipment", id: "LAB_BENCH" })).toBeNull();
    });
  });

  describe("item", () => {
    it("resolves a carried item with carried: true", () => {
      const item = { id: "blaster-1", type: "blaster" } as ItemView;
      const view = mockView({ inventory: [item] });
      const resolved = resolveTarget(view, { kind: "item", id: "blaster-1" });
      expect(resolved).toEqual({ kind: "item", item, carried: true });
    });

    it("resolves a room floor item with carried: false", () => {
      const item = { id: "wrench-1", type: "wrench" } as ItemView;
      const view = mockView({ roomItems: [item] });
      const resolved = resolveTarget(view, { kind: "item", id: "wrench-1" });
      expect(resolved).toEqual({ kind: "item", item, carried: false });
    });

    it("prefers a carried item if the same id exists in both inventory and roomItems", () => {
      const carried = { id: "knife-1", type: "knife" } as ItemView;
      const onFloor = { id: "knife-1", type: "knife", broken: true } as ItemView;
      const view = mockView({ inventory: [carried], roomItems: [onFloor] });
      const resolved = resolveTarget(view, { kind: "item", id: "knife-1" });
      expect(resolved).toEqual({ kind: "item", item: carried, carried: true });
    });

    it("returns null for an item not carried or in the room", () => {
      const view = mockView({
        inventory: [{ id: "knife-1", type: "knife" } as ItemView],
        roomItems: [{ id: "wrench-1", type: "wrench" } as ItemView],
      });
      expect(resolveTarget(view, { kind: "item", id: "missing-item" })).toBeNull();
    });
  });
});

describe("optionsOn", () => {
  const option = (action: Action, ap = 1, mp = 0): ActionOption => ({
    action,
    cost: { ap, mp },
    chance: 1,
    tags: [],
    lacks: [],
  });

  it("excludes terminal actions", () => {
    const actions: ActionOption[] = [
      option({ type: "research", equipment: "LAB_BENCH", research: "BACTERIA" }),
      option({ type: "project", equipment: "NEXUS", project: "FIRE_DETECTOR" }),
      option({ type: "update_neron", equipment: "NERON_CORE" }),
      option({ type: "repair_pilgred", equipment: "PILGRED" }),
      option({ type: "scan_planet", equipment: "ASTRO_TERMINAL" }),
    ];
    const view = mockView({ actions });
    expect(optionsOn(view, { kind: "equipment", id: "LAB_BENCH" })).toEqual([]);
    expect(optionsOn(view, { kind: "player", id: "p0" })).toEqual([]);
  });

  it("excludes take, drop, and ready actions", () => {
    const actions: ActionOption[] = [
      option({ type: "take", item: "wrench-1" }),
      option({ type: "drop", item: "wrench-1" }),
      option({ type: "ready" } as unknown as Action),
    ];
    const view = mockView({ actions });
    expect(optionsOn(view, { kind: "item", id: "wrench-1" })).toEqual([]);
    expect(optionsOn(view, { kind: "player", id: "p0" })).toEqual([]);
  });

  it("aims single-property actions at yourself (view.you) only", () => {
    const actions: ActionOption[] = [
      option({ type: "search" }),
      option({ type: "get_up" }),
      option({ type: "extract_spore" }),
    ];
    const view = mockView({
      actions,
      players: [{ id: "p1", character: "frieda" } as OtherPlayerView],
    });

    expect(optionsOn(view, { kind: "player", id: "p0" })).toEqual(actions);
    expect(optionsOn(view, { kind: "player", id: "p1" })).toEqual([]);
    expect(optionsOn(view, { kind: "equipment", id: "BED" })).toEqual([]);
    expect(optionsOn(view, { kind: "item", id: "item-1" })).toEqual([]);
  });

  it("aims issue_mission at yourself (view.you) only, not at the subordinate", () => {
    const issue = option({ type: "issue_mission", subordinate: "p1" });
    const view = mockView({
      actions: [issue],
      players: [{ id: "p1", character: "frieda" } as OtherPlayerView],
    });

    expect(optionsOn(view, { kind: "player", id: "p0" })).toEqual([issue]);
    expect(optionsOn(view, { kind: "player", id: "p1" })).toEqual([]);
  });

  it("aims player-targeted actions at the named person", () => {
    const punchP1 = option({ type: "punch", target: "p1" });
    const healP2 = option({ type: "heal", target: "p2" });
    const view = mockView({ actions: [punchP1, healP2] });

    expect(optionsOn(view, { kind: "player", id: "p1" })).toEqual([punchP1]);
    expect(optionsOn(view, { kind: "player", id: "p2" })).toEqual([healP2]);
    expect(optionsOn(view, { kind: "player", id: "p0" })).toEqual([]);
  });

  it("aims equipment actions (including terminal access) at the named equipment", () => {
    const access = option({ type: "access", equipment: "LAB_BENCH" });
    const dispense = option({ type: "dispense", equipment: "COFFEE_MACHINE" });
    const repair = option({ type: "repair", equipment: "OXYGEN_TANK" });
    const view = mockView({ actions: [access, dispense, repair] });

    expect(optionsOn(view, { kind: "equipment", id: "LAB_BENCH" })).toEqual([access]);
    expect(optionsOn(view, { kind: "equipment", id: "COFFEE_MACHINE" })).toEqual([dispense]);
    expect(optionsOn(view, { kind: "equipment", id: "OXYGEN_TANK" })).toEqual([repair]);
    expect(optionsOn(view, { kind: "equipment", id: "OTHER_EQUIPMENT" })).toEqual([]);
  });

  it("aims item actions at the named item", () => {
    const consume = option({ type: "consume", item: "ration-1" });
    const dismantle = option({ type: "dismantle", item: "blaster-1" });
    const view = mockView({ actions: [consume, dismantle] });

    expect(optionsOn(view, { kind: "item", id: "ration-1" })).toEqual([consume]);
    expect(optionsOn(view, { kind: "item", id: "blaster-1" })).toEqual([dismantle]);
    expect(optionsOn(view, { kind: "item", id: "other-item" })).toEqual([]);
  });

  it("aims attack actions with a target at the victim, not the weapon", () => {
    const attack = option({ type: "attack", target: "p1", weapon: "knife-1" });
    const view = mockView({ actions: [attack] });

    expect(optionsOn(view, { kind: "player", id: "p1" })).toEqual([attack]);
    expect(optionsOn(view, { kind: "item", id: "knife-1" })).toEqual([]);
  });

  it("aims area weapon actions (attack without target) at the weapon item", () => {
    const areaAttack = option({ type: "attack", weapon: "grenade-1" });
    const view = mockView({ actions: [areaAttack] });

    expect(optionsOn(view, { kind: "item", id: "grenade-1" })).toEqual([areaAttack]);
    expect(optionsOn(view, { kind: "player", id: "p0" })).toEqual([]);
  });

  it("aims stop_accommodation at the target player", () => {
    const stopPush = option({ type: "stop_accommodation", target: "p1" });
    const view = mockView({ actions: [stopPush] });

    expect(optionsOn(view, { kind: "player", id: "p1" })).toEqual([stopPush]);
    expect(optionsOn(view, { kind: "player", id: "p0" })).toEqual([]);
  });

  it("aims actions with structured Target objects (e.g. examine) at that target", () => {
    const examinePlayer = option({ type: "examine", target: { kind: "player", id: "p1" } } as unknown as Action);
    const examineEq = option({ type: "examine", target: { kind: "equipment", id: "TERMINAL" } } as unknown as Action);
    const examineItem = option({ type: "examine", target: { kind: "item", id: "wrench-1" } } as unknown as Action);
    const view = mockView({ actions: [examinePlayer, examineEq, examineItem] });

    expect(optionsOn(view, { kind: "player", id: "p1" })).toEqual([examinePlayer]);
    expect(optionsOn(view, { kind: "equipment", id: "TERMINAL" })).toEqual([examineEq]);
    expect(optionsOn(view, { kind: "item", id: "wrench-1" })).toEqual([examineItem]);
    expect(optionsOn(view, { kind: "player", id: "p0" })).toEqual([]);
  });

  it("excludes room navigation actions (e.g. move) that name no target", () => {
    const move = option({ type: "move", to: "corridor_front" as never });
    const view = mockView({ actions: [move] });

    expect(optionsOn(view, { kind: "player", id: "p0" })).toEqual([]);
    expect(optionsOn(view, { kind: "player", id: "p1" })).toEqual([]);
    expect(optionsOn(view, { kind: "equipment", id: "BED" })).toEqual([]);
    expect(optionsOn(view, { kind: "item", id: "item-1" })).toEqual([]);
  });

  it("retains options regardless of AP cost (for disabled button display)", () => {
    const affordable = option({ type: "punch", target: "p1" }, 1);
    const tooCostly = option({ type: "interrogate", target: "p1" }, 100);
    const view = mockView({ actions: [affordable, tooCostly] });

    expect(optionsOn(view, { kind: "player", id: "p1" })).toEqual([affordable, tooCostly]);
  });
});

describe("attackWeapon", () => {
  it("returns the inventory item matching the attack weapon", () => {
    const knife = { id: "knife-1", type: "knife" } as ItemView;
    const view = mockView({ inventory: [knife] });
    const action: Action = { type: "attack", target: "p1", weapon: "knife-1" };

    expect(attackWeapon(view, action)).toBe(knife);
  });

  it("returns undefined if the weapon is not in inventory (e.g. dropped on the floor)", () => {
    const knife = { id: "knife-1", type: "knife" } as ItemView;
    const view = mockView({ inventory: [], roomItems: [knife] });
    const action: Action = { type: "attack", target: "p1", weapon: "knife-1" };

    expect(attackWeapon(view, action)).toBeUndefined();
  });

  it("returns undefined for non-attack actions", () => {
    const knife = { id: "knife-1", type: "knife" } as ItemView;
    const view = mockView({ inventory: [knife] });

    expect(attackWeapon(view, { type: "punch", target: "p1" })).toBeUndefined();
    expect(attackWeapon(view, { type: "search" })).toBeUndefined();
  });

  it("returns the inventory weapon for an area attack action without a target", () => {
    const grenade = { id: "grenade-1", type: "grenade" } as ItemView;
    const view = mockView({ inventory: [grenade] });
    const action: Action = { type: "attack", weapon: "grenade-1" };

    expect(attackWeapon(view, action)).toBe(grenade);
  });
});

describe("integration with sampleView", () => {
  it("resolves targets and finds actions on a real generated ship view", () => {
    const view = sampleView();

    // Resolves yourself
    const self = resolveTarget(view, { kind: "player", id: view.you.id });
    expect(self).toEqual({ kind: "player", person: view.you });

    // Resolves room equipment if present
    const eq = view.roomEquipment[0];
    if (eq) {
      expect(resolveTarget(view, { kind: "equipment", id: eq.id })).toEqual({
        kind: "equipment",
        equipment: eq,
      });
    }

    // Resolves carried items
    const item = view.inventory[0];
    if (item) {
      expect(resolveTarget(view, { kind: "item", id: item.id })).toEqual({
        kind: "item",
        item,
        carried: true,
      });
    }

    // optionsOn filters to actions aimed at yourself (e.g. search)
    const selfOptions = optionsOn(view, { kind: "player", id: view.you.id });
    for (const opt of selfOptions) {
      // Should not include terminal or inventory actions
      expect(["access", "take", "drop", "ready"]).not.toContain(opt.action.type);
    }
  });
});

describe("hostile NPC targets", () => {
  const hostile = { id: "hostile:1", kind: "intruder", hp: 14, maxHp: 14 };
  const punch: ActionOption = { action: { type: "punch", target: "hostile:1" }, cost: { ap: 1, mp: 0 } } as ActionOption;

  it("resolves a hostile in your room, and not one that has gone", () => {
    const view = mockView({ hostiles: [hostile] });
    expect(resolveTarget(view, { kind: "hostile", id: "hostile:1" })).toEqual({ kind: "hostile", hostile });
    expect(resolveTarget(mockView({ hostiles: [] }), { kind: "hostile", id: "hostile:1" })).toBeNull();
  });

  it("puts an action aimed at it on its panel, not on a person's", () => {
    const view = mockView({ hostiles: [hostile], actions: [punch] });
    expect(optionsOn(view, { kind: "hostile", id: "hostile:1" })).toEqual([punch]);
    expect(optionsOn(view, { kind: "player", id: "hostile:1" })).toEqual([]);
  });
});
