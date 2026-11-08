import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, resolveConfig } from "../src/config.ts";
import { parseGameMessage } from "../src/protocol.ts";
import { queueAction } from "../src/queue.ts";
import { applyInput } from "../src/replay.ts";
import { applyAction, createGame, viewFor } from "../src/rules.ts";
import { STANDARD_KNOBS, setupOverrides } from "../src/setups.ts";
import { normalizeSpot } from "../src/normalizeState.ts";
import { publicStatusesOf } from "../src/statuses.ts";
import { MAX_SPOT_CELL, terminalChairs, walk } from "../src/spot.ts";
import type { GameState } from "../src/types.ts";
import { makeSeats, must, offered, player } from "./support.ts";

const config = { ...DEFAULT_CONFIG, mushCount: 1, startInventory: [], startItems: [], maxAp: 99, startAp: 10, manualCycles: true };

/** p0, p1 and p2 in the laboratory, p3 in the refectory. */
function ship(): GameState {
  const s = createGame(makeSeats(4), config, 3);
  s.players.forEach((p) => (p.room = p.id === "p3" ? "REFECTORY" : "LABORATORY"));
  return s;
}

describe("where you stand", () => {
  it("nobody has a spot until they walk or move", () => {
    expect(ship().players.map((p) => p.spot)).toEqual([undefined, undefined, undefined, undefined]);
  });

  it("walking sets your cell, and sitting if it's a chair", () => {
    const s = must(walk(ship(), "p1", 3, -4, false));
    expect(player(s, "p1").spot).toEqual({ kind: "cell", x: 3, y: -4 });
    expect(player(must(walk(s, "p1", 5, 6, true)), "p1").spot).toEqual({ kind: "cell", x: 5, y: 6, sitting: true });
  });

  it("is free and touches nothing else", () => {
    const s = ship();
    const after = must(walk(s, "p1", 1, 2, false));
    const { spot, ...rest } = player(after, "p1");
    expect(rest).toEqual(player(s, "p1"));
    expect(after.log).toEqual(s.log);
  });

  it("roommates see it; people elsewhere don't", () => {
    const s = must(walk(ship(), "p1", 3, 4, true));
    expect(viewFor(s, "p0").players.find((o) => o.id === "p1")?.spot).toEqual({ kind: "cell", x: 3, y: 4, sitting: true });
    expect(viewFor(s, "p1").you.spot).toEqual({ kind: "cell", x: 3, y: 4, sitting: true });
    expect(viewFor(s, "p3").players.find((o) => o.id === "p1")?.spot).toBeUndefined();
  });

  it("the dead see nobody's spot", () => {
    const s = must(walk(ship(), "p1", 3, 4, false));
    player(s, "p0").alive = false;
    expect(viewFor(s, "p0").players.find((o) => o.id === "p1")?.spot).toBeUndefined();
  });

  it("is refused when dead, in bed, pushed in a wheelchair, or off any room", () => {
    const refused = (setup: (s: GameState) => void, x = 1, y = 1) => {
      const s = ship();
      setup(s);
      return walk(s, "p1", x, y, false);
    };
    expect(refused((s) => (player(s, "p1").alive = false))).toEqual({ ok: false, error: "cant_walk" });
    expect(refused((s) => (player(s, "p1").lyingIn = "bed"))).toEqual({ ok: false, error: "cant_walk" });
    expect(refused((s) => (player(s, "p1").pushedBy = "p0"))).toEqual({ ok: false, error: "cant_walk" });
    expect(refused((s) => (s.phase = "ended"))).toEqual({ ok: false, error: "cant_walk" });
    expect(refused(() => {}, MAX_SPOT_CELL + 1)).toEqual({ ok: false, error: "cant_walk" });
    expect(refused(() => {}, 1.5)).toEqual({ ok: false, error: "cant_walk" });
  });

  it("moving puts you in front of the door you came in by", () => {
    const s = must(walk(ship(), "p1", 3, 4, true));
    const to = s.config.rooms.LABORATORY![0]!;
    const moved = must(applyAction(s, "p1", { type: "move", to }));
    expect(player(moved, "p1").spot).toEqual({ kind: "door", door: "LABORATORY" });
  });

  it("someone pushed in a wheelchair arrives at the same door as the pusher", () => {
    const s = ship();
    player(s, "p2").pushedBy = "p1";
    const to = s.config.rooms.LABORATORY![0]!;
    const moved = must(applyAction(s, "p1", { type: "move", to }));
    expect(player(moved, "p2").spot).toEqual({ kind: "door", door: "LABORATORY" });
  });

  it("pushing a wheelchair, your walk steers it: they go to the cell and you to the one behind, and nobody sits", () => {
    const s = ship();
    player(s, "p2").pushedBy = "p1";
    const steered = must(walk(s, "p1", 3, 4, true, { x: 2, y: 4 }));
    expect(player(steered, "p2").spot).toEqual({ kind: "cell", x: 3, y: 4 });
    expect(player(steered, "p1").spot).toEqual({ kind: "cell", x: 2, y: 4 });
    expect(viewFor(steered, "p0").players.find((o) => o.id === "p2")?.spot).toEqual({ kind: "cell", x: 3, y: 4 });
    // Without a cell behind, you stay where you were.
    expect(player(must(walk(s, "p1", 3, 4, false)), "p1").spot).toBeUndefined();
    expect(walk(s, "p1", 3, 4, false, { x: MAX_SPOT_CELL + 1, y: 0 })).toEqual({ ok: false, error: "cant_walk" });
  });

  it("sending a public action gets you up from a chair, timed or not, and keeps your cell", () => {
    const s = must(walk(ship(), "p1", 3, 4, true));
    const to = s.config.rooms.LABORATORY![0]!;
    const timed = must(queueAction(s, "p1", { type: "move", to }, 1000));
    expect(player(timed, "p1").spot).toEqual({ kind: "cell", x: 3, y: 4 });
    const untimed = must(queueAction(s, "p1", { type: "ready" }, 1000));
    expect(player(untimed, "p1").spot).toEqual({ kind: "cell", x: 3, y: 4 });
  });

  it("a private, secret or covert action leaves you seated as your roommates see it", () => {
    const s = must(walk(ship(), "p1", 3, 4, true));
    const examined = must(queueAction(s, "p1", { type: "examine", target: { kind: "player", id: "p0" } }, 1000));
    expect(player(examined, "p1").spot).toEqual({ kind: "cell", x: 3, y: 4, sitting: true });
    expect(viewFor(examined, "p0").players.find((o) => o.id === "p1")?.spot).toEqual({ kind: "cell", x: 3, y: 4, sitting: true });
  });

  it("can be switched off: walks are refused and nobody's spot is sent", () => {
    const s = must(walk(ship(), "p1", 3, 4, false));
    s.config.sharedSpots = false;
    expect(walk(s, "p1", 5, 6, false)).toEqual({ ok: false, error: "cant_walk" });
    expect(viewFor(s, "p0").players.find((o) => o.id === "p1")?.spot).toBeUndefined();
    expect(viewFor(s, "p0").config.sharedSpots).toBe(false);
  });

  it("off by a setup, no seat's view has anyone else's spot, but yours is still yours", () => {
    const off = resolveConfig(setupOverrides({ ...STANDARD_KNOBS, sharedSpots: false }));
    const s = createGame(makeSeats(4, "others"), { ...config, sharedSpots: off.sharedSpots }, 3);
    s.players.forEach((p, i) => {
      p.room = "LABORATORY";
      p.spot = { kind: "cell", x: i, y: i, sitting: i % 2 === 0 };
    });
    player(s, "p3").alive = false;
    expect(walk(s, "p1", 5, 6, false)).toEqual({ ok: false, error: "cant_walk" });
    for (const p of s.players) {
      const view = viewFor(s, p.id);
      expect(view.players.filter((o) => o.spot !== undefined)).toEqual([]);
      expect(view.you.spot).toEqual(p.spot);
      expect(view.config.sharedSpots).toBe(false);
    }
  });

  it("goes through applyInput, so replays have it", () => {
    const s = must(applyInput(ship(), { type: "walk", x: 2, y: 3, sitting: false, by: "p1" }));
    expect(player(s, "p1").spot).toEqual({ kind: "cell", x: 2, y: 3 });
  });

  it("parses only whole cells in range with a sitting flag", () => {
    expect(parseGameMessage(JSON.stringify({ type: "walk", x: 1, y: -2, sitting: true }))).toEqual({ type: "walk", x: 1, y: -2, sitting: true });
    expect(parseGameMessage(JSON.stringify({ type: "walk", x: 1, y: 2, sitting: false, behind: { x: 0, y: 2 } }))).toEqual({ type: "walk", x: 1, y: 2, sitting: false, behind: { x: 0, y: 2 } });
    for (const bad of [{ x: 1, y: 2, sitting: false, behind: { x: 0.5, y: 2 } }, { x: 1, y: 2, sitting: false, behind: 3 }, { x: 1, y: 2 }, { x: "1", y: 2, sitting: false }, { x: 1.5, y: 2, sitting: false }, { x: MAX_SPOT_CELL + 1, y: 0, sitting: false }]) {
      expect(parseGameMessage(JSON.stringify({ type: "walk", ...bad }))).toBeNull();
    }
  });
});

describe("sitting at a terminal (#192)", () => {
  const LAB = "LABORATORY:RESEARCH_LAB";
  const ASTRO = "COMMAND_CENTER:ASTRO_MODULE";
  const access = (s: GameState, by: string, equipment = LAB) => must(queueAction(s, by, { type: "access", equipment }, 1000));
  const spotOf = (s: GameState, id: string) => player(s, id).spot;

  it("the map names the chairs at the bridge's, the lab's and the turrets' terminals, and none elsewhere", () => {
    expect(terminalChairs("LABORATORY", LAB)).toHaveLength(1);
    for (const t of ["ASTRO_MODULE", "COM_CENTER", "PILOT_MODULE"]) expect(terminalChairs("COMMAND_CENTER", `COMMAND_CENTER:${t}`)).toHaveLength(1);
    for (const r of ["A_0", "A_1", "A_2", "B_0", "B_1", "B_2"]) expect(terminalChairs(`LASER_TURRET_${r}`, `LASER_TURRET_${r}:TURRET_COMMAND`)).toHaveLength(1);
    expect(terminalChairs("NEXUS_ROOM", "NEXUS_ROOM:NERON_CORE")).toEqual([]);
  });

  it("opening it sits you on its free chair; the next person stands at it, and doesn't take the chair when it frees up", () => {
    const s = access(ship(), "p1");
    expect(spotOf(s, "p1")).toEqual({ kind: "occupancy", equipment: LAB, chair: 0 });
    const both = access(s, "p2");
    expect(spotOf(both, "p2")).toEqual({ kind: "occupancy", equipment: LAB });
    const left = must(walk(both, "p1", 1, 1, false));
    expect(spotOf(left, "p2")).toEqual({ kind: "occupancy", equipment: LAB });
    // Opening it again, after the seat freed up, sits you.
    const again = access(must(walk(left, "p2", 2, 2, false)), "p2");
    expect(spotOf(again, "p2")).toEqual({ kind: "occupancy", equipment: LAB, chair: 0 });
  });

  it("opening it again keeps your chair", () => {
    const s = access(ship(), "p1");
    expect(spotOf(access(s, "p1"), "p1")).toEqual(spotOf(s, "p1"));
  });

  it("someone who sat down on the chair by clicking it has it", () => {
    const [chair] = terminalChairs("LABORATORY", LAB);
    const s = access(must(walk(ship(), "p0", chair!.x, chair!.y, true)), "p1");
    expect(spotOf(s, "p1")).toEqual({ kind: "occupancy", equipment: LAB });
    // Standing on its cell doesn't take it.
    expect(spotOf(access(must(walk(ship(), "p0", chair!.x, chair!.y, false)), "p1"), "p1")).toEqual({ kind: "occupancy", equipment: LAB, chair: 0 });
  });

  it("walking (closing its window) and moving end it", () => {
    const s = access(ship(), "p1");
    expect(spotOf(must(walk(s, "p1", 3, 4, false)), "p1")).toEqual({ kind: "cell", x: 3, y: 4 });
    const to = s.config.rooms.LABORATORY![0]!;
    expect(spotOf(must(applyAction(s, "p1", { type: "move", to })), "p1")).toEqual({ kind: "door", door: "LABORATORY" });
  });

  it("the terminal's own actions keep you there, public or private, timed or not", () => {
    const s = access(ship(), "p1");
    // Research is private and timed; Return to Sol and the like are public, but the window stays open.
    const research = offered(s, "p1").find((a) => a.type === "research");
    expect(research).toBeDefined();
    const researched = must(queueAction(s, "p1", research!, 1000));
    expect(spotOf(researched, "p1")).toEqual(spotOf(s, "p1"));
    const ready = must(queueAction(s, "p1", { type: "ready" }, 1000));
    expect(spotOf(ready, "p1")).toEqual(spotOf(s, "p1"));
  });

  it("shows as the public Focused status, to roommates only, sitting or standing", () => {
    const s = access(access(ship(), "p1"), "p2");
    const p0 = viewFor(s, "p0");
    expect(p0.players.find((o) => o.id === "p1")?.statuses).toContain("focused");
    expect(p0.players.find((o) => o.id === "p2")?.statuses).toContain("focused");
    expect(p0.players.find((o) => o.id === "p1")?.spot).toEqual({ kind: "occupancy", equipment: LAB, chair: 0 });
    expect(viewFor(s, "p1").statuses).toContain("focused");
    const p3 = viewFor(s, "p3");
    expect(p3.players.find((o) => o.id === "p1")?.statuses).toEqual([]);
    expect(p3.players.find((o) => o.id === "p1")?.spot).toBeUndefined();
    expect(publicStatusesOf(s, player(must(walk(s, "p1", 1, 1, false)), "p1"))).not.toContain("focused");
  });

  it("isn't taken in bed, in or pushing a wheelchair, or with shared spots off", () => {
    const at = (setup: (s: GameState) => void) => {
      const s = ship();
      setup(s);
      return spotOf(access(s, "p1"), "p1");
    };
    expect(at((s) => (player(s, "p1").lyingIn = "bed"))).toBeUndefined();
    expect(at((s) => (player(s, "p1").pushedBy = "p0"))).toBeUndefined();
    expect(at((s) => (player(s, "p0").pushedBy = "p1"))).toBeUndefined();
    expect(at((s) => (s.config = { ...s.config, sharedSpots: false }))).toBeUndefined();
  });

  it("lying down takes you away from it", () => {
    const s = ship();
    s.players.forEach((p) => (p.room = "BEDROOM_A"));
    const bed = s.equipment.BEDROOM_A!.find((e) => e.type === "BED")!.id;
    player(s, "p1").spot = { kind: "occupancy", equipment: "x" };
    expect(spotOf(must(applyAction(s, "p1", { type: "lie_down", equipment: bed })), "p1")).toBeUndefined();
  });

  it("a terminal with no chair stands you at it", () => {
    const s = ship();
    s.players.forEach((p) => (p.room = "NEXUS_ROOM"));
    expect(spotOf(access(s, "p1", "NEXUS_ROOM:NERON_CORE"), "p1")).toEqual({ kind: "occupancy", equipment: "NEXUS_ROOM:NERON_CORE" });
  });

  it("every chair is taken in turn on the bridge, one per terminal", () => {
    const s = ship();
    s.players.forEach((p) => (p.room = "COMMAND_CENTER"));
    const a = access(s, "p0", ASTRO);
    const b = access(a, "p1", "COMMAND_CENTER:COM_CENTER");
    expect(spotOf(b, "p0")).toEqual({ kind: "occupancy", equipment: ASTRO, chair: 0 });
    expect(spotOf(b, "p1")).toEqual({ kind: "occupancy", equipment: "COMMAND_CENTER:COM_CENTER", chair: 0 });
  });

  it("survives a reload (normalizeSpot), and goes through applyInput", () => {
    const spot = { kind: "occupancy", equipment: LAB, chair: 0 } as const;
    expect(normalizeSpot({ ...spot, extra: 1 } as never)).toEqual(spot);
    expect(normalizeSpot({ kind: "occupancy", equipment: LAB })).toEqual({ kind: "occupancy", equipment: LAB });
    const r = applyInput(ship(), { type: "action", by: "p1", at: 1000, action: { type: "access", equipment: LAB } } as never);
    expect(r.ok && player(r.state, "p1").spot).toEqual(spot);
  });
});
