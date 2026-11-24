import { describe, expect, it } from "vitest";
import { ANTI_MUSH_SERUM_ITEM } from "../src/actions/vaccinate.ts";
import { createChannel, createThread, inviteToChannel, leaveChannel, pushChat, sendChat, toggleCheckbox } from "../src/chat.ts";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { ITRACKIE_ITEM } from "../src/items.ts";
import { logPrivate, logPublic } from "../src/log.ts";
import { postPlan } from "../src/plans.ts";
import { queueAction } from "../src/queue.ts";
import { RESEARCH_COMPLETE } from "../src/research.ts";
import { applyAction, createGame, newCycle, viewFor } from "../src/rules.ts";
import { sharePilgred } from "../src/sharedPilgred.ts";
import { sharePlanet } from "../src/sharedPlanets.ts";
import { sharePlants } from "../src/sharedPlants.ts";
import { shareReport } from "../src/sharedReports.ts";
import { walk } from "../src/spot.ts";
import { isComatose, overheadStatuses } from "../src/statuses.ts";
import type { Action, GameState, PlayerId } from "../src/types.ts";
import { endGame } from "../src/victory.ts";
import { makeSeats, must, mustApply, nextCycle, noCharacterModifiers, offered as legal, player, stockLab, setProgress, testConfig } from "./support.ts";

const seats = makeSeats(4);
const config = noCharacterModifiers(testConfig({ maxAp: 99, startAp: 50 }));
const vaccinate = (target: PlayerId): Action => ({ type: "vaccinate", target });
const serums = (s: GameState) => s.items.filter((i) => i.type === ANTI_MUSH_SERUM_ITEM);
const offered = (s: GameState, id: PlayerId) => legal(s, id).filter((a) => a.type === "vaccinate");
const logKeys = (s: GameState, p: PlayerId) => viewFor(s, p).log.map((e) => e.key);

/** p0 human holding a serum, p1 Mush and p2 human beside them in SICK_BAY; p3 human in the lab. */
function ship(): GameState {
  const s = createGame(seats, config, 3);
  s.players.forEach((p) => {
    p.role = p.id === "p1" ? "mush" : "human";
    p.room = p.id === "p3" ? "LABORATORY" : "SICK_BAY";
  });
  s.items.push({ id: `item-${s.nextItemId++}`, type: ANTI_MUSH_SERUM_ITEM, at: { kind: "player", id: "p0" } });
  return s;
}

describe("anti-mush serum", () => {
  it("pins default vaccine config numbers", () => {
    expect([DEFAULT_CONFIG.vaccine.cost.ap, DEFAULT_CONFIG.vaccine.comaCycles]).toEqual([1, 2]);
  });

  it("costs the configured AP and is used up", () => {
    const s = ship();
    const after = must(applyAction(s, "p0", vaccinate("p2")));
    expect(player(after, "p0").ap).toBe(player(s, "p0").ap - config.vaccine.cost.ap);
    expect(serums(after)).toHaveLength(0);
  });

  it("turns a Mush human: spores and Mush skills go, satiety restarts, and cured is seen on wake", () => {
    const s = ship();
    Object.assign(player(s, "p1"), { spores: 3, mushSkills: ["spiker"], satiety: 0 });
    const after = mustApply(s, "p0", vaccinate("p1"));
    expect(player(after, "p1")).toMatchObject({ role: "human", alpha: false, spores: 0, mushSkills: [], satietyZeroSince: after.cycle });
    expect(viewFor(after, "p1").log).toEqual([]);
    expect(logKeys(after, "p0")).toContain("vaccineWorked");
    const woke = nextCycle(nextCycle(after));
    expect(logKeys(woke, "p1")).toContain("vaccinated");
    expect(logKeys(woke, "p1")).toContain("cured");
  });

  it("clears contamination on a human, and is used up on a healthy one with nothing happening", () => {
    const s = ship();
    s.contamination["p2"] = 2;
    const cured = mustApply(s, "p0", vaccinate("p2"));
    expect(cured.contamination["p2"]).toBeUndefined();
    expect(viewFor(cured, "p2").log).toEqual([]);
    expect(logKeys(nextCycle(nextCycle(cured)), "p2")).toContain("cured");

    const healthy = mustApply(ship(), "p0", vaccinate("p2"));
    expect(serums(healthy)).toHaveLength(0);
    expect(logKeys(healthy, "p0")).toContain("vaccineNothing");
    const wokeHealthy = nextCycle(nextCycle(healthy));
    expect(logKeys(wokeHealthy, "p2")).toContain("vaccinated");
    expect(logKeys(wokeHealthy, "p2")).not.toContain("cured");
  });

  it("shows the room that a serum was used, never the result", () => {
    const after = mustApply(ship(), "p0", vaccinate("p1"));
    expect(logKeys(after, "p2")).toContain("vaccinated");
    for (const key of ["vaccineWorked", "vaccineNothing", "cured"]) expect(logKeys(after, "p2")).not.toContain(key);
    expect(logKeys(after, "p3")).not.toContain("vaccinated");
  });

  it("is only offered to someone carrying a serum, on others in the room, and an illegal try changes nothing", () => {
    const s = ship();
    expect(offered(s, "p0").map((a) => (a as { target: string }).target).sort()).toEqual(["p1", "p2"]);
    expect(offered(s, "p2")).toHaveLength(0);
    const floor = ship();
    floor.items.find((i) => i.type === ANTI_MUSH_SERUM_ITEM)!.at = { kind: "room", id: "SICK_BAY" };
    expect(offered(floor, "p0")).toHaveLength(0);
    for (const bad of [vaccinate("p0"), vaccinate("p3")]) {
      const before = JSON.stringify(s);
      expect(applyAction(s, "p0", bad).ok).toBe(false);
      expect(JSON.stringify(s)).toBe(before);
    }
  });

  it("is left on the lab floor when the research completes", () => {
    const s = ship();
    setProgress(s, { research: "ANTI_MUSH_SERUM" }, RESEARCH_COMPLETE - 1);
    stockLab(s, "LABORATORY", "ANTI_MUSH_SERUM");
    const after = mustApply(s, "p3", { type: "research", equipment: "LABORATORY:RESEARCH_LAB", research: "ANTI_MUSH_SERUM" });
    expect(serums(after).filter((i) => i.at.kind === "room" && i.at.id === "LABORATORY")).toHaveLength(1);
  });
});

describe("RFS coma (#489)", () => {
  it("puts both Mush and human targets into a 2-cycle coma with public overhead status", () => {
    for (const target of ["p1", "p2"] as const) {
      const s = ship();
      const c0 = mustApply(s, "p0", vaccinate(target));
      expect(isComatose(c0, player(c0, target))).toBe(true);
      expect(player(c0, target).comaUntil).toBe(c0.cycle + config.vaccine.comaCycles);
      expect(viewFor(c0, target).statuses).toContain("coma");
      const roomView = viewFor(c0, "p0").players.find((o) => o.id === target)!;
      expect(roomView.statuses).toContain("coma");
      expect(overheadStatuses(roomView.statuses)).toContain("coma");
      // Still comatose after 1 cycle, wakes after 2 cycles.
      const c1 = nextCycle(c0);
      expect(isComatose(c1, player(c1, target))).toBe(true);
      expect(viewFor(c1, target).statuses).toContain("coma");
      const c2 = nextCycle(c1);
      expect(isComatose(c2, player(c2, target))).toBe(false);
      expect(viewFor(c2, target).statuses).not.toContain("coma");
      expect(viewFor(c2, "p0").players.find((o) => o.id === target)!.statuses).not.toContain("coma");
    }
  });

  it("preserves inventory and bed (with bed AP gain), clears active stances/queue, and resets inactivity", () => {
    const s = ship();
    s.now = 123_456;
    const p2 = player(s, "p2");
    const p1 = player(s, "p1");
    p2.ap = 2;
    p2.lyingIn = "SICK_BAY:MEDLAB_BED";
    p2.lyingSince = s.cycle;
    p2.modifiers.push("lying_down");
    p2.statuses.push("guardian");
    p2.boardedIcarus = true;
    p2.spot = { kind: "occupancy", equipment: "SICK_BAY:DRUG_DISP", chair: 0 };
    p2.protectedBy = "p0"; // protected by someone else: stays
    p1.protectedBy = "p2"; // p2 was protecting p1: ends
    p2.pushedBy = "p1"; // wheelchair push: ends
    p2.accommodationOffers = [{ by: "p0", until: s.now + 60_000 }];
    p1.accommodationOffers = [{ by: "p2", until: s.now + 60_000 }];
    p2.current = { action: { type: "move", to: "LABORATORY" }, since: 100, until: 200, adjustment: { ap: 0, mp: 0 } };
    p2.queue = [{ action: { type: "move", to: "LABORATORY" }, adjustment: { ap: 0, mp: 0 } }];
    p2.inactivity = "inactive";
    p2.lastSeenAt = 1;
    s.items.push({ id: `item-${s.nextItemId++}`, type: "medikit", at: { kind: "player", id: "p2" } });

    const after = mustApply(s, "p0", vaccinate("p2"));
    const afterP2 = player(after, "p2");
    // Inventory & bed kept
    expect(after.items.some((i) => i.type === "medikit" && i.at.kind === "player" && i.at.id === "p2")).toBe(true);
    expect(afterP2.lyingIn).toBe("SICK_BAY:MEDLAB_BED");
    // Active states & queue cleared; protectedBy kept
    expect(afterP2.current).toBeNull();
    expect(afterP2.queue).toEqual([]);
    expect(afterP2.statuses).not.toContain("guardian");
    expect(player(after, "p1").protectedBy).toBeUndefined();
    expect(afterP2.protectedBy).toBe("p0");
    expect(afterP2.pushedBy).toBeUndefined();
    expect(afterP2.accommodationOffers).toBeUndefined();
    expect(player(after, "p1").accommodationOffers).toBeUndefined();
    expect(afterP2.boardedIcarus).toBeUndefined();
    expect(afterP2.spot).toBeUndefined();
    // Inactivity reset
    expect(afterP2.inactivity).toBeUndefined();
    expect(afterP2.lastSeenAt).toBe(123_456);
    // Bed AP gain still applies during coma cycle tick
    const ticked = must(newCycle(after));
    expect(player(ticked, "p2").ap).toBe(2 + config.apPerCycle + 1);
  });

  it("blocks all actions and inputs except ready while comatose", () => {
    const manual = noCharacterModifiers(testConfig({ maxAp: 99, startAp: 50, manualCycles: true, sharedSpots: true }));
    const s = createGame(seats, manual, 3);
    s.players.forEach((p) => {
      p.role = p.id === "p1" ? "mush" : "human";
      p.room = "SICK_BAY";
      s.items.push({ id: `item-${s.nextItemId++}`, type: ITRACKIE_ITEM, at: { kind: "player", id: p.id } });
    });
    s.items.push({ id: `item-${s.nextItemId++}`, type: ANTI_MUSH_SERUM_ITEM, at: { kind: "player", id: "p0" } });
    // Create a private channel with p2 before coma, and post a checklist message by p2.
    const withCh = must(createChannel(s, "p2", "secret", ["p0"]));
    const chId = withCh.channels[0]!.id;
    const withMsg = must(sendChat(withCh, "p2", chId, "- [ ] check"));
    const coma = mustApply(withMsg, "p0", vaccinate("p2"));

    // Only ready is offered
    expect(legal(coma, "p2")).toEqual([{ type: "ready" }]);
    expect(viewFor(coma, "p2").actions.map((o) => o.action.type)).toEqual(["ready"]);
    // Non-ready actions and queueAction are rejected
    expect(applyAction(coma, "p2", { type: "move", to: "LABORATORY" }).ok).toBe(false);
    expect(queueAction(coma, "p2", { type: "move", to: "LABORATORY" }, 1000).ok).toBe(false);
    // Walk and all chat/channel/plan/share inputs are rejected
    expect(walk(coma, "p2", 1, 1, false).ok).toBe(false);
    expect(sendChat(coma, "p2", "global", "hello").ok).toBe(false);
    expect(sendChat(coma, "p2", chId, "hello").ok).toBe(false);
    expect(toggleCheckbox(coma, "p2", chId, 0, 0).ok).toBe(false);
    expect(createChannel(coma, "p2", "other").ok).toBe(false);
    expect(inviteToChannel(coma, "p2", chId, "p1").ok).toBe(false);
    expect(leaveChannel(coma, "p2", chId).ok).toBe(false);
    expect(createThread(coma, "p2", "thread").ok).toBe(false);
    expect(postPlan(coma, "p2", { channel: chId, room: "SICK_BAY", purpose: "other", slots: [{ kind: "onCall" }] }).ok).toBe(false);
    expect(sharePlanet(coma, "p2", "planet-1", [], "hi").ok).toBe(false);
    expect(shareReport(coma, "p2", "exp-1", "hi").ok).toBe(false);
    expect(sharePlants(coma, "p2", [], "hi").ok).toBe(false);
    expect(sharePilgred(coma, "p2", 50, "hi").ok).toBe(false);
    // Ready still works (and ends the cycle since there are no unready bots)!
    const readied = must(applyAction(coma, "p2", { type: "ready" }));
    expect(readied.cycle).toBe(coma.cycle + 1);
  });

  it("permanently omits all logs and chat (including system messages) written during coma", () => {
    const s = ship();
    for (const id of ["p0", "p2"] as const) s.items.push({ id: `item-${s.nextItemId++}`, type: ITRACKIE_ITEM, at: { kind: "player", id } });
    const before = must(sendChat(s, "p0", "global", "before coma"));
    const coma = mustApply(before, "p0", vaccinate("p2"));
    const seenAtComaStart = player(coma, "p2").logSeen;

    // Logs written during coma (room public, ship-wide, private to p2)
    logPublic(coma, "SICK_BAY", "roomDuringComa");
    logPublic(coma, undefined, "shipDuringComa");
    logPrivate(coma, "p2", "privateDuringComa");
    expect(player(coma, "p2").logSeen).toBe(seenAtComaStart);

    // Chat written during coma (player message + system message)
    const afterChat = must(sendChat(coma, "p0", "global", "during coma"));
    pushChat(afterChat, "global", { from: null, isBot: false, text: "", system: { key: "systemDuringComa" } });

    // While comatose: no logs, no chat, no channels
    const comaView = viewFor(afterChat, "p2");
    expect(comaView.log).toEqual([]);
    expect(comaView.chat).toEqual([]);
    expect(comaView.readChannels).toEqual([]);
    expect(comaView.chatChannels).toEqual([]);

    // Wake up after 2 cycles, then add a post-coma log and chat
    const woke = nextCycle(nextCycle(afterChat));
    logPublic(woke, "SICK_BAY", "roomAfterComa");
    const afterWakeChat = must(sendChat(woke, "p0", "global", "after coma"));

    const wokeView = viewFor(afterWakeChat, "p2");
    const keys = wokeView.log.map((e) => e.key);
    expect(keys).toContain("vaccinated");
    expect(keys).toContain("roomAfterComa");
    expect(keys).not.toContain("roomDuringComa");
    expect(keys).not.toContain("shipDuringComa");
    expect(keys).not.toContain("privateDuringComa");

    const texts = wokeView.chat.map((m) => m.text || m.system?.key);
    expect(texts).toContain("before coma");
    expect(texts).toContain("after coma");
    expect(texts).not.toContain("during coma");
    expect(texts).not.toContain("systemDuringComa");
  });

  it("blinds room and ship-wide state in viewFor while comatose, never leaks comaUntil/missedLogs, and keeps end screen working", () => {
    const s = ship();
    s.fires.push("SICK_BAY");
    s.pilgred.progress = 100;
    s.eden.computed = true;
    s.comms.linked = true;
    s.items.push({ id: `item-${s.nextItemId++}`, type: "medikit", at: { kind: "room", id: "SICK_BAY" } });
    const coma = mustApply(s, "p0", vaccinate("p2"));
    logPublic(coma, "SICK_BAY", "missedOne");

    const view = viewFor(coma, "p2");
    expect(view.ship).toBeNull();
    expect(view.players).toEqual([]);
    expect(view.unidentified).toEqual([]);
    expect(view.roomItems).toEqual([]);
    expect(view.roomEquipment).toEqual([]);
    expect(view.doors).toEqual([]);
    expect(view.roomOnFire).toBe(false);
    expect(view.burningRooms).toEqual([]);
    expect(view.alerts).toEqual({ fires: 0, broken: 0, reports: [], gravity: null });
    expect(view.hunters).toEqual({ count: 0, list: null, merchants: null, turrets: null });
    expect(view.titles).toEqual([]);
    expect(view.lost).toEqual([]);
    expect(view.expedition).toBeNull();
    expect(view.expeditions).toEqual([]);
    expect(view.navigation).toEqual({ orbiting: false, traveling: false, orbitPicture: null, orbitName: null, heading: null, lastTurn: null });
    expect(view.comms).toEqual({ linked: false, terminal: null });
    expect(view.pilgredRepaired).toBe(false);
    expect(view.edenComputed).toBe(false);
    expect(view.humanTankFull).toBe(false);
    expect(view.launched).toBeNull();
    expect(view.cycle).toBe(0);
    expect(view.day).toBe(0);
    expect(view.cycleOfDay).toBe(0);
    expect(view.privateChannels).toEqual([]);
    expect(view.planets).toEqual([]);

    // Neither comaUntil nor missedLogs ever appears in anyone's view
    for (const p of coma.players) {
      const json = JSON.stringify(viewFor(coma, p.id));
      expect(json).not.toContain("comaUntil");
      expect(json).not.toContain("missedLogs");
    }

    // If the game ends while comatose, end screen data is visible
    endGame(coma, "humans", "sol");
    const endedView = viewFor(coma, "p2");
    expect(endedView.phase).toBe("ended");
    expect(endedView.winner).toBe("humans");
    expect(endedView.ending).toBe("sol");
    expect(endedView.crew).toHaveLength(coma.players.length);
  });
});
