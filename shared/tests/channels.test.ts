import { describe, expect, it } from "vitest";
import { CHAT_PAGE, chatPageKey, createChannel, inviteToChannel, leaveChannel, sendChat, toggleCheckbox } from "../src/chat.ts";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { ITRACKIE_ITEM } from "../src/itemIds.ts";
import { channelLimit, MODIFIERS } from "../src/modifiers.ts";
import { parseGameMessage } from "../src/protocol.ts";
import { applyAction, createGame, viewFor, type ActionResult } from "../src/rules.ts";
import type { GameState, PrivateChannelId } from "../src/types.ts";
import { clone, makeSeats, must, player } from "./support.ts";

const seats = makeSeats(8, "others");

const deadCopy = (s: GameState, id: string): GameState => {
  const copy = clone(s);
  player(copy, id).alive = false;
  return copy;
};
const error = (r: ActionResult): string => {
  if (r.ok) throw new Error("expected a failure");
  return r.error;
};

/** p0 has made "Secret plans"; p1 has been invited. Nobody else is in. */
function withChannel(): { state: GameState; id: PrivateChannelId } {
  let state = createGame(seats, DEFAULT_CONFIG, 42);
  state = must(createChannel(state, "p0", "Secret plans"));
  const id = state.channels[0]!.id;
  state = must(inviteToChannel(state, "p0", id, "p1"));
  return { state, id };
}

describe("private channels", () => {
  it("lets the creator and invited members read and post; everyone else sees nothing", () => {
    const { state: base, id } = withChannel();
    const state = must(sendChat(base, "p1", id, "meet at the bridge"));
    for (const member of ["p0", "p1"]) {
      const view = viewFor(state, member);
      expect(view.privateChannels).toEqual([{ id, name: "Secret plans", members: ["p0", "p1"], createdBy: "p0", day: 1, cycleOfDay: 1 }]);
      expect(view.chat.map((m) => m.text)).toEqual(["meet at the bridge"]);
      expect(view.chatChannels).toContain(id);
    }
    for (const outsider of seats.slice(2)) {
      const view = viewFor(state, outsider.id);
      expect(view.privateChannels).toEqual([]);
      expect(view.chatChannels).not.toContain(id);
      const json = JSON.stringify(view);
      expect(json).not.toContain("meet at the bridge");
      expect(json).not.toContain("Secret plans");
      expect(sendChat(state, outsider.id, id, "hi").ok).toBe(false);
    }
  });

  it("lets any member invite, from any room, and shows new members the whole history", () => {
    let { state, id } = withChannel();
    state = must(sendChat(state, "p0", id, "before you"));
    state = must(applyAction(state, "p1", { type: "move", to: Object.keys(state.config.rooms).find((r) => state.config.rooms.LABORATORY!.includes(r))! }));
    expect(state.players.find((p) => p.id === "p1")!.room).not.toBe(state.players.find((p) => p.id === "p2")!.room);
    state = must(inviteToChannel(state, "p1", id, "p2"));
    expect(viewFor(state, "p2").chat.map((m) => m.text)).toEqual(["before you"]);
    expect(viewFor(state, "p2").privateChannels[0]!.members).toEqual(["p0", "p1", "p2"]);
  });

  it("rejects invites from non-members and to people already in, dead, or unknown", () => {
    const { state, id } = withChannel();
    expect(inviteToChannel(state, "p2", id, "p3").ok).toBe(false);
    expect(inviteToChannel(state, "p0", id, "p1").ok).toBe(false);
    expect(inviteToChannel(state, "p0", id, "nobody").ok).toBe(false);
    const dead = deadCopy(state, "p3");
    expect(inviteToChannel(dead, "p0", id, "p3").ok).toBe(false);
  });

  it("limits each player to three channels, counting ones they were invited to", () => {
    let state = createGame(seats, DEFAULT_CONFIG, 42);
    for (const name of ["a", "b", "c"]) state = must(createChannel(state, "p0", name));
    expect(createChannel(state, "p0", "d").ok).toBe(false);
    state = must(leaveChannel(state, "p0", state.channels[0]!.id));
    state = must(createChannel(state, "p0", "d"));

    // p1 is invited into three of p0's channels and can't be put into a fourth.
    for (const c of state.channels) state = must(inviteToChannel(state, "p0", c.id, "p1"));
    expect(createChannel(state, "p1", "mine").ok).toBe(false);
    state = must(createChannel(state, "p2", "other"));
    expect(inviteToChannel(state, "p2", state.channels.at(-1)!.id, "p1").ok).toBe(false);
  });

  it("does not tell an inviter why an invite to someone else failed", () => {
    let { state, id } = withChannel();
    for (const name of ["a", "b", "c"]) state = must(createChannel(state, "p2", name));
    const full = error(inviteToChannel(state, "p0", id, "p2"));
    const dead = deadCopy(state, "p3");
    expect(error(inviteToChannel(dead, "p0", id, "p3"))).toBe(full);
    expect(error(inviteToChannel(state, "p0", id, "nobody"))).toBe(full);
  });

  it("reads the limit through modifiers", () => {
    const state = createGame(seats, DEFAULT_CONFIG, 42);
    const registry = { bigger: { channelLimit: (n: number) => n + 2 } };
    const p = { ...state.players[0]!, modifiers: ["bigger"] };
    expect(channelLimit(state, state.players[0]!, MODIFIERS)).toBe(3);
    expect(channelLimit(state, p, registry)).toBe(5);
  });

  it("removes a member's access when they leave, and deletes the channel and its messages with the last one", () => {
    let { state, id } = withChannel();
    state = must(sendChat(state, "p0", id, "hello"));
    state = must(leaveChannel(state, "p1", id));
    expect(viewFor(state, "p1").privateChannels).toEqual([]);
    expect(JSON.stringify(viewFor(state, "p1"))).not.toContain("hello");
    expect(sendChat(state, "p1", id, "hi").ok).toBe(false);
    expect(viewFor(state, "p0").privateChannels[0]!.members).toEqual(["p0"]);

    state = must(leaveChannel(state, "p0", id));
    expect(state.channels).toEqual([]);
    expect(state.chat).toEqual([]);
    expect(leaveChannel(state, "p0", id).ok).toBe(false);
  });

  it("needs an iTrackie to read or post, but keeps the membership", () => {
    let { state, id } = withChannel();
    state = must(sendChat(state, "p0", id, "hello"));
    const mine = viewFor(state, "p1").inventory.find((i) => i.type === ITRACKIE_ITEM)!.id;
    state = must(applyAction(state, "p1", { type: "drop", item: mine }));
    const view = viewFor(state, "p1");
    expect(view.chat).toEqual([]);
    expect(view.chatChannels).toEqual([]);
    expect(view.privateChannels).toHaveLength(1);
    expect(sendChat(state, "p1", id, "hi").ok).toBe(false);
    state = must(applyAction(state, "p1", { type: "take", item: mine }));
    expect(viewFor(state, "p1").chat.map((m) => m.text)).toEqual(["hello"]);
  });

  it("needs a working iTrackie to open a channel, but not to be invited to one", () => {
    let state = createGame(seats, DEFAULT_CONFIG, 42);
    const mine = viewFor(state, "p1").inventory.find((i) => i.type === ITRACKIE_ITEM)!.id;
    state = must(applyAction(state, "p1", { type: "drop", item: mine }));
    expect(createChannel(state, "p1", "x")).toEqual({ ok: false, error: "channel_needs_itrackie" });
    state = must(createChannel(state, "p0", "x", ["p1"]));
    expect(state.channels[0]!.members).toEqual(["p0", "p1"]);

    const broken = clone(createGame(seats, DEFAULT_CONFIG, 42));
    broken.items.find((i) => i.type === ITRACKIE_ITEM && i.at.kind === "player" && i.at.id === "p2")!.broken = true;
    expect(createChannel(broken, "p2", "x")).toEqual({ ok: false, error: "channel_needs_itrackie" });
  });

  it("stops dead members reading and posting in private channels", () => {
    const { state, id } = withChannel();
    const dead = deadCopy(state, "p1");
    expect(viewFor(dead, "p1").chatChannels).toEqual(["graveyard"]);
    expect(sendChat(dead, "p1", id, "hi").ok).toBe(false);
    expect(createChannel(dead, "p1", "x").ok).toBe(false);
  });

  it("pages each channel's history without touching others", () => {
    let { state, id } = withChannel();
    state = must(sendChat(state, "p0", "global", "keep me"));
    for (let i = 0; i < 3 * CHAT_PAGE; i++) state = must(sendChat(state, "p0", id, `m${i}`));
    expect(state.chat.filter((m) => m.channel === id)).toHaveLength(2 * CHAT_PAGE);
    expect(state.chat.some((m) => m.text === "keep me")).toBe(true);
  });

  it("deletes a channel's stored pages when its last member leaves, and never stores a page sealed in that input", () => {
    let { state, id } = withChannel();
    for (let i = 0; i < 2 * CHAT_PAGE + 1; i++) state = must(sendChat(state, "p0", id, `m${i}`));
    // Pages 0 and 1 sealed (0 on message 50, 1 on message 100); the outbox still holds them, as no server took them.
    expect(state.chatOutbox.sealed.map((p) => p.page)).toEqual([0, 1]);
    for (const member of state.channels.find((c) => c.id === id)!.members) state = must(leaveChannel(state, member, id));
    expect(state.chatOutbox.sealed).toEqual([]);
    expect(state.chatOutbox.dropped).toEqual([{ channel: id, pages: 2 }]);
    expect(state.chatSeq[id]).toBeUndefined();
    expect(state.chat.some((m) => m.channel === id)).toBe(false);
    expect(chatPageKey(id, 1)).toBe(`chat:${id}:1`);
  });

  it("validates channel names", () => {
    const state = createGame(seats, DEFAULT_CONFIG, 42);
    const unnamed = must(createChannel(state, "p0", "   ")).channels[0]!;
    expect([unnamed.name, unnamed.day, unnamed.cycleOfDay]).toEqual(["", 1, 1]);
    expect(createChannel(state, "p0", "x".repeat(25)).ok).toBe(false);
    expect(must(createChannel(state, "p0", "  ok  ")).channels[0]!.name).toBe("ok");
  });

  it("parses channel messages and rejects malformed ids", () => {
    const parse = (m: unknown) => parseGameMessage(JSON.stringify(m));
    expect(parse({ type: "createChannel", name: "x" })).toEqual({ type: "createChannel", name: "x" });
    expect(parse({ type: "invite", channel: "pc-3", player: "p1" })).toEqual({ type: "invite", channel: "pc-3", player: "p1" });
    expect(parse({ type: "leaveChannel", channel: "pc-3" })).toEqual({ type: "leaveChannel", channel: "pc-3" });
    expect(parse({ type: "chat", channel: "pc-3", text: "hi" })).toEqual({ type: "chat", channel: "pc-3", text: "hi" });
    for (const bad of ["pc-", "pc-x", "pc-1; drop", "global2", 3, null]) {
      expect(parse({ type: "chat", channel: bad, text: "hi" })).toBeNull();
      expect(parse({ type: "leaveChannel", channel: bad })).toBeNull();
    }
    expect(parse({ type: "invite", channel: "pc-3", player: 5 })).toBeNull();
    expect(parse({ type: "createChannel", name: 5 })).toBeNull();
    expect(parse({ type: "createChannel" })).toEqual({ type: "createChannel" });
    expect(parse({ type: "createChannel", name: "x", members: ["p1"] })).toEqual({ type: "createChannel", name: "x", members: ["p1"] });
    expect(parse({ type: "createChannel", name: "x", members: "p1" })).toBeNull();
    expect(parse({ type: "createChannel", name: "x", members: [5] })).toBeNull();
  });

  it("adds initial members on creation, skipping anyone an invite would refuse", () => {
    let state = createGame(seats, DEFAULT_CONFIG, 42);
    for (const name of ["a", "b", "c"]) state = must(createChannel(state, "p2", name));
    state = must(createChannel(state, "p0", "Crew", ["p1", "p2", "p0", "p1", "nobody"]));
    expect(state.channels.at(-1)!.members).toEqual(["p0", "p1"]);
  });
});


describe("checkbox messages", () => {
  const base = createGame(seats, DEFAULT_CONFIG, 1);
  const text = "todo\n- [ ] a\n- [x] b\n```\n- [ ] code\n```\n> 1. [ ] quoted";
  const posted = must(sendChat(base, "p1", "global", text));
  const seq = posted.chat[0]!.seq;
  // Ticks are kept beside the message (chatMarks) and drawn into its text in each view.
  const textOf = (s: GameState) => viewFor(s, "p2").chat.find((m) => m.channel === "global" && m.seq === seq)!.text;
  const toggle = (s: GameState, by: string, line: number, at = seq) => toggleCheckbox(s, by, "global", at, line);

  it("lets the author tick and untick, by line", () => {
    const ticked = must(toggle(posted, "p1", 1));
    expect(textOf(ticked)).toBe(text.replace("- [ ] a", "- [x] a"));
    expect(textOf(must(toggle(ticked, "p1", 2)))).toBe(textOf(ticked).replace("- [x] b", "- [ ] b"));
    expect(ticked.chat[0]!.text).toBe(text);
    expect(textOf(must(toggle(posted, "p1", 6)))).toContain("> 1. [x] quoted");
  });

  it("refuses everyone but the author", () => {
    expect(toggle(posted, "p2", 1).ok).toBe(false);
    expect(textOf(posted)).toBe(text);
  });

  it("refuses lines that aren't checkboxes, including inside code fences", () => {
    for (const line of [0, 3, 4, 5, 99, -1, 1.5]) expect(toggle(posted, "p1", line).ok).toBe(false);
  });

  it("refuses unknown messages and an author who lost the channel", () => {
    expect(toggle(posted, "p1", 1, 999).ok).toBe(false);
    expect(toggle(deadCopy(posted, "p1"), "p1", 1).ok).toBe(false);
  });

  it("validates the wire message", () => {
    expect(parseGameMessage(JSON.stringify({ type: "toggleCheckbox", channel: "global", seq: 3, line: 0 }))).toEqual({ type: "toggleCheckbox", channel: "global", seq: 3, line: 0 });
    const ok = { channel: "global", seq: 3, line: 0 };
    for (const bad of [{ ...ok, seq: "3" }, { ...ok, line: -1 }, { ...ok, line: undefined }, { ...ok, seq: 1.5 }, { ...ok, seq: -1 }, { ...ok, channel: "nowhere" }, { message: 3, line: 0 }]) {
      expect(parseGameMessage(JSON.stringify({ type: "toggleCheckbox", ...bad }))).toBeNull();
    }
  });
});
