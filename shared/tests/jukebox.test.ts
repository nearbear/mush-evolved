import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { JUKEBOX_EQUIPMENT } from "../src/equipment.ts";
import { songAt } from "../src/jukebox.ts";
import { PROJECT_COMPLETE } from "../src/projects.ts";
import { applyAction, createGame, unaffordableActions, viewFor } from "../src/rules.ts";
import type { Action, GameState, PlayerId } from "../src/types.ts";
import { makeSeats, mustApply, offered, player, setProgress } from "./support.ts";

const ROOM = "REFECTORY";
const JUKEBOX_ID = `${ROOM}:${JUKEBOX_EQUIPMENT}`;
const work: Action = { type: "project", equipment: "NEXUS_ROOM:NERON_CORE", project: "BEAT_BOX" };
const listen: Action = { type: "listen_jukebox", equipment: JUKEBOX_ID };
const check: Action = { type: "check_jukebox", equipment: JUKEBOX_ID };
const { morale } = DEFAULT_CONFIG.jukebox;

function ship(progress = PROJECT_COMPLETE - 1): GameState {
  const s = createGame(makeSeats(4, "others"), DEFAULT_CONFIG, 7);
  s.players[0]!.room = "NEXUS_ROOM";
  for (const p of s.players.slice(1)) p.room = ROOM;
  setProgress(s, { project: "BEAT_BOX" }, progress);
  return s;
}

const builtShip = (): GameState => mustApply(ship(), "p0", work);

/** Picks a jukebox seed whose song this cycle is `id`'s, so the tests don't depend on one seed's draws. */
function playing(s: GameState, id: PlayerId): GameState {
  for (let seed = 0; seed < 1000; seed++) {
    s.jukeboxSeed = seed;
    if (songAt(s)?.id === id) return s;
  }
  throw new Error(`no seed plays ${id}'s song`);
}

describe("Jukebox (BEAT_BOX)", () => {
  it("pins the confirmed config numbers", () => {
    const { cost } = DEFAULT_CONFIG.jukebox;
    expect([DEFAULT_CONFIG.project.jukebox.room, cost.ap, morale]).toEqual(["REFECTORY", 0, 3]);
  });

  it("has no jukebox before the project and one in the refectory after", () => {
    const s = ship(0);
    expect(Object.values(s.equipment).flat().some((e) => e.type === JUKEBOX_EQUIPMENT)).toBe(false);
    expect(offered(s, "p1")).not.toContainEqual(check);
    const done = builtShip();
    expect(done.equipment[ROOM]!.filter((e) => e.type === JUKEBOX_EQUIPMENT)).toEqual([{ id: JUKEBOX_ID, type: JUKEBOX_EQUIPMENT }]);
    expect(viewFor(done, "p1").roomEquipment.some((e) => e.id === JUKEBOX_ID)).toBe(true);
    expect(offered(done, "p1")).toContainEqual(check);
  });

  it("picks a song per cycle from the living only, stable for the same cycle, without moving the shared RNG", () => {
    const s = builtShip();
    const rng = s.rng;
    const picks = Array.from({ length: 40 }, (_, i) => songAt(s, i)!.id);
    expect(Array.from({ length: 40 }, (_, i) => songAt(s, i)!.id)).toEqual(picks);
    expect(s.rng).toBe(rng);
    expect(new Set(picks).size).toBeGreaterThan(1);
    s.players[2]!.alive = false;
    for (let i = 0; i < 40; i++) expect(songAt(s, i)!.id).not.toBe("p2");
    for (const p of s.players) p.alive = false;
    expect(songAt(s)).toBeUndefined();
  });

  it("refuses Listen, shown disabled, while someone else's song plays", () => {
    const s = playing(builtShip(), "p2");
    expect(offered(s, "p1")).not.toContainEqual(listen);
    expect(unaffordableActions(s, "p1").find((o) => o.action.type === "listen_jukebox")?.lacks).toEqual(["notYourSong"]);
    expect(applyAction(s, "p1", listen)).toEqual({ ok: false, error: "illegal_action" });
  });

  it("gives +3 morale once a day, publicly, and again the next day", () => {
    const s = playing(builtShip(), "p1");
    player(s, "p1").morale = 4;
    const ap = player(s, "p1").ap;
    const after = mustApply(s, "p1", listen);
    expect(player(after, "p1").morale).toBe(4 + morale);
    expect(player(after, "p1").ap).toBe(ap - DEFAULT_CONFIG.jukebox.cost.ap);
    expect(after.log.at(-1)).toMatchObject({ key: "listenedJukebox", params: { name: player(s, "p1").character, song: player(s, "p1").character }, visibleTo: "all", room: ROOM });
    expect(viewFor(after, "p2").log.some((e) => e.key === "listenedJukebox")).toBe(true);

    // Same day, same song: shown disabled, and no second bonus.
    expect(unaffordableActions(after, "p1").find((o) => o.action.type === "listen_jukebox")?.lacks).toEqual(["listenedToday"]);
    expect(applyAction(after, "p1", listen).ok).toBe(false);
    // jukeboxDay goes to its owner only.
    expect(viewFor(after, "p1").you.jukeboxDay).toBeDefined();
    expect(JSON.stringify(viewFor(after, "p2").players)).not.toContain("jukeboxDay");

    const tomorrow = structuredClone(after);
    tomorrow.cycle += tomorrow.config.cyclesPerDay;
    playing(tomorrow, "p1");
    expect(player(mustApply(tomorrow, "p1", listen), "p1").morale).toBe(4 + 2 * morale);
  });

  it("lets Mush listen", () => {
    const s = playing(builtShip(), "p1");
    s.players[1]!.role = "mush";
    expect(offered(s, "p1")).toContainEqual(listen);
  });

  it("shows the current song to those in the room, and refuses both actions when broken", () => {
    const s = playing(builtShip(), "p3");
    expect(viewFor(s, "p1").roomEquipment.find((e) => e.id === JUKEBOX_ID)?.song).toBe(player(s, "p3").character);
    expect(viewFor(s, "p0").roomEquipment.some((e) => e.id === JUKEBOX_ID)).toBe(false);

    s.equipment[ROOM]!.find((e) => e.id === JUKEBOX_ID)!.broken = true;
    playing(s, "p1");
    expect(viewFor(s, "p1").roomEquipment.find((e) => e.id === JUKEBOX_ID)?.song).toBeUndefined();
    for (const a of [listen, check]) {
      expect(offered(s, "p1")).not.toContainEqual(a);
      expect(applyAction(s, "p1", a).ok).toBe(false);
    }
  });

  it("Check playlist privately lists the next 3 songs", () => {
    const s = builtShip();
    const after = mustApply(s, "p1", check);
    const expected = [1, 2, 3].map((i) => songAt(s, i)!.character);
    expect(after.log.at(-1)).toMatchObject({ key: "jukeboxPlaylist", params: { song1: expected[0], song2: expected[1], song3: expected[2] }, visibleTo: ["p1"] });
    expect(viewFor(after, "p2").log.some((e) => e.key === "jukeboxPlaylist")).toBe(false);
  });
});
