import { describe, expect, it } from "vitest";
import { killPlayer } from "../src/death.ts";
import { CORPSE_ITEM } from "../src/itemIds.ts";
import { parseGameMessage } from "../src/protocol.ts";
import { installCameraIn } from "./cameras.ts";
import { applyAction, createGame, viewFor } from "../src/rules.ts";
import type { Action, GameState } from "../src/types.ts";
import { makeSeats, player, must, offered, testConfig } from "./support.ts";

const seats = makeSeats(3);
const config = testConfig();
const BAYS = ["SPACESHIP_BAY_A", "SPACESHIP_BAY_AA", "SPACESHIP_BAY_B", "ICARUS"];

/** p2 is dead; p0 carries their corpse in `room`; p1 is in the refectory. */
function ship(room = "SPACESHIP_BAY_A"): { s: GameState; corpse: string; jettison: Action } {
  const s = createGame(seats, config, 3);
  for (const p of s.players) p.room = "REFECTORY";
  killPlayer(s, player(s, "p2"), "injury");
  const corpse = s.items.find((i) => i.type === CORPSE_ITEM)!;
  corpse.at = { kind: "player", id: "p0" };
  player(s, "p0").room = room;
  return { s, corpse: corpse.id, jettison: { type: "jettison", item: corpse.id } };
}

describe("jettison", () => {
  it("destroys a carried corpse in any bay, for free", () => {
    for (const room of BAYS) {
      const { s, corpse, jettison } = ship(room);
      expect(offered(s, "p0")).toContainEqual(jettison);
      const after = must(applyAction(s, "p0", jettison));
      expect(after.items.some((i) => i.id === corpse)).toBe(false);
      expect(player(after, "p0").ap).toBe(player(s, "p0").ap);
    }
  });

  it("is refused, leaving state unchanged, outside a bay, for a corpse on the floor, or for another item", () => {
    const outside = ship("REFECTORY");
    expect(offered(outside.s, "p0").some((a) => a.type === "jettison")).toBe(false);
    expect(applyAction(outside.s, "p0", outside.jettison).ok).toBe(false);

    const floor = ship();
    floor.s.items.find((i) => i.id === floor.corpse)!.at = { kind: "room", id: "SPACESHIP_BAY_A" };
    expect(applyAction(floor.s, "p0", floor.jettison).ok).toBe(false);

    const other = ship();
    other.s.items.push({ id: "w", type: "wrench", at: { kind: "player", id: "p0" } });
    expect(applyAction(other.s, "p0", { type: "jettison", item: "w" }).ok).toBe(false);
    expect(offered(other.s, "p0").filter((a) => a.type === "jettison")).toEqual([other.jettison]);
  });

  it("is secret: a witness or a camera makes it room history, alone only the actor sees it, and it is never seen from another room", () => {
    const alone = ship();
    const solo = must(applyAction(alone.s, "p0", alone.jettison));
    expect(solo.log.find((e) => e.key === "jettisoned")).toMatchObject({ visibleTo: ["p0"], params: { name: "chao", body: "eleesha" } });

    const watched = ship();
    player(watched.s, "p1").room = "SPACESHIP_BAY_A";
    const witnessed = must(applyAction(watched.s, "p0", watched.jettison));
    expect(viewFor(witnessed, "p1").log.some((e) => e.key === "jettisoned")).toBe(true);
    player(witnessed, "p1").room = "REFECTORY";
    expect(viewFor(witnessed, "p1").log.some((e) => e.key === "jettisoned")).toBe(false);

    const filmed = ship();
    installCameraIn(filmed.s, "SPACESHIP_BAY_A");
    const seen = must(applyAction(filmed.s, "p0", filmed.jettison));
    player(seen, "p1").room = "SPACESHIP_BAY_A"; // arriving later: it is room history
    expect(viewFor(seen, "p1").log.some((e) => e.key === "jettisoned")).toBe(true);
  });

  it("parses from the wire", () => {
    expect(parseGameMessage(JSON.stringify({ type: "action", action: { type: "jettison", item: "item-9" } }))).toEqual({
      type: "action",
      action: { type: "jettison", item: "item-9" },
    });
  });
});
