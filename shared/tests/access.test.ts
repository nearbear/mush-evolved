import { describe, expect, it } from "vitest";
import { CHARACTERS } from "../src/characters.ts";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { parseGameMessage } from "../src/protocol.ts";
import { applyAction, createGame, viewFor } from "../src/rules.ts";
import type { Action, Seat } from "../src/types.ts";

const seats: Seat[] = Array.from({ length: 3 }, (_, i) => ({ id: `p${i}`, name: `Player ${i}`, isBot: i > 0, character: CHARACTERS[i]!.id }));
const ASTRO: Action = { type: "access", equipment: "COMMAND_CENTER:ASTRO_MODULE" };

function game(room: string) {
  const state = createGame(seats, DEFAULT_CONFIG, 7);
  for (const p of state.players) p.room = room;
  return state;
}

describe("accessing a terminal", () => {
  it("is offered for every terminal in the room, free", () => {
    const view = viewFor(game("COMMAND_CENTER"), "p0");
    const types = view.legalActions.flatMap((a) => (a.type === "access" ? [a.equipment] : []));
    expect(types.sort()).toEqual(["COMMAND_CENTER:ASTRO_MODULE", "COMMAND_CENTER:COM_CENTER", "COMMAND_CENTER:PILOT_MODULE"]);
    expect(view.legalCosts[view.legalActions.findIndex((a) => a.type === "access" && a.equipment === (ASTRO as { equipment: string }).equipment)]).toEqual({ ap: 0, mp: 0 });
  });

  it("changes nothing", () => {
    const s = game("COMMAND_CENTER");
    const r = applyAction(s, "p0", ASTRO);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.state).toEqual(s);
  });

  it("is refused from another room or for a non-terminal", () => {
    expect(applyAction(game("LABORATORY"), "p0", ASTRO).ok).toBe(false);
    expect(viewFor(game("LABORATORY"), "p0").legalActions).not.toContainEqual(ASTRO);
    expect(applyAction(game("REFECTORY"), "p0", { type: "access", equipment: "REFECTORY:COFFEE_DISPENSER" }).ok).toBe(false);
  });

  it("parses from the wire, and rejects a missing equipment", () => {
    expect(parseGameMessage(JSON.stringify({ type: "action", action: ASTRO }))).toEqual({ type: "action", action: ASTRO });
    expect(parseGameMessage(JSON.stringify({ type: "action", action: { type: "access" } }))).toBeNull();
  });
});
