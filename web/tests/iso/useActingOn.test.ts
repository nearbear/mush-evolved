import { describe, expect, it } from "vitest";
import { actionTarget, type Action } from "@mush2/shared";
import { begun } from "../../src/iso/useActingOn.ts";

const shower: Action = { type: "shower", equipment: "e1" };
const heal: Action = { type: "heal", target: "p2" };
const examine: Action = { type: "examine", target: { kind: "equipment", id: "e2" } };
const under = (action: Action, since: number) => ({ action, since, until: since + 1000 });

describe("begun", () => {
  it("is a newly started timed action", () => {
    expect(begun({ current: null, queue: [] }, { current: under(shower, 1), queue: [] })).toBe(shower);
    expect(begun({ current: under(shower, 1), queue: [heal] }, { current: under(heal, 2), queue: [] })).toBe(heal);
  });
  it("is nothing while the same action is under way, even if the queue was cleared", () => {
    expect(begun({ current: under(shower, 1), queue: [] }, { current: under(shower, 1), queue: [] })).toBeUndefined();
    expect(begun({ current: under(shower, 1), queue: [heal, examine] }, { current: under(shower, 1), queue: [] })).toBeUndefined();
  });
  it("is the last instant action that ran once nothing is under way", () => {
    expect(begun({ current: under(shower, 1), queue: [examine, heal] }, { current: null, queue: [] })).toBe(heal);
    expect(begun({ current: under(shower, 1), queue: [examine, heal] }, { current: null, queue: [heal] })).toBe(examine);
  });
  it("is nothing when an action just finishes", () => {
    expect(begun({ current: under(shower, 1), queue: [] }, { current: null, queue: [] })).toBeUndefined();
  });
});

describe("actionTarget", () => {
  it("finds equipment, items, people and examined things, and nothing for untargeted actions", () => {
    expect(actionTarget(shower)).toEqual({ kind: "equipment", id: "e1" });
    expect(actionTarget({ type: "take", item: "i1" })).toEqual({ kind: "item", id: "i1" });
    expect(actionTarget(heal)).toEqual({ kind: "player", id: "p2" });
    expect(actionTarget({ type: "vaccinate", target: "p2" })).toEqual({ kind: "player", id: "p2" });
    expect(actionTarget(examine)).toEqual({ kind: "equipment", id: "e2" });
    expect(actionTarget({ type: "move", to: "BRIDGE" } as Action)).toBeNull();
    expect(actionTarget({ type: "ready" })).toBeNull();
  });
});
