import { describe, expect, it } from "vitest";
import { CHARACTERS } from "../src/characters.ts";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { MYCO_ALARM_ITEM, MYCO_ALARM_YIELD } from "../src/mycoalarm.ts";
import { applyAction, createGame, viewFor } from "../src/rules.ts";
import type { Action, GameState, PlayerId, Seat } from "../src/types.ts";

const seats: Seat[] = Array.from({ length: 4 }, (_, i) => ({ id: `p${i}`, name: `Player ${i}`, isBot: false, character: CHARACTERS[i]!.id }));
const config = { ...DEFAULT_CONFIG, mushCount: 1, startInventory: [], startItems: [], maxAp: 99, startAp: 50, dismantle: { ...DEFAULT_CONFIG.dismantle, successChance: 1 } };
const spike = (target: PlayerId): Action => ({ type: "spike", target });
const alarmsIn = (s: GameState, room: string) => s.items.filter((i) => i.type === MYCO_ALARM_ITEM && i.at.kind === "room" && i.at.id === room);
const rings = (s: GameState, room: string) => s.log.filter((e) => e.key === "mycoAlarmRang" && e.room === room);
const addAlarm = (s: GameState, at: GameState["items"][number]["at"]) => s.items.push({ id: `item-${s.nextItemId++}`, type: MYCO_ALARM_ITEM, at });

/** p0 Mush with spores and p1 human in SICK_BAY; p2 human in the lab; p3 human in the refectory. */
function ship(): GameState {
  const s = createGame(seats, config, 3);
  s.players.forEach((p) => {
    p.role = p.id === "p0" ? "mush" : "human";
  });
  const get = (id: PlayerId) => s.players.find((p) => p.id === id)!;
  get("p0").room = get("p1").room = "SICK_BAY";
  get("p0").spores = 3;
  get("p2").room = "LABORATORY";
  get("p3").room = "REFECTORY";
  return s;
}
const ok = (r: ReturnType<typeof applyAction>) => {
  if (!r.ok) throw new Error(r.error);
  return r.state;
};

describe("myco alarm", () => {
  it("rings once in the room when a Mush spikes there, however many alarms there are, and stays", () => {
    const s = ship();
    addAlarm(s, { kind: "room", id: "SICK_BAY" });
    addAlarm(s, { kind: "room", id: "SICK_BAY" });
    const after = ok(applyAction(s, "p0", spike("p1")));
    expect(rings(after, "SICK_BAY")).toHaveLength(1);
    expect(rings(after, "SICK_BAY")[0]!.level).toBe("warning");
    expect(alarmsIn(after, "SICK_BAY")).toHaveLength(2);
  });

  it("does not ring with no alarm, a carried alarm, an alarm in another room, or on extraction", () => {
    const empty = ok(applyAction(ship(), "p0", spike("p1")));
    expect(rings(empty, "SICK_BAY")).toHaveLength(0);
    const carried = ship();
    addAlarm(carried, { kind: "player", id: "p0" });
    addAlarm(carried, { kind: "player", id: "p1" });
    expect(rings(ok(applyAction(carried, "p0", spike("p1"))), "SICK_BAY")).toHaveLength(0);
    const elsewhere = ship();
    addAlarm(elsewhere, { kind: "room", id: "LABORATORY" });
    const e = ok(applyAction(elsewhere, "p0", spike("p1")));
    expect(e.log.filter((l) => l.key === "mycoAlarmRang")).toHaveLength(0);
    const extract = ship();
    addAlarm(extract, { kind: "room", id: "SICK_BAY" });
    expect(rings(ok(applyAction(extract, "p0", { type: "extract_spore" })), "SICK_BAY")).toHaveLength(0);
  });

  it("names no one, is seen only by people in that room, and shows later arrivals", () => {
    const s = ship();
    addAlarm(s, { kind: "room", id: "SICK_BAY" });
    const after = ok(applyAction(s, "p0", spike("p1")));
    const entry = rings(after, "SICK_BAY")[0]!;
    expect(entry.params).toBeUndefined();
    expect(entry.visibleTo).toBe("all");
    const room = (id: PlayerId) => viewFor(after, id).log.filter((l) => l.key === "mycoAlarmRang").length;
    expect(room("p1")).toBe(1);
    expect(room("p2")).toBe(0);
    expect(room("p3")).toBe(0);
    after.players.find((p) => p.id === "p2")!.room = "SICK_BAY";
    expect(room("p2")).toBe(1);
  });

  it("is built three at a time on the lab floor when the research completes", () => {
    const s = ship();
    s.players.forEach((p) => {
      p.room = "LABORATORY";
    });
    s.research.MYCO_ALARM = 75;
    const done = ok(applyAction(s, "p2", { type: "research", equipment: "LABORATORY:RESEARCH_LAB", research: "MYCO_ALARM" }));
    expect(alarmsIn(done, "LABORATORY")).toHaveLength(MYCO_ALARM_YIELD);
    const partial = ship();
    partial.players.forEach((p) => {
      p.room = "LABORATORY";
    });
    partial.research.MYCO_ALARM = 50;
    expect(alarmsIn(ok(applyAction(partial, "p2", { type: "research", equipment: "LABORATORY:RESEARCH_LAB", research: "MYCO_ALARM" })), "LABORATORY")).toHaveLength(0);
  });

  it("can be dismantled by anyone for one scrap metal at the usual cost", () => {
    const s = ship();
    addAlarm(s, { kind: "room", id: "SICK_BAY" });
    const id = alarmsIn(s, "SICK_BAY")[0]!.id;
    const ap = s.players[1]!.ap;
    const after = ok(applyAction(s, "p1", { type: "dismantle", item: id }));
    expect(alarmsIn(after, "SICK_BAY")).toHaveLength(0);
    expect(after.items.filter((i) => i.type === "metal_scraps")).toHaveLength(1);
    expect(after.players[1]!.ap).toBe(ap - config.dismantle.cost.ap);
  });
});
