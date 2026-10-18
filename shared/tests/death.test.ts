import { describe, expect, it } from "vitest";
import { createChannel, inviteToChannel, sendChat, toggleCheckbox } from "../src/chat.ts";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { damage, killPlayer } from "../src/death.ts";
import { CORPSE_ITEM, ITEM_TYPES, ITRACKIE_ITEM, itemsIn } from "../src/items.ts";
import { applyAction, createGame, viewFor } from "../src/rules.ts";
import { CHAT_CHANNELS, GRAVEYARD_CHANNEL, MUSH_CHANNEL, type Action, type GameState, type PlayerId } from "../src/types.ts";
import { makeSeats, player, must, offered } from "./support.ts";

const seats = makeSeats(4);
const config = { ...DEFAULT_CONFIG, mushCount: 1, startItems: [], startSkills: [] };
const punch = (target: PlayerId): Action => ({ type: "punch", target });

/** p0 (Mush) and p1 (human) share the sick bay; p2 and p3 (humans) are in the refectory. Everyone has an iTrackie. */
function ship(): GameState {
  const s = createGame(seats, config, 3);
  s.players.forEach((p, i) => {
    p.role = i === 0 ? "mush" : "human";
    p.room = i < 2 ? "SICK_BAY" : "REFECTORY";
  });
  return s;
}
function give(s: GameState, id: PlayerId, type: string): void {
  s.items.push({ id: `item-${s.nextItemId++}`, type, at: { kind: "player", id } });
}
/** p0 punches p1 down from 1 HP. */
function punchToDeath(s: GameState): GameState {
  player(s, "p1").hp = 1;
  return must(applyAction(s, "p0", punch("p1")));
}

describe("death", () => {
  it("0 HP kills at once and leaves a heavy corpse in the room", () => {
    const s = punchToDeath(ship());
    const dead = player(s, "p1");
    expect(dead.alive).toBe(false);
    expect(dead.hp).toBe(0);
    const corpses = itemsIn(s, { kind: "room", id: "SICK_BAY" }).filter((i) => i.type === CORPSE_ITEM);
    expect(corpses).toEqual([expect.objectContaining({ of: "p1" })]);
    expect(ITEM_TYPES[CORPSE_ITEM]?.heavy).toBe(true);
  });

  it("destroys the iTrackie and drops everything else into the room", () => {
    const s = ship();
    give(s, "p1", "wrench");
    give(s, "p1", "soap");
    const after = punchToDeath(s);
    expect(itemsIn(after, { kind: "player", id: "p1" })).toEqual([]);
    const floor = itemsIn(after, { kind: "room", id: "SICK_BAY" }).map((i) => i.type);
    expect(floor.sort()).toEqual([CORPSE_ITEM, "soap", "wrench"].sort());
    expect(after.items.filter((i) => i.type === ITRACKIE_ITEM)).toHaveLength(3);
  });

  it("announces the death and role crew-wide, and logs it in the room without the role", () => {
    const s = punchToDeath(ship());
    const announcement = s.chat.filter((m) => m.channel === "global" && m.system);
    expect(announcement.map((m) => m.system)).toEqual([{ key: "diedHuman", params: { name: "chun" } }]);
    const line = s.log.find((e) => e.key === "died")!;
    expect(line).toMatchObject({ room: "SICK_BAY", visibleTo: "all" });
    expect(line.params).toEqual({ name: "chun" }); // no role in the room's line
    // Someone across the ship reads the announcement but not the room's log.
    expect(viewFor(s, "p2").chat.some((m) => m.system?.key === "diedHuman")).toBe(true);
    expect(viewFor(s, "p2").log.some((e) => e.key === "died")).toBe(false);
  });

  it("names a dead Mush as Mush, and logs the room line even with nobody there", () => {
    const s = ship();
    player(s, "p0").room = "BEDROOM_A";
    killPlayer(s, player(s, "p0"));
    expect(s.chat.find((m) => m.system?.key === "diedMush")?.system?.params).toEqual({ name: "chao" });
    expect(s.log.find((e) => e.key === "died")).toMatchObject({ room: "BEDROOM_A", visibleTo: "all" });
    // Anyone who walks in later sees it in the room's history.
    player(s, "p2").room = "BEDROOM_A";
    expect(viewFor(s, "p2").log.some((e) => e.key === "died")).toBe(true);
  });

  it("voids bonds in both directions and contamination", () => {
    const s = ship();
    s.bonds = { p1: ["p2"], p2: ["p1", "p3"] };
    s.contamination = { p1: 2, p2: 1 };
    const after = punchToDeath(s);
    expect(after.bonds).toEqual({ p2: ["p3"] });
    expect(after.contamination).toEqual({ p2: 1 });
  });

  it("leaves every private channel with a message; a channel left empty is deleted", () => {
    let s = ship();
    s = must(createChannel(s, "p1", "Shared"));
    s = must(inviteToChannel(s, "p1", "pc-1", "p2"));
    s = must(createChannel(s, "p1", "Alone"));
    s = punchToDeath(s);
    expect(s.channels.map((c) => [c.id, c.members])).toEqual([["pc-1", ["p2"]]]);
    expect(s.chat.filter((m) => m.channel === "pc-1").map((m) => m.system)).toEqual([{ key: "leftThisWorld", params: { name: "chun" } }]);
    expect(s.chat.some((m) => m.channel === "pc-2")).toBe(false);
  });

  it("is permanent: the dead can't act, heal, or take more damage", () => {
    const s = punchToDeath(ship());
    expect(offered(s, "p1")).toEqual([]);
    expect(applyAction(s, "p1", { type: "ready" }).ok).toBe(false);
    expect(offered(s, "p0").some((a) => a.type === "punch")).toBe(false);
    const before = JSON.stringify(s);
    damage(s, player(s, "p1"), 5);
    killPlayer(s, player(s, "p1"));
    expect(JSON.stringify(s)).toBe(before);
  });

  it("the dead don't hold up the cycle", () => {
    let s = ship();
    for (const id of ["p2", "p3"]) s = must(applyAction(s, id, { type: "ready" }));
    const cycle = s.cycle;
    s = punchToDeath(s); // p1 never readied; p0 still has to
    expect(s.cycle).toBe(cycle);
    s = must(applyAction(s, "p0", { type: "ready" }));
    expect(s.cycle).toBe(cycle + 1);
  });

  it("the infiniteHp cheat keeps a player alive", () => {
    const s = ship();
    player(s, "p1").cheats = ["infiniteHp"];
    damage(s, player(s, "p1"), 1000);
    expect(player(s, "p1")).toMatchObject({ alive: true, hp: config.maxHp });
  });

  it("a corpse can be picked up and takes one slot", () => {
    const s = punchToDeath(ship());
    const corpse = s.items.find((i) => i.type === CORPSE_ITEM)!;
    expect(offered(s, "p0")).toContainEqual({ type: "take", item: corpse.id });
    const after = must(applyAction(s, "p0", { type: "take", item: corpse.id }));
    expect(itemsIn(after, { kind: "player", id: "p0" }).map((i) => i.type).sort()).toEqual([CORPSE_ITEM, ITRACKIE_ITEM].sort());
  });
});

describe("the dead player's view (#45)", () => {
  it("reads global chat and the feature threads without an iTrackie, and posts only in the graveyard", () => {
    let s = must(sendChat(ship(), "p1", "global", "- [ ] last words"));
    s = punchToDeath(s);
    const v = viewFor(s, "p1");
    expect(v.inventory).toEqual([]);
    expect(v.readChannels).toEqual([...CHAT_CHANNELS, GRAVEYARD_CHANNEL]);
    expect(v.chatChannels).toEqual([GRAVEYARD_CHANNEL]);
    expect(v.chat.some((m) => m.system?.key === "diedHuman")).toBe(true);
    for (const channel of CHAT_CHANNELS) expect(sendChat(s, "p1", channel, "boo").ok).toBe(false);
    const mine = s.chat.find((m) => m.from === "p1")!;
    expect(toggleCheckbox(s, "p1", mine.id, 0).ok).toBe(false);
  });

  it("the graveyard is for the dead alone: they talk in it, the living neither read nor post", () => {
    const s = ship();
    killPlayer(s, player(s, "p1"));
    killPlayer(s, player(s, "p3"));
    const posted = must(sendChat(s, "p1", GRAVEYARD_CHANNEL, "anyone there?"));
    expect(viewFor(posted, "p3").chat.map((m) => m.text)).toContain("anyone there?");
    expect(sendChat(posted, "p3", GRAVEYARD_CHANNEL, "yes").ok).toBe(true);
    for (const living of ["p0", "p2"]) {
      const v = viewFor(posted, living);
      expect(v.readChannels).not.toContain(GRAVEYARD_CHANNEL);
      expect(v.chatChannels).not.toContain(GRAVEYARD_CHANNEL);
      expect(v.chat.some((m) => m.channel === GRAVEYARD_CHANNEL)).toBe(false);
      expect(sendChat(posted, living, GRAVEYARD_CHANNEL, "boo").ok).toBe(false);
    }
  });

  it("a dead Mush also reads the Mush channel, read-only; a dead human never does", () => {
    const s = ship();
    killPlayer(s, player(s, "p0"));
    killPlayer(s, player(s, "p2"));
    expect(viewFor(s, "p0").readChannels).toContain(MUSH_CHANNEL);
    expect(sendChat(s, "p0", MUSH_CHANNEL, "boo").ok).toBe(false);
    expect(viewFor(s, "p2").readChannels).not.toContain(MUSH_CHANNEL);
  });

  it("sees nothing that depends on a room", () => {
    const s = ship();
    s.contamination = { p1: 2 };
    s.items.push({ id: "floor", type: "wrench", at: { kind: "room", id: "SICK_BAY" } });
    killPlayer(s, player(s, "p0")); // dies in the sick bay, beside p1
    const v = viewFor(s, "p0");
    expect(v.roomItems).toEqual([]);
    expect(v.roomEquipment).toEqual([]);
    expect(v.unidentified).toEqual([]);
    expect(v.log.every((e) => e.room === undefined && e.visibleTo === "all")).toBe(true);
    for (const o of v.players) {
      expect(o.room).toBeUndefined();
      expect(o.statuses).toEqual([]);
      expect(o.skills).toEqual([]);
      expect(o.contamination).toBeUndefined();
    }
    // Without ACTOPI too: no head counts per room.
    s.actopi = false;
    expect(viewFor(s, "p0").unidentified).toEqual([]);
  });

  it("learns nothing new: no one else's role or contamination", () => {
    const s = ship();
    s.contamination = { p2: 1 };
    const json = JSON.stringify(viewFor(punchToDeath(s), "p1"));
    expect(json.match(/"role"/g)).toHaveLength(1); // their own
    expect(json).not.toContain('"contamination"');
  });

  it("the living don't see a dead player's room, even with ACTOPI on or off", () => {
    const s = punchToDeath(ship());
    expect(viewFor(s, "p2").players.find((o) => o.id === "p1")).toMatchObject({ alive: false, statuses: [], skills: [] });
    expect(viewFor(s, "p2").players.find((o) => o.id === "p1")?.room).toBeUndefined();
    expect(viewFor(s, "p0").players.find((o) => o.id === "p1")?.room).toBeUndefined();
    s.actopi = false;
    expect(viewFor(s, "p2").unidentified).toEqual(["SICK_BAY"]); // p0 only
  });
});
