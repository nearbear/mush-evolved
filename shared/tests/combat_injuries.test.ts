import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.ts";
import {
  BARE_HANDS_OUTCOMES,
  BLASTER_OUTCOMES,
  GRENADE_OUTCOMES,
  KNIFE_OUTCOMES,
  LIZARO_JUNGLE_OUTCOMES,
  MISSILE_LAUNCHER_OUTCOMES,
  NATAMY_RIFLE_OUTCOMES,
  OLD_FAITHFUL_OUTCOMES,
} from "../src/configHitOutcomes.ts";
import { addDisease, INJURY_UPGRADES } from "../src/diseases.ts";
import { dropWeapon, removeItemIfPresent } from "../src/items.ts";
import { MODIFIERS } from "../src/modifiers.ts";
import { createGame, viewFor } from "../src/rules.ts";
import { STATUS_IDS, STATUS_PUBLIC, statusIdsFor } from "../src/statuses.ts";
import type { GameState } from "../src/types.ts";
import { makeSeats, noCharacterModifiers, player, testConfig } from "./support.ts";

const config = noCharacterModifiers(testConfig());

function ship(): GameState {
  const s = createGame(makeSeats(3), config, 1);
  for (const id of ["p0", "p1"]) player(s, id).room = "LABORATORY";
  return s;
}

describe("dropWeapon & removeItemIfPresent", () => {
  it("moves a carried weapon to the player's room and clears hiddenBy", () => {
    const s = ship();
    const p0 = player(s, "p0");
    const w1 = { id: "w1", type: "blaster", at: { kind: "player" as const, id: p0.id }, hiddenBy: p0.id };
    s.items.push(w1);

    expect(dropWeapon(s, p0, w1)).toBe(true);
    const moved = s.items.find((i) => i.id === "w1")!;
    expect(moved.at).toEqual({ kind: "room", id: "LABORATORY" });
    expect(moved.hiddenBy).toBeUndefined();
  });

  it("respects canDrop: false unless bypassCanDrop is true", () => {
    const s = ship();
    const p0 = player(s, "p0");
    const cam = { id: "cam", type: "camera", at: { kind: "player" as const, id: p0.id } };
    s.items.push(cam);

    expect(dropWeapon(s, p0, cam)).toBe(false);
    expect(cam.at).toEqual({ kind: "player", id: p0.id });

    expect(dropWeapon(s, p0, cam, { bypassCanDrop: true })).toBe(true);
    expect(cam.at).toEqual({ kind: "room", id: "LABORATORY" });
  });

  it("returns false when the item is not carried by the player", () => {
    const s = ship();
    const p0 = player(s, "p0");
    const w1 = { id: "w1", type: "knife", at: { kind: "room" as const, id: "LABORATORY" } };
    const w2 = { id: "w2", type: "knife", at: { kind: "player" as const, id: "p1" } };
    s.items.push(w1, w2);

    expect(dropWeapon(s, p0, w1)).toBe(false);
    expect(dropWeapon(s, p0, w2)).toBe(false);
  });

  it("removeItemIfPresent removes an item once and returns undefined if already gone", () => {
    const s = ship();
    s.items.push({ id: "g1", type: "grenade", at: { kind: "player", id: "p0" } });

    expect(removeItemIfPresent(s, "g1")?.id).toBe("g1");
    expect(removeItemIfPresent(s, "g1")).toBeUndefined();
  });
});

describe("combat injuries", () => {
  it("registers every injury referenced by weapon outcomes as a private injury", () => {
    const tables = [
      BLASTER_OUTCOMES,
      KNIFE_OUTCOMES,
      NATAMY_RIFLE_OUTCOMES,
      LIZARO_JUNGLE_OUTCOMES,
      OLD_FAITHFUL_OUTCOMES,
      MISSILE_LAUNCHER_OUTCOMES,
      GRENADE_OUTCOMES,
      BARE_HANDS_OUTCOMES,
    ];
    const outcomeInjuries = new Set<string>();
    for (const table of tables) {
      for (const outcome of [...table.hitOutcomes, ...table.missOutcomes]) {
        for (const inj of outcome.effects?.injuries ?? []) {
          if (inj.injury !== "random") outcomeInjuries.add(inj.injury);
        }
      }
    }
    for (const upgraded of Object.values(INJURY_UPGRADES)) outcomeInjuries.add(upgraded);
    // The random injury's pool: every entry must be a real injury too.
    const d = DEFAULT_CONFIG.diseases;
    for (const id of [...d.combatInjuries, ...d.bladeInjuries, ...d.bulletInjuries, ...d.explosiveInjuries, ...d.bluntInjuries]) outcomeInjuries.add(id);

    for (const id of outcomeInjuries) {
      expect(DEFAULT_CONFIG.diseases.allInjuries, id).toContain(id);
      expect(DEFAULT_CONFIG.diseases.allDiseaseStats.some((d) => d.label === id && d.type === "injury"), id).toBe(true);
      expect(MODIFIERS[id], id).toBeDefined();
      expect(statusIdsFor(DEFAULT_CONFIG.diseases.allDiseases, DEFAULT_CONFIG.diseases.allInjuries), id).toContain(id);
      expect(STATUS_IDS, id).not.toContain(id);
      expect(STATUS_PUBLIC[id], id).toBeUndefined();
    }
  });

  it("keeps combat injuries private in viewFor", () => {
    const s = ship();
    const p0 = player(s, "p0");
    addDisease(s, p0, "damaged_ears_injury");

    expect(viewFor(s, "p0").statuses).toContain("damaged_ears_injury");
    expect(viewFor(s, "p1").players.find((p) => p.id === "p0")!.statuses).not.toContain("damaged_ears_injury");
  });

  it("upgrades lower-tier injuries on repeat application and prevents downgrades", () => {
    for (const [lower, higher] of Object.entries(INJURY_UPGRADES)) {
      const s = ship();
      const p0 = player(s, "p0");

      addDisease(s, p0, lower);
      expect(p0.modifiers).toContain(lower);
      expect(p0.statuses).toContain(lower);

      // Repeat application upgrades lower -> higher.
      addDisease(s, p0, lower);
      expect(p0.modifiers).not.toContain(lower);
      expect(p0.statuses).not.toContain(lower);
      expect(p0.diseaseTrackers.some((t) => t.name === lower)).toBe(false);
      expect(p0.modifiers).toContain(higher);
      expect(p0.statuses).toContain(higher);
      expect(p0.diseaseTrackers.find((t) => t.name === higher)?.forever).toBe(true);

      // Applying lower again while holding higher is a no-op.
      addDisease(s, p0, lower);
      expect(p0.modifiers).not.toContain(lower);
      expect(p0.modifiers.filter((m) => m === higher)).toHaveLength(1);
    }
  });

  it("replaces lower-tier injury when higher-tier injury is applied directly", () => {
    const s = ship();
    const p0 = player(s, "p0");

    addDisease(s, p0, "damaged_ears_injury");
    addDisease(s, p0, "destroyed_ears_injury");

    expect(p0.modifiers).not.toContain("damaged_ears_injury");
    expect(p0.statuses).not.toContain("damaged_ears_injury");
    expect(p0.diseaseTrackers.some((t) => t.name === "damaged_ears_injury")).toBe(false);
    expect(p0.modifiers).toContain("destroyed_ears_injury");
    expect(p0.statuses).toContain("destroyed_ears_injury");
  });
});
