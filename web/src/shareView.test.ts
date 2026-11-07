import { describe, expect, it } from "vitest";
import { shareUnchanged } from "./shareView.ts";

describe("shareUnchanged", () => {
  it("keeps unchanged parts as the previous objects and rebuilds only the path to a change", () => {
    const prev = { you: { id: "a", room: "bridge" }, chat: [{ seq: 0, text: "hi" }, { seq: 1, text: "yo" }], threads: [] };
    const next = JSON.parse(JSON.stringify(prev)) as typeof prev;
    next.you.room = "lab";
    const shared = shareUnchanged(prev, next);
    expect(shared).toEqual(next);
    expect(shared).not.toBe(prev);
    expect(shared.you).not.toBe(prev.you);
    expect(shared.chat).toBe(prev.chat);
    expect(shared.threads).toBe(prev.threads);
  });

  it("returns the previous object when nothing changed", () => {
    const prev = { a: [1, { b: 2 }], c: "x" };
    expect(shareUnchanged(prev, JSON.parse(JSON.stringify(prev)))).toBe(prev);
  });

  it("shares the untouched items of a list that grew or changed", () => {
    const prev = { chat: [{ seq: 0 }, { seq: 1, text: "old" }] };
    const next = { chat: [{ seq: 0 }, { seq: 1, text: "new" }, { seq: 2 }] };
    const shared = shareUnchanged(prev, next);
    expect(shared.chat).not.toBe(prev.chat);
    expect(shared.chat[0]).toBe(prev.chat[0]);
    expect(shared.chat[1]).toEqual({ seq: 1, text: "new" });
    expect(shared.chat[2]).toBe(next.chat[2]);
  });

  it("notices added and removed keys", () => {
    const prev: Record<string, unknown> = { a: 1, b: 2 };
    expect(shareUnchanged(prev, { a: 1 })).toEqual({ a: 1 });
    expect(shareUnchanged(prev, { a: 1, b: 2, c: 3 })).toEqual({ a: 1, b: 2, c: 3 });
    expect(shareUnchanged({ a: undefined }, { b: undefined })).toEqual({ b: undefined });
  });

  it("starts fresh from nothing", () => {
    const next = { a: [1] };
    expect(shareUnchanged(null, next)).toBe(next);
  });
});
