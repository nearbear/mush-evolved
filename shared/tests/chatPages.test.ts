// Chat pages (#355, docs/plans/chat-pages.md): fixed pages of CHAT_PAGE messages per channel, sealed into an outbox the
// server stores, with views naming messages by channel and seq, never the game-wide id.
import { describe, expect, it } from "vitest";
import { CHAT_PAGE, chatPageOf, sendChat, takeChatOutbox } from "../src/chat.ts";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { contaminate } from "../src/infection.ts";
import { stampEntries } from "../src/replay.ts";
import { createGame, viewFor } from "../src/rules.ts";
import { fullViewFor } from "../src/fullView.ts";
import { applyDiff, diffView } from "../src/viewDiff.ts";
import { MUSH_CHANNEL, type GameState } from "../src/types.ts";
import { clone, makeSeats, must, player } from "./support.ts";

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
