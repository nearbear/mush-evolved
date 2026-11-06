import { describe, expect, it } from "vitest";
import type { ChatMessage, LogLine, PlayerView } from "@mush2/shared";
import { batchText, freshIn, isUrgent } from "./announce.ts";

const entry = (over: Partial<LogLine>): LogLine => ({ cycle: 1, key: "x", visibleTo: "all", ...over });
const msg = (id: number, over: Partial<ChatMessage> = {}): ChatMessage => ({ id, cycle: 1, channel: "global", from: "p2", isBot: false, text: "hi", ...over });
const view = (log: LogLine[], chat: ChatMessage[], room = "A"): PlayerView => ({ log, chat, you: { room } }) as unknown as PlayerView;

describe("freshIn", () => {
  it("announces nothing for the history of the first view", () => {
    const f = freshIn(null, view([entry({})], [msg(1)]));
    expect(f.log).toEqual([]);
    expect(f.chat).toEqual([]);
    expect(f.seen).toEqual({ log: 1, chat: 1, cycle: 1 });
  });

  it("returns only what came after, from this room or private to you", () => {
    const seen = { log: 1, chat: 1, cycle: 1 };
    const f = freshIn(seen, view([entry({}), entry({ key: "here", room: "A" }), entry({ key: "there", room: "B" }), entry({ key: "mine" })], [msg(1), msg(2)]));
    expect(f.log.map((e) => e.key)).toEqual(["here", "mine"]);
    expect(f.chat.map((m) => m.id)).toEqual([2]);
  });

  it("reports a later cycle once", () => {
    const first = freshIn({ log: 1, chat: 0, cycle: 1 }, view([entry({}), entry({ cycle: 2 })], []));
    expect(first.cycle).toBe(2);
    expect(freshIn(first.seen, view([entry({}), entry({ cycle: 2 })], [])).cycle).toBeUndefined();
  });

  it("treats a shorter log as trimmed, not as new", () => {
    expect(freshIn({ log: 5, chat: 0, cycle: 1 }, view([entry({})], [])).log).toEqual([]);
  });
});

describe("isUrgent", () => {
  it("covers warnings and injury or death keys only", () => {
    expect(isUrgent({ key: "x", level: "warning" })).toBe(true);
    expect(isUrgent({ key: "died" })).toBe(true);
    expect(isUrgent({ key: "chitchatted" })).toBe(false);
  });
});

describe("batchText", () => {
  it("joins a short batch and cuts a long one to a count", () => {
    expect(batchText(["a", "b"], () => "more")).toBe("a b");
    expect(batchText(["a", "b", "c", "d", "e", "f"], (n) => `+${n}`)).toBe("a b c d +2");
  });
});
