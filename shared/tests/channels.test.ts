import { describe, expect, it } from "vitest";
import { CHARACTERS } from "../src/characters.ts";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { ITRACKIE_ITEM } from "../src/items.ts";
import { channelLimit, MODIFIERS } from "../src/modifiers.ts";
import { parseGameMessage } from "../src/protocol.ts";
import {
  CHAT_HISTORY,
  createChannel,
  inviteToChannel,
  leaveChannel,
  sendChat,
  toggleCheckbox,
} from "../src/chat.ts";
import { applyAction, createGame, viewFor, type ActionResult } from "../src/rules.ts";
import type { GameState, PrivateChannelId, Seat } from "../src/types.ts";

const seats: Seat[] = Array.from({ length: 8 }, (_, i) => ({
  id: `p${i}`,
  name: `Player ${i}`,
  isBot: i > 0,
  character: CHARACTERS[i]!.id,
}));

const deadCopy = (s: GameState, id: string): GameState => {
  const copy = JSON.parse(JSON.stringify(s)) as GameState;
  copy.players.find((p) => p.id === id)!.alive = false;
  return copy;
};
const must = (r: ActionResult): GameState => {
  if (!r.ok) throw new Error(r.error);
  return r.state;
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
      expect(view.privateChannels).toEqual([{ id, name: "Secret plans", members: ["p0", "p1"], createdBy: "p0" }]);
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

  it("stops dead members reading and posting", () => {
    const { state, id } = withChannel();
    const dead = deadCopy(state, "p1");
    expect(viewFor(dead, "p1").chatChannels).toEqual([]);
    expect(sendChat(dead, "p1", id, "hi").ok).toBe(false);
    expect(createChannel(dead, "p1", "x").ok).toBe(false);
  });

  it("caps each channel's history without touching others", () => {
    let { state, id } = withChannel();
    state = must(sendChat(state, "p0", "global", "keep me"));
    for (let i = 0; i < CHAT_HISTORY + 5; i++) state = must(sendChat(state, "p0", id, `m${i}`));
    expect(state.chat.filter((m) => m.channel === id)).toHaveLength(CHAT_HISTORY);
    expect(state.chat.some((m) => m.text === "keep me")).toBe(true);
  });

  it("validates channel names", () => {
    const state = createGame(seats, DEFAULT_CONFIG, 42);
    expect(createChannel(state, "p0", "   ").ok).toBe(false);
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
  });
});


describe("checkbox messages", () => {
  const base = createGame(seats, DEFAULT_CONFIG, 1);
  const text = "todo\n- [ ] a\n- [x] b\n```\n- [ ] code\n```\n> 1. [ ] quoted";
  const posted = must(sendChat(base, "p1", "global", text));
  const id = posted.chat[0]!.id;
  const textOf = (s: GameState) => s.chat.find((m) => m.id === id)!.text;

  it("lets the author tick and untick, by line", () => {
    const ticked = must(toggleCheckbox(posted, "p1", id, 1));
    expect(textOf(ticked)).toBe(text.replace("- [ ] a", "- [x] a"));
    expect(textOf(must(toggleCheckbox(ticked, "p1", id, 2)))).toBe(ticked.chat[0]!.text.replace("- [x] b", "- [ ] b"));
    expect(textOf(must(toggleCheckbox(posted, "p1", id, 6)))).toContain("> 1. [x] quoted");
  });

  it("refuses everyone but the author", () => {
    expect(toggleCheckbox(posted, "p2", id, 1).ok).toBe(false);
    expect(textOf(posted)).toBe(text);
  });

  it("refuses lines that aren't checkboxes, including inside code fences", () => {
    for (const line of [0, 3, 4, 5, 99, -1, 1.5]) expect(toggleCheckbox(posted, "p1", id, line).ok).toBe(false);
  });

  it("refuses unknown messages and an author who lost the channel", () => {
    expect(toggleCheckbox(posted, "p1", 999, 1).ok).toBe(false);
    expect(toggleCheckbox(deadCopy(posted, "p1"), "p1", id, 1).ok).toBe(false);
  });

  it("validates the wire message", () => {
    expect(parseGameMessage(JSON.stringify({ type: "toggleCheckbox", message: 3, line: 0 }))).toEqual({ type: "toggleCheckbox", message: 3, line: 0 });
    for (const bad of [{ message: "3", line: 0 }, { message: 3, line: -1 }, { message: 3 }, { message: 1.5, line: 0 }]) {
      expect(parseGameMessage(JSON.stringify({ type: "toggleCheckbox", ...bad }))).toBeNull();
    }
  });
});
