import { describe, expect, it } from "vitest";
import { actionVisibility, ACTIONS } from "../src/actions.ts";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { killPlayer } from "../src/death.ts";
import { cure } from "../src/infection.ts";
import { CAMERA_EQUIPMENT } from "../src/equipment.ts";
import { applyAction, createGame, viewFor } from "../src/rules.ts";
import { queueAction } from "../src/queue.ts";
import type { GameState } from "../src/types.ts";
import { makeSeats, mustApply, nextCycle, option, player } from "./support.ts";

const base = { ...DEFAULT_CONFIG, mushCount: 1, startInventory: [], startItems: [], startSkills: [] };
const ROOM_A = Object.keys(base.rooms).find((r) => base.rooms[r]!.length >= 2)!;
const ROOM_B = base.rooms[ROOM_A]![0]!;
const ROOM_C = base.rooms[ROOM_A]![1]!;

/** p0 is Mush with nimble_fingers in ROOM_A; p1 and p2 are humans in ROOM_C. */
function ship(): GameState {
  const s = createGame(makeSeats(3), base, 42);
  player(s, "p0").role = "mush";
  player(s, "p0").mushSkills = ["nimble_fingers"];
  player(s, "p0").room = ROOM_A;
  player(s, "p1").role = "human";
  player(s, "p1").room = ROOM_C;
  player(s, "p2").role = "human";
  player(s, "p2").room = ROOM_C;
  s.items.push({ id: "test-item-1", type: "knife", at: { kind: "player", id: "p0" } });
  return s;
}

describe("nimble fingers", () => {
  it("only Mush with nimble_fingers can enter Nimble mode, for 0 AP and instant", () => {
    const s = ship();
    expect(ACTIONS.enter_nimble.timed).toBe(false);
    expect(ACTIONS.exit_nimble.timed).toBe(false);
    expect(option(s, "p1", { type: "enter_nimble" })).toBeUndefined();
    expect(applyAction(s, "p1", { type: "enter_nimble" }).ok).toBe(false);

    player(s, "p0").mushSkills = [];
    expect(option(s, "p0", { type: "enter_nimble" })).toBeUndefined();
    expect(applyAction(s, "p0", { type: "enter_nimble" }).ok).toBe(false);

    player(s, "p0").mushSkills = ["nimble_fingers"];
    const o = option(s, "p0", { type: "enter_nimble" })!;
    expect(o.cost).toEqual({ ap: 0, mp: 0 });
    const after = mustApply(s, "p0", { type: "enter_nimble" });
    expect(viewFor(after, "p0").statuses).toContain("nimble");
    expect(viewFor(after, "p0").log.at(-1)?.key).toBe("enteredNimble");
    expect(viewFor(after, "p0").log.at(-1)?.kind).toBe("private");
  });

  it("hides the nimble status and toggle logs from everyone else", () => {
    const s = mustApply(ship(), "p0", { type: "enter_nimble" });
    player(s, "p1").room = ROOM_A;
    const p1View = viewFor(s, "p1");
    expect(p1View.players.find((o) => o.id === "p0")!.statuses).not.toContain("nimble");
    expect(p1View.log.some((l) => l.key === "enteredNimble")).toBe(false);

    const exited = mustApply(s, "p0", { type: "exit_nimble" });
    expect(viewFor(exited, "p0").statuses).not.toContain("nimble");
    expect(viewFor(exited, "p0").log.at(-1)?.key).toBe("exitedNimble");
    expect(viewFor(exited, "p1").log.some((l) => l.key === "exitedNimble")).toBe(false);
  });

  it("persists across cycles and ends on death", () => {
    const s = mustApply(ship(), "p0", { type: "enter_nimble" });
    const cycled = nextCycle(s);
    expect(viewFor(cycled, "p0").statuses).toContain("nimble");

    killPlayer(cycled, player(cycled, "p0"), "injury");
    expect(player(cycled, "p0").statuses).not.toContain("nimble");
  });

  it("turns room-level public actions into secret actions", () => {
    const s = mustApply(ship(), "p0", { type: "enter_nimble" });
    const dropped = mustApply(s, "p0", { type: "drop", item: "test-item-1" });
    const actorLog = viewFor(dropped, "p0").log.at(-1)!;
    expect(actorLog.key).toBe("dropped");
    expect(actorLog.kind).toBe("secret");
    expect(actorLog.leaked).toBeUndefined();

    // Moving p1 into ROOM_A later does not retroactively reveal the unwitnessed secret drop.
    player(dropped, "p1").room = ROOM_A;
    expect(viewFor(dropped, "p1").log.some((l) => l.key === "dropped")).toBe(false);

    // With a witness present, the drop becomes leaked room history with the secret kind.
    player(s, "p1").room = ROOM_A;
    const witnessed = mustApply(s, "p0", { type: "drop", item: "test-item-1" });
    const p1Log = viewFor(witnessed, "p1").log.at(-1)!;
    expect(p1Log.key).toBe("dropped");
    expect(p1Log.kind).toBe("secret");
    expect(p1Log.leaked).toBe(true);
  });

  it("hides movement between empty rooms without cameras, and reveals it when entering or leaving a room with a player or camera", () => {
    const baseNimble = mustApply(ship(), "p0", { type: "enter_nimble" });

    // Empty ROOM_A -> empty ROOM_B (no cameras): both left and entered are hidden.
    const quiet = mustApply(baseNimble, "p0", { type: "move", to: ROOM_B });
    expect(quiet.log.filter((l) => l.key === "left" || l.key === "entered").every((l) => l.kind === "secret" && !l.leaked)).toBe(true);
    player(quiet, "p1").room = ROOM_A;
    expect(viewFor(quiet, "p1").log.some((l) => l.key === "left")).toBe(false);
    player(quiet, "p1").room = ROOM_B;
    expect(viewFor(quiet, "p1").log.some((l) => l.key === "entered")).toBe(false);

    // Camera in ROOM_A -> empty ROOM_B: left is leaked in ROOM_A, entered is hidden in ROOM_B.
    const camLeave = mustApply(ship(), "p0", { type: "enter_nimble" });
    camLeave.equipment[ROOM_A] = [{ id: "cam-a", type: CAMERA_EQUIPMENT }];
    const leftCam = mustApply(camLeave, "p0", { type: "move", to: ROOM_B });
    player(leftCam, "p1").room = ROOM_A;
    const leftEntry = viewFor(leftCam, "p1").log.find((l) => l.key === "left");
    expect(leftEntry?.kind).toBe("secret");
    expect(leftEntry?.leaked).toBe(true);
    player(leftCam, "p1").room = ROOM_B;
    expect(viewFor(leftCam, "p1").log.some((l) => l.key === "entered")).toBe(false);

    // Empty ROOM_A -> ROOM_C with p1: left is hidden in ROOM_A, entered is leaked in ROOM_C.
    const intoWitness = mustApply(ship(), "p0", { type: "enter_nimble" });
    const enteredWitness = mustApply(intoWitness, "p0", { type: "move", to: ROOM_C });
    const enteredEntry = viewFor(enteredWitness, "p1").log.find((l) => l.key === "entered");
    expect(enteredEntry?.kind).toBe("secret");
    expect(enteredEntry?.leaked).toBe(true);
    player(enteredWitness, "p1").room = ROOM_A;
    expect(viewFor(enteredWitness, "p1").log.some((l) => l.key === "left")).toBe(false);
  });

  it("keeps ship-wide announcements public and updates actionVisibility in Nimble mode", () => {
    const s = mustApply(ship(), "p0", { type: "enter_nimble" });
    const view = viewFor(s, "p0");
    expect(actionVisibility("drop", view)).toBe("secret");
    expect(actionVisibility("move", view)).toBe("secret");
    expect(actionVisibility("travel", view)).toBe("public");

    // Travel ship-wide log stays public.
    const bridge = Object.keys(s.equipment).find((r) => s.equipment[r]!.some((e) => e.type === "PILOT_MODULE"))!;
    player(s, "p0").room = bridge;
    s.titles.commander = "p0";
    s.navigation.orbit = null;
    s.ship.combustion = 1;
    const cmd = s.equipment[bridge]!.find((e) => e.type === "PILOT_MODULE")!;
    const traveled = mustApply(s, "p0", { type: "travel", equipment: cmd.id });
    const shipLog = viewFor(traveled, "p1").log.find((l) => l.key === "shipTraveled");
    expect(shipLog).toBeDefined();
    expect(shipLog?.kind).toBeUndefined();
  });

  it("keeps the actor seated and does not end wheelchair accommodation when queueing a room-level public action in Nimble mode", () => {
    const s = mustApply(ship(), "p0", { type: "enter_nimble" });
    player(s, "p0").spot = { kind: "cell", x: 100, y: 100, sitting: true };
    player(s, "p1").room = ROOM_A;
    player(s, "p1").pushedBy = "p0";
    const queued = queueAction(s, "p0", { type: "bond", target: "p1" }, 1000);
    expect(queued.ok).toBe(true);
    if (!queued.ok) return;
    expect(player(queued.state, "p0").spot).toEqual({ kind: "cell", x: 100, y: 100, sitting: true });
    expect(player(queued.state, "p1").pushedBy).toBe("p0");
  });

  it("clears nimble mode when cured by anti-Mush serum", () => {
    const s = mustApply(ship(), "p0", { type: "enter_nimble" });
    expect(cure(s, player(s, "p0"))).toBe(true);

    const p0View = viewFor(s, "p0");
    expect(p0View.statuses).not.toContain("nimble");
    expect(option(s, "p0", { type: "exit_nimble" })).toBeUndefined();
    expect(applyAction(s, "p0", { type: "exit_nimble" }).ok).toBe(false);
    expect(actionVisibility("drop", p0View)).toBe("public");

    const dropped = mustApply(s, "p0", { type: "drop", item: "test-item-1" });
    expect(viewFor(dropped, "p0").log.at(-1)?.kind).toBeUndefined();
  });
});
