import { describe, expect, it } from "vitest";
import { CHARACTERS } from "../src/characters.ts";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { MODIFIERS } from "../src/modifiers.ts";
import { applyAction, createGame, sendChat, viewFor } from "../src/rules.ts";
import type { Action, GameState, PlayerId, PlayerView, Seat } from "../src/types.ts";

const seats: Seat[] = Array.from({ length: 4 }, (_, i) => ({ id: `p${i}`, name: `Player ${i}`, isBot: false, character: CHARACTERS[i]!.id }));
const config = { ...DEFAULT_CONFIG, mushCount: 1, startInventory: [], startItems: [], maxAp: 99, startAp: 50 };
const spike = (target: PlayerId): Action => ({ type: "spike", target });
const player = (s: GameState, id: PlayerId) => s.players.find((p) => p.id === id)!;

/** p0 alpha Mush with 9 spores, p1 human beside them in SICK_BAY; p2 human bystander there too; p3 human in the lab. */
function ship(): GameState {
  const s = createGame(seats, config, 3);
  s.players.forEach((p) => {
    p.role = p.id === "p0" ? "mush" : "human";
    p.alpha = p.id === "p0";
    p.room = p.id === "p3" ? "LABORATORY" : "SICK_BAY";
  });
  player(s, "p0").spores = 9;
  return s;
}

function mustApply(state: GameState, id: PlayerId, ...actions: Action[]): GameState {
  for (const action of actions) {
    const r = applyAction(state, id, action);
    if (!r.ok) throw new Error(r.error);
    state = r.state;
  }
  return state;
}

const spikes = (s: GameState, n: number) => mustApply(s, "p0", ...Array.from({ length: n }, () => spike("p1")));

describe("conversion", () => {
  it("happens at once when contamination reaches capacity, and not before", () => {
    const two = spikes(ship(), 2);
    expect(player(two, "p1").role).toBe("human");
    const three = spikes(two, 1);
    expect(player(three, "p1")).toMatchObject({ role: "mush", alpha: false });
    expect(three.contamination).toEqual({});
  });

  it("waits for a capacity raised by modifiers", () => {
    MODIFIERS["test_resistant"] = { contaminationCapacity: (c) => c + 2 };
    try {
      const s0 = ship();
      player(s0, "p1").modifiers.push("test_resistant");
      expect(player(spikes(s0, 4), "p1").role).toBe("human");
      expect(player(spikes(s0, 5), "p1").role).toBe("mush");
    } finally {
      delete MODIFIERS["test_resistant"];
    }
  });

  it("tells only the convert, privately, without naming who did it", () => {
    const s = spikes(ship(), 3);
    const entry = viewFor(s, "p1").log.at(-1)!;
    expect(entry).toMatchObject({ key: "converted", visibleTo: ["p1"] });
    expect(entry.params).toBeUndefined();
    for (const id of ["p0", "p2", "p3"]) expect(viewFor(s, id).log.some((e) => e.key === "converted")).toBe(false);
  });

  it("keeps skills, HP, and morale, and drops satiety and hunger", () => {
    const s0 = ship();
    Object.assign(player(s0, "p1"), { skills: ["creative"], hp: 9, morale: 5, satiety: 4, satietyZeroSince: null });
    const p1 = player(spikes(s0, 3), "p1");
    expect(p1).toMatchObject({ skills: ["creative"], hp: 9, morale: 5, satiety: 0, satietyZeroSince: null });
  });

  it("gives Mush actions at once: spore extraction with no cooldown, and skill picks", () => {
    const v = viewFor(spikes(ship(), 3), "p1");
    expect(v.legalActions).toContainEqual({ type: "extract_spore" });
    expect(v.legalActions.some((a) => a.type === "pick_skill")).toBe(true);
  });

  it("shows a human's contamination to Mush in their room only, never to humans or the human themself", () => {
    const s = spikes(ship(), 2);
    const seenOn = (viewer: PlayerId, target: PlayerId) => viewFor(s, viewer).players.find((p) => p.id === target)!.contamination;
    expect(seenOn("p0", "p1")).toBe(2);
    expect(seenOn("p0", "p2")).toBeUndefined(); // not contaminated
    expect(seenOn("p2", "p1")).toBeUndefined(); // a human bystander
    expect(JSON.stringify(viewFor(s, "p1"))).not.toMatch(/contamin/i); // the victim's own view
    // A Mush elsewhere doesn't see it.
    const apart = spikes(ship(), 2);
    player(apart, "p0").room = "LABORATORY";
    expect(viewFor(apart, "p0").players.find((p) => p.id === "p1")!.contamination).toBeUndefined();
    // Once converted there is nothing to show.
    expect(viewFor(spikes(s, 1), "p0").players.find((p) => p.id === "p1")!.contamination).toBeUndefined();
  });

  it("changes nothing a bystander human can see, apart from the spike itself", () => {
    const strip = (v: PlayerView) => ({ ...v, log: v.log.filter((e) => e.key !== "spiked") });
    const before = spikes(ship(), 2);
    const after = spikes(before, 1);
    for (const id of ["p2", "p3"]) {
      const b = strip(viewFor(before, id));
      const a = strip(viewFor(after, id));
      // The Mush spent AP and a spore, which no bystander sees either.
      expect(a).toEqual(b);
    }
    expect(JSON.stringify(viewFor(after, "p2"))).not.toMatch(/contamin|converted/i);
  });
});

describe("Mush channel", () => {
  const mushChat = (s: GameState, id: PlayerId) => viewFor(s, id).chat.filter((m) => m.channel === "mush");

  it("posts a system message naming the human and the level, but not the culprit", () => {
    const s = spikes(ship(), 1);
    expect(mushChat(s, "p0")).toEqual([
      expect.objectContaining({ from: null, system: { key: "mushContaminated", params: { name: "Player 1", level: 1, capacity: 3 } } }),
    ]);
    expect(JSON.stringify(s.chat)).not.toContain("Player 0");
  });

  it("posts a conversion message at capacity, and the convert can then read the channel", () => {
    const two = spikes(ship(), 2);
    expect(viewFor(two, "p1").chatChannels).not.toContain("mush");
    const three = spikes(two, 1);
    expect(mushChat(three, "p0").at(-1)).toMatchObject({ system: { key: "mushConverted", params: { name: "Player 1" } } });
    expect(viewFor(three, "p1").chatChannels).toContain("mush");
    expect(mushChat(three, "p1")).toHaveLength(3);
  });

  it("is invisible to humans: no messages, no channel, no posting", () => {
    const s = spikes(ship(), 2);
    for (const id of ["p1", "p2", "p3"]) {
      expect(viewFor(s, id).chatChannels).not.toContain("mush");
      expect(JSON.stringify(viewFor(s, id).chat)).not.toMatch(/mush|contaminated/i);
      expect(sendChat(s, id, "mush", "hi").ok).toBe(false);
    }
  });

  it("lets a Mush read and post without an iTrackie, and nothing else", () => {
    const s = ship();
    expect(viewFor(s, "p0").chatChannels).toEqual(["mush"]);
    const r = sendChat(s, "p0", "mush", "hello");
    expect(r.ok && r.state.chat.at(-1)).toMatchObject({ channel: "mush", from: "p0", text: "hello" });
    expect(sendChat(s, "p0", "global", "hello").ok).toBe(false);
  });

  it("is closed to a dead Mush", () => {
    const s = ship();
    player(s, "p0").alive = false;
    expect(viewFor(s, "p0").chatChannels).toEqual([]);
  });
});
