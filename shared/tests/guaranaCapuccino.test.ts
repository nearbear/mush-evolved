import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { RESEARCH_COMPLETE, researchStatus } from "../src/research.ts";
import { applyAction, createGame, viewFor } from "../src/rules.ts";
import type { GameState } from "../src/types.ts";
import { makeSeats, must, player } from "./support.ts";

const config = DEFAULT_CONFIG;

function coffeeGame(): GameState {
  const s = createGame(makeSeats(3, "others"), structuredClone(config), 7);
  player(s, "p0").ap = 2;
  player(s, "p0").satiety = 0;
  player(s, "p0").skills = [];
  s.items.push({ id: "coffee-1", type: "coffee", at: { kind: "player", id: "p0" } });
  return s;
}

describe("Guarana cappuccino (GUARANA_CAPUCCINO)", () => {
  it("is marked full and configured for +1 extra AP", () => {
    expect(researchStatus("GUARANA_CAPUCCINO")).toBe("full");
    expect(config.research.guaranaExtraAp).toBe(1);
  });

  it("gives humans +1 extra AP per coffee once complete, capped at maxAp, and stacks with caffeinomaniac", () => {
    const before = coffeeGame();
    const afterBefore = must(applyAction(before, "p0", { type: "consume", item: "coffee-1" }));
    expect(player(afterBefore, "p0").ap).toBe(4);

    // Partial progress gives no bonus
    const partial = coffeeGame();
    partial.research.GUARANA_CAPUCCINO = RESEARCH_COMPLETE - 1;
    const afterPartial = must(applyAction(partial, "p0", { type: "consume", item: "coffee-1" }));
    expect(player(afterPartial, "p0").ap).toBe(4);

    // Complete research gives +1 extra AP (2 + 1 = 3)
    const complete = coffeeGame();
    complete.research.GUARANA_CAPUCCINO = RESEARCH_COMPLETE;
    const afterComplete = must(applyAction(complete, "p0", { type: "consume", item: "coffee-1" }));
    expect(player(afterComplete, "p0").ap).toBe(5);

    // Stacks with caffeinomaniac (+2 base +1 guarana +caffeinomaniac.ap)
    const caff = coffeeGame();
    caff.research.GUARANA_CAPUCCINO = RESEARCH_COMPLETE;
    player(caff, "p0").skills = ["caffeinomaniac"];
    const afterCaff = must(applyAction(caff, "p0", { type: "consume", item: "coffee-1" }));
    expect(player(afterCaff, "p0").ap).toBe(2 + 2 + config.research.guaranaExtraAp + config.caffeinomaniac.ap);

    // Still capped at maxAp
    const nearCap = coffeeGame();
    nearCap.research.GUARANA_CAPUCCINO = RESEARCH_COMPLETE;
    player(nearCap, "p0").ap = player(nearCap, "p0").maxAp - 1;
    const afterCap = must(applyAction(nearCap, "p0", { type: "consume", item: "coffee-1" }));
    expect(player(afterCap, "p0").ap).toBe(player(afterCap, "p0").maxAp);
  });

  it("does not boost non-coffee items or give AP to Mush", () => {
    const s = coffeeGame();
    s.research.GUARANA_CAPUCCINO = RESEARCH_COMPLETE;
    s.items.push({ id: "ration-1", type: "cooked_ration", at: { kind: "player", id: "p0" } });
    const afterRation = must(applyAction(s, "p0", { type: "consume", item: "ration-1" }));
    expect(player(afterRation, "p0").ap).toBe(6); // cooked_ration gives 4 AP, not 5

    // Mush get 0 AP from coffee even with GUARANA_CAPUCCINO complete
    const mush = coffeeGame();
    mush.research.GUARANA_CAPUCCINO = RESEARCH_COMPLETE;
    player(mush, "p0").role = "mush";
    const afterMush = must(applyAction(mush, "p0", { type: "consume", item: "coffee-1" }));
    expect(player(afterMush, "p0").ap).toBe(2);
  });

  it("requires coffee in the lab and reveals completion ship-wide in PlayerView.research", () => {
    const s = createGame(makeSeats(3, "others"), structuredClone(config), 7);
    player(s, "p0").room = "LABORATORY";
    player(s, "p1").room = "BRIDGE";

    const blocked = applyAction(s, "p0", { type: "research", equipment: "LABORATORY:RESEARCH_LAB", research: "GUARANA_CAPUCCINO" });
    expect(blocked.ok).toBe(false);

    s.items.push({ id: "lab-coffee", type: "coffee", at: { kind: "room", id: "LABORATORY" } });
    s.research.GUARANA_CAPUCCINO = RESEARCH_COMPLETE;
    expect(viewFor(s, "p1").research.GUARANA_CAPUCCINO).toBe(RESEARCH_COMPLETE);
  });
});
