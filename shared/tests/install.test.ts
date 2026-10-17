import { describe, expect, it } from "vitest";
import { CHARACTERS } from "../src/characters.ts";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { hasCamera, logCovert } from "../src/log.ts";
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

/** p0 carries a camera in the refectory; p1 is there too; p2 is in the laboratory. */
function ship(): { s: GameState; camera: string; install: Action } {
  const s = createGame(seats, config, 3);
  player(s, "p0").room = "REFECTORY";
  player(s, "p1").room = "REFECTORY";
  player(s, "p2").room = "LABORATORY";
  const id = `item-${s.nextItemId++}`;
  s.items.push({ id, type: "camera", at: { kind: "player", id: "p0" } });
  return { s, camera: id, install: { type: "install", item: id } };
}

describe("install", () => {
  it("defaults to 1 AP", () => {
    expect(DEFAULT_CONFIG.install).toEqual({ cost: { ap: 1 } });
  });

  it("moves the carried camera into the room, for 1 AP, with a public log line", () => {
    const { s, camera, install } = ship();
    expect(viewFor(s, "p0").legalActions).toContainEqual(install);
    const after = must(applyAction(s, "p0", install));
    expect(after.items.find((i) => i.id === camera)!.at).toEqual({ kind: "room", id: "REFECTORY" });
    expect(hasCamera(after, "REFECTORY")).toBe(true);
    expect(player(after, "p0").ap).toBe(player(s, "p0").ap - 1);
    expect(viewFor(after, "p1").roomItems.some((i) => i.type === "camera")).toBe(true);
    expect(viewFor(after, "p1").log.some((e) => e.key === "cameraInstalled")).toBe(true);
    // The other room learns nothing.
    expect(viewFor(after, "p2").roomItems.some((i) => i.type === "camera")).toBe(false);
    expect(viewFor(after, "p2").log.some((e) => e.key === "cameraInstalled")).toBe(false);
  });

  it("makes covert actions room history in a room that had no camera", () => {
    const { s, install } = ship();
    const before = structuredClone(s);
    logCovert(before, "p0", "jettisoned", { name: "x", body: "y" });
    expect(before.log.at(-1)!.visibleTo).toEqual(["p0"]);
    const after = must(applyAction(s, "p0", install));
    logCovert(after, "p0", "jettisoned", { name: "x", body: "y" });
    expect(after.log.at(-1)!.visibleTo).toBe("all");
  });

  it("works in every room of the ship", () => {
    const { s, install } = ship();
    for (const room of Object.keys(s.config.rooms)) {
      const t = structuredClone(s);
      player(t, "p0").room = room;
      t.items = t.items.filter((i) => i.type !== "camera" || i.at.kind === "player");
      expect(hasCamera(t, room)).toBe(false);
      expect(hasCamera(must(applyAction(t, "p0", install)), room)).toBe(true);
    }
  });

  it("is refused, leaving state unchanged, where a camera already is, when broke, or for an item you don't carry", () => {
    const { s, camera, install } = ship();

    const twice = must(applyAction(s, "p0", install));
    const second = { ...twice, items: [...twice.items, { id: "item-extra", type: "camera", at: { kind: "player" as const, id: "p0" } }] };
    expect(viewFor(second, "p0").legalActions.some((a) => a.type === "install")).toBe(false);
    expect(applyAction(second, "p0", { type: "install", item: "item-extra" }).ok).toBe(false);

    const broke = structuredClone(s);
    player(broke, "p0").ap = 0;
    expect(applyAction(broke, "p0", install).ok).toBe(false);

    const onFloor = structuredClone(s);
    onFloor.items.find((i) => i.id === camera)!.at = { kind: "room", id: "REFECTORY" };
    expect(applyAction(onFloor, "p0", install).ok).toBe(false);
    expect(applyAction(s, "p1", install).ok).toBe(false);
  });

  it("is accepted from the wire", () => {
    expect(parseGameMessage(JSON.stringify({ type: "action", action: { type: "install", item: "item-9" } }))).toEqual({
      type: "action",
      action: { type: "install", item: "item-9" },
    });
  });
});
