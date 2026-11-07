// Chat pages (#355, docs/plans/chat-pages.md): fixed pages of CHAT_PAGE messages per channel, sealed into an outbox the
// server stores, with views naming messages by channel and seq, never the game-wide id.
import { describe, expect, it } from "vitest";
import { CHAT_PAGE, chatPageOf, createChannel, leaveChannel, sendChat, takeChatOutbox, toggleCheckbox } from "../src/chat.ts";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { contaminate } from "../src/infection.ts";
import { ITRACKIE_ITEM } from "../src/items.ts";
import { mergeStreams, revealFor, streamsOf } from "../src/replayView.ts";
import { stampEntries } from "../src/replay.ts";
import { createGame, viewFor } from "../src/rules.ts";
import { fullViewFor } from "../src/fullView.ts";
import { applyDiff, diffView } from "../src/viewDiff.ts";
import { MUSH_CHANNEL, type GameState } from "../src/types.ts";
import { clone, makeSeats, must, player } from "./support.ts";

const error = (r: { ok: boolean; error?: string }): string | undefined => (r.ok ? undefined : r.error);

const seats = makeSeats(4, "others");
const post = (state: GameState, n: number, channel: "global" | "botany" = "global"): GameState => {
  for (let i = 0; i < n; i++) state = must(sendChat(state, "p0", channel, `${channel} ${i}`));
  return state;
};

describe("chat pages", () => {
  it("number each channel's messages from 0, apart from the other channels", () => {
    let state = post(createGame(seats, DEFAULT_CONFIG, 1), 3);
    state = post(state, 2, "botany");
    state = post(state, 1);
    expect(state.chat.map((m) => `${m.channel}:${m.seq}`)).toEqual(["global:0", "global:1", "global:2", "botany:0", "botany:1", "global:3"]);
    expect(state.chatSeq).toEqual({ global: 4, botany: 2 });
    expect(chatPageOf(CHAT_PAGE - 1)).toBe(0);
    expect(chatPageOf(CHAT_PAGE)).toBe(1);
  });

  it("seal a full page when the next one starts, not when it fills", () => {
    let state = post(createGame(seats, DEFAULT_CONFIG, 1), CHAT_PAGE);
    expect(state.chatOutbox.sealed).toEqual([]);
    state = post(state, 1);
    const [sealed] = takeChatOutbox(state).sealed;
    expect(sealed!.channel).toBe("global");
    expect(sealed!.page).toBe(0);
    expect(sealed!.messages.map((m) => m.seq)).toEqual(Array.from({ length: CHAT_PAGE }, (_, i) => i));
    // The sealed page stays as the tail until the next seal.
    expect(state.chat).toHaveLength(CHAT_PAGE + 1);
    expect(state.chatOutbox).toEqual({ sealed: [], dropped: [] });
  });

  it("drop the old tail from the state once the next page seals, keeping the rest for the views", () => {
    let state = post(createGame(seats, DEFAULT_CONFIG, 1), 2 * CHAT_PAGE + 1);
    expect(state.chatOutbox.sealed.map((p) => p.page)).toEqual([0, 1]);
    const view = viewFor(state, "p1");
    expect(view.chat.map((m) => m.seq)).toEqual(Array.from({ length: CHAT_PAGE + 1 }, (_, i) => CHAT_PAGE + i));
    expect(view.chatCounts.global).toBe(2 * CHAT_PAGE + 1);
  });

  it("stamp the copies in a page that the same input sealed", () => {
    let state = post(createGame(seats, DEFAULT_CONFIG, 1), CHAT_PAGE + 1);
    state = stampEntries(state, 77);
    expect(state.chatOutbox.sealed[0]!.messages.every((m) => m.at === 77)).toBe(true);
    expect(state.chat.every((m) => m.at === 77)).toBe(true);
  });

  it("keep the outbox out of the full view, and record a seal as a small change", () => {
    const before = post(createGame(seats, DEFAULT_CONFIG, 1), 2 * CHAT_PAGE);
    takeChatOutbox(before);
    const after = post(before, 1);
    expect("chatOutbox" in fullViewFor(after, null)).toBe(false);
    const [a, b] = [fullViewFor(before, null), fullViewFor(after, null)];
    const diff = diffView(a, b);
    expect(applyDiff(a, diff)).toEqual(b);
    // One page removed and one message appended, not every message patched in place.
    expect(JSON.stringify(diff).length).toBeLessThan(JSON.stringify(b.chat.at(-1)).length + 1000);
  });

  it("never show a human a gap where the Mush were told of a contamination", () => {
    let state = createGame(seats, DEFAULT_CONFIG, 1);
    const mush = state.players.find((p) => p.role === "mush")!;
    const human = state.players.find((p) => p.role !== "mush")!;
    state = post(state, 1);
    const next = clone(state);
    contaminate(next, player(next, human.id));
    expect(next.chat.some((m) => m.channel === MUSH_CHANNEL && m.system?.key === "mushContaminated")).toBe(true);
    state = post(next, 1);
    const view = viewFor(state, human.id);
    expect(view.chat.map((m) => m.seq)).toEqual([0, 1]);
    expect(view.chat.some((m) => "id" in m)).toBe(false);
    expect(view.chatCounts).toEqual({ global: 2 });
    expect(view.readChannels).not.toContain(MUSH_CHANNEL);
    expect(viewFor(state, mush.id).chatCounts[MUSH_CHANNEL]).toBe(1);
  });
});

describe("checklist ticks (phase 2)", () => {
  const LIST = "plan\n- [ ] hull\n- [x] oxygen";
  /** p0's checklist at `seq` 0 of global chat, then `after` more messages. */
  const listThen = (after: number): GameState => post(must(sendChat(createGame(seats, DEFAULT_CONFIG, 1), "p0", "global", LIST)), after);
  const shown = (state: GameState, by = "p1", seq = 0) => viewFor(state, by).chat.find((m) => m.channel === "global" && m.seq === seq)?.text;

  it("start from the boxes as typed, and are kept beside the message, not in it", () => {
    const state = listThen(0);
    expect(state.chatMarks).toEqual({ "global:0": { from: "p0", tasks: [1, 2], checked: [2] } });
    const ticked = must(toggleCheckbox(state, "p0", "global", 0, 1));
    expect(ticked.chatMarks["global:0"]!.checked).toEqual([1, 2]);
    expect(ticked.chat[0]!.text).toBe(LIST);
    expect(ticked.chat).toEqual(state.chat);
    expect(shown(ticked)).toBe("plan\n- [x] hull\n- [x] oxygen");
    expect(shown(must(toggleCheckbox(ticked, "p0", "global", 0, 2)))).toBe("plan\n- [x] hull\n- [ ] oxygen");
  });

  it("are only made for a player's message with a task line", () => {
    let state = post(createGame(seats, DEFAULT_CONFIG, 1), 1);
    state = must(sendChat(state, "p0", "global", "```\n- [ ] in code\n```"));
    expect(state.chatMarks).toEqual({});
    expect(error(toggleCheckbox(state, "p0", "global", 0, 0))).toBe("message_not_found");
    expect(error(toggleCheckbox(state, "p0", "global", 1, 1))).toBe("message_not_found");
  });

  it("toggle the same on the open page, the tail and a page two back, with nothing read from storage", () => {
    for (const after of [1, CHAT_PAGE, 2 * CHAT_PAGE + 5]) {
      const state = listThen(after);
      takeChatOutbox(state);
      const ticked = must(toggleCheckbox(state, "p0", "global", 0, 1));
      expect(ticked.chatOutbox).toEqual({ sealed: [], dropped: [] });
      expect(ticked.chat).toEqual(state.chat);
      expect(ticked.chatMarks["global:0"]!.checked).toEqual([1, 2]);
    }
    // Two pages back, the message is in no view; the tail still carries it ticked.
    expect(shown(must(toggleCheckbox(listThen(2 * CHAT_PAGE + 5), "p0", "global", 0, 1)))).toBeUndefined();
    expect(shown(must(toggleCheckbox(listThen(CHAT_PAGE + 5), "p0", "global", 0, 1)))).toBe("plan\n- [x] hull\n- [x] oxygen");
  });

  it("are the author's alone, while they can still post to the channel", () => {
    const state = listThen(0);
    expect(error(toggleCheckbox(state, "p1", "global", 0, 1))).toBe("message_not_yours");
    expect(error(toggleCheckbox(state, "p0", "global", 0, 0))).toBe("checkbox_not_found");
    expect(error(toggleCheckbox(state, "p0", "global", 0, 1.5))).toBe("checkbox_not_found");
    expect(error(toggleCheckbox(state, "p0", "botany", 0, 1))).toBe("message_not_found");
    const bare = clone(state);
    bare.items = bare.items.filter((i) => !(i.type === ITRACKIE_ITEM && i.at.kind === "player" && i.at.id === "p0"));
    expect(error(toggleCheckbox(bare, "p0", "global", 0, 1))).toBe("message_not_found");
  });

  it("never reach a view as entries, nor anyone who can't read the channel", () => {
    let state = must(createChannel(createGame(seats, DEFAULT_CONFIG, 1), "p0", "", ["p1"]));
    const channel = state.channels[0]!.id;
    state = must(sendChat(state, "p0", channel, "- [ ] secret task"));
    state = must(toggleCheckbox(state, "p0", channel, 0, 0));
    expect(viewFor(state, "p1").chat.find((m) => m.channel === channel)!.text).toBe("- [x] secret task");
    for (const p of ["p0", "p1", "p2", "p3"]) expect(JSON.stringify(viewFor(state, p))).not.toContain("chatMarks");
    expect(JSON.stringify(viewFor(state, "p2"))).not.toContain("secret task");
  });

  it("go with a private channel when its last member leaves", () => {
    let state = must(createChannel(createGame(seats, DEFAULT_CONFIG, 1), "p0"));
    const channel = state.channels[0]!.id;
    state = must(sendChat(state, "p0", channel, "- [ ] a"));
    state = must(sendChat(state, "p0", "global", "- [ ] b"));
    expect(Object.keys(state.chatMarks)).toEqual([`${channel}:0`, "global:0"]);
    expect(Object.keys(must(leaveChannel(state, "p0", channel)).chatMarks)).toEqual(["global:0"]);
  });

  it("replay: a toggle on a page two back shows in the frame after it, the text as typed in the streams", () => {
    const before = listThen(2 * CHAT_PAGE + 5);
    const after = must(toggleCheckbox(before, "p0", "global", 0, 1));
    const [a, b] = [fullViewFor(before, null), fullViewFor(after, null)];
    expect(applyDiff(a, diffView(a, b))).toEqual(b);
    // The streams still hold the first message from an earlier frame.
    const streams = mergeStreams(mergeStreams(streamsOf(fullViewFor(listThen(0), null)), a), b);
    expect(streams.chat[0]!.text).toBe(LIST);
    const follow = after.players[0]!.mind;
    const text = (full: typeof a) => revealFor(full, follow, streams).view.chat.find((m) => m.channel === "global" && m.seq === 0)!.text;
    expect(text(a)).toBe(LIST);
    expect(text(b)).toBe("plan\n- [x] hull\n- [x] oxygen");
  });
});
