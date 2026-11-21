import { describe, expect, it } from "vitest";
import { jump } from "../src/actions/travel.ts";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { arriveMerchant, type MerchantDeal, merchantsCycle, merchantsInOrbit, merchantsInSpace, openEvents } from "../src/merchants.ts";
import { advanceNeron } from "../src/comms.ts";
import { offeredProjects, tradableProjects } from "../src/projectEffects.ts";
import { availableProjects, PROJECT_IDS, type ProjectId } from "../src/projects.ts";
import { PILGRED_COMPLETE } from "../src/pilgred.ts";
import { addSignal, findSignal, type Signal } from "../src/signals.ts";
import { applyAction, createGame, viewFor } from "../src/rules.ts";
import type { Action, GameConfig, GameState } from "../src/types.ts";
import { clone, costOf, makeSeats, must, nextCycle, noHunters, noIncidents, offered, player } from "./support.ts";

const TERMINAL = "COMMAND_CENTER:COM_CENTER";
const cfg = DEFAULT_CONFIG.merchants;
const close = (signal: string, deal: number, projects?: string[]): Action => ({ type: "close_deal", equipment: TERMINAL, signal, deal, ...(projects && { projects }) });

/** Four players on the bridge; p0 is the Comms Officer. No merchant arrives on its own unless `arrival` says so. */
function ship(arrival = 0): GameState {
  const config: GameConfig = { ...noIncidents(noHunters(DEFAULT_CONFIG)), merchants: { ...cfg, arrivalChance: arrival } };
  const s = createGame(makeSeats(4), config, 7);
  for (const p of s.players) p.room = "COMMAND_CENTER";
  s.titles.comms_officer = "p0";
  return s;
}

/** A transport with the given deals, in orbit now and already contacted (its deals on offer). */
function withMerchant(s: GameState, deals: MerchantDeal[]): Signal {
  const m = addSignal(s, "merchant", s.cycle + cfg.stayCycles, { merchant: { kind: "transport", event: "HUMAN_VS_FUEL", deals, hp: cfg.kinds.transport.hp } });
  m.step = "offers";
  return m;
}

const blocked = (s: GameState, deal: number) => viewFor(s, "p0").comms.terminal?.signals?.find((sig) => sig.kind === "merchant")?.merchant?.deals[deal]?.blocked;

const crewForFuel: MerchantDeal = { give: [{ kind: "crew", count: 1 }], receive: [{ kind: "item", item: "fuel_capsule", count: 9 }] };
const storageCount = (s: GameState, type: string) => s.items.filter((i) => i.type === type && i.at.kind === "room" && i.at.id === cfg.deliveryRoom).length;

describe("merchant ships", () => {
  it("uses the owner's numbers: about 2 a day, 4 cycles, 2 AP a deal, delivered to Front Storage", () => {
    expect([cfg.arrivalChance * DEFAULT_CONFIG.cyclesPerDay, cfg.stayCycles, cfg.deal.cost.ap, cfg.deliveryRoom]).toEqual([2, 4, 2, "STORAGE_FRONT"]);
  });

  describe("arrival and departure", () => {
    it("arrives at a cycle change with its deals rolled within the original's ranges", () => {
      const s = nextCycle(ship(1));
      expect(merchantsInOrbit(s)).toHaveLength(1);
      const signal = merchantsInOrbit(s)[0]!;
      const m = signal.merchant!;
      expect(m.kind).toBe("transport");
      expect(signal.endsAt).toBe(s.cycle + cfg.stayCycles);
      expect([signal.step, signal.feed]).toEqual(["hail", []]);
      const templates = cfg.kinds.transport.events[m.event]!;
      expect(m.deals).toHaveLength(templates.length);
      m.deals.forEach((deal, i) => {
        const t = templates[i]!;
        expect(deal.skill).toBe(t.skill);
        // An asset rolled to 0 is left out, so each one is matched to its template by kind and item.
        for (const a of deal.receive) {
          const tmpl = t.receive.find((r) => r.kind === a.kind && (r.kind !== "item" || (a.kind === "item" && r.item === a.item)))!;
          const [min, max] = "count" in tmpl ? tmpl.count : [1, 1];
          expect(a.count).toBeGreaterThanOrEqual(Math.max(1, min));
          expect(a.count).toBeLessThanOrEqual(max);
        }
      });
    });

    it("doesn't arrive before Mush are chosen", () => {
      const config: GameConfig = {
        ...noIncidents(noHunters(DEFAULT_CONFIG)),
        merchants: { ...cfg, arrivalChance: 1 },
        preselection: { seats: 4, endsOn: { day: 3, cycle: 8 }, mushCount: "auto", twoMushAbove: 8, minPlayers: 1 },
      };
      const s = createGame([], config, 7);
      expect(s.preselection).toBe(true);
      merchantsCycle(s);
      expect(merchantsInOrbit(s)).toEqual([]);
      expect(s.signals.list).toEqual([]);
    });

    it("several can be in orbit at once", () => {
      let s = ship(1);
      s = nextCycle(nextCycle(s));
      expect(merchantsInOrbit(s).length).toBe(2);
      expect(new Set(merchantsInOrbit(s).map((m) => m.id)).size).toBe(2);
    });

    it("is lost once its stay is over, and kept in the list", () => {
      let s = ship();
      arriveMerchant(s, "transport");
      for (let i = 0; i < cfg.stayCycles - 1; i++) s = nextCycle(s);
      expect(merchantsInOrbit(s)).toHaveLength(1);
      s = nextCycle(s);
      expect(merchantsInOrbit(s)).toEqual([]);
      expect(s.signals.list.filter((m) => m.kind === "merchant").map((m) => m.status)).toEqual(["lost"]);
    });

    it("is left behind when the Daedalus travels", () => {
      const s = ship();
      arriveMerchant(s, "transport");
      jump(s, player(s, "p0"), 1);
      expect(merchantsInOrbit(s)).toEqual([]);
      expect(s.signals.list.filter((m) => m.kind === "merchant").map((m) => m.status)).toEqual(["lost"]);
    });
  });

  describe("closing a deal", () => {
    it("is offered only to the comms officer at the terminal, for 2 AP", () => {
      const s = ship();
      const m = withMerchant(s, [{ give: [{ kind: "fuel", count: 1 }], receive: [{ kind: "item", item: "oxy_capsule", count: 2 }] }]);
      expect(offered(s, "p0")).toContainEqual(close(m.id, 0));
      expect(costOf(s, "p0", close(m.id, 0))?.ap).toBe(cfg.deal.cost.ap);
      expect(offered(s, "p1").some((a) => a.type === "close_deal")).toBe(false);
      player(s, "p0").room = "FRONT_CORRIDOR";
      expect(offered(s, "p0").some((a) => a.type === "close_deal")).toBe(false);
    });

    it("trades a random inactive player: dead, no corpse, no announcement, items dropped where they stood", () => {
      const s = ship();
      const away = player(s, "p3");
      away.room = "LABORATORY";
      away.inactivity = "inactive";
      s.items.push({ id: "item-x", type: "knife", at: { kind: "player", id: "p3" } });
      const m = withMerchant(s, [crewForFuel]);
      const logBefore = s.log.length;
      const chatBefore = s.chat.length;
      const next = must(applyAction(s, "p0", close(m.id, 0)));
      expect(player(next, "p3").alive).toBe(false);
      expect(next.items.some((i) => i.type === "corpse")).toBe(false);
      expect(next.items.find((i) => i.id === "item-x")?.at).toEqual({ kind: "room", id: "LABORATORY" });
      expect(storageCount(next, "fuel_capsule")).toBe(storageCount(s, "fuel_capsule") + 9);
      expect(merchantsInOrbit(next)).toEqual([]);
      expect(player(next, "p0").ap).toBe(player(s, "p0").ap - cfg.deal.cost.ap);
      // Nothing public: only the officer's private line. The trade never names the role.
      const added = next.log.slice(logBefore);
      expect(added.map((e) => [e.key, e.visibleTo])).toEqual([["merchantDealClosed", ["p0"]]]);
      expect(next.chat.length).toBe(chatBefore);
    });

    it("an active player is never traded; with too few inactive crew the deal is shown blocked", () => {
      const s = ship();
      const m = withMerchant(s, [crewForFuel]);
      expect(offered(s, "p0")).not.toContainEqual(close(m.id, 0));
      expect(applyAction(s, "p0", close(m.id, 0)).ok).toBe(false);
      expect(blocked(s, 0)).toBe("crew");
    });

    it("pays fuel and oxygen from the tanks", () => {
      const s = ship();
      s.ship.fuel = 10;
      const m = withMerchant(s, [{ give: [{ kind: "fuel", count: 6 }], receive: [{ kind: "item", item: "oxy_capsule", count: 12 }] }]);
      const next = must(applyAction(s, "p0", close(m.id, 0)));
      expect(next.ship.fuel).toBe(4);
      expect(storageCount(next, "oxy_capsule")).toBe(storageCount(s, "oxy_capsule") + 12);
      s.ship.fuel = 5;
      expect(blocked(s, 0)).toBe("fuel");
    });

    it("pays items from the storage rooms' floors, never hidden ones", () => {
      const s = ship();
      s.items = s.items.filter((i) => i.type !== "uncooked_ration");
      s.items.push({ id: "r1", type: "uncooked_ration", at: { kind: "room", id: "STORAGE_A_0" } });
      s.items.push({ id: "r2", type: "uncooked_ration", at: { kind: "room", id: "STORAGE_B_1" }, hiddenBy: "p2" });
      s.items.push({ id: "r3", type: "uncooked_ration", at: { kind: "room", id: "REFECTORY" } });
      s.items.push({ id: "r4", type: "uncooked_ration", at: { kind: "player", id: "p1" } });
      const m = withMerchant(s, [{ give: [{ kind: "item", item: "uncooked_ration", count: 1 }], receive: [{ kind: "item", item: "fuel_capsule", count: 2 }] }]);
      const next = must(applyAction(s, "p0", close(m.id, 0)));
      expect(next.items.map((i) => i.id)).not.toContain("r1");
      expect(next.items.map((i) => i.id)).toEqual(expect.arrayContaining(["r2", "r3", "r4"]));
      // With only the hidden one left in storage, the deal is blocked: hidden items never count.
      m.merchant!.deals[0]!.give = [{ kind: "item", item: "uncooked_ration", count: 2 }];
      expect(blocked(s, 0)).toBe("item");
    });

    it("a skill deal needs someone alive in the officer's room with the skill (eMush)", () => {
      const s = ship();
      const m = withMerchant(s, [{ give: [{ kind: "fuel", count: 1 }], receive: [{ kind: "item", item: "oxy_capsule", count: 1 }], skill: "diplomacy" }]);
      for (const p of s.players) p.skills = [];
      expect(blocked(s, 0)).toBe("skill");
      player(s, "p2").skills = ["diplomacy"];
      expect(offered(s, "p0")).toContainEqual(close(m.id, 0));
    });

    it("skilful (Polyvalent) unlocks diplomacy and botanic merchant deals", () => {
      for (const skill of ["diplomacy", "botanic"] as const) {
        const s = ship();
        const m = withMerchant(s, [{ give: [{ kind: "fuel", count: 1 }], receive: [{ kind: "item", item: "oxy_capsule", count: 1 }], skill }]);
        for (const p of s.players) p.skills = [];
        expect(blocked(s, 0)).toBe("skill");
        player(s, "p2").skills = ["skilful"];
        expect(offered(s, "p0")).toContainEqual(close(m.id, 0));
      }
    });

    it("an illegal deal leaves the state unchanged", () => {
      const s = ship();
      const m = withMerchant(s, [crewForFuel]);
      const before = clone(s);
      expect(applyAction(s, "p0", close("merchant-404", 0)).ok).toBe(false);
      expect(applyAction(s, "p1", close(m.id, 0)).ok).toBe(false);
      expect(s).toEqual(before);
    });
  });

  describe("the transport's other hails (owner, 2026-11-16 and 2026-11-21)", () => {
    const events = cfg.kinds.transport.events;
    const finish = (s: GameState, ...ids: ProjectId[]) => {
      for (const id of ids) s.projects[id] = 100;
    };
    const inactive = (s: GameState, ...ids: string[]) => {
      for (const id of ids) player(s, id).inactivity = "inactive";
    };

    it("has all 7 of the original's hails, PILGREDISSIM with only its 3-crew deal", () => {
      expect(Object.keys(events).sort()).toEqual(["FOREST_DEAL", "GOOD_PROJECTIONS", "HUMAN_VS_FUEL", "HUMAN_VS_OXY", "HUMAN_VS_TREE", "PILGREDISSIM", "TECHNO_REWRITE"]);
      expect(events.PILGREDISSIM).toEqual([{ give: [{ kind: "crew", count: [3, 3] }], receive: [{ kind: "pilgred" }] }]);
      expect(events.TECHNO_REWRITE!.map((d) => [d.give, d.receive, d.skill])).toEqual([
        [[{ kind: "project", count: [2, 2] }], [{ kind: "project", count: [1, 1] }], undefined],
        [[{ kind: "project", count: [3, 3] }], [{ kind: "project", count: [2, 2] }], "diplomacy"],
      ]);
      expect([DEFAULT_CONFIG.lunchbox.cost.ap, DEFAULT_CONFIG.lunchbox.charges]).toEqual([0, 3]);
    });

    it("PILGREDISSIM comes only while PILGRED is broken and 3 inactive players exist", () => {
      const s = ship();
      expect(openEvents(s, "transport")).not.toContain("PILGREDISSIM");
      inactive(s, "p1", "p2", "p3");
      expect(openEvents(s, "transport")).toContain("PILGREDISSIM");
      s.pilgred.progress = PILGRED_COMPLETE;
      expect(openEvents(s, "transport")).not.toContain("PILGREDISSIM");
    });

    it("the project hails come only while a project can still be finished", () => {
      const s = ship();
      expect(openEvents(s, "transport")).toEqual(expect.arrayContaining(["GOOD_PROJECTIONS", "TECHNO_REWRITE"]));
      finish(s, ...PROJECT_IDS);
      expect(openEvents(s, "transport")).not.toContain("GOOD_PROJECTIONS");
      expect(openEvents(s, "transport")).not.toContain("TECHNO_REWRITE");
    });

    it("PILGREDISSIM: 3 inactive players repair PILGRED; blocked once it is repaired", () => {
      const s = ship();
      inactive(s, "p1", "p2", "p3");
      const m = withMerchant(s, [{ give: [{ kind: "crew", count: 3 }], receive: [{ kind: "pilgred", count: 1 }] }]);
      const next = must(applyAction(s, "p0", close(m.id, 0)));
      expect(next.pilgred.progress).toBe(PILGRED_COMPLETE);
      expect(["p1", "p2", "p3"].map((id) => player(next, id).alive)).toEqual([false, false, false]);
      s.pilgred.progress = PILGRED_COMPLETE;
      expect(blocked(s, 0)).toBe("pilgred");
    });

    it("HUMAN_VS_TREE's Ian deal takes Ian only when he is inactive", () => {
      const s = ship();
      player(s, "p3").character = "ian";
      inactive(s, "p2");
      const m = withMerchant(s, [{ give: [{ kind: "character", character: "ian", count: 1 }], receive: [{ kind: "item", item: "tree_pot", count: 4 }] }]);
      expect(blocked(s, 0)).toBe("character");
      expect(applyAction(s, "p0", close(m.id, 0)).ok).toBe(false);
      inactive(s, "p3");
      const next = must(applyAction(s, "p0", close(m.id, 0)));
      expect([player(next, "p3").alive, player(next, "p2").alive]).toEqual([false, true]);
      expect(storageCount(next, "tree_pot")).toBe(storageCount(s, "tree_pot") + 4);
    });

    it("FOREST_DEAL pays empty hydropots only, never a planted one", () => {
      const s = ship();
      s.items = s.items.filter((i) => i.type !== "tree_pot");
      s.items.push({ id: "pot", type: "tree_pot", at: { kind: "room", id: "STORAGE_A_0" }, plant: { species: "fruit_banana", age: null, thirst: 0 } as never });
      const m = withMerchant(s, [{ give: [{ kind: "item", item: "tree_pot", count: 1 }], receive: [{ kind: "item", item: "lunchbox", count: 1 }] }]);
      expect(blocked(s, 0)).toBe("item");
      s.items.push({ id: "empty", type: "tree_pot", at: { kind: "room", id: "STORAGE_A_0" } });
      const next = must(applyAction(s, "p0", close(m.id, 0)));
      expect(next.items.map((i) => i.id)).toContain("pot");
      expect(next.items.map((i) => i.id)).not.toContain("empty");
      expect(next.items.find((i) => i.type === "lunchbox")).toMatchObject({ at: { kind: "room", id: cfg.deliveryRoom }, charges: 3 });
    });

    it("GOOD_PROJECTIONS finishes a random unfinished project, with NERON's public line", () => {
      const s = ship();
      inactive(s, "p3");
      const m = withMerchant(s, [{ give: [{ kind: "crew", count: 1 }], receive: [{ kind: "project", count: 1 }] }]);
      const before = availableProjects(s);
      const logBefore = s.log.length;
      const next = must(applyAction(s, "p0", close(m.id, 0)));
      const done = before.filter((id) => !availableProjects(next).includes(id));
      expect(done).toHaveLength(1);
      expect(next.projects[done[0]!]).toBe(100);
      const added = next.log.slice(logBefore).map((e) => [e.key, e.params?.project, e.visibleTo]);
      expect(added).toContainEqual(["neronProjectCompleted", done[0], "all"]);
    });

    describe("TECHNO_REWRITE", () => {
      const rewrite: MerchantDeal = { give: [{ kind: "project", count: 2 }], receive: [{ kind: "project", count: 1 }] };

      it("is offered with the first tradable projects; the officer may pick any others a merchant can take", () => {
        const s = ship();
        finish(s, "PLASMA_SHIELD", "FIRE_SENSOR", "NOISE_REDUCER", "EXTRA_DRONE");
        const m = withMerchant(s, [rewrite]);
        expect(tradableProjects(s)).not.toContain("EXTRA_DRONE");
        expect(offered(s, "p0")).toContainEqual(close(m.id, 0, tradableProjects(s).slice(0, 2)));
        expect(viewFor(s, "p0").comms.terminal?.signals?.find((sig) => sig.id === m.id)?.merchant?.projects).toEqual(tradableProjects(s));
        expect(applyAction(s, "p0", close(m.id, 0, ["PLASMA_SHIELD", "NOISE_REDUCER"])).ok).toBe(true);
      });

      it("refuses a one-time project, a wrong count, a repeat, an unfinished project or no pick", () => {
        const s = ship();
        finish(s, "PLASMA_SHIELD", "FIRE_SENSOR", "EXTRA_DRONE");
        const m = withMerchant(s, [rewrite]);
        const before = clone(s);
        for (const pick of [["PLASMA_SHIELD", "EXTRA_DRONE"], ["PLASMA_SHIELD"], ["PLASMA_SHIELD", "PLASMA_SHIELD"], ["PLASMA_SHIELD", "OXY_MORE"], undefined]) {
          expect(applyAction(s, "p0", close(m.id, 0, pick)).ok, JSON.stringify(pick)).toBe(false);
        }
        expect(s).toEqual(before);
      });

      it("is blocked with too few tradable projects", () => {
        const s = ship();
        finish(s, "PLASMA_SHIELD", "EXTRA_DRONE", "DISMANTLING");
        withMerchant(s, [rewrite]);
        expect(blocked(s, 0)).toBe("project");
      });

      it("the given projects are lost for good, and never come straight back", () => {
        const s = ship();
        finish(s, "PLASMA_SHIELD", "FIRE_SENSOR");
        const m = withMerchant(s, [{ give: [{ kind: "project", count: 2 }], receive: [{ kind: "project", count: 2 }] }]);
        const next = must(applyAction(s, "p0", close(m.id, 0, ["PLASMA_SHIELD", "FIRE_SENSOR"])));
        expect(next.lostProjects).toEqual(["PLASMA_SHIELD", "FIRE_SENSOR"]);
        expect([next.projects.PLASMA_SHIELD, next.projects.FIRE_SENSOR]).toEqual([undefined, undefined]);
        expect(availableProjects(next)).not.toContain("PLASMA_SHIELD");
        expect(next.projectDeck).not.toContain("FIRE_SENSOR");
        expect(offeredProjects(next, { cheats: ["freeHacking"] })).not.toContain("PLASMA_SHIELD");
        expect(Object.entries(next.projects).filter(([, v]) => v >= 100).map(([id]) => id)).not.toEqual(expect.arrayContaining(["PLASMA_SHIELD"]));
        // A NERON update never finishes a lost project.
        const n = clone(next);
        n.lostProjects = PROJECT_IDS.filter((id) => id !== "OXY_MORE");
        for (const id of n.lostProjects) delete n.projects[id];
        expect(advanceNeron(n, 100)).toBe("OXY_MORE");
      });

      it("giving Noise reducer back takes its 2 AP off the cap, current AP capped", () => {
        const s = ship();
        finish(s, "NOISE_REDUCER", "PLASMA_SHIELD");
        for (const p of s.players) {
          p.maxAp += 2;
          p.ap = p.maxAp;
        }
        const m = withMerchant(s, [rewrite]);
        const next = must(applyAction(s, "p0", close(m.id, 0, ["NOISE_REDUCER", "PLASMA_SHIELD"])));
        expect(player(next, "p1").maxAp).toBe(player(s, "p1").maxAp - 2);
        expect(player(next, "p1").ap).toBe(player(next, "p1").maxAp);
      });
    });
  });

  describe("lunchbox", () => {
    const open = (item: string): Action => ({ type: "open_lunchbox", item });

    it("gives a standard ration per opening, for free and privately, and is gone after 3", () => {
      let s = ship();
      s.items.push({ id: "box", type: "lunchbox", at: { kind: "room", id: "COMMAND_CENTER" }, charges: 3 });
      const rations = (st: GameState) => st.items.filter((i) => i.type === "uncooked_ration" && i.at.kind === "player" && i.at.id === "p1").length;
      expect(costOf(s, "p1", open("box"))?.ap).toBe(0);
      const logBefore = s.log.length;
      s = must(applyAction(s, "p1", open("box")));
      expect(rations(s)).toBe(1);
      expect(s.items.find((i) => i.id === "box")?.charges).toBe(2);
      expect(s.log.slice(logBefore).map((e) => [e.key, e.visibleTo])).toEqual([["lunchboxOpened", ["p1"]]]);
      for (const p of s.players) p.ap = 10;
      s = must(applyAction(s, "p2", open("box")));
      s = must(applyAction(s, "p2", open("box")));
      expect(s.items.some((i) => i.id === "box")).toBe(false);
      expect(applyAction(s, "p1", open("box")).ok).toBe(false);
    });
  });

  describe("shooting a merchant (owner, 2026-11-21)", () => {
    const TURRET_ROOM = "LASER_TURRET_A_0";
    const TURRET = "LASER_TURRET_A_0:TURRET_COMMAND";
    const shoot = (target: string): Action => ({ type: "turret_attack", equipment: TURRET, hunter: target });
    /** p1 at a turret with a sure (or never) shot; a transport in orbit, already contacted. */
    function range(chance: number, damage: [number, number] = [2, 2]): { s: GameState; m: Signal } {
      const s = ship();
      s.config = { ...s.config, turrets: { ...s.config.turrets, chance, damage } };
      player(s, "p1").room = TURRET_ROOM;
      return { s, m: withMerchant(s, [crewForFuel]) };
    }

    it("the transport has the original's 16 hp, no armor", () => {
      expect(cfg.kinds.transport.hp).toBe(16);
      expect(arriveMerchant(ship(), "transport").merchant!.hp).toBe(16);
    });

    it("is a target at a turret after the hunters, and gunners see its kind, name and hp; nobody else does", () => {
      const { s, m } = range(1);
      expect(offered(s, "p1").filter((a) => a.type === "turret_attack")).toEqual([shoot(m.id)]);
      expect(viewFor(s, "p1").hunters.merchants).toEqual([{ id: m.id, kind: "transport", name: { key: "signals.names.merchant.transport" }, hp: 16 }]);
      expect(viewFor(s, "p0").hunters.merchants).toBeNull();
    });

    it("a hit ends the conversation at once; it flees at the cycle change, with no announcement", () => {
      const { s, m } = range(1);
      const chat = s.chat.length;
      let next = must(applyAction(s, "p1", shoot(m.id)));
      const hit = findSignal(next, m.id)!;
      expect([hit.status, hit.merchant!.hp, hit.merchant!.fleeing]).toEqual(["shot", 14, true]);
      expect(hit.feed.at(-1)).toMatchObject({ from: "signal", key: "signals.merchant.transport.shot", closes: true });
      expect(next.log.at(-1)).toMatchObject({ key: "merchantHit", visibleTo: ["p1"], params: { merchant: "transport", damage: 2 } });
      // Still in space to shoot at until the cycle change, but no longer dealing.
      expect(merchantsInOrbit(next)).toEqual([]);
      expect(merchantsInSpace(next).map((x) => x.id)).toEqual([m.id]);
      expect(offered(next, "p0").some((a) => a.type === "close_deal")).toBe(false);
      next = must(applyAction(next, "p1", shoot(m.id)));
      expect(findSignal(next, m.id)!.feed.filter((e) => e.closes)).toHaveLength(1);
      next = nextCycle(next);
      expect(merchantsInSpace(next)).toEqual([]);
      expect(findSignal(next, m.id)!.status).toBe("shot");
      expect(next.chat.slice(chat).some((c) => c.system?.key.includes("erchant"))).toBe(false);
    });

    it("a miss changes nothing for the merchant", () => {
      const { s, m } = range(0);
      const next = must(applyAction(s, "p1", shoot(m.id)));
      expect(findSignal(next, m.id)!).toMatchObject({ status: "active", merchant: { hp: 16 } });
      expect(findSignal(next, m.id)!.merchant!.fleeing).toBeUndefined();
      expect(next.log.at(-1)).toMatchObject({ key: "merchantMiss", visibleTo: ["p1"] });
    });

    it("at 0 hp it is destroyed, drops wreckage like a hunter, and the shooter alone is told", () => {
      const { s, m } = range(1, [16, 16]);
      const next = must(applyAction(s, "p1", shoot(m.id)));
      const gone = findSignal(next, m.id)!;
      expect([gone.status, gone.merchant!.hp]).toEqual(["destroyed", 0]);
      expect(gone.feed.at(-1)).toMatchObject({ from: "system", key: "signals.destroyed", closes: true });
      expect(merchantsInSpace(next)).toEqual([]);
      expect(next.space.length).toBeGreaterThan(s.space.length);
      expect(next.log.at(-1)).toMatchObject({ key: "merchantDestroyed", visibleTo: ["p1"] });
    });

    it("destroyed after a first hit, it says so", () => {
      const { s, m } = range(1, [8, 8]);
      const next = must(applyAction(must(applyAction(s, "p1", shoot(m.id))), "p1", shoot(m.id)));
      const gone = findSignal(next, m.id)!;
      expect(gone.status).toBe("destroyed");
      expect(gone.feed.map((e) => e.key).slice(-2)).toEqual(["signals.merchant.transport.shot", "signals.destroyed"]);
    });

    it("one that made a deal or was refused has left, so can't be shot", () => {
      const { s, m } = range(1);
      const refused = must(applyAction(s, "p0", { type: "refuse_signal", equipment: TERMINAL, signal: m.id }));
      expect(offered(refused, "p1").some((a) => a.type === "turret_attack")).toBe(false);
      expect(applyAction(refused, "p1", shoot(m.id)).ok).toBe(false);
    });

    it("a hit one is gone when the Daedalus travels", () => {
      const { s, m } = range(1);
      const next = must(applyAction(s, "p1", shoot(m.id)));
      jump(next, player(next, "p0"), 1);
      expect(merchantsInSpace(next)).toEqual([]);
      expect(findSignal(next, m.id)!.status).toBe("shot");
    });
  });
});
