import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { shortestPath } from "../src/paths.ts";
import { PATROL_SHIPS } from "../src/patrol.ts";

describe("shortestPath", () => {
  // A - B - D and A - C - D: two routes of the same length; E is cut off.
  const graph = { A: ["B", "C"], B: ["A", "D"], C: ["A", "D"], D: ["B", "C"], E: [] };

  it("is empty when already there", () => {
    expect(shortestPath(graph, "A", "A")).toEqual([]);
  });

  it("lists the rooms walked through, ending at the goal, taking the first exit on a tie", () => {
    expect(shortestPath(graph, "A", "D")).toEqual(["B", "D"]);
    expect(shortestPath({ ...graph, A: ["C", "B"] }, "A", "D")).toEqual(["C", "D"]);
  });

  it("is null when there is no way", () => {
    expect(shortestPath(graph, "A", "E")).toBeNull();
    expect(shortestPath(graph, "A", "NOWHERE")).toBeNull();
  });

  it("reaches every Daedalus room from the start room, one door at a time, but no patrol craft (no doors)", () => {
    const { rooms, startRoom } = DEFAULT_CONFIG;
    const craft = new Set(PATROL_SHIPS.map((ship) => ship.id));
    for (const id of craft) expect(shortestPath(rooms, startRoom, id), id).toBeNull();
    for (const to of Object.keys(rooms).filter((id) => !craft.has(id))) {
      const path = shortestPath(rooms, startRoom, to);
      expect(path, to).not.toBeNull();
      path!.reduce((from, next) => {
        expect(rooms[from], `${from} -> ${next}`).toContain(next);
        return next;
      }, startRoom);
    }
  });
});
