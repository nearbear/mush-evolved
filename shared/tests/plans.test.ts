// Channel plans and on-call summons (docs/plans/on-call.md): posting, claiming, the summons walk, cleanup and expiry,
// and who sees what.

import { describe, expect, it } from "vitest";
import { createChannel, inviteToChannel, leaveChannel } from "../src/chat.ts";
import { ITRACKIE_ITEM } from "../src/items.ts";
import { killPlayer } from "../src/death.ts";
import { postPlan } from "../src/plans.ts";
import { clearQueue, queueAction } from "../src/queue.ts";
import { applyAction, createGame, viewFor, type ActionResult } from "../src/rules.ts";
import type { DraftSlot, GameState, PlanDraft, PlayerId, PrivateChannelId } from "../src/types.ts";
import { clone, makeSeats, must, mustApply, nextCycle, nextDay, offered, player, testConfig } from "./support.ts";

/** Everyone carries an iTrackie, as on a real ship: the summons go through it. */
const config = testConfig({ startInventory: [ITRACKIE_ITEM] });
/** Three doors from the lab: CORRIDOR_A, CORRIDOR_B, REFECTORY. */
const LAB = "LABORATORY";
const MESS = "REFECTORY";

const error = (r: ActionResult): string => {
  if (r.ok) throw new Error("expected a failure");
  return r.error;
};

/** p0 created "crew" with p1, p2 and p3 in it; p4 is outside. Everyone in the lab. */
function ship(): { s: GameState; channel: PrivateChannelId } {
  let s = createGame(makeSeats(5), config, 7);
  for (const p of s.players) p.room = LAB;
  s = must(createChannel(s, "p0", "crew", ["p1", "p2", "p3"]));
  return { s, channel: s.channels[0]!.id };
}

const draft = (channel: PrivateChannelId, slots: DraftSlot[], room = MESS): PlanDraft => ({ channel, room, purpose: "meal", slots });
const onCall = (reservedFor?: PlayerId): DraftSlot => (reservedFor ? { kind: "onCall", reservedFor } : { kind: "onCall" });

/** `ship()` with p0's plan: three on-call slots and a fiery speech task, to the refectory. */
function planned() {
  const { s, channel } = ship();
  const next = must(postPlan(s, "p0", draft(channel, [onCall(), onCall(), onCall(), { kind: "task", task: { type: "fiery_speech" } }])));
  return { s: next, channel, plan: next.plans[0]!.id };
}

const claim = (s: GameState, id: PlayerId, plan: string, slot: number) => mustApply(s, id, { type: "claim_slot", plan, slot });
const keysOf = (s: GameState, id: PlayerId) => viewFor(s, id).log.map((e) => e.key);

describe("posting a plan", () => {
  it("stores an open plan with unclaimed slots, posted today", () => {
    const { s, channel } = planned();
    expect(s.plans).toEqual([
      {
        id: "plan-1",
        channel,
        author: "p0",
        room: MESS,
        purpose: "meal",
        slots: [
          { kind: "onCall", holder: null },
          { kind: "onCall", holder: null },
          { kind: "onCall", holder: null },
          { kind: "task", task: { type: "fiery_speech" }, holder: null, done: false },
        ],
        status: "open",
        postedDay: 1,
      },
    ]);
  });

  it("only the channel's creator may post, and only one open plan at a time", () => {
    const { s, channel } = ship();
    expect(error(postPlan(s, "p1", draft(channel, [onCall()])))).toBe("plan_forbidden");
    expect(error(postPlan(s, "p4", draft(channel, [onCall()])))).toBe("plan_forbidden");
    const posted = must(postPlan(s, "p0", draft(channel, [onCall()])));
    expect(error(postPlan(posted, "p0", draft(channel, [onCall()])))).toBe("plan_exists");
  });

  it("refuses patrol craft and unknown rooms, empty and oversized plans, and bad reservations and tasks", () => {
    const { s, channel } = ship();
    expect(error(postPlan(s, "p0", draft(channel, [onCall()], "PATROL_SHIP_A_0")))).toBe("plan_room_invalid");
    expect(error(postPlan(s, "p0", draft(channel, [onCall()], "NOWHERE")))).toBe("plan_room_invalid");
    expect(error(postPlan(s, "p0", draft(channel, [])))).toBe("plan_empty");
    expect(error(postPlan(s, "p0", draft(channel, Array.from({ length: config.plans.slotsPerPlan + 1 }, () => onCall()))))).toBe("plan_too_many_slots");
    expect(postPlan(s, "p0", draft(channel, Array.from({ length: config.plans.slotsPerPlan }, () => onCall()))).ok).toBe(true);
    expect(error(postPlan(s, "p0", draft(channel, [onCall()], "constructor")))).toBe("plan_room_invalid");
    expect(error(postPlan(s, "p0", draft(channel, [onCall("p4")])))).toBe("plan_reserved_invalid");
    // Reservations the claim rules would refuse to the very person they are for.
    expect(error(postPlan(s, "p0", draft(channel, [onCall("p0")])))).toBe("plan_reserved_invalid");
    expect(error(postPlan(s, "p0", draft(channel, [onCall("p1"), onCall("p1")])))).toBe("plan_reserved_invalid");
    for (const type of ["stt", "comfort"] as const)
      expect(error(postPlan(s, "p0", draft(channel, [{ kind: "task", task: { type, target: "p1" }, reservedFor: "p1" }])))).toBe("plan_reserved_invalid");
    expect(postPlan(s, "p0", draft(channel, [onCall("p1"), onCall("p2"), { kind: "task", task: { type: "heal", target: "p1" }, reservedFor: "p1" }])).ok).toBe(true);
    expect(error(postPlan(s, "p0", { ...draft(channel, [onCall()]), purpose: "party" as never }))).toBe("plan_invalid");
    const task = (t: object) => postPlan(s, "p0", draft(channel, [{ kind: "task", task: t } as DraftSlot]));
    expect(error(task({ type: "research", research: "NOPE" }))).toBe("plan_task_invalid");
    expect(error(task({ type: "project", project: "NOPE" }))).toBe("plan_task_invalid");
    expect(error(task({ type: "bring", itemType: "NOPE" }))).toBe("plan_task_invalid");
    expect(error(task({ type: "heal", target: "nobody" }))).toBe("plan_task_invalid");
    expect(error(task({ type: "dance" }))).toBe("plan_task_invalid");
    expect(task({ type: "bring", itemType: "medikit" }).ok).toBe(true);
    // Extra fields are dropped, so members are never sent anything the draft added.
    const extra = must(postPlan(s, "p0", draft(channel, [{ kind: "task", task: { type: "fiery_speech", note: "x" }, junk: 1 } as unknown as DraftSlot])));
    expect(extra.plans[0]!.slots[0]).toEqual({ kind: "task", task: { type: "fiery_speech" }, holder: null, done: false });
    // Any living player may be a target, member or not.
    expect(task({ type: "heal", target: "p4" }).ok).toBe(true);
  });

  it("refuses a task already finished, or aimed at the dead", () => {
    const { s, channel } = ship();
    s.research.STEROIDS = 100;
    s.pilgred.progress = 100;
    killPlayer(s, player(s, "p4"), "injury");
    const task = (t: object) => postPlan(s, "p0", draft(channel, [{ kind: "task", task: t } as DraftSlot]));
    expect(error(task({ type: "research", research: "STEROIDS" }))).toBe("plan_task_invalid");
    expect(error(task({ type: "repair_pilgred" }))).toBe("plan_task_invalid");
    expect(error(task({ type: "comfort", target: "p4" }))).toBe("plan_task_invalid");
  });

  it("waits for Mush selection", () => {
    const { s, channel } = ship();
    s.preselection = true;
    expect(error(postPlan(s, "p0", draft(channel, [onCall()])))).toBe("plan_forbidden");
  });

  it("a bot that created a channel may post", () => {
    let s = createGame(makeSeats(3, "all"), config, 7);
    s = must(createChannel(s, "p1", "", ["p2"]));
    expect(postPlan(s, "p1", draft(s.channels[0]!.id, [onCall()])).ok).toBe(true);
  });
});

describe("claiming", () => {
  it("members claim free slots; a claim is offered, then the holder can withdraw", () => {
    const { s: base, plan } = planned();
    expect(offered(base, "p1")).toContainEqual({ type: "claim_slot", plan, slot: 0 });
    const s = claim(base, "p1", plan, 0);
    expect(s.plans[0]!.slots[0]!.holder).toBe("p1");
    // Taken: nobody else is offered it.
    expect(offered(s, "p2")).not.toContainEqual({ type: "claim_slot", plan, slot: 0 });
    expect(applyAction(s, "p2", { type: "claim_slot", plan, slot: 0 }).ok).toBe(false);
    const back = mustApply(s, "p1", { type: "withdraw_slot", plan, slot: 0 });
    expect(back.plans[0]!.slots[0]!.holder).toBeNull();
  });

  it("claims are free and untimed: no AP, MP or queue", () => {
    const { s: base, plan } = planned();
    const s = must(queueAction(base, "p1", { type: "claim_slot", plan, slot: 0 }, 1000));
    const [before, after] = [player(base, "p1"), player(s, "p1")];
    expect([after.ap, after.mp, after.current]).toEqual([before.ap, before.mp, null]);
    expect(s.plans[0]!.slots[0]!.holder).toBe("p1");
  });

  it("non-members claim nothing, and see nothing", () => {
    const { s, plan } = planned();
    expect(offered(s, "p4").filter((a) => a.type === "claim_slot")).toEqual([]);
    expect(applyAction(s, "p4", { type: "claim_slot", plan, slot: 0 }).ok).toBe(false);
    expect(viewFor(s, "p4").plans).toEqual([]);
    expect(viewFor(s, "p1").plans).toEqual(s.plans);
  });

  it("a member without an iTrackie sees and touches no plan, as with the channel's messages", () => {
    const drop = (s: GameState, ids: PlayerId[]): GameState => {
      const bare = clone(s);
      bare.items = bare.items.filter((i) => !(i.type === ITRACKIE_ITEM && i.at.kind === "player" && ids.includes(i.at.id)));
      return bare;
    };
    const { s, plan } = planned();
    const bare = drop(s, ["p0", "p1"]);
    expect(viewFor(bare, "p1").plans).toEqual([]);
    expect(offered(bare, "p1").filter((a) => a.type === "claim_slot")).toEqual([]);
    expect(applyAction(bare, "p1", { type: "claim_slot", plan, slot: 0 }).ok).toBe(false);
    expect(applyAction(bare, "p0", { type: "cancel_plan", plan }).ok).toBe(false);
    expect(viewFor(bare, "p2").plans).toEqual(s.plans);
    const { s: fresh, channel } = ship();
    expect(error(postPlan(drop(fresh, ["p0"]), "p0", draft(channel, [onCall()])))).toBe("plan_forbidden");
  });

  it("one on-call slot each, none for the author, who may still take tasks", () => {
    const { s: base, plan } = planned();
    const s = claim(base, "p1", plan, 0);
    expect(applyAction(s, "p1", { type: "claim_slot", plan, slot: 1 }).ok).toBe(false);
    expect(applyAction(s, "p0", { type: "claim_slot", plan, slot: 1 }).ok).toBe(false);
    expect(claim(s, "p0", plan, 3).plans[0]!.slots[3]!.holder).toBe("p0");
    // Tasks are not limited: the on-call holder may also take one.
    expect(claim(s, "p1", plan, 3).plans[0]!.slots[3]!.holder).toBe("p1");
  });

  it("respects reservations, and nobody claims an STT or Comfort aimed at themselves", () => {
    const { s: base, channel } = ship();
    const s = must(postPlan(base, "p0", draft(channel, [onCall("p2"), { kind: "task", task: { type: "stt", target: "p1" } }])));
    const plan = s.plans[0]!.id;
    expect(applyAction(s, "p1", { type: "claim_slot", plan, slot: 0 }).ok).toBe(false);
    expect(claim(s, "p2", plan, 0).plans[0]!.slots[0]!.holder).toBe("p2");
    expect(applyAction(s, "p1", { type: "claim_slot", plan, slot: 1 }).ok).toBe(false);
    expect(claim(s, "p3", plan, 1).plans[0]!.slots[1]!.holder).toBe("p3");
  });

  it("a task's holder ticks it Done, once, and every member sees it", () => {
    const { s: base, plan } = planned();
    const s = mustApply(claim(base, "p2", plan, 3), "p2", { type: "mark_done", plan, slot: 3 });
    expect(viewFor(s, "p3").plans[0]!.slots[3]).toMatchObject({ holder: "p2", done: true });
    expect(applyAction(s, "p2", { type: "mark_done", plan, slot: 3 }).ok).toBe(false);
    // Not someone else's, and not an on-call slot.
    const t = claim(base, "p2", plan, 3);
    expect(applyAction(t, "p1", { type: "mark_done", plan, slot: 3 }).ok).toBe(false);
    expect(applyAction(claim(t, "p1", plan, 0), "p1", { type: "mark_done", plan, slot: 0 }).ok).toBe(false);
  });

  it("an illegal claim leaves the state unchanged", () => {
    const { s, plan } = planned();
    const before = JSON.stringify(s);
    expect(applyAction(s, "p4", { type: "claim_slot", plan, slot: 0 }).ok).toBe(false);
    expect(applyAction(s, "p1", { type: "claim_slot", plan, slot: 99 }).ok).toBe(false);
    expect(JSON.stringify(s)).toBe(before);
  });
});

describe("cancelling, expiry and the card", () => {
  it("only the author cancels, and a cancelled plan stays until the next is posted", () => {
    const { s: base, channel, plan } = planned();
    expect(applyAction(base, "p1", { type: "cancel_plan", plan }).ok).toBe(false);
    const s = mustApply(claim(base, "p1", plan, 0), "p0", { type: "cancel_plan", plan });
    expect(s.plans[0]!.status).toBe("cancelled");
    expect(viewFor(s, "p1").plans.map((p) => p.status)).toEqual(["cancelled"]);
    expect(applyAction(s, "p2", { type: "claim_slot", plan, slot: 1 }).ok).toBe(false);
    // A new plan can be posted; the channel keeps `finishedKept` finished ones.
    let t = must(postPlan(s, "p0", draft(channel, [onCall()])));
    t = mustApply(t, "p0", { type: "cancel_plan", plan: t.plans[1]!.id });
    t = must(postPlan(t, "p0", draft(channel, [onCall()])));
    expect(t.plans.map((p) => [p.id, p.status])).toEqual([
      ["plan-2", "cancelled"],
      ["plan-3", "open"],
    ]);
  });

  it("an open plan expires at the end of the day after it was posted", () => {
    const { s: base } = planned();
    let s = nextDay(base);
    expect(s.plans[0]!.status).toBe("open");
    s = nextCycle(s);
    expect(s.plans[0]!.status).toBe("open");
    s = nextDay(s);
    expect(s.plans[0]!.status).toBe("expired");
  });
});

describe("leaving and dying", () => {
  it("a holder who leaves the channel or dies loses their claims; a reservation for them lapses", () => {
    const { s: base, channel } = ship();
    let s = must(postPlan(base, "p0", draft(channel, [onCall(), onCall("p3"), { kind: "task", task: { type: "fiery_speech" } }])));
    const plan = s.plans[0]!.id;
    s = claim(claim(s, "p1", plan, 0), "p2", plan, 2);
    s = must(leaveChannel(s, "p1", channel));
    expect(s.plans[0]!.slots[0]!.holder).toBeNull();
    killPlayer(s, player(s, "p2"), "injury");
    expect(s.plans[0]!.slots[2]!.holder).toBeNull();
    s = must(leaveChannel(s, "p3", channel));
    expect(s.plans[0]!.slots[1]).toEqual({ kind: "onCall", holder: null });
    expect(s.plans[0]!.status).toBe("open");
  });

  it("the author leaving cancels the plan and closes planning in that channel for good", () => {
    const { s: base, channel } = planned();
    let s = must(leaveChannel(base, "p0", channel));
    expect(s.plans[0]!.status).toBe("cancelled");
    expect(s.channels[0]!.planningClosed).toBe(true);
    expect(s.channels[0]!.createdBy).toBe("p0");
    // Back in by invitation, still no plan.
    s = must(inviteToChannel(s, "p1", channel, "p0"));
    expect(error(postPlan(s, "p0", draft(channel, [onCall()])))).toBe("plan_forbidden");
    // The other members still see the cancelled card.
    expect(viewFor(s, "p1").plans.map((p) => p.status)).toEqual(["cancelled"]);
  });

  it("the author dying does the same", () => {
    const { s } = planned();
    killPlayer(s, player(s, "p0"), "injury");
    expect([s.plans[0]!.status, s.channels[0]!.planningClosed]).toEqual(["cancelled", true]);
  });

  it("the last member out takes the plan with the channel", () => {
    let { s, channel } = planned();
    for (const id of ["p0", "p1", "p2", "p3"]) s = must(leaveChannel(s, id, channel));
    expect(s.plans).toEqual([]);
  });

  it("a slot already ticked Done is never struck", () => {
    const { s: base, channel } = ship();
    let s = must(postPlan(base, "p0", draft(channel, [{ kind: "task", task: { type: "heal", target: "p4" } }])));
    const plan = s.plans[0]!.id;
    s = mustApply(claim(s, "p1", plan, 0), "p1", { type: "mark_done", plan, slot: 0 });
    killPlayer(s, player(s, "p4"), "injury");
    expect(s.plans[0]!.slots[0]).toEqual({ kind: "task", task: { type: "heal", target: "p4" }, holder: "p1", done: true });
  });

  it("a dead target strikes out only its slot", () => {
    const { s: base, channel } = ship();
    let s = must(postPlan(base, "p0", draft(channel, [onCall(), { kind: "task", task: { type: "heal", target: "p4" } }])));
    const plan = s.plans[0]!.id;
    s = claim(s, "p1", plan, 1);
    killPlayer(s, player(s, "p4"), "injury");
    expect(s.plans[0]!.slots[1]).toMatchObject({ holder: "p1", struck: "target_died" });
    expect(applyAction(s, "p1", { type: "withdraw_slot", plan, slot: 1 }).ok).toBe(false);
    expect(applyAction(s, "p1", { type: "mark_done", plan, slot: 1 }).ok).toBe(false);
    expect(s.plans[0]!.status).toBe("open");
    expect(claim(s, "p2", plan, 0).plans[0]!.slots[0]!.holder).toBe("p2");
  });

  it("a research finished while the plan is open strikes out its slot", () => {
    const { s: base, channel } = ship();
    let s = must(postPlan(base, "p0", draft(channel, [{ kind: "task", task: { type: "research", research: "STEROIDS" } }])));
    s.research.STEROIDS = 100;
    s = nextCycle(s);
    expect(s.plans[0]!.slots[0]).toMatchObject({ struck: "already_done" });
    expect(applyAction(s, "p1", { type: "claim_slot", plan: s.plans[0]!.id, slot: 0 }).ok).toBe(false);
  });
});

describe("the summons", () => {
  /** p1 and p2 hold on-call slots 0 and 1, slot 2 is unclaimed; p0 is in the refectory. */
  function called() {
    const { s: base, plan } = planned();
    const s = claim(claim(base, "p1", plan, 0), "p2", plan, 1);
    player(s, "p0").room = MESS;
    return { s, plan };
  }

  it("is offered only to the author, only in the plan's room", () => {
    const { s, plan } = called();
    expect(offered(s, "p0")).toContainEqual({ type: "summon", plan });
    expect(offered(s, "p1")).not.toContainEqual({ type: "summon", plan });
    const away = clone(s);
    player(away, "p0").room = LAB;
    expect(offered(away, "p0")).not.toContainEqual({ type: "summon", plan });
    // Still reaches `view.actions` with `lacks: ["notInPlanRoom"]` so the UI shows Go greyed out without computing legality.
    expect(viewFor(away, "p0").actions).toContainEqual(expect.objectContaining({ action: { type: "summon", plan }, lacks: ["notInPlanRoom"] }));
    expect(applyAction(away, "p0", { type: "summon", plan }).ok).toBe(false);
  });

  it("is refused on a plan with no on-call slot", () => {
    const { s: base, channel } = ship();
    const s = must(postPlan(base, "p0", draft(channel, [{ kind: "task", task: { type: "fiery_speech" } }])));
    player(s, "p0").room = MESS;
    const plan = s.plans[0]!.id;
    expect(offered(s, "p0")).not.toContainEqual({ type: "summon", plan });
    expect(applyAction(s, "p0", { type: "summon", plan }).ok).toBe(false);
  });

  it("walks each holder door by door, paying as live, with the same log lines, then is spent", () => {
    const { s: base, plan } = called();
    const s = mustApply(base, "p0", { type: "summon", plan });
    const live = mustApply(base, "p1", { type: "move", to: "CORRIDOR_A" }, { type: "move", to: "CORRIDOR_B" }, { type: "move", to: MESS });
    for (const id of ["p1", "p2"]) {
      expect(player(s, id).room).toBe(MESS);
      expect([player(s, id).mp, player(s, id).ap]).toEqual([player(live, "p1").mp, player(live, "p1").ap]);
    }
    const publicLines = (st: GameState) => st.log.filter((e) => e.visibleTo === "all" && e.params?.name === player(st, "p1").character);
    expect(publicLines(s)).toEqual(publicLines(live));
    expect(s.plans[0]!.slots.map((sl) => (sl.kind === "onCall" ? sl.outcome : "task"))).toEqual(["arrived", "arrived", "unclaimed", "task"]);
    expect(s.plans[0]!.status).toBe("called");
    expect(keysOf(s, "p1")).toContain("summonArrived");
    expect(applyAction(s, "p0", { type: "summon", plan }).ok).toBe(false);
    // The author pays nothing.
    expect([player(s, "p0").ap, player(s, "p0").mp]).toEqual([player(base, "p0").ap, player(base, "p0").mp]);
  });

  it("walks in slot order, each holder's whole walk first", () => {
    const { s: base, plan } = called();
    const s = mustApply(base, "p0", { type: "summon", plan });
    const entered = s.log.filter((e) => e.key === "entered" && e.room === MESS).map((e) => e.params?.name);
    expect(entered).toEqual([player(s, "p1").character, player(s, "p2").character]);
  });

  it("a holder already there arrives without paying or losing their queue", () => {
    const { s: base, plan } = called();
    player(base, "p1").room = MESS;
    const s = mustApply(base, "p0", { type: "summon", plan });
    expect(player(s, "p1").mp).toBe(player(base, "p1").mp);
    expect(s.plans[0]!.slots[0]).toMatchObject({ outcome: "arrived" });
  });

  it("stops a holder who can't pay where they stand, tells only them why, and refunds nothing", () => {
    const { s: base, plan } = called();
    Object.assign(player(base, "p1"), { mp: 1, ap: 0 });
    const s = mustApply(base, "p0", { type: "summon", plan });
    expect(player(s, "p1").room).toBe("CORRIDOR_A");
    expect(player(s, "p1").mp).toBe(0);
    expect(s.plans[0]!.slots[0]).toMatchObject({ holder: "p1", outcome: "stopped" });
    expect(keysOf(s, "p1")).toContain("summonStoppedCantAfford");
    for (const id of ["p0", "p2", "p3", "p4"]) expect(JSON.stringify(viewFor(s, id))).not.toContain("summonStopped");
    // The next holder still walks.
    expect(player(s, "p2").room).toBe(MESS);
  });

  it("converts AP to MP as a live move does", () => {
    const { s: base, plan } = called();
    Object.assign(player(base, "p1"), { mp: 0, ap: 1 });
    const s = mustApply(base, "p0", { type: "summon", plan });
    expect(player(s, "p1").room).toBe(MESS);
    expect(player(s, "p1").ap).toBe(0);
  });

  it("stops a holder being pushed in a wheelchair, or with no way there", () => {
    const { s: base, plan } = called();
    player(base, "p1").pushedBy = "p3";
    player(base, "p2").room = "PATROL_SHIP_A_0";
    const s = mustApply(base, "p0", { type: "summon", plan });
    expect(keysOf(s, "p1")).toContain("summonStoppedPushed");
    expect(keysOf(s, "p2")).toContain("summonStoppedNoPath");
    expect([player(s, "p1").room, player(s, "p2").room]).toEqual([LAB, "PATROL_SHIP_A_0"]);
  });

  it("gets a sleeper up and drops their queue, telling them", () => {
    const { s: base, plan } = called();
    const sleeper = player(base, "p1");
    sleeper.modifiers.push("lying_down");
    sleeper.lyingIn = "bed";
    let s = must(queueAction(base, "p1", { type: "move", to: "SICK_BAY" }, 1000));
    s = must(queueAction(s, "p1", { type: "move", to: "CORRIDOR_A" }, 1000));
    // Queueing got them up; put them back to bed to check the walk does.
    player(s, "p1").modifiers.push("lying_down");
    s = mustApply(s, "p0", { type: "summon", plan });
    const p1 = player(s, "p1");
    expect([p1.modifiers.includes("lying_down"), p1.current, p1.queue, p1.room]).toEqual([false, null, [], MESS]);
    expect(keysOf(s, "p1").filter((k) => k === "actionDropped")).toHaveLength(2);
  });

  it("the author learns nothing about other rooms", () => {
    const { s: base, plan } = called();
    Object.assign(player(base, "p1"), { mp: 1, ap: 0 });
    const s = mustApply(base, "p0", { type: "summon", plan });
    const view = viewFor(s, "p0");
    expect(view.log.filter((e) => e.room !== undefined && e.room !== MESS)).toEqual([]);
    // The card says only that p1 didn't come; with ACTOPI off, not where they are.
    const dark = clone(s);
    dark.bios.actopi = false;
    expect(viewFor(dark, "p0").players.find((p) => p.id === "p1")?.room).toBeUndefined();
  });
});

describe("clear queue", () => {
  it("tells the player only when asked to", () => {
    const { s: base } = ship();
    const s = must(queueAction(base, "p1", { type: "move", to: "SICK_BAY" }, 1000));
    expect(keysOf(must(clearQueue(s, "p1")), "p1")).not.toContain("actionDropped");
    expect(keysOf(must(clearQueue(s, "p1", true)), "p1")).toContain("actionDropped");
  });
});

describe("plans in views", () => {
  it("a member's view is unchanged by whether a non-member stands in the plan's room", () => {
    const { s, plan } = planned();
    const a = claim(s, "p1", plan, 0);
    const b = clone(a);
    player(b, "p4").room = MESS;
    expect(viewFor(a, "p1").plans).toEqual(viewFor(b, "p1").plans);
  });

  it("the dead see no plans", () => {
    const { s } = planned();
    killPlayer(s, player(s, "p1"), "injury");
    expect(viewFor(s, "p1").plans).toEqual([]);
  });
});
