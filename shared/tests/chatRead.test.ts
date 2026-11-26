// Chat read state (#400, chatRead.ts): one count per channel per seat, raised only, clamped to the channel's messages,
// and only for the channels the seat's body reads now.
import { describe, expect, it } from "vitest";
import { createChannel, inviteToChannel, leaveChannel, sendChat } from "../src/chat.ts";
import { chatReadFor, mergeChatRead, pruneChatRead, unreadCount, type ChatRead } from "../src/chatRead.ts";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { ITRACKIE_ITEM } from "../src/itemIds.ts";
import { bodyOf, swapMinds } from "../src/mind.ts";
import { applyAction, createGame, viewFor } from "../src/rules.ts";
import { GRAVEYARD_CHANNEL, MUSH_CHANNEL, type ChannelId, type GameState, type PlayerId } from "../src/types.ts";
import { clone, makeSeats, must, player } from "./support.ts";

const seats = makeSeats(4, "others");

const post = (state: GameState, from: PlayerId, channel: ChannelId, n: number): GameState => {
  for (let i = 0; i < n; i++) state = must(sendChat(state, from, channel, `${channel} ${i}`));
  return state;
};

/** A game where the Mush and a human are found, global has 5 messages and the Mush channel 3. */
function game() {
  let state = createGame(seats, DEFAULT_CONFIG, 1);
  const mush = state.players.find((p) => p.role === "mush")!.id;
  const human = state.players.find((p) => p.role !== "mush")!.id;
  state = post(state, human, "global", 5);
  state = post(state, mush, MUSH_CHANNEL, 3);
  return { state, mush, human };
}

const merge = (state: GameState, seat: PlayerId, stored: ChatRead, incoming: ChatRead) => mergeChatRead(state, player(state, seat), stored, incoming);

const dropITrackie = (state: GameState, id: PlayerId): GameState => {
  const item = viewFor(state, id).inventory.find((i) => i.type === ITRACKIE_ITEM)!.id;
  return must(applyAction(state, id, { type: "drop", item }));
};

describe("mergeChatRead", () => {
  it("only raises counts, and says which went up", () => {
    const { state, human } = game();
    expect(merge(state, human, {}, { global: 3 })).toEqual({ read: { global: 3 }, raised: { global: 3 } });
    expect(merge(state, human, { global: 3 }, { global: 2 })).toEqual({ read: { global: 3 }, raised: {} });
    expect(merge(state, human, { global: 3 }, { global: 3 })).toEqual({ read: { global: 3 }, raised: {} });
    expect(merge(state, human, { global: 3 }, { global: 4 })).toEqual({ read: { global: 4 }, raised: { global: 4 } });
  });

  it("clamps each count to the messages the channel has, and ignores a channel with none", () => {
    const { state, human } = game();
    expect(merge(state, human, {}, { global: 99 })).toEqual({ read: { global: 5 }, raised: { global: 5 } });
    expect(merge(state, human, { global: 5 }, { global: 99 })).toEqual({ read: { global: 5 }, raised: {} });
    expect(merge(state, human, {}, { botany: 4, global: 0 })).toEqual({ read: {}, raised: {} });
  });

  it("refuses channels the body can't read now, keeping what it read before", () => {
    const { state: base, mush, human } = game();
    // A human never reads the Mush channel.
    expect(merge(base, human, {}, { [MUSH_CHANNEL]: 2 })).toEqual({ read: {}, raised: {} });
    // Nor a private channel they aren't in.
    let state = must(createChannel(base, mush, "secret"));
    const pc = state.channels[0]!.id;
    state = post(state, mush, pc, 2);
    expect(merge(state, human, {}, { [pc]: 2 })).toEqual({ read: {}, raised: {} });
    // Without an iTrackie, global chat is refused, but its count stays: picking one up again doesn't make it unread.
    state = dropITrackie(state, human);
    expect(merge(state, human, { global: 2 }, { global: 4 })).toEqual({ read: { global: 2 }, raised: {} });
    expect(chatReadFor(state, player(state, human), { global: 2 })).toEqual({});
  });

  it("lets the dead read their graveyard", () => {
    let state = game().state;
    const human = state.players.find((p) => p.role !== "mush")!.id;
    state = clone(state);
    player(state, human).alive = false;
    state = post(state, human, GRAVEYARD_CHANNEL, 2);
    expect(merge(state, human, {}, { [GRAVEYARD_CHANNEL]: 2, global: 5 })).toEqual({ read: { [GRAVEYARD_CHANNEL]: 2, global: 5 }, raised: { [GRAVEYARD_CHANNEL]: 2, global: 5 } });
    expect(chatReadFor(state, player(state, human), { [GRAVEYARD_CHANNEL]: 2, global: 5 })).toEqual({ [GRAVEYARD_CHANNEL]: 2, global: 5 });
  });

  it("does nothing once the game has ended", () => {
    const { state: base, human } = game();
    const state = clone(base);
    state.phase = "ended";
    expect(merge(state, human, { global: 1 }, { global: 4 })).toEqual({ read: { global: 1 }, raised: {} });
    expect(chatReadFor(state, player(state, human), { global: 4 })).toEqual({});
  });
});

describe("chatReadFor", () => {
  it("sends the channels the body reads now, clamped, without zeros", () => {
    const { state, mush, human } = game();
    const stored: ChatRead = { global: 9, [MUSH_CHANNEL]: 2, botany: 0 };
    expect(chatReadFor(state, player(state, mush), stored)).toEqual({ global: 5, [MUSH_CHANNEL]: 2 });
    expect(chatReadFor(state, player(state, human), stored)).toEqual({ global: 5 });
  });

  it("follows the mind through a Transfer, filtered by the new body", () => {
    const { state: base, mush, human } = game();
    // The human's body has no iTrackie, so whoever is in it reads only what needs none.
    const state = clone(dropITrackie(base, human));
    swapMinds(state, player(state, mush), player(state, human));
    // Read state is keyed by seat (the mind); the server finds the body with bodyOf.
    const read: Record<PlayerId, ChatRead> = { [mush]: { global: 4, [MUSH_CHANNEL]: 3 }, [human]: { global: 2 } };
    const sentTo = (seat: PlayerId) => chatReadFor(state, player(state, bodyOf(state, seat)!), read[seat]!);
    // The Mush mind, now in the human's body: the Mush channel, not global (no iTrackie), and its global count kept.
    expect(bodyOf(state, mush)).toBe(human);
    expect(sentTo(mush)).toEqual({ [MUSH_CHANNEL]: 3 });
    expect(mergeChatRead(state, player(state, human), read[mush]!, { global: 5 })).toEqual({ read: read[mush], raised: {} });
    // The human mind, now in the Mush's body: global (that body holds an iTrackie), and nothing of the Mush channel.
    expect(sentTo(human)).toEqual({ global: 2 });
  });
});

describe("pruneChatRead", () => {
  it("drops a private channel deleted when its last member left, and keeps unreadable ones", () => {
    let state = must(createChannel(game().state, "p0", "secret"));
    const pc = state.channels[0]!.id;
    state = must(inviteToChannel(state, "p0", pc, "p1"));
    state = post(state, "p0", pc, 2);
    const stored: ChatRead = { global: 3, [MUSH_CHANNEL]: 1, [pc]: 2 };
    state = must(leaveChannel(state, "p0", pc));
    // p1 is still in it: the channel is kept, though p0 can't read it now.
    expect(pruneChatRead(state, stored)).toEqual(stored);
    state = must(leaveChannel(state, "p1", pc));
    expect(state.chatSeq[pc]).toBeUndefined();
    expect(pruneChatRead(state, stored)).toEqual({ global: 3, [MUSH_CHANNEL]: 1 });
  });
});

describe("unreadCount", () => {
  it("is the channel's count less the count read, never below 0", () => {
    const counts = { global: 120, botany: 3 };
    expect(unreadCount(counts, { global: 20 }, "global")).toBe(100);
    expect(unreadCount(counts, {}, "botany")).toBe(3);
    expect(unreadCount(counts, { botany: 5 }, "botany")).toBe(0);
    expect(unreadCount(counts, {}, MUSH_CHANNEL)).toBe(0);
  });
});
