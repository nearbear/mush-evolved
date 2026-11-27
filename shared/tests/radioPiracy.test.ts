import { describe, expect, it } from "vitest";
import { ACTIONS } from "../src/actions.ts";
import { createChannel, sendChat } from "../src/chat.ts";
import { killPlayer } from "../src/death.ts";
import { addDisease } from "../src/diseases.ts";
import { ITRACKIE_ITEM } from "../src/itemIds.ts";
import { parseGameMessage } from "../src/protocol.ts";
import { applyInput } from "../src/replay.ts";
import { applyAction, chatPageView, createGame, viewFor } from "../src/rules.ts";
import type { Action, GameState, PlayerId } from "../src/types.ts";
import { makeSeats, must, mustApply, nextDay, noCharacterModifiers, offered, option, player, testConfig } from "./support.ts";

const TERMINAL = "COMMAND_CENTER:COM_CENTER";
const base = noCharacterModifiers(testConfig());

/** p0 is a Mush with Radio Piracy at the Com center; p1 (the target), p2 and p3 are humans elsewhere. */
function ship(): GameState {
  const s = createGame(makeSeats(4), base, 7);
  for (const p of s.players) p.room = "LABORATORY";
  player(s, "p0").room = "COMMAND_CENTER";
  player(s, "p0").role = "mush";
  player(s, "p0").mushSkills = ["radio_piracy"];
  for (const id of ["p1", "p2", "p3"]) player(s, id).role = "human";
  s.items = s.items.filter((i) => i.type !== ITRACKIE_ITEM);
  for (const p of s.players) s.items.push({ id: `it-${p.id}`, type: ITRACKIE_ITEM, at: { kind: "player", id: p.id } });
  return s;
}

const hackAction = (target: PlayerId): Action => ({ type: "radio_piracy", equipment: TERMINAL, target });
const hack = (s: GameState, target: PlayerId = "p1"): GameState => mustApply(s, "p0", hackAction(target));
const itrackie = (s: GameState, id: PlayerId): string => s.items.find((i) => i.type === ITRACKIE_ITEM && i.at.kind === "player" && i.at.id === id)!.id;
const reset = (s: GameState, id: PlayerId = "p1"): GameState => mustApply(s, id, { type: "factory_reset", item: itrackie(s, id) });
const chat = (s: GameState, by: PlayerId, channel: string, text: string): GameState => must(sendChat(s, by, channel as never, text));
const spoof = (s: GameState, channel: string, text: string, as: PlayerId = "p1") => applyInput(s, { type: "chat", by: "p0", channel: channel as never, text, as });
const texts = (s: GameState, id: PlayerId, channel: string): string[] =>
  viewFor(s, id)
    .chat.filter((m) => m.channel === channel)
    .map((m) => m.text);
/** p1 opens a private channel with p2 and posts in it; returns the state and the channel id. */
function privateChannel(s: GameState): { s: GameState; channel: string } {
  const opened = must(createChannel(s, "p1", "secret", ["p2"]));
  const channel = opened.channels.at(-1)!.id;
  return { s: chat(opened, "p1", channel, "before"), channel };
}

describe("radio piracy", () => {
  it("costs 3 AP, factory reset 1 AP; both private, and the hack never rings myco alarms", () => {
    expect([base.radioPiracy.cost.ap, base.factoryReset.cost.ap]).toEqual([3, 1]);
    expect(option(ship(), "p0", hackAction("p1"))!.cost).toEqual({ ap: base.radioPiracy.cost.ap, mp: 0 });
    expect(option(ship(), "p1", { type: "factory_reset" })!.cost).toEqual({ ap: base.factoryReset.cost.ap, mp: 0 });
    expect(ACTIONS.radio_piracy.visibility).toBe("private");
    expect(ACTIONS.factory_reset.visibility).toBe("private");
    expect(ACTIONS.radio_piracy.tags).not.toContain("spore");
    expect(player(hack(ship()), "p0").ap).toBe(player(ship(), "p0").ap - base.radioPiracy.cost.ap);
  });

  it("targets any other living player anywhere, Mush included; only a Mush with the skill at the Com center; once a day", () => {
    const s = ship();
    player(s, "p2").role = "mush";
    const targets = offered(s, "p0")
      .filter((a) => a.type === "radio_piracy")
      .map((a) => (a as { target: string }).target);
    expect(targets.sort()).toEqual(["p1", "p2", "p3"]);
    expect(applyAction(s, "p0", hackAction("p0")).ok).toBe(false);
    // Not a human, not without the skill, not away from the terminal; a refusal changes nothing.
    player(s, "p3").room = "COMMAND_CENTER";
    player(s, "p3").mushSkills = ["radio_piracy"];
    expect(applyAction(s, "p3", hackAction("p1")).ok).toBe(false);
    const away = ship();
    player(away, "p0").room = "LABORATORY";
    expect(applyAction(away, "p0", hackAction("p1"))).toMatchObject({ ok: false });
    const noSkill = ship();
    player(noSkill, "p0").mushSkills = [];
    expect(option(noSkill, "p0", hackAction("p1"))).toBeUndefined();
    // Once a day per hacker, back the next day.
    const once = hack(ship());
    expect(applyAction(once, "p0", hackAction("p2")).ok).toBe(false);
    expect(option(once, "p0", hackAction("p2"))).toBeUndefined();
    const tomorrow = nextDay(once);
    expect(option(tomorrow, "p0", hackAction("p2"))).toBeDefined();
  });

  it("gives the hacker a private line and tells nobody else; the target's view doesn't change", () => {
    const before = ship();
    const s = hack(before);
    expect(s.log.at(-1)).toMatchObject({ key: "radioHacked", visibleTo: ["p0"] });
    for (const id of ["p1", "p2", "p3"]) expect(JSON.stringify(viewFor(s, id))).not.toContain("radio");
    expect(viewFor(s, "p0").radioHack).toEqual({ target: "p1", channels: viewFor(s, "p1").chatChannels });
    expect(JSON.stringify(viewFor(s, "p0"))).not.toContain("chatSeq");
  });

  it("reads the target's private channels from the hack on, never earlier history", () => {
    const { s: open, channel } = privateChannel(ship());
    expect(viewFor(open, "p0").readChannels).not.toContain(channel);
    const s = chat(hack(open), "p2", channel, "after");
    const v = viewFor(s, "p0");
    expect(v.readChannels).toContain(channel);
    expect(texts(s, "p0", channel)).toEqual(["after"]);
    expect(v.privateChannels.find((c) => c.id === channel)).toMatchObject({ name: "secret", tapped: true });
    // Earlier messages are unheard (never unread) and their page is refused if it is older.
    expect(v.chatUnheard?.[channel as never]).toEqual([[0, 1]]);
    expect(chatPageView(s, "p0", channel as never, 0)!.map((m) => m.text)).toEqual(["after"]);
    // Plans stay the members'; the members see no `tapped` mark.
    expect(viewFor(s, "p1").privateChannels.find((c) => c.id === channel)!.tapped).toBeUndefined();
    // A channel the target joins later reads from the hack on too.
    const later = must(createChannel(s, "p2", "", ["p1"]));
    const second = later.channels.at(-1)!.id;
    expect(texts(chat(later, "p2", second, "hi"), "p0", second)).toEqual(["hi"]);
  });

  it("posts as the target where they can post; everyone but the target sees it, and it is never unread for them", () => {
    const { s: open, channel } = privateChannel(hack(ship()));
    for (const c of ["global", channel]) {
      const r = spoof(open, c, "trust me");
      expect(r.ok).toBe(true);
      const s = (r as { state: GameState }).state;
      const last = s.chat.at(-1)!;
      expect(last).toMatchObject({ from: "p1", isBot: player(s, "p1").isBot, text: "trust me" });
      expect(texts(s, "p0", c)).toContain("trust me");
      expect(texts(s, "p2", c)).toContain("trust me");
      expect(texts(s, "p1", c)).not.toContain("trust me");
      expect(chatPageView(s, "p1", c as never, 0)!.some((m) => m.text === "trust me")).toBe(false);
      expect(viewFor(s, "p1").chatUnheard?.[c as never]).toEqual([[last.seq, last.seq + 1]]);
    }
    // Not in the Mush channel, not where the target can't post, not as anyone else.
    expect(spoof(open, "mush", "x").ok).toBe(false);
    expect(spoof(open, "global", "x", "p2").ok).toBe(false);
    const p3channel = must(createChannel(open, "p3", "", ["p2"]));
    expect(spoof(p3channel, p3channel.channels.at(-1)!.id, "x").ok).toBe(false);
  });

  it("writes the spoof as the target would: their Torn Tongue refuses it, their Missing Teeth drop letters", () => {
    const mute = hack(ship());
    addDisease(mute, player(mute, "p1"), "torn_tongue_injury");
    expect(spoof(mute, "global", "hello")).toMatchObject({ ok: false, error: "cant_speak" });
    const teeth = hack(ship());
    addDisease(teeth, player(teeth, "p1"), "missing_teeth_injury");
    const spoofed = spoof(teeth, "global", "Fast Delivery");
    expect(spoofed.ok && spoofed.state.chat.at(-1)!.text).toBe("a eiery");
    // The hacker's own injuries don't matter.
    const hackerMute = hack(ship());
    addDisease(hackerMute, player(hackerMute, "p0"), "torn_tongue_injury");
    expect(spoof(hackerMute, "global", "hello").ok).toBe(true);
  });

  it("goes quiet without the hacker's own iTrackie, and comes back with it", () => {
    const { s: open, channel } = privateChannel(hack(ship()));
    const bare = structuredClone(open);
    bare.items = bare.items.filter((i) => i.id !== itrackie(open, "p0"));
    expect(viewFor(bare, "p0").radioHack).toBeUndefined();
    expect(viewFor(bare, "p0").readChannels).not.toContain(channel);
    expect(spoof(bare, "global", "x").ok).toBe(false);
    expect(player(bare, "p0").radioHack).toBeDefined();
  });

  it("factory reset ends every hack on the resetter; the same line either way, and the hacker learns it was lost", () => {
    const clean = reset(ship());
    const hacked = reset(hack(ship()));
    const line = (s: GameState) => s.log.filter((e) => e.visibleTo !== "all" && (e.visibleTo as string[]).includes("p1")).at(-1);
    expect(line(clean)).toMatchObject({ key: "factoryReset", visibleTo: ["p1"] });
    expect({ ...line(hacked), id: 0 }).toEqual({ ...line(clean), id: 0 });
    expect(player(hacked, "p0").radioHack).toBeUndefined();
    expect(hacked.log.find((e) => e.key === "radioHackLost")).toMatchObject({ visibleTo: ["p0"], params: { target: player(hacked, "p1").character } });
    expect(clean.log.some((e) => e.key === "radioHackLost")).toBe(false);
    // Someone else's reset leaves the hack alone.
    expect(player(reset(hack(ship()), "p2"), "p0").radioHack).toBeDefined();
  });

  it("ends on the next hack, either death, and the hacker's Transfer; never with a line", () => {
    const next = hack(nextDay(hack(ship())), "p2");
    expect(player(next, "p0").radioHack!.target).toBe("p2");
    const targetDies = hack(ship());
    killPlayer(targetDies, player(targetDies, "p1"), "beaten");
    expect(player(targetDies, "p0").radioHack).toBeUndefined();
    const hackerDies = hack(ship());
    killPlayer(hackerDies, player(hackerDies, "p0"), "beaten");
    expect(player(hackerDies, "p0").radioHack).toBeUndefined();
    expect(hackerDies.log.some((e) => e.key === "radioHackLost")).toBe(false);
    // The hacker's Transfer: here into the hacked target itself, which ends it too.
    const transfer = hack(ship());
    player(transfer, "p0").mushSkills.push("transfert");
    player(transfer, "p1").room = player(transfer, "p0").room;
    transfer.contamination.p1 = 1;
    const moved = mustApply(transfer, "p0", { type: "body_transfer", target: "p1" });
    expect(moved.players.some((p) => p.radioHack)).toBe(false);
  });

  it("parses `as` on a chat message", () => {
    expect(parseGameMessage(JSON.stringify({ type: "chat", channel: "global", text: "hi", as: "p1" }))).toEqual({ type: "chat", channel: "global", text: "hi", as: "p1" });
    expect(parseGameMessage(JSON.stringify({ type: "chat", channel: "global", text: "hi", as: 3 }))).toBeNull();
  });
});

describe("radio piracy in the same room", () => {
  const near = (target: PlayerId): Action => ({ type: "radio_piracy_room", target });
  /** p0 (the hacker) and p1 share the Laboratory; p2 and p3 are elsewhere. */
  function roomShip(): GameState {
    const s = ship();
    player(s, "p0").room = "LABORATORY";
    for (const id of ["p2", "p3"]) player(s, id).room = "REFECTORY";
    return s;
  }

  it("costs 2 AP, is private, never rings myco alarms, and places the same hack", () => {
    expect(base.radioPiracy.inRoomCost.ap).toBe(2);
    expect(ACTIONS.radio_piracy_room.visibility).toBe("private");
    expect(ACTIONS.radio_piracy_room.tags).not.toContain("spore");
    const before = roomShip();
    expect(option(before, "p0", near("p1"))!.cost).toEqual({ ap: base.radioPiracy.inRoomCost.ap, mp: 0 });
    const s = mustApply(before, "p0", near("p1"));
    expect(player(s, "p0").ap).toBe(player(before, "p0").ap - base.radioPiracy.inRoomCost.ap);
    expect(player(s, "p0").radioHack?.target).toBe("p1");
    expect(s.log.at(-1)).toMatchObject({ key: "radioHacked", visibleTo: ["p0"] });
    expect(viewFor(s, "p0").radioHack?.target).toBe("p1");
    for (const id of ["p1", "p2", "p3"]) expect(JSON.stringify(viewFor(s, id))).not.toContain("radio");
  });

  it("targets only living others in the hacker's room; only a Mush with the skill", () => {
    const s = roomShip();
    const targets = offered(s, "p0")
      .filter((a) => a.type === "radio_piracy_room")
      .map((a) => (a as { target: string }).target);
    expect(targets).toEqual(["p1"]);
    expect(applyAction(s, "p0", near("p2")).ok).toBe(false);
    expect(applyAction(s, "p0", near("p0")).ok).toBe(false);
    const human = roomShip();
    player(human, "p0").role = "human";
    expect(option(human, "p0", near("p1"))).toBeUndefined();
    expect(applyAction(human, "p0", near("p1")).ok).toBe(false);
    const noSkill = roomShip();
    player(noSkill, "p0").mushSkills = [];
    expect(applyAction(noSkill, "p0", near("p1")).ok).toBe(false);
    const dead = roomShip();
    killPlayer(dead, player(dead, "p1"), "assassinated");
    expect(applyAction(dead, "p0", near("p1")).ok).toBe(false);
  });

  it("shares the once-a-day limit with the Com center hack, both ways", () => {
    const s = roomShip();
    player(s, "p2").room = "LABORATORY";
    const once = mustApply(s, "p0", near("p1"));
    expect(applyAction(once, "p0", near("p2")).ok).toBe(false);
    expect(option(once, "p0", near("p2"))).toBeUndefined();
    expect(option(nextDay(once), "p0", near("p2"))).toBeDefined();
    // A Com center hack today blocks the in-room one.
    const atTerminal = hack(ship());
    player(atTerminal, "p0").room = "LABORATORY";
    expect(applyAction(atTerminal, "p0", near("p1")).ok).toBe(false);
  });
});
