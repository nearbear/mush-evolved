import { describe, expect, it } from "vitest";
import type { ChannelId } from "@mush2/shared";
import { dividerAt, dividerPlacement } from "../../src/hud/unreadDivider.ts";
import { featureOf, unreadByFeature } from "../../src/hud/chatTabs.ts";

describe("dividerPlacement", () => {
  it("puts the divider in the feed when its page is shown", () => {
    expect(dividerPlacement(57, 60, 1)).toEqual({ beforeSeq: 57, jumpPage: null, count: 3 });
  });
  it("offers a jump when the divider is on an earlier page", () => {
    expect(dividerPlacement(12, 120, 2)).toEqual({ beforeSeq: null, jumpPage: 0, count: 108 });
  });
  it("has no jump when the reader went back past the divider (» shows the count)", () => {
    expect(dividerPlacement(110, 120, 0)).toEqual({ beforeSeq: null, jumpPage: null, count: 10 });
  });
  it("is absent with nothing unread", () => {
    expect(dividerPlacement(null, 10, 0).count).toBe(0);
    expect(dividerPlacement(10, 10, 0)).toEqual({ beforeSeq: null, jumpPage: null, count: 0 });
  });
});

describe("dividerAt", () => {
  const msgs = (from: string[], start = 0) => from.map((f, i) => ({ seq: start + i, from: f }));
  it("goes at the read count", () => {
    expect(dividerAt(2, 4, msgs(["p1", "p0", "p1", "p0"]), "p0")).toBe(2);
  });
  it("is absent when everything is read", () => {
    expect(dividerAt(4, 4, msgs(["p1", "p1", "p1", "p1"]), "p0")).toBeNull();
  });
  it("is absent when only your own messages are past the count (the server's count is on its way)", () => {
    expect(dividerAt(2, 4, msgs(["p1", "p1", "p0", "p0"]), "p0")).toBeNull();
  });
  it("counts a message missing from the view as someone else's", () => {
    expect(dividerAt(2, 5, msgs(["p0", "p0"], 3), "p0")).toBe(2);
  });
});

describe("unreadByFeature", () => {
  it("files shared planets under Astrophysics and shared reports under Expeditions", () => {
    expect(featureOf("sp-3" as ChannelId)).toBe("astrophysics");
    expect(featureOf("sr-1" as ChannelId)).toBe("expeditions");
    expect(featureOf("botany")).toBe("botany");
    expect(featureOf("global")).toBeNull();
    expect(featureOf("th-2" as ChannelId)).toBeNull();
  });
  it("sums each feature's channels, readable ones only", () => {
    const view = {
      readChannels: ["global", "botany", "astrophysics", "sp-1", "sr-1"] as ChannelId[],
      chatCounts: { global: 9, botany: 3, astrophysics: 2, "sp-1": 4, "sr-1": 1, research: 7 } as Partial<Record<ChannelId, number>>,
    };
    expect(unreadByFeature(view, { botany: 3, astrophysics: 1, "sp-1": 1 } as Partial<Record<ChannelId, number>>)).toEqual({ astrophysics: 4, expeditions: 1 });
  });
});

describe("unheard messages (Damaged or Destroyed Ears)", () => {
  const others = (seqs: number[]) => seqs.map((seq) => ({ seq, from: "p1" }));

  it("place no divider when everything unread is unheard", () => {
    expect(dividerAt(2, 5, [], "p0", [[2, 5]])).toBeNull();
  });

  it("move the divider past unheard messages, which aren't drawn", () => {
    expect(dividerAt(2, 6, others([5]), "p0", [[2, 5]])).toBe(5);
  });

  it("leave them out of the count", () => {
    expect(dividerPlacement(2, 10, 0, [[4, 7]]).count).toBe(5);
  });
});
