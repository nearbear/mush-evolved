import { describe, expect, it } from "vitest";
import { actionVisibility, ACTIONS } from "../src/actions.ts";
import { killPlayer } from "../src/death.ts";
import { cure } from "../src/infection.ts";
import { CAMERA_EQUIPMENT } from "../src/equipment.ts";
import { ITRACKIE_ITEM } from "../src/itemIds.ts";
import { applyAction, createGame, viewFor } from "../src/rules.ts";
import { queueAction } from "../src/queue.ts";
import { createChannel } from "../src/chat.ts";
import { postPlan } from "../src/plans.ts";
import type { GameState } from "../src/types.ts";
import { makeSeats, must, mustApply, nextCycle, option, player, testConfig } from "./support.ts";

const base = testConfig();
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

    // With a witness present, the drop stays plain public (no secret badge that would give the Mush away).
    player(s, "p1").room = ROOM_A;
    const witnessed = mustApply(s, "p0", { type: "drop", item: "test-item-1" });
    const p1Log = viewFor(witnessed, "p1").log.at(-1)!;
    expect(p1Log.key).toBe("dropped");
    expect(p1Log.kind).toBeUndefined();
    expect(p1Log.leaked).toBeUndefined();
  });

  it("hides movement between empty rooms without cameras, and stays public when entering or leaving a room with a player or camera", () => {
    const baseNimble = mustApply(ship(), "p0", { type: "enter_nimble" });

    // Empty ROOM_A -> empty ROOM_B (no cameras): both left and entered are hidden.
    const quiet = mustApply(baseNimble, "p0", { type: "move", to: ROOM_B });
    expect(quiet.log.filter((l) => l.key === "left" || l.key === "entered").every((l) => l.kind === "secret" && !l.leaked)).toBe(true);
    player(quiet, "p1").room = ROOM_A;
    expect(viewFor(quiet, "p1").log.some((l) => l.key === "leftRoom")).toBe(false);
    player(quiet, "p1").room = ROOM_B;
    expect(viewFor(quiet, "p1").log.some((l) => l.key === "enteredRoom")).toBe(false);

    // Camera in ROOM_A -> empty ROOM_B: left looks public in ROOM_A, entered is hidden in ROOM_B.
    const camLeave = mustApply(ship(), "p0", { type: "enter_nimble" });
    camLeave.equipment[ROOM_A] = [{ id: "cam-a", type: CAMERA_EQUIPMENT }];
    const leftCam = mustApply(camLeave, "p0", { type: "move", to: ROOM_B });
    player(leftCam, "p1").room = ROOM_A;
    const leftEntry = viewFor(leftCam, "p1").log.find((l) => l.key === "leftRoom");
    expect(leftEntry).toBeDefined();
    expect(leftEntry?.kind).toBeUndefined();
    expect(leftEntry?.leaked).toBeUndefined();
    player(leftCam, "p1").room = ROOM_B;
    expect(viewFor(leftCam, "p1").log.some((l) => l.key === "enteredRoom")).toBe(false);

    // Empty ROOM_A -> ROOM_C with p1: left is hidden in ROOM_A, entered looks public in ROOM_C.
    const intoWitness = mustApply(ship(), "p0", { type: "enter_nimble" });
    const enteredWitness = mustApply(intoWitness, "p0", { type: "move", to: ROOM_C });
    const enteredEntry = viewFor(enteredWitness, "p1").log.find((l) => l.key === "enteredRoom");
    expect(enteredEntry).toBeDefined();
    expect(enteredEntry?.kind).toBeUndefined();
    expect(enteredEntry?.leaked).toBeUndefined();
    player(enteredWitness, "p1").room = ROOM_A;
    expect(viewFor(enteredWitness, "p1").log.some((l) => l.key === "leftRoom")).toBe(false);
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

  it("does not hide a death caused during a Nimble action", () => {
    let killed = mustApply(ship(), "p0", { type: "enter_nimble" });
    player(killed, "p1").room = ROOM_A;
    player(killed, "p1").hp = 1;
    while (player(killed, "p1").alive) {
      killed = mustApply(killed, "p0", { type: "attack", target: "p1", weapon: "test-item-1" });
    }
    expect(player(killed, "p1").alive).toBe(false);

    // Even with no other living witness in ROOM_A when p1 dies, the death line stays public room history.
    player(killed, "p2").room = ROOM_A;
    const diedLine = viewFor(killed, "p2").log.find((l) => l.key === "died");
    expect(diedLine).toBeDefined();
    expect(diedLine?.kind).toBeUndefined();
    expect(diedLine?.visibleTo).toBe("all");
  });

  it("does not apply Nimble mode to another player's summons moves", () => {
    let s = mustApply(ship(), "p0", { type: "enter_nimble" });
    s.items.push(
      { id: "it-0", type: ITRACKIE_ITEM, at: { kind: "player", id: "p0" } },
      { id: "it-1", type: ITRACKIE_ITEM, at: { kind: "player", id: "p1" } },
    );
    s = must(createChannel(s, "p0", "ops", ["p1"]));
    const channel = s.channels.find((c) => c.name === "ops")!.id;
    s = must(postPlan(s, "p0", { channel, room: ROOM_A, purpose: "meal", slots: [{ kind: "onCall" }] }));
    const plan = s.plans[0]!.id;
    s = mustApply(s, "p1", { type: "claim_slot", plan, slot: 0 });

    // p1 walks from ROOM_C -> ROOM_A (adjacent). p0 is Nimble in ROOM_A, p1 is not Nimble.
    const summoned = mustApply(s, "p0", { type: "summon", plan });
    expect(player(summoned, "p1").room).toBe(ROOM_A);

    // p1's departure from ROOM_C (where only p2 was, then p1 left) and arrival in ROOM_A stay public under p1's name.
    const p1Left = summoned.log.find((l) => l.key === "left" && l.params?.name === player(summoned, "p1").character);
    expect(p1Left).toBeDefined();
    expect(p1Left?.kind).toBeUndefined();
    expect(p1Left?.visibleTo).toBe("all");
  });
});
