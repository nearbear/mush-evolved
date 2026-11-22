import { describe, expect, it } from "vitest";
import { sendChat } from "../src/chat.ts";
import { addDisease } from "../src/diseases.ts";
import { ITRACKIE_ITEM } from "../src/items.ts";
import { createGame, viewFor } from "../src/rules.ts";
import type { GameState } from "../src/types.ts";
import { makeSeats, must, noCharacterModifiers, player, testConfig } from "./support.ts";

const TEETH = "missing_teeth_injury";
const config = noCharacterModifiers(testConfig());

function ship(): GameState {
  const s = createGame(makeSeats(3), config, 1);
  s.items = s.items.filter((i) => i.type !== ITRACKIE_ITEM);
  for (const id of ["p0", "p1"]) s.items.push({ id: `it-${id}`, type: ITRACKIE_ITEM, at: { kind: "player", id } });
  return s;
}

const lastText = (s: GameState) => s.chat.at(-1)!.text;

describe("missing teeth injury", () => {
  it("is an injury a random combat injury can give", () => {
    expect(config.diseases.allInjuries).toContain(TEETH);
    expect(config.diseases.combatInjuries).toContain(TEETH);
    expect(config.diseases.bluntInjuries).toContain(TEETH);
  });

  it("lowers max morale by 2", () => {
    const plain = ship();
    const s = ship();
    addDisease(s, player(s, "p0"), TEETH);
    expect(player(s, "p0").maxMorale).toBe(player(plain, "p0").maxMorale - 2);
  });

  it("drops F, V, S, T, D and L in both cases from the holder's chat messages, and only theirs", () => {
    const s = ship();
    addDisease(s, player(s, "p0"), TEETH);
    const said = must(sendChat(s, "p0", "global", "Fast Delivery: TOLD you, Vlad!"));
    expect(lastText(said)).toBe("a eiery: O you, a!");
    expect(viewFor(said, "p1").chat.some((m) => m.text === "a eiery: O you, a!")).toBe(true);
    expect(lastText(must(sendChat(s, "p1", "global", "Fast")))).toBe("Fast");
  });

  it("refuses a message with nothing left to say", () => {
    const s = ship();
    addDisease(s, player(s, "p0"), TEETH);
    expect(sendChat(s, "p0", "global", "tSd lL").ok).toBe(false);
  });
});
