import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { PROJECT_COMPLETE, projectStatus } from "../src/projects.ts";
import { createGame, viewFor } from "../src/rules.ts";
import type { GameState, RoomId } from "../src/types.ts";
import { makeSeats, player } from "./support.ts";

const HERE: RoomId = "REFECTORY";
const ELSEWHERE: RoomId = "BRIDGE";
const OTHER: RoomId = "CENTRAL_CORRIDOR";

function ship(): GameState {
  const s = createGame(makeSeats(3, "others"), DEFAULT_CONFIG, 7);
  player(s, "p0").room = HERE;
  player(s, "p1").room = ELSEWHERE;
  player(s, "p2").room = OTHER;
  return s;
}

describe("Fire Detectors (FIRE_SENSOR)", () => {
  it("is marked fully implemented in projectStatus", () => {
    expect(projectStatus("FIRE_SENSOR")).toBe("full");
  });

  it("before completion: burning rooms are hidden from view, only roomOnFire for living in burning room", () => {
    const s = ship();
    s.fires = [HERE, ELSEWHERE];

    // p0 is in HERE (burning)
    const v0 = viewFor(s, "p0");
    expect(v0.roomOnFire).toBe(true);
    expect(v0.burningRooms).toEqual([]);

    // p2 is in OTHER (not burning)
    const v2 = viewFor(s, "p2");
    expect(v2.roomOnFire).toBe(false);
    expect(v2.burningRooms).toEqual([]);
  });

  it("at 99% progress: burning rooms are still hidden", () => {
    const s = ship();
    s.fires = [HERE];
    s.projects.FIRE_SENSOR = PROJECT_COMPLETE - 1;

    expect(viewFor(s, "p2").burningRooms).toEqual([]);
  });

  it("when complete: all burning rooms reach every living player, regardless of their location", () => {
    const s = ship();
    s.fires = [HERE, ELSEWHERE];
    s.projects.FIRE_SENSOR = PROJECT_COMPLETE;

    // p0 is in HERE (burning)
    const v0 = viewFor(s, "p0");
    expect(v0.roomOnFire).toBe(true);
    expect(v0.burningRooms).toEqual([HERE, ELSEWHERE]);

    // p2 is in OTHER (not burning)
    const v2 = viewFor(s, "p2");
    expect(v2.roomOnFire).toBe(false);
    expect(v2.burningRooms).toEqual([HERE, ELSEWHERE]);
  });

  it("dead players see no burning rooms (room-dependent info never leaks to the dead)", () => {
    const s = ship();
    s.fires = [HERE, ELSEWHERE];
    s.projects.FIRE_SENSOR = PROJECT_COMPLETE;
    player(s, "p2").alive = false;

    expect(viewFor(s, "p2").burningRooms).toEqual([]);
  });

  it("when fires are extinguished, burningRooms is empty", () => {
    const s = ship();
    s.fires = [];
    s.projects.FIRE_SENSOR = PROJECT_COMPLETE;

    expect(viewFor(s, "p0").burningRooms).toEqual([]);
    expect(viewFor(s, "p2").burningRooms).toEqual([]);
  });
});
