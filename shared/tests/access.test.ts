import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { parseGameMessage } from "../src/protocol.ts";
import { applyAction, createGame, viewFor } from "../src/rules.ts";
import type { Action } from "../src/types.ts";
import { costOf, makeSeats, offered } from "./support.ts";

const seats = makeSeats(3, "others");
const ASTRO: Action = { type: "access", equipment: "COMMAND_CENTER:ASTRO_MODULE" };

function game(room: string) {
  const state = createGame(seats, DEFAULT_CONFIG, 7);
  for (const p of state.players) p.room = room;
  return state;
}

describe("accessing a terminal", () => {
  it("is offered for every terminal in the room, free", () => {
    const s = game("COMMAND_CENTER");
    const types = offered(s, "p0").flatMap((a) => (a.type === "access" ? [a.equipment] : []));
    expect(types.sort()).toEqual(["COMMAND_CENTER:ASTRO_MODULE", "COMMAND_CENTER:COM_CENTER", "COMMAND_CENTER:PILOT_MODULE"]);
    expect(costOf(s, "p0", ASTRO)).toEqual({ ap: 0, mp: 0 });
  });

  it("changes nothing", () => {
    const s = game("COMMAND_CENTER");
    const r = applyAction(s, "p0", ASTRO);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.state).toEqual(s);
  });

  it("is refused from another room or for a non-terminal", () => {
    expect(applyAction(game("LABORATORY"), "p0", ASTRO).ok).toBe(false);
    expect(offered(game("LABORATORY"), "p0")).not.toContainEqual(ASTRO);
    expect(applyAction(game("REFECTORY"), "p0", { type: "access", equipment: "REFECTORY:COFFEE_DISPENSER" }).ok).toBe(false);
  });

  it("parses from the wire, and rejects a missing equipment", () => {
    expect(parseGameMessage(JSON.stringify({ type: "action", action: ASTRO }))).toEqual({ type: "action", action: ASTRO });
    expect(parseGameMessage(JSON.stringify({ type: "action", action: { type: "access" } }))).toBeNull();
  });
});
