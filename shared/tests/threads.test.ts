import { describe, expect, it } from "vitest";
import { CHAT_PAGE, createThread, MAX_THREAD_NAME_LENGTH, sendChat, toggleCheckbox } from "../src/chat.ts";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { ITRACKIE_ITEM } from "../src/items.ts";
import { parseGameMessage } from "../src/protocol.ts";
import { applyInput } from "../src/replay.ts";
import { applyAction, createGame, viewFor, type ActionResult } from "../src/rules.ts";
import type { GameState, ThreadId } from "../src/types.ts";
import { clone, makeSeats, must, player } from "./support.ts";

const seats = makeSeats(4, "others");

const error = (r: ActionResult): string => {
  if (r.ok) throw new Error("expected a failure");
  return r.error;
};

/** p0 has posted in global chat, and p1 has started "Plans" from that message. */
function withThread(): { state: GameState; id: ThreadId; message: number } {
  let state = createGame(seats, DEFAULT_CONFIG, 42);
  state = must(sendChat(state, "p0", "global", "who has the wrench?"));
  const message = state.chat[0]!.seq;
  state = must(createThread(state, "p1", "Plans", message));
  return { state, id: state.threads[0]!.id, message };
}

describe("threads", () => {
  it("are started from a global message, and everyone with global chat reads and posts in them", () => {
    const { state: base, id, message } = withThread();
    expect(base.threads).toEqual([{ id, name: "Plans", from: message, createdBy: "p1", cycle: base.cycle }]);
    const state = must(sendChat(base, "p2", id, "I do"));
    for (const seat of seats) {
      const view = viewFor(state, seat.id);
      expect(view.threads).toEqual(state.threads);
      expect(view.chatChannels).toContain(id);
      expect(view.chat.find((m) => m.channel === id)?.text).toBe("I do");
    }
  });

  it("can be started on their own", () => {
    const state = must(createThread(createGame(seats, DEFAULT_CONFIG, 42), "p0", "  Repairs \n list "));
    expect(state.threads).toEqual([{ id: "th-1", name: "Repairs list", createdBy: "p0", cycle: state.cycle }]);
    expect(must(createThread(state, "p1", "Food")).threads.map((t) => t.id)).toEqual(["th-1", "th-2"]);
  });

  it("allow one thread per message, named by its global seq, which must exist", () => {
    const { state, message } = withThread();
    expect(error(createThread(state, "p2", "Again", message))).toBe("thread_exists");
    // Only one global message so far: seq 1 is not posted yet, whatever other channels hold.
    const botany = must(sendChat(state, "p0", "botany", "plant"));
    for (const seq of [1, 999, -1, 0.5]) expect(error(createThread(botany, "p2", "Nowhere", seq))).toBe("message_not_found");
  });

  it("can start from a global message whose page has left the state", () => {
    let state = createGame(seats, DEFAULT_CONFIG, 42);
    for (let i = 0; i < 2 * CHAT_PAGE + 1; i++) state = must(sendChat(state, "p0", "global", `m${i}`));
    expect(state.chat.some((m) => m.channel === "global" && m.seq === 0)).toBe(false);
    state = must(createThread(state, "p1", "Old times", 0));
    expect(state.threads[0]!.from).toBe(0);
    expect(error(createThread(state, "p2", "Again", 0))).toBe("thread_exists");
  });

  it("need a one-line name of at most the limit", () => {
    const state = createGame(seats, DEFAULT_CONFIG, 42);
    expect(error(createThread(state, "p0", "   "))).toBe("thread_name_invalid");
    expect(error(createThread(state, "p0", "x".repeat(MAX_THREAD_NAME_LENGTH + 1)))).toBe("thread_name_invalid");
    expect(createThread(state, "p0", "x".repeat(MAX_THREAD_NAME_LENGTH)).ok).toBe(true);
  });

  it("need an iTrackie, like global chat: without one you see no threads and can't start or post in one", () => {
    let { state, id } = withThread();
    state = must(sendChat(state, "p0", id, "secret-ish"));
    const mine = viewFor(state, "p2").inventory.find((i) => i.type === ITRACKIE_ITEM)!.id;
    state = must(applyAction(state, "p2", { type: "drop", item: mine }));
    const view = viewFor(state, "p2");
    expect(view.threads).toEqual([]);
    const json = JSON.stringify(view);
    expect(json).not.toContain("Plans");
    expect(json).not.toContain("secret-ish");
    expect(error(createThread(state, "p2", "Mine"))).toBe("thread_forbidden");
    expect(sendChat(state, "p2", id, "hi").ok).toBe(false);
  });

  it("can be read but not posted in or started by the dead", () => {
    const { state: base, id } = withThread();
    const state = must(sendChat(base, "p0", id, "still here"));
    const dead = clone(state);
    player(dead, "p3").alive = false;
    const view = viewFor(dead, "p3");
    expect(view.threads.map((t) => t.id)).toEqual([id]);
    expect(view.readChannels).toContain(id);
    expect(view.chatChannels).not.toContain(id);
    expect(view.chat.some((m) => m.text === "still here")).toBe(true);
    expect(sendChat(dead, "p3", id, "boo").ok).toBe(false);
    expect(error(createThread(dead, "p3", "Ghosts"))).toBe("thread_forbidden");
  });

  it("let authors tick checkboxes in their thread messages", () => {
    const { state: base, id } = withThread();
    const state = must(sendChat(base, "p0", id, "- [ ] fix the hull"));
    const message = state.chat.at(-1)!;
    expect(viewFor(must(toggleCheckbox(state, "p0", id, message.seq, 0)), "p1").chat.at(-1)!.text).toBe("- [x] fix the hull");
  });

  it("are replayed from the createThread input", () => {
    const state = createGame(seats, DEFAULT_CONFIG, 42);
    expect(must(applyInput(state, { type: "createThread", name: "Plans", by: "p0" })).threads).toHaveLength(1);
  });

  it("parse thread messages from clients", () => {
    const parse = (m: unknown) => parseGameMessage(JSON.stringify(m));
    expect(parse({ type: "createThread", name: "x" })).toEqual({ type: "createThread", name: "x" });
    expect(parse({ type: "createThread", name: "x", from: 4 })).toEqual({ type: "createThread", name: "x", from: 4 });
    expect(parse({ type: "createThread", name: "x", from: "4" })).toBeNull();
    expect(parse({ type: "createThread", name: 3 })).toBeNull();
    expect(parse({ type: "chat", channel: "th-3", text: "hi" })).toEqual({ type: "chat", channel: "th-3", text: "hi" });
    for (const bad of ["th-", "th-x", "th-1; drop"]) expect(parse({ type: "chat", channel: bad, text: "hi" })).toBeNull();
  });
});
