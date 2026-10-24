import { describe, expect, it } from "vitest";
import { walkPath } from "../../src/iso/placement.ts";
import { CELLS_PER_SECOND, followTrail, stepWalkers, type Door, type Motion } from "../../src/iso/useWalkers.ts";

const OPEN_MS = 500;
const motion = (over: Partial<Motion>): Motion => ({ pos: { x: 0, y: 0 }, route: [], facing: { strip: "face", flip: false }, arriving: false, waiting: false, ...over });
/** Walking out along x: cells 1 and 2 on this side, the doorway at 3, then 4 beyond. */
const outThroughDoor = () => [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0, door: "t5" }, { x: 4, y: 0 }];

let now = 0;
/** Runs frames of `ms` until `until` holds (or a time limit), returning how long that took. */
function run(motions: Map<string, Motion>, doors: Map<string, Door>, until: () => boolean, ms = 10) {
  const start = now;
  while (!until() && now - start < 10_000) {
    now += ms;
    stepWalkers(motions, doors, now, (CELLS_PER_SECOND * ms) / 1000, () => OPEN_MS);
  }
  return now - start;
}
/** One more frame. */
function frame(motions: Map<string, Motion>, doors: Map<string, Door>, ms = 10) {
  now += ms;
  stepWalkers(motions, doors, now, (CELLS_PER_SECOND * ms) / 1000, () => OPEN_MS);
}

describe("stepWalkers", () => {
  it("opens a door ahead of someone walking up to it, so they go straight through", () => {
    const m = motion({ pos: { x: -2, y: 0 }, route: outThroughDoor() });
    const motions = new Map([["p1", m]]), doors = new Map<string, Door>();
    run(motions, doors, () => doors.has("t5"));
    // Opened while they were still more than a cell away.
    expect(3 - m.pos.x).toBeGreaterThan(1);
    let waited = false;
    run(motions, doors, () => {
      waited ||= m.waiting;
      return m.route.length === 0;
    });
    expect(waited).toBe(false);
  });

  it("makes someone standing at a shut door wait, stepping into the doorway as it is open", () => {
    const m = motion({ pos: { x: 2, y: 0 }, route: [{ x: 3, y: 0, door: "t5" }, { x: 4, y: 0 }] });
    const motions = new Map([["p1", m]]), doors = new Map<string, Door>();
    frame(motions, doors);
    expect(m.waiting).toBe(true);
    const reached = run(motions, doors, () => m.pos.x >= 3);
    expect(reached).toBeGreaterThanOrEqual(OPEN_MS - 20);
    expect(reached).toBeLessThan(OPEN_MS + 20);
  });

  it("keeps the door open while someone stands in it, and shuts it once they're through", () => {
    const m = motion({ pos: { x: 2, y: 0 }, route: [{ x: 3, y: 0, door: "t5" }] });
    const motions = new Map([["p1", m]]), doors = new Map<string, Door>();
    run(motions, doors, () => m.route.length === 0);
    for (let i = 0; i < 10; i++) frame(motions, doors, 100);
    expect(doors.get("t5")?.state).toBe("opening");
    m.route = [{ x: 4, y: 0 }];
    run(motions, doors, () => m.route.length === 0);
    expect(doors.get("t5")?.state).toBe("closing");
  });

  it("leaves an open door open for someone coming in from its doorway, then shuts it behind them", () => {
    // As you come into a room: from the doorway to the cell in front of it, and no further.
    const m = motion({ pos: { x: 3, y: 0 }, inDoor: "t5", route: [{ x: 2, y: 0 }] });
    const motions = new Map([["p1", m]]), doors = new Map<string, Door>([["t5", { state: "open", since: 0 }]]);
    let waited = false;
    run(motions, doors, () => {
      waited ||= m.waiting;
      return m.route.length === 0;
    });
    expect(waited).toBe(false);
    // Shut by the frame they stop in: no frame comes after it.
    expect(doors.get("t5")?.state).toBe("closing");
  });
});

describe("followTrail (pushing a wheelchair)", () => {
  /** A 6 by 6 floor. */
  const floor = Array.from({ length: 36 }, (_, i) => ({ x: i % 6, y: Math.floor(i / 6) }));

  it("walks the leader's trail and stops a cell short, keeping a cell behind all the way", () => {
    const leader = motion({ pos: { x: 1, y: 0 }, route: walkPath(floor, { x: 1, y: 0 }, { x: 4, y: 3 })!.slice(1) });
    const pusher = motion({ pos: { x: 0, y: 0 } });
    followTrail(floor, pusher, leader);
    expect(pusher.route.at(-1)).toEqual(leader.route.at(-2));
    const motions = new Map([["terrence", leader], ["pusher", pusher]]), doors = new Map<string, Door>();
    while (leader.route.length) {
      frame(motions, doors);
      const gap = Math.abs(leader.pos.x - pusher.pos.x) + Math.abs(leader.pos.y - pusher.pos.y);
      expect(gap).toBeCloseTo(1, 5);
    }
  });

  it("steps up beside a leader who stands still, and leaves someone already there put", () => {
    const leader = motion({ pos: { x: 3, y: 3 } });
    const far = motion({ pos: { x: 0, y: 3 } });
    followTrail(floor, far, leader);
    expect(far.route.at(-1)).toEqual({ x: 2, y: 3 });
    const near = motion({ pos: { x: 2, y: 3 } });
    followTrail(floor, near, leader);
    expect(near.route).toEqual([]);
  });

  it("jumps there with the instant actions cheat", () => {
    const leader = motion({ pos: { x: 0, y: 0 }, route: [{ x: 1, y: 0 }, { x: 2, y: 0 }] });
    const pusher = motion({ pos: { x: 0, y: 1 } });
    followTrail(floor, pusher, leader, true);
    expect(pusher.pos).toEqual({ x: 1, y: 0 });
    expect(pusher.route).toEqual([]);
  });
});
