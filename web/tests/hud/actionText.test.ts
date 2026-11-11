import type {
  Action,
  ActionOption,
  EquipmentView,
  ItemView,
  OtherPlayerView,
  PlayerView,
  YouView,
} from "@mush2/shared";
import { describe, expect, it } from "vitest";
import { describeAction } from "../../src/hud/actionText.ts";
import type { useNames } from "../../src/i18n/names.ts";

type Names = ReturnType<typeof useNames>;

const fakeNames: Names = {
  action: (type: string) => type,
  itemOf: (item: { type: string }) => item.type,
  equipment: (type: string) => type,
  character: (character: string) => character,
  room: (room: string) => room,
} as unknown as Names;

function mockView(overrides: Partial<PlayerView> = {}): PlayerView {
  return {
    you: {
      id: "p0",
      character: "jinsu",
      room: "bridge",
    } as unknown as YouView,
    players: [],
    roomEquipment: [],
    inventory: [],
    roomItems: [],
    actions: [],
    ...overrides,
  } as unknown as PlayerView;
}

describe("describeAction", () => {
  it("describes an action without a subject", () => {
    const view = mockView();
    expect(describeAction(view, fakeNames, "AP", { type: "search" })).toBe("search");
  });

  it("describes an action with an item from inventory", () => {
    const item = { id: "item-knife", type: "knife" } as ItemView;
    const view = mockView({ inventory: [item] });
    expect(describeAction(view, fakeNames, "AP", { type: "consume", item: "item-knife" })).toBe("consume knife");
  });

  it("describes an action with an item from roomItems", () => {
    const item = { id: "item-wrench", type: "wrench" } as ItemView;
    const view = mockView({ roomItems: [item] });
    expect(describeAction(view, fakeNames, "AP", { type: "take", item: "item-wrench" })).toBe("take wrench");
  });

  it("describes an action with equipment", () => {
    const eq = { id: "eq-coffee", type: "COFFEE_DISPENSER" } as EquipmentView;
    const view = mockView({ roomEquipment: [eq] });
    expect(describeAction(view, fakeNames, "AP", { type: "dispense", equipment: "eq-coffee" })).toBe("dispense COFFEE_DISPENSER");
  });

  it("describes an action targeting another player", () => {
    const other = { id: "p1", character: "frieda" } as OtherPlayerView;
    const view = mockView({ players: [other] });
    expect(describeAction(view, fakeNames, "AP", { type: "punch", target: "p1" })).toBe("punch frieda");
  });

  it("describes an action targeting yourself", () => {
    const view = mockView();
    expect(describeAction(view, fakeNames, "AP", { type: "heal", target: "p0" } as unknown as Action)).toBe("heal jinsu");
  });

  it("describes a room movement action", () => {
    const view = mockView();
    expect(describeAction(view, fakeNames, "AP", { type: "move", to: "corridor_front" as never })).toBe("move corridor_front");
  });

  it("appends AP cost when present in view.actions and ap > 0", () => {
    const action: Action = { type: "search" };
    const actions: ActionOption[] = [{ action, cost: { ap: 2, mp: 0 }, chance: 1, tags: [], lacks: [] }];
    const view = mockView({ actions });
    expect(describeAction(view, fakeNames, "AP", action)).toBe("search, 2 AP");
  });

  it("omits AP cost when ap is 0 or not found in view.actions", () => {
    const freeAction: Action = { type: "search" };
    const freeActions: ActionOption[] = [{ action: freeAction, cost: { ap: 0, mp: 0 }, chance: 1, tags: [], lacks: [] }];
    const view1 = mockView({ actions: freeActions });
    expect(describeAction(view1, fakeNames, "AP", freeAction)).toBe("search");

    const queuedAction: Action = { type: "search" };
    const view2 = mockView({ actions: [] });
    expect(describeAction(view2, fakeNames, "AP", queuedAction)).toBe("search");
  });
});
