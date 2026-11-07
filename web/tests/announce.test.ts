import { describe, expect, it } from "vitest";
import type { ChatLine, LogLine, PlayerView } from "@mush2/shared";
import { batchText, freshIn, isUrgent } from "../src/announce.ts";

const entry = (over: Partial<LogLine>): LogLine => ({ cycle: 1, key: "x", visibleTo: "all", ...over });
const msg = (seq: number, over: Partial<ChatLine> = {}): ChatLine => ({ seq, cycle: 1, channel: "global", from: "p2", isBot: false, text: "hi", ...over });
const view = (log: LogLine[], chat: ChatLine[], room = "A", logSeen = log.length, id = "p1"): PlayerView =>
  ({ log, logSeen, chat, chatCounts: chat.length ? { global: chat.length } : {}, readChannels: ["global"], you: { id, room } }) as unknown as PlayerView;

describe("freshIn", () => {
  it("announces nothing for the history of the first view", () => {
    const f = freshIn(null, view([entry({})], [msg(0)]));
    expect(f.log).toEqual([]);
    expect(f.chat).toEqual([]);
    expect(f.seen).toEqual({ body: "p1", log: 1, chat: { global: 1 }, cycle: 1 });
  });

  it("returns only what came after, from this room or private to you", () => {
    const seen = { body: "p1", log: 1, chat: { global: 1 }, cycle: 1 };
    const f = freshIn(seen, view([entry({}), entry({ key: "here", room: "A" }), entry({ key: "there", room: "B" }), entry({ key: "mine" })], [msg(0), msg(1)]));
    expect(f.log.map((e) => e.key)).toEqual(["here", "mine"]);
    expect(f.chat.map((m) => m.seq)).toEqual([1]);
  });

  it("announces no history from a channel that just became readable, and counts per channel", () => {
    const seen = { body: "p1", log: 0, chat: { global: 1 }, cycle: 1 };
    const v = { ...view([], [msg(0), msg(1), msg(0, { channel: "mush" }), msg(1, { channel: "mush" })]), readChannels: ["global", "mush"], chatCounts: { global: 2, mush: 2 } } as PlayerView;
    const f = freshIn(seen, v);
    expect(f.chat.map((m) => `${m.channel}:${m.seq}`)).toEqual(["global:1"]);
    expect(f.seen.chat).toEqual({ global: 2, mush: 2 });
    expect(freshIn(f.seen, { ...v, chat: [...v.chat, msg(2, { channel: "mush" })], chatCounts: { global: 2, mush: 3 } }).chat.map((m) => m.seq)).toEqual([2]);
  });

  it("reports a later cycle once", () => {
    const first = freshIn({ body: "p1", log: 1, chat: {}, cycle: 1 }, view([entry({}), entry({ cycle: 2 })], []));
    expect(first.cycle).toBe(2);
    expect(freshIn(first.seen, view([entry({}), entry({ cycle: 2 })], [])).cycle).toBeUndefined();
  });

  it("counts new lines by logSeen, not by length, once old ones leave the window", () => {
    // Five seen; two aged out and one came in: the log is shorter, but its last line is new.
    const f = freshIn({ body: "p1", log: 5, chat: {}, cycle: 1 }, view([entry({}), entry({}), entry({}), entry({ key: "new" })], [], "A", 6));
    expect(f.log.map((e) => e.key)).toEqual(["new"]);
    expect(f.seen.log).toBe(6);
  });

  it("announces nothing when the count did not grow", () => {
    expect(freshIn({ body: "p1", log: 5, chat: {}, cycle: 1 }, view([entry({})], [], "A", 5)).log).toEqual([]);
  });

  it("starts over after a Transfer moves you to another body", () => {
    expect(freshIn({ body: "p1", log: 1, chat: {}, cycle: 1 }, view([entry({}), entry({ key: "theirs" })], [], "A", 9, "p2")).log).toEqual([]);
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
