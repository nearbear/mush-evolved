import { describe, expect, it } from "vitest";
import { endsAccommodation } from "../src/actionTarget.ts";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { killPlayer } from "../src/death.ts";
import { nextDue, queueAction, tick } from "../src/queue.ts";
import { applyAction, createGame, viewFor } from "../src/rules.ts";
import { overheadStatuses } from "../src/statuses.ts";
import type { Action, GameState } from "../src/types.ts";
import { clone, makeSeats, must, mustApply, offered, player } from "./support.ts";

// p0 is Terrence; p1 and p2 are not. Everyone starts in the laboratory.
const HERE = "LABORATORY";
const seats = makeSeats(3).map((s, i) => (i === 0 ? { ...s, character: "terrence" as const } : s));
// MP starts empty, so the pusher's move converts AP.
const config = { ...DEFAULT_CONFIG, mushCount: 1, startInventory: [], startItems: [], startMp: 0 };
const NEXT = config.rooms[HERE]![0]!;

function ship(): GameState {
  const s = createGame(seats, config, 7);
  for (const p of s.players) p.room = HERE;
  return s;
}

const offer: Action = { type: "accommodate", target: "p0" };
const accept: Action = { type: "accept_accommodation", target: "p1" };
const move: Action = { type: "move", to: NEXT };
const logged = (s: GameState, key: string) => s.log.some((e) => e.key === key);

/** p1 offers and Terrence accepts. */
const pushed = (): GameState => mustApply(mustApply(ship(), "p1", offer), "p0", accept);

describe("accommodating Terrence", () => {
  it("pins the confirmed numbers: offering is free, and an offer waits 5 minutes", () => {
    expect([config.accommodate.cost.ap, config.accommodate.offerMs]).toEqual([0, 300_000]);
  });

  it("is offered to others in Terrence's room, on Terrence only", () => {
    const s = ship();
    expect(player(s, "p0").modifiers).toContain("wheelchair");
    expect(offered(s, "p1")).toContainEqual(offer);
    expect(offered(s, "p1")).not.toContainEqual({ type: "accommodate", target: "p2" });
    expect(offered(s, "p0").some((a) => a.type === "accommodate")).toBe(false);
    player(s, "p1").room = NEXT;
    expect(offered(s, "p1")).not.toContainEqual(offer);
  });

  it("waits for Terrence to accept, and can't be offered twice", () => {
    const s = mustApply(ship(), "p1", offer);
    expect(player(s, "p0").pushedBy).toBeUndefined();
    expect(logged(s, "accommodationOffered")).toBe(true);
    expect(offered(s, "p0")).toContainEqual(accept);
    expect(offered(s, "p1")).not.toContainEqual(offer);
    expect(applyAction(s, "p1", offer).ok).toBe(false);
    // Nobody else can accept for him.
    expect(applyAction(s, "p2", accept).ok).toBe(false);
  });

  it("starts the push when Terrence accepts, publicly", () => {
    const s = pushed();
    expect(player(s, "p0").pushedBy).toBe("p1");
    expect(player(s, "p0").accommodationOffers).toBeUndefined();
    expect(logged(s, "accommodated")).toBe(true);
    const seen = viewFor(s, "p2").players.find((p) => p.id === "p0")!;
    expect(seen.pushedBy).toBe("p1");
    expect(seen.statuses).toContain("accommodated");
    expect(viewFor(s, "p0").statuses).toContain("accommodated");
    // Nobody else can push him meanwhile.
    expect(offered(s, "p2")).not.toContainEqual(offer);
  });

  it("an offer lapses when the offerer leaves the room", () => {
    let s = mustApply(ship(), "p1", offer);
    s = mustApply(s, "p1", move);
    player(s, "p1").room = HERE;
    expect(player(s, "p0").accommodationOffers).toBeUndefined();
    expect(applyAction(s, "p0", accept).ok).toBe(false);
  });

  it("locks Terrence's own movement while pushed", () => {
    const s = pushed();
    expect(offered(s, "p0").some((a) => a.type === "move")).toBe(false);
    const before = clone(s);
    expect(applyAction(s, "p0", move).ok).toBe(false);
    expect(s).toEqual(before);
  });

  it("takes Terrence along when the pusher moves, at no cost to him", () => {
    const s0 = pushed();
    const t0 = player(s0, "p0");
    const p0 = player(s0, "p1");
    const s = mustApply(s0, "p1", move);
    const t = player(s, "p0");
    expect([player(s, "p1").room, t.room]).toEqual([NEXT, NEXT]);
    expect([t.ap, t.mp]).toEqual([t0.ap, t0.mp]);
    // The pusher pays an ordinary move: MP start at 0, so one AP converts.
    const p = player(s, "p1");
    expect(p0.ap - p.ap).toBe(config.movement.apPerConversion);
    expect(p.mp).toBe(config.movement.mpPerConversion - config.movement.mpPerMove);
    expect(t.pushedBy).toBe("p1");
    expect(s.log.filter((e) => e.key === "entered" && e.params?.name === "terrence")).toHaveLength(1);
  });

  it("gets Terrence out of bed when he is wheeled away", () => {
    const s0 = pushed();
    player(s0, "p0").modifiers.push("lying_down");
    player(s0, "p0").lyingIn = "BED";
    const t = player(mustApply(s0, "p1", move), "p0");
    expect(t.modifiers).not.toContain("lying_down");
    expect(t.lyingIn).toBeUndefined();
  });

  it("can be stopped by either side, after which Terrence moves on his own", () => {
    for (const who of ["p0", "p1"]) {
      const s0 = pushed();
      const stop: Action = { type: "stop_accommodation", target: "p0" };
      expect(offered(s0, who)).toContainEqual(stop);
      expect(offered(s0, "p2")).not.toContainEqual(stop);
      const s = mustApply(s0, who, stop);
      expect(player(s, "p0").pushedBy).toBeUndefined();
      expect(logged(s, "accommodationEnded")).toBe(true);
      expect(offered(s, "p0")).toContainEqual(move);
      expect(player(mustApply(s, "p1", move), "p0").room).toBe(HERE);
    }
  });

  it("lapses if Terrence doesn't accept in time", () => {
    const { durationMs } = config.action;
    const T0 = 1_000_000;
    // The offer is timed: it is made when its bar runs out.
    let s = must(queueAction(ship(), "p1", offer, T0));
    s = must(tick(s, T0 + durationMs));
    const until = T0 + durationMs + config.accommodate.offerMs;
    expect(player(s, "p0").accommodationOffers).toEqual([{ by: "p1", until }]);
    // The server wakes for it like for an action bar.
    expect(nextDue(s)).toBe(until);
    expect(tick(s, until - 1).ok).toBe(false);
    const lapsed = must(tick(s, until));
    expect(player(lapsed, "p0").accommodationOffers).toBeUndefined();
    expect(offered(lapsed, "p0")).not.toContainEqual(accept);
    expect(nextDue(lapsed)).toBeNull();
    // Accepted in time, it starts.
    const taken = must(tick(must(queueAction(s, "p0", accept, until - durationMs - 1)), until - 1));
    expect(player(taken, "p0").pushedBy).toBe("p1");
  });

  it("is ended at once, without queueing", () => {
    const s0 = pushed();
    const stop: Action = { type: "stop_accommodation", target: "p0" };
    const s = must(queueAction(s0, "p0", stop, 5));
    expect(player(s, "p0").pushedBy).toBeUndefined();
    expect(player(s, "p0").current).toBeNull();
  });

  it("ends when either of them dies", () => {
    for (const who of ["p0", "p1"]) {
      const s = pushed();
      killPlayer(s, player(s, who));
      expect(player(s, "p0").pushedBy).toBeUndefined();
    }
    const s = mustApply(ship(), "p1", offer);
    killPlayer(s, player(s, "p1"));
    expect(player(s, "p0").accommodationOffers).toBeUndefined();
  });
});

describe("acting ends the push (owner, 2026-10-24)", () => {
  const research: Action = { type: "research", equipment: "LABORATORY:RESEARCH_LAB", research: "MYCOSCAN" };
  const examine: Action = { type: "examine", target: { kind: "equipment", id: "LABORATORY:RESEARCH_LAB" } };

  it("ends when the pusher sends a public action on equipment, as soon as it is sent, publicly", () => {
    const s = must(queueAction(pushed(), "p1", research, 1000));
    expect(player(s, "p0").pushedBy).toBeUndefined();
    expect(s.log.at(-1)?.key).toBe("accommodationEnded");
    expect(viewFor(s, "p2").log.some((e) => e.key === "accommodationEnded")).toBe(true);
  });

  it("ends when Terrence himself sends one", () => {
    expect(player(must(queueAction(pushed(), "p0", research, 1000)), "p0").pushedBy).toBeUndefined();
  });

  it("doesn't end for a private action, which would give it away, or for someone else's", () => {
    expect(player(must(queueAction(pushed(), "p1", examine, 1000)), "p0").pushedBy).toBe("p1");
    expect(player(must(queueAction(pushed(), "p2", research, 1000)), "p0").pushedBy).toBe("p1");
  });

  it("counts public actions on equipment or another person, not on items, yourself, or the push itself", () => {
    expect(endsAccommodation(research, "p1", "public")).toBe(true);
    expect(endsAccommodation({ type: "take_fuel", equipment: "e1" }, "p1", "public")).toBe(true);
    expect(endsAccommodation({ type: "punch", target: "p2" }, "p1", "public")).toBe(true);
    expect(endsAccommodation({ type: "vaccinate", target: "p2" }, "p1", "public")).toBe(true);
    expect(endsAccommodation({ type: "heal", target: "p1" }, "p1", "public")).toBe(false);
    expect(endsAccommodation({ type: "take", item: "i1" }, "p1", "public")).toBe(false);
    expect(endsAccommodation({ type: "drop", item: "i1" }, "p1", "public")).toBe(false);
    expect(endsAccommodation(move, "p1", "public")).toBe(false);
    expect(endsAccommodation(accept, "p0", "public")).toBe(false);
    expect(endsAccommodation({ type: "stop_accommodation", target: "p0" }, "p1", "public")).toBe(false);
    expect(endsAccommodation(research, "p1", "covert")).toBe(false);
  });
});

describe("the wheelchair trait", () => {
  it("is a public status on Terrence, kept off the over-head badges", () => {
    const s = ship();
    expect(viewFor(s, "p1").players.find((p) => p.id === "p0")!.statuses).toContain("wheelchair");
    expect(overheadStatuses(["wheelchair", "accommodated"])).toEqual(["accommodated"]);
  });
});
