import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { addDisease, diseaseStats } from "../src/diseases.ts";
import { CAT_ITEM } from "../src/itemIds.ts";
import { schrodinger } from "../src/schrodinger.ts";
import { createGame } from "../src/rules.ts";
import type { GameState, ItemState, RoomId } from "../src/types.ts";
import { makeSeats, mustApply, noCharacterModifiers, option, player, testConfig } from "./support.ts";

const ALLERGY = "cat_allergy_disease";
const QUINCKE = "quincks_oedema_disease";
const config = noCharacterModifiers(testConfig());
const LAB = "LABORATORY";
const NEXT: RoomId = DEFAULT_CONFIG.rooms.LABORATORY![0]!;

/** Everyone human in `NEXT`; p0 has Cat Allergy; the cat on the lab floor. */
const ship = (catAt: ItemState["at"] = { kind: "room", id: LAB }): GameState => {
  const s = createGame(makeSeats(3), config, 1);
  for (const p of s.players) Object.assign(p, { role: "human", room: NEXT, morale: 6, modifiers: [] });
  s.items = s.items.filter((i) => i.type !== CAT_ITEM);
  s.items.push({ id: "cat", type: CAT_ITEM, at: catAt });
  addDisease(s, player(s, "p0"), ALLERGY);
  return s;
};
const sneezes = (s: GameState) => s.log.filter((e) => e.key === "sneezes").length;
const cat = (s: GameState) => s.items.find((i) => i.type === CAT_ITEM)!;

describe("Cat Allergy", () => {
  it("lasts 12 to 20 cycles", () => {
    expect(diseaseStats({ config: DEFAULT_CONFIG } as GameState, ALLERGY)).toMatchObject({ durationMin: 12, durationMax: 20 });
    expect(DEFAULT_CONFIG.diseases.allDiseases).toContain(ALLERGY);
  });

  it("walking into the cat's room: a sneeze and -1 morale; a room without him: nothing", () => {
    const s = ship();
    const before = sneezes(s);
    const inLab = mustApply(s, "p0", { type: "move", to: LAB });
    expect([sneezes(inLab) - before, player(inLab, "p0").morale]).toEqual([1, 5]);
    const away = ship({ kind: "room", id: "BRIDGE" });
    const moved = mustApply(away, "p0", { type: "move", to: LAB });
    expect([sneezes(moved) - sneezes(away), player(moved, "p0").morale]).toEqual([0, 6]);
  });

  it("the cat walking into a carrier's room sets it off", () => {
    const s = ship();
    // His step is random here: put him back in the lab until one takes him to the carrier's room.
    for (let i = 0; i < 200; i++) {
      schrodinger.act(s, cat(s), LAB);
      if ((cat(s).at as { id: string }).id === NEXT) break;
      cat(s).at = { kind: "room", id: LAB };
    }
    expect((cat(s).at as { id: string }).id).toBe(NEXT);
    expect(player(s, "p0").morale).toBe(5);
    expect(sneezes(s)).toBe(1);
  });

  it("someone carrying the cat in sets it off; the carrier carrying him in reacts once", () => {
    const s = ship({ kind: "player", id: "p1" });
    player(s, "p1").room = LAB;
    player(s, "p0").room = NEXT;
    const after = mustApply(s, "p1", { type: "move", to: NEXT });
    expect([sneezes(after), player(after, "p0").morale]).toEqual([1, 5]);
    const self = ship({ kind: "player", id: "p0" });
    player(self, "p0").room = LAB;
    const walked = mustApply(self, "p0", { type: "move", to: NEXT });
    expect([sneezes(walked), player(walked, "p0").morale]).toEqual([1, 5]);
  });

  it("triples the injury chance while he is in the room, carried or not", () => {
    const s = ship();
    player(s, "p0").room = LAB;
    player(s, "p0").skills.push("engineer");
    s.items.push({ id: "w", type: "knife", at: { kind: "player", id: "p0" } });
    const base = config.dismantle.injuryChance;
    expect(option(s, "p0", { type: "dismantle", item: "w" })?.injury).toBeCloseTo(base * 3);
    expect(option(s, "p0", { type: "take", item: "cat" })?.injury).toBeCloseTo(config.schrodinger.take.injuryChance * 3);
    cat(s).at = { kind: "room", id: "BRIDGE" };
    expect(option(s, "p0", { type: "dismantle", item: "w" })?.injury).toBeCloseTo(base);
    cat(s).at = { kind: "player", id: "p0" };
    expect(option(s, "p0", { type: "dismantle", item: "w" })?.injury).toBeCloseTo(base * 3);
  });

  it("picking him up gives Quincke's Oedema; someone without the allergy gets nothing", () => {
    const s = ship();
    for (const p of s.players) p.room = LAB;
    player(s, "p0").hp = 14;
    const took = mustApply(s, "p0", { type: "take", item: "cat" });
    expect(player(took, "p0").modifiers).toContain(QUINCKE);
    const other = mustApply(s, "p1", { type: "take", item: "cat" });
    expect(player(other, "p1").modifiers).not.toContain(QUINCKE);
  });

  it("a Mush carrier: no morale, no sneeze, no injury change, no Quincke", () => {
    const s = ship();
    const p0 = player(s, "p0");
    p0.role = "mush";
    const inLab = mustApply(s, "p0", { type: "move", to: LAB });
    expect([sneezes(inLab), player(inLab, "p0").morale]).toEqual([0, 6]);
    player(inLab, "p0").skills.push("engineer");
    inLab.items.push({ id: "w", type: "knife", at: { kind: "player", id: "p0" } });
    expect(option(inLab, "p0", { type: "dismantle", item: "w" })?.injury).toBeCloseTo(config.dismantle.injuryChance);
    const took = mustApply(inLab, "p0", { type: "take", item: "cat" });
    expect(player(took, "p0").modifiers).not.toContain(QUINCKE);
  });
});
