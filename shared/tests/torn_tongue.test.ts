import { describe, expect, it } from "vitest";
import { createChannel, sendChat } from "../src/chat.ts";
import { addDisease, removeDisease } from "../src/diseases.ts";
import { ITRACKIE_ITEM } from "../src/itemIds.ts";
import { applyAction, createGame } from "../src/rules.ts";
import type { Action, GameState } from "../src/types.ts";
import { makeSeats, must, offered, player, testConfig } from "./support.ts";

const TONGUE = "torn_tongue_injury";

function ship(): GameState {
  const s = createGame(makeSeats(3, "others"), testConfig({ startInventory: [ITRACKIE_ITEM] }), 7);
  for (const p of s.players) p.room = "LABORATORY";
  player(s, "p0").skills = ["leadership", "motivator", "shrink"];
  player(s, "p1").skills = ["confident"];
  return s;
}

const talking: Action[] = [{ type: "fiery_speech" }, { type: "boring_speech" }, { type: "comfort", target: "p1" }];
const chitchat: Action = { type: "chitchat", target: "p1" };

describe("torn tongue injury", () => {
  it("refuses every talking action while you have it", () => {
    const s = ship();
    for (const a of talking) expect(offered(s, "p0")).toContainEqual(a);
    expect(offered(s, "p0")).toContainEqual(chitchat);
    addDisease(s, player(s, "p0"), TONGUE);
    for (const a of [...talking, chitchat]) {
      expect(offered(s, "p0")).not.toContainEqual(a);
      expect(applyAction(s, "p0", a).ok).toBe(false);
    }
    removeDisease(s, player(s, "p0"), TONGUE);
    must(applyAction(s, "p0", { type: "comfort", target: "p1" }));
  });

  it("refuses chat posts, in any channel, and only for the injured", () => {
    const s = ship();
    addDisease(s, player(s, "p0"), TONGUE);
    expect(sendChat(s, "p0", "global", "hello")).toEqual({ ok: false, error: "cant_speak" });
    expect(sendChat(s, "p1", "global", "hello").ok).toBe(true);
    removeDisease(s, player(s, "p0"), TONGUE);
    expect(sendChat(s, "p0", "global", "hello").ok).toBe(true);
  });

  it("refuses creating a private channel", () => {
    const s = ship();
    addDisease(s, player(s, "p0"), TONGUE);
    expect(createChannel(s, "p0", "", ["p1"])).toEqual({ ok: false, error: "cant_speak" });
    expect(createChannel(s, "p1", "", ["p0"]).ok).toBe(true);
    removeDisease(s, player(s, "p0"), TONGUE);
    expect(createChannel(s, "p0").ok).toBe(true);
  });
});
