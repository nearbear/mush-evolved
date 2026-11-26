import { describe, expect, it } from "vitest";
import { pushChat, sendChat } from "../src/chat.ts";
import { unreadCount } from "../src/chatRead.ts";
import { fullViewFor, perspective } from "../src/fullView.ts";
import { ITRACKIE_ITEM } from "../src/itemIds.ts";
import { mergeStreams, revealFor, streamsOf } from "../src/replayView.ts";
import { addDisease, removeDisease } from "../src/diseases.ts";
import { chatPageView, createGame, viewFor } from "../src/rules.ts";
import type { GameState } from "../src/types.ts";
import { makeSeats, noCharacterModifiers, player, testConfig, withoutDrugs } from "./support.ts";

const EARS = "damaged_ears_injury";
const DESTROYED = "destroyed_ears_injury";
const config = noCharacterModifiers(testConfig({ startInventory: [ITRACKIE_ITEM] }));

function ship(): GameState {
  return withoutDrugs(createGame(makeSeats(3), config, 1));
}

/** Posts to global chat as `id`, failing the test if it's refused. */
function say(s: GameState, id: string, text: string): GameState {
  const r = sendChat(s, id, "global", text);
  if (!r.ok) throw new Error(r.error);
  return r.state;
}

const texts = (s: GameState, id: string) => viewFor(s, id).chat.filter((m) => m.channel === "global").map((m) => m.text);

describe("damaged ears injury", () => {
  it("lowers max HP by 2 while you have it", () => {
    const s = ship();
    const p0 = player(s, "p0");
    const max = p0.maxHp;
    addDisease(s, p0, EARS);
    expect(p0.maxHp).toBe(max - 2);
    removeDisease(s, p0, EARS);
    expect(p0.maxHp).toBe(max);
  });

  it("hides other players' messages posted while you have it, and only those", () => {
    let s = say(ship(), "p1", "before");
    addDisease(s, player(s, "p0"), EARS);
    s = say(s, "p1", "during");
    s = say(s, "p0", "mine");
    pushChat(s, "global", { from: null, isBot: false, text: "", system: { key: "diedHuman", params: { name: player(s, "p2").character, cause: "injury" } } });
    expect(texts(s, "p0")).toContain("before");
    expect(texts(s, "p0")).toContain("mine");
    expect(texts(s, "p0")).not.toContain("during");
    expect(viewFor(s, "p0").chat.some((m) => m.system?.key === "diedHuman")).toBe(true);
    // Everyone else hears it.
    expect(texts(s, "p2")).toContain("during");
  });

  it("keeps those messages lost after it's cured, but hears new ones", () => {
    let s = ship();
    addDisease(s, player(s, "p0"), EARS);
    s = say(s, "p1", "during");
    removeDisease(s, player(s, "p0"), EARS);
    s = say(s, "p1", "after");
    expect(texts(s, "p0")).not.toContain("during");
    expect(texts(s, "p0")).toContain("after");
  });

  it("filters an older chat page the same way", () => {
    let s = ship();
    addDisease(s, player(s, "p0"), EARS);
    s = say(s, "p1", "during");
    expect(chatPageView(s, "p0", "global", 0)!.map((m) => m.text)).not.toContain("during");
    expect(chatPageView(s, "p2", "global", 0)!.map((m) => m.text)).toContain("during");
  });

  it("sends what you couldn't hear only to you, as chatUnheard", () => {
    let s = ship();
    addDisease(s, player(s, "p0"), EARS);
    s = say(s, "p1", "during");
    expect(viewFor(s, "p0").chatUnheard).toEqual({ global: [[0, 1]] });
    for (const id of ["p0", "p1", "p2"]) expect(JSON.stringify(viewFor(s, id))).not.toContain("\"unheard\"");
    for (const id of ["p1", "p2"]) expect(viewFor(s, id).chatUnheard).toBeUndefined();
  });

  it("doesn't count what you couldn't hear as unread", () => {
    let s = say(ship(), "p1", "before");
    addDisease(s, player(s, "p0"), EARS);
    s = say(s, "p1", "during 1");
    s = say(s, "p2", "during 2");
    removeDisease(s, player(s, "p0"), EARS);
    s = say(s, "p1", "after");
    const v = viewFor(s, "p0");
    // Nothing read: "before" and "after" are unread, the two in between never notify.
    expect(unreadCount(v.chatCounts, {}, "global", v.chatUnheard)).toBe(2);
    // Read up to "before": only "after" is left.
    expect(unreadCount(v.chatCounts, { global: 1 }, "global", v.chatUnheard)).toBe(1);
    // Someone who heard everything has all four unread.
    const other = viewFor(s, "p2");
    expect(unreadCount(other.chatCounts, {}, "global", other.chatUnheard)).toBe(4);
  });
});

describe("destroyed ears injury", () => {
  it("lowers max HP by 3 and max morale by 1 while you have it", () => {
    const s = ship();
    const p0 = player(s, "p0");
    const [hp, morale] = [p0.maxHp, p0.maxMorale];
    addDisease(s, p0, DESTROYED);
    expect([p0.maxHp, p0.maxMorale]).toEqual([hp - 3, morale - 1]);
    removeDisease(s, p0, DESTROYED);
    expect([p0.maxHp, p0.maxMorale]).toEqual([hp, morale]);
  });

  it("hides other players' messages for good, like damaged ears", () => {
    let s = ship();
    addDisease(s, player(s, "p0"), DESTROYED);
    s = say(s, "p1", "during");
    removeDisease(s, player(s, "p0"), DESTROYED);
    s = say(s, "p1", "after");
    expect(texts(s, "p0")).not.toContain("during");
    expect(texts(s, "p0")).toContain("after");
  });

  it("keeps you deaf without a gap when damaged ears upgrades to it", () => {
    let s = ship();
    addDisease(s, player(s, "p0"), EARS);
    s = say(s, "p1", "damaged");
    addDisease(s, player(s, "p0"), EARS); // a second Damaged Ears upgrades
    expect(player(s, "p0").modifiers).toContain(DESTROYED);
    expect(player(s, "p0").modifiers).not.toContain(EARS);
    s = say(s, "p1", "destroyed");
    expect(texts(s, "p0")).not.toContain("damaged");
    expect(texts(s, "p0")).not.toContain("destroyed");
    expect(player(s, "p0").unheard).toEqual({ global: [[0, 2]] });
  });
});

describe("deafness in replays", () => {
  /** p0 deaf (Destroyed Ears) while p1 says "unheard"; p0's mind is p0 (no Transfer). */
  function deafGame(): GameState {
    let s = ship();
    addDisease(s, player(s, "p0"), DESTROYED);
    s = say(s, "p1", "unheard");
    return say(s, "p0", "mine");
  }
  const chatOf = (view: { chat: { text: string }[] }) => view.chat.map((m) => m.text);

  it("keeps it in a seat's own view", () => {
    const full = fullViewFor(deafGame(), null);
    expect(chatOf(perspective(full, "p0"))).not.toContain("unheard");
    expect(chatOf(perspective(full, "p2"))).toContain("unheard");
  });

  it("shows every message in All-seeing, even following the deaf seat", () => {
    const full = fullViewFor(deafGame(), null);
    expect(chatOf(revealFor(full, "p0").view)).toContain("unheard");
    expect(chatOf(revealFor(full, "p0").view)).toContain("mine");
  });

  it("shows them in All-seeing after the cure too, from older streams, while the seat view still hides them", () => {
    const s = deafGame();
    const streams = streamsOf(fullViewFor(s, null));
    removeDisease(s, player(s, "p0"), DESTROYED);
    const later = say(s, "p1", "heard");
    const full = fullViewFor(later, null);
    expect(chatOf(revealFor(full, "p0", mergeStreams(streams, full)).view)).toEqual(expect.arrayContaining(["heard", "unheard"]));
    expect(chatOf(perspective(full, "p0"))).not.toContain("unheard");
  });
});
