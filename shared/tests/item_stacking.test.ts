import { describe, expect, it } from "vitest";
import { createGame, isImmune, itemViewKey, stackItemViews, viewFor } from "../src/index.ts";
import { makeSeats, mustApply, testConfig, withoutDrugs } from "./support.ts";

const seats = makeSeats(4, "others");

function refectoryGame() {
  const config = testConfig({
    startItems: Array.from({ length: 32 }, () => ({ type: "uncooked_ration", room: "REFECTORY" })),
  });
  const state = withoutDrugs(createGame(seats, config, 42));
  for (const p of state.players) p.room = "REFECTORY";
  return state;
}

describe("item stacking and spiked priority", () => {
  it("stacks 31 normal rations and 1 spiked ration into 1 stack for a human and 2 for a Mush", () => {
    const state = refectoryGame();
    const human = state.players.find((p) => p.role === "human")!;
    const mush = state.players.find((p) => p.role === "mush")!;
    // Spike the last ration in the room (leaving it at the end of roomItems — no wire reordering!).
    const spiked = state.items[state.items.length - 1]!;
    spiked.spores = 1;

    const humanView = viewFor(state, human.id);
    expect(humanView.roomItems).toHaveLength(32);
    // No leak: the spiked item keeps its original position and has no spores field for the human.
    expect(humanView.roomItems[humanView.roomItems.length - 1]!.id).toBe(spiked.id);
    expect(humanView.roomItems.every((i) => i.spores === undefined)).toBe(true);

    const humanStacks = stackItemViews(humanView.roomItems);
    expect(humanStacks).toHaveLength(1);
    expect(humanStacks[0]!.items).toHaveLength(32);

    const mushView = viewFor(state, mush.id);
    const mushStacks = stackItemViews(mushView.roomItems);
    expect(mushStacks).toHaveLength(2);
    expect(mushStacks.map((s) => s.items.length).sort((a, b) => a - b)).toEqual([1, 31]);
    expect(mushStacks.find((s) => s.items.length === 1)!.items[0]!.spores).toBe(1);
  });

  it("separates items that differ in any field visible to the viewer", () => {
    expect(itemViewKey({ id: "a", type: "cooked_ration" })).toBe(itemViewKey({ id: "b", type: "cooked_ration" }));
    expect(itemViewKey({ id: "a", type: "cooked_ration", broken: true })).not.toBe(itemViewKey({ id: "b", type: "cooked_ration" }));
    expect(itemViewKey({ id: "a", type: "cooked_ration", spoil: "rotten" })).not.toBe(itemViewKey({ id: "b", type: "cooked_ration" }));
    expect(itemViewKey({ id: "a", type: "blueprint", builds: "drone" })).not.toBe(itemViewKey({ id: "b", type: "blueprint", builds: "knife" }));
  });

  it("gives a human the spiked ration when taking any normal-looking ration from the stack", () => {
    const state = refectoryGame();
    const human = state.players.find((p) => p.role === "human")!;
    const normal = state.items[0]!;
    const spiked = state.items[state.items.length - 1]!;
    spiked.spores = 1;

    const next = mustApply(state, human.id, { type: "take", item: normal.id });
    const carried = next.items.filter((i) => i.at.kind === "player" && i.at.id === human.id);
    expect(carried.map((i) => i.id)).toEqual([spiked.id]);
    expect(carried[0]!.spores).toBe(1);
    // The originally requested unspiked item remains in the room.
    expect(next.items.find((i) => i.id === normal.id)!.at).toEqual({ kind: "room", id: "REFECTORY" });
  });

  it("picks the highest-spore ration first when several in the stack are spiked", () => {
    const state = refectoryGame();
    const human = state.players.find((p) => p.role === "human")!;
    const normal = state.items[0]!;
    const spiked1 = state.items[10]!;
    const spiked2 = state.items[20]!;
    spiked1.spores = 1;
    spiked2.spores = 3;

    const next = mustApply(state, human.id, { type: "take", item: normal.id });
    const carried = next.items.filter((i) => i.at.kind === "player" && i.at.id === human.id);
    expect(carried.map((i) => i.id)).toEqual([spiked2.id]);
  });

  it("lets a Mush take a normal ration without swapping to a spiked one", () => {
    const state = refectoryGame();
    const mush = state.players.find((p) => p.role === "mush")!;
    const normal = state.items[0]!;
    const spiked = state.items[state.items.length - 1]!;
    spiked.spores = 1;

    const next = mustApply(state, mush.id, { type: "take", item: normal.id });
    const carried = next.items.filter((i) => i.at.kind === "player" && i.at.id === mush.id);
    expect(carried.map((i) => i.id)).toEqual([normal.id]);
    expect(next.items.find((i) => i.id === spiked.id)!.at).toEqual({ kind: "room", id: "REFECTORY" });
  });

  it("respects viewer-visible differences like Chef spoilage when swapping", () => {
    const state = refectoryGame();
    const chef = state.players.find((p) => p.role === "human")!;
    chef.skills = ["cook"];
    const freshNormal = state.items[0]!;
    const spoiledSpiked = state.items[state.items.length - 1]!;
    spoiledSpiked.spoil = "rotten";
    spoiledSpiked.spores = 1;

    // To a Chef, fresh and rotten are in separate stacks, so taking the fresh one does not swap to the rotten spiked one.
    const next = mustApply(state, chef.id, { type: "take", item: freshNormal.id });
    const carried = next.items.filter((i) => i.at.kind === "player" && i.at.id === chef.id);
    expect(carried.map((i) => i.id)).toEqual([freshNormal.id]);
  });

  it("never swaps onto a spiked ration hidden by another player", () => {
    const state = refectoryGame();
    const human = state.players.find((p) => p.role === "human")!;
    const mush = state.players.find((p) => p.role === "mush")!;
    const normal = state.items[0]!;
    const hiddenSpiked = state.items[state.items.length - 1]!;
    hiddenSpiked.spores = 1;
    hiddenSpiked.hiddenBy = mush.id;

    const next = mustApply(state, human.id, { type: "take", item: normal.id });
    const carried = next.items.filter((i) => i.at.kind === "player" && i.at.id === human.id);
    expect(carried.map((i) => i.id)).toEqual([normal.id]);
  });

  it("prioritizes the spiked ration when a human consumes directly from the room floor", () => {
    const state = refectoryGame();
    const human = state.players.find((p) => p.role === "human" && !isImmune(state, p))!;
    human.satiety = 0;
    const normal = state.items[0]!;
    const spiked = state.items[state.items.length - 1]!;
    spiked.spores = 1;

    const next = mustApply(state, human.id, { type: "consume", item: normal.id });
    expect(next.items.find((i) => i.id === spiked.id)).toBeUndefined();
    expect(next.items.find((i) => i.id === normal.id)).toBeDefined();
    expect(next.contamination[human.id]).toBe(1);
  });

  it("does not swap when a human consumes a carried ration from their own inventory", () => {
    const state = refectoryGame();
    const human = state.players.find((p) => p.role === "human")!;
    human.satiety = 0;
    const carried = state.items[0]!;
    carried.at = { kind: "player", id: human.id };
    const roomSpiked = state.items[state.items.length - 1]!;
    roomSpiked.spores = 1;

    const next = mustApply(state, human.id, { type: "consume", item: carried.id });
    expect(next.items.find((i) => i.id === carried.id)).toBeUndefined();
    expect(next.items.find((i) => i.id === roomSpiked.id)).toBeDefined();
    expect(next.contamination[human.id] ?? 0).toBe(0);
  });
});
