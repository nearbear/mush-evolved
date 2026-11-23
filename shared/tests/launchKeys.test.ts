import { describe, expect, it } from "vitest";
import { ACTIONS } from "../src/actions.ts";
import { TRAVEL_UNDERWAY } from "../src/actions/action.ts";
import { coupCycle } from "../src/coup.ts";
import { killPlayer } from "../src/death.ts";
import { ICARUS_CRAFT, lostPlace } from "../src/patrol.ts";
import { PILGRED_COMPLETE } from "../src/pilgred.ts";
import { applyAction, createGame, viewFor } from "../src/rules.ts";
import type { Action, GameState } from "../src/types.ts";
import type { TitleId } from "../src/titles.ts";
import { makeSeats, must, nextCycle, offered, option, player, testConfig } from "./support.ts";

const TERMINAL = "COMMAND_CENTER:PILOT_MODULE";
const key = (title: TitleId, on: boolean): Action => ({ type: "set_launch_key", equipment: TERMINAL, title, on });

/** Four on the bridge: p0 Commander, p1 NERON Admin, p2 Comms Officer, p3 no title. */
function bridge(): GameState {
  const s = createGame(makeSeats(4), testConfig({ manualCycles: true }), 7);
  for (const p of s.players) p.room = "COMMAND_CENTER";
  s.titles = { commander: "p0", neron_admin: "p1", comms_officer: "p2" };
  return s;
}

describe("launch keys (#480)", () => {
  it("start out, and each holder inserts and removes their own for free, with a public room line", () => {
    const s = bridge();
    expect(s.launchKeys).toEqual({ commander: false, neron_admin: false, comms_officer: false });
    const ap = player(s, "p1").ap;
    const on = must(applyAction(s, "p1", key("neron_admin", true)));
    expect(on.launchKeys.neron_admin).toBe(true);
    expect(player(on, "p1").ap).toBe(ap);
    expect(on.log.at(-1)).toMatchObject({ key: "launchKeyInserted", room: "COMMAND_CENTER", visibleTo: "all", params: { name: player(s, "p1").character, title: "neron_admin" } });
    const off = must(applyAction(on, "p1", key("neron_admin", false)));
    expect(off.launchKeys.neron_admin).toBe(false);
    expect(off.log.at(-1)).toMatchObject({ key: "launchKeyRemoved", visibleTo: "all" });
  });

  it("offers each holder only their own key, toggled", () => {
    const s = bridge();
    const keys = (id: string, state = s) => offered(state, id).filter((a) => a.type === "set_launch_key");
    expect(keys("p0")).toEqual([key("commander", true)]);
    expect(keys("p3")).toEqual([]);
    expect(keys("p0", must(applyAction(s, "p0", key("commander", true))))).toEqual([key("commander", false)]);
  });

  it("refuses anyone but the holder: no title, another title, a hacked terminal, neron_access; freeHacking may", () => {
    const s = bridge();
    expect(applyAction(s, "p3", key("commander", true)).ok).toBe(false);
    expect(applyAction(s, "p0", key("neron_admin", true)).ok).toBe(false);
    player(s, "p3").hackedEquipment = [TERMINAL];
    expect(applyAction(s, "p3", key("commander", true)).ok).toBe(false);
    player(s, "p3").skills.push("neron_access");
    expect(applyAction(s, "p3", key("neron_admin", true)).ok).toBe(false);
    player(s, "p3").cheats.push("freeHacking");
    expect(offered(s, "p3").filter((a) => a.type === "set_launch_key")).toHaveLength(3);
    expect(must(applyAction(s, "p3", key("comms_officer", true))).launchKeys.comms_officer).toBe(true);
  });

  it("refuses a key already in that position, and leaves the state unchanged when refused", () => {
    const s = bridge();
    const before = structuredClone(s);
    expect(applyAction(s, "p0", key("commander", false)).ok).toBe(false);
    expect(applyAction(s, "p3", key("commander", true)).ok).toBe(false);
    expect(s).toEqual(before);
  });

  it("needs a working Command terminal in the room; a broken one keeps the keys in", () => {
    const s = must(applyAction(bridge(), "p0", key("commander", true)));
    player(s, "p0").room = "LABORATORY";
    expect(applyAction(s, "p0", key("commander", false)).ok).toBe(false);
    expect(s.launchKeys.commander).toBe(true); // stays in after its holder left
    player(s, "p0").room = "COMMAND_CENTER";
    s.equipment.COMMAND_CENTER!.find((e) => e.id === TERMINAL)!.broken = true;
    expect(applyAction(s, "p0", key("commander", false)).ok).toBe(false);
    expect(applyAction(s, "p1", key("neron_admin", true)).ok).toBe(false);
    expect(offered(s, "p0").some((a) => a.type === "set_launch_key")).toBe(false);
    expect(s.launchKeys.commander).toBe(true);
  });

  it("switches a key off when its title changes hands, with no log line", () => {
    let s = must(applyAction(bridge(), "p0", key("commander", true)));
    s = must(applyAction(s, "p1", key("neron_admin", true)));
    const logged = s.log.length;
    killPlayer(s, player(s, "p0"), "injury");
    expect(s.titles.commander).not.toBe("p0");
    expect(s.launchKeys).toEqual({ commander: false, neron_admin: true, comms_officer: false });
    expect(s.log.slice(logged).some((e) => e.key.startsWith("launchKey"))).toBe(false);
  });

  it("switches the Commander's key off after a coup", () => {
    const s = must(applyAction(bridge(), "p0", key("commander", true)));
    player(s, "p3").coupPending = true;
    coupCycle(s);
    expect(s.titles.commander).toBe("p3");
    expect(s.launchKeys.commander).toBe(false);
  });

  it("shows the keys only to the living in a room with a Command terminal, holders included", () => {
    const s = must(applyAction(bridge(), "p0", key("commander", true)));
    expect(viewFor(s, "p3").launchKeys).toEqual({ commander: true, neron_admin: false, comms_officer: false });
    player(s, "p0").room = "LABORATORY";
    expect(viewFor(s, "p0").launchKeys).toBeNull();
    killPlayer(s, player(s, "p3"), "injury");
    expect(viewFor(s, "p3").launchKeys).toBeNull();
  });
});

describe("launch and the final cycle (#480, phase 3)", () => {
  const sol: Action = { type: "return_to_sol", equipment: TERMINAL };
  const eden: Action = { type: "travel_to_eden", equipment: TERMINAL };

  /** Four on the bridge, PILGRED repaired, Eden computed, all keys in, p0 Commander, everyone human. */
  function readyToLaunch(): GameState {
    const s = bridge();
    s.pilgred.progress = PILGRED_COMPLETE;
    s.eden.computed = true;
    s.launchKeys = { commander: true, neron_admin: true, comms_officer: true };
    for (const p of s.players) p.role = "human";
    return s;
  }

  it("decides the Sol winner at the cycle change, not at launch", () => {
    // Mush alive at launch, killed during the final cycle -> humans win.
    const s = readyToLaunch();
    player(s, "p3").role = "mush";
    const launched = must(applyAction(s, "p0", sol));
    expect([launched.phase, launched.winner, launched.launched]).toEqual(["playing", null, { destination: "sol", by: "p0" }]);
    killPlayer(launched, player(launched, "p3"), "injury");
    const ended = nextCycle(launched);
    expect([ended.phase, ended.winner, ended.ending]).toEqual(["ended", "humans", "sol"]);

    // No Mush at launch, someone becomes Mush during the final cycle -> Mush win.
    const s2 = readyToLaunch();
    const launched2 = must(applyAction(s2, "p0", sol));
    player(launched2, "p3").role = "mush";
    const ended2 = nextCycle(launched2);
    expect([ended2.phase, ended2.winner, ended2.ending]).toEqual(["ended", "mush", "sol"]);
  });

  it("ends the game at once as humans_dead if the last human dies during the final cycle", () => {
    const s = readyToLaunch();
    player(s, "p1").role = "mush";
    player(s, "p2").role = "mush";
    player(s, "p3").role = "mush";
    const launched = must(applyAction(s, "p0", eden));
    expect(launched.phase).toBe("playing");
    killPlayer(launched, player(launched, "p0"), "injury");
    expect([launched.phase, launched.winner, launched.ending]).toEqual(["ended", "mush", "humans_dead"]);
  });

  it("kills everyone in a flying patrol ship or on a planet at launch as abandoned, ignoring Magnetic return", () => {
    const s = readyToLaunch();
    s.projects.AUTO_RETURN_ICARUS = 100; // Magnetic return must not rescue on intergalactic launch
    // p1 flying a patrol ship
    s.patrolShips.PATROL_SHIP_A_0!.out = true;
    player(s, "p1").room = "PATROL_SHIP_A_0";
    // p2 on an active Icarus expedition
    player(s, "p2").room = ICARUS_CRAFT;
    s.expeditions.push({ id: "exp-1", members: ["p2"], crew: [player(s, "p2").character], planet: "Kaos", events: [] });
    s.expedition = { report: "exp-1", planet: "pl-1", sectors: [0], nextAt: 999999, carried: { p2: [] }, sabotaged: false, sabotageNext: false, hp: { p2: 14 }, ship: null };
    // p3 lost on a planet
    player(s, "p3").room = lostPlace("p3");

    const launched = must(applyAction(s, "p0", sol));
    expect(launched.phase).toBe("playing");
    for (const id of ["p1", "p2", "p3"]) {
      expect(player(launched, id).alive).toBe(false);
      expect(launched.log.some((e) => e.key === "died" && e.params?.name === player(s, id).character && e.params?.cause === "abandoned")).toBe(true);
    }
    expect(launched.expedition).toBeNull();
    expect(launched.icarusLost).toBe(true);
    expect(launched.patrolShips.PATROL_SHIP_A_0!.destroyed).toBe(true);
  });

  it("a Mush killed off-ship at launch does not count as alive for Sol", () => {
    const s = readyToLaunch();
    player(s, "p3").role = "mush";
    s.patrolShips.PATROL_SHIP_A_0!.out = true;
    player(s, "p3").room = "PATROL_SHIP_A_0";

    const launched = must(applyAction(s, "p0", sol));
    expect(player(launched, "p3").alive).toBe(false);
    const ended = nextCycle(launched);
    expect([ended.phase, ended.winner, ended.ending]).toEqual(["ended", "humans", "sol"]);
  });

  it("ends the game at once as ship_destroyed when off-ship deaths leave no living human", () => {
    const s = readyToLaunch();
    // p0 (Mush Commander) launches while the only human (p1) is in a flying patrol ship; p2/p3 are Mush.
    player(s, "p0").role = "mush";
    player(s, "p2").role = "mush";
    player(s, "p3").role = "mush";
    s.patrolShips.PATROL_SHIP_A_0!.out = true;
    player(s, "p1").room = "PATROL_SHIP_A_0";

    const launched = must(applyAction(s, "p0", sol));
    expect(player(launched, "p1").alive).toBe(false);
    expect([launched.phase, launched.winner, launched.ending]).toEqual(["ended", "mush", "ship_destroyed"]);
  });

  it("does no cycle-change processing at the final cycle change (no hunters, fires, AP, oxygen, incidents)", () => {
    const s = readyToLaunch();
    const launched = must(applyAction(s, "p0", sol));
    launched.ship.hull = 1;
    launched.ship.oxygen = 5;
    launched.hunters.list.push({ id: "h1", type: "hunter", hp: 10, hitChance: 1, target: { kind: "ship" }, countdown: null });
    launched.pendingFires.push("LABORATORY");
    launched.incidentPoints = 1000;
    const apBefore = player(launched, "p0").ap;
    const cycleBefore = launched.cycle;

    const ended = nextCycle(launched);
    expect([ended.phase, ended.winner, ended.ending]).toEqual(["ended", "humans", "sol"]);
    expect(ended.cycle).toBe(cycleBefore);
    expect(ended.ship.hull).toBe(1);
    expect(ended.ship.oxygen).toBe(5);
    expect(ended.fires).toEqual([]);
    expect(player(ended, "p0").ap).toBe(apBefore);
  });

  it("locks key switches, navigation, expedition departures, patrol takeoffs and re-launching while launched", () => {
    const s = readyToLaunch();
    s.planets.p0 = [{ id: "pl-1", name: "Kaos", direction: "north", distance: 1, sectors: [{ tag: "OXYGEN", known: true }] }];
    s.navigation.orbit = "pl-1";
    const launched = must(applyAction(s, "p0", sol));

    const expectLocked = (actor: string, action: Action, shown = true) => {
      expect(applyAction(launched, actor, action).ok).toBe(false);
      expect(ACTIONS[action.type].validate(launched, player(launched, actor), action as never)).toBe(TRAVEL_UNDERWAY);
      if (shown) expect(option(launched, actor, action)?.lacks).toContain("travelUnderway");
    };

    // Key switches locked with travel_underway
    expectLocked("p0", key("commander", false));

    // Re-launching Sol or Eden refused
    expectLocked("p0", sol, false);
    expectLocked("p0", eden, false);

    // Navigation: turn_ship, leave_orbit, travel
    expectLocked("p0", { type: "turn_ship", equipment: TERMINAL, side: "left" });
    expectLocked("p0", { type: "leave_orbit", equipment: TERMINAL });
    launched.navigation.orbit = null;
    expectLocked("p0", { type: "travel", equipment: TERMINAL });

    // Patrol takeoff
    player(launched, "p1").room = "SPACESHIP_BAY_A";
    player(launched, "p1").skills.push("pilot");
    expectLocked("p1", { type: "takeoff", equipment: "SPACESHIP_BAY_A:PATROL_SHIP_A_0" });

    // Expedition departures: board_icarus and icarus_takeoff
    launched.navigation.orbit = "pl-1";
    const bay = launched.config.expedition.room;
    player(launched, "p2").room = bay;
    const icarusEquip = launched.equipment[bay]!.find((e) => e.type === "ICARUS_COMMAND")!.id;
    expectLocked("p2", { type: "board_icarus", equipment: icarusEquip });

    player(launched, "p2").boardedIcarus = true;
    player(launched, "p2").skills.push("pilot");
    expectLocked("p2", { type: "icarus_takeoff" });

    // Other actions (e.g. moving) still work during the final cycle
    const moveAction: Action = { type: "move", to: "CORRIDOR_A" };
    expect(applyAction(launched, "p0", moveAction).ok).toBe(true);
  });

  it("includes launched in every view (bridge, elsewhere, and dead)", () => {
    const s = readyToLaunch();
    for (const id of ["p0", "p1", "p2"]) expect(viewFor(s, id).launched).toBeNull();
    const launched = must(applyAction(s, "p0", sol));
    player(launched, "p1").room = "LABORATORY";
    killPlayer(launched, player(launched, "p2"), "injury");
    for (const id of ["p0", "p1", "p2"]) {
      expect(viewFor(launched, id).launched).toEqual({ destination: "sol", by: "p0" });
    }
  });
});
