import { describe, expect, it } from "vitest";
import { CHARACTERS } from "../src/characters.ts";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { killPlayer } from "../src/death.ts";
import { CORPSE_ITEM } from "../src/items.ts";
import { parseGameMessage } from "../src/protocol.ts";
import { applyAction, createGame, viewFor, type ActionResult } from "../src/rules.ts";
import type { Action, GameState, PlayerId, Seat } from "../src/types.ts";

const seats: Seat[] = Array.from({ length: 3 }, (_, i) => ({ id: `p${i}`, name: `Player ${i}`, isBot: false, character: CHARACTERS[i]!.id }));
const config = { ...DEFAULT_CONFIG, mushCount: 1, startItems: [], startSkills: [] };
const player = (s: GameState, id: PlayerId) => s.players.find((p) => p.id === id)!;
const must = (r: ActionResult): GameState => {
  if (!r.ok) throw new Error(r.error);
  return r.state;
};
const BAYS = ["SPACESHIP_BAY_A", "SPACESHIP_BAY_AA", "SPACESHIP_BAY_B", "ICARUS"];

/** p2 is dead; p0 carries their corpse in `room`; p1 is in the refectory. */
function ship(room = "SPACESHIP_BAY_A"): { s: GameState; corpse: string; jettison: Action } {
  const s = createGame(seats, config, 3);
  for (const p of s.players) p.room = "REFECTORY";
  killPlayer(s, player(s, "p2"));
  const corpse = s.items.find((i) => i.type === CORPSE_ITEM)!;
  corpse.at = { kind: "player", id: "p0" };
  player(s, "p0").room = room;
  return { s, corpse: corpse.id, jettison: { type: "jettison", item: corpse.id } };
}

describe("jettison", () => {
  it("defaults to 0 AP in the four bays", () => {
    expect(DEFAULT_CONFIG.jettison).toEqual({ cost: { ap: 0 }, rooms: BAYS });
  });

  it("destroys a carried corpse in any bay, for free", () => {
    for (const room of BAYS) {
      const { s, corpse, jettison } = ship(room);
      expect(viewFor(s, "p0").legalActions).toContainEqual(jettison);
      const after = must(applyAction(s, "p0", jettison));
      expect(after.items.some((i) => i.id === corpse)).toBe(false);
      expect(player(after, "p0").ap).toBe(player(s, "p0").ap);
    }
  });

  it("is refused, leaving state unchanged, outside a bay, for a corpse on the floor, or for another item", () => {
    const outside = ship("REFECTORY");
    expect(viewFor(outside.s, "p0").legalActions.some((a) => a.type === "jettison")).toBe(false);
    expect(applyAction(outside.s, "p0", outside.jettison).ok).toBe(false);

    const floor = ship();
    floor.s.items.find((i) => i.id === floor.corpse)!.at = { kind: "room", id: "SPACESHIP_BAY_A" };
    expect(applyAction(floor.s, "p0", floor.jettison).ok).toBe(false);

    const other = ship();
    other.s.items.push({ id: "w", type: "wrench", at: { kind: "player", id: "p0" } });
    expect(applyAction(other.s, "p0", { type: "jettison", item: "w" }).ok).toBe(false);
    expect(viewFor(other.s, "p0").legalActions.filter((a) => a.type === "jettison")).toEqual([other.jettison]);
  });

  it("is covert: a bystander doesn't see it, a camera makes it room history, and it is never seen from another room", () => {
    const watched = ship();
    player(watched.s, "p1").room = "SPACESHIP_BAY_A";
    const unseen = must(applyAction(watched.s, "p0", watched.jettison));
    expect(unseen.log.find((e) => e.key === "jettisoned")).toMatchObject({ visibleTo: ["p0"], params: { name: "Player 0", body: "Player 2" } });
    expect(viewFor(unseen, "p1").log.some((e) => e.key === "jettisoned")).toBe(false);

    const filmed = ship();
    filmed.s.items.push({ id: "cam", type: "camera", at: { kind: "room", id: "SPACESHIP_BAY_A" } });
    const seen = must(applyAction(filmed.s, "p0", filmed.jettison));
    player(seen, "p1").room = "SPACESHIP_BAY_A"; // arriving later: it is room history
    expect(viewFor(seen, "p1").log.some((e) => e.key === "jettisoned")).toBe(true);
    player(seen, "p1").room = "REFECTORY";
    expect(viewFor(seen, "p1").log.some((e) => e.key === "jettisoned")).toBe(false);
  });

  it("parses from the wire", () => {
    expect(parseGameMessage(JSON.stringify({ type: "action", action: { type: "jettison", item: "item-9" } }))).toEqual({
      type: "action",
      action: { type: "jettison", item: "item-9" },
    });
  });
});
