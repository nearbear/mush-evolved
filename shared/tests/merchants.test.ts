import { describe, expect, it } from "vitest";
import { jump } from "../src/actions/travel.ts";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { arriveMerchant, merchantsCycle, type Merchant } from "../src/merchants.ts";
import { applyAction, createGame, viewFor } from "../src/rules.ts";
import type { Action, GameConfig, GameState } from "../src/types.ts";
import { clone, costOf, makeSeats, must, nextCycle, noHunters, noIncidents, offered, player } from "./support.ts";

const TERMINAL = "COMMAND_CENTER:COM_CENTER";
const cfg = DEFAULT_CONFIG.merchants;
const close = (merchant: string, deal: number): Action => ({ type: "close_deal", equipment: TERMINAL, merchant, deal });

/** Four players on the bridge; p0 is the Comms Officer. No merchant arrives on its own unless `arrival` says so. */
function ship(arrival = 0): GameState {
  const config: GameConfig = { ...noIncidents(noHunters(DEFAULT_CONFIG)), merchants: { ...cfg, arrivalChance: arrival } };
  const s = createGame(makeSeats(4), config, 7);
  for (const p of s.players) p.room = "COMMAND_CENTER";
  s.titles.comms_officer = "p0";
  return s;
}

/** A transport with the given deals, in orbit now. */
function withMerchant(s: GameState, deals: Merchant["deals"]): Merchant {
  const m: Merchant = { id: `merchant-${s.merchants.nextId++}`, kind: "transport", event: "HUMAN_VS_FUEL", arrivedAt: s.cycle, leavesAt: s.cycle + cfg.stayCycles, deals };
  s.merchants.list.push(m);
  return m;
}

const crewForFuel: Merchant["deals"][number] = { give: [{ kind: "crew", count: 1 }], receive: [{ kind: "item", item: "fuel_capsule", count: 9 }] };
const storageCount = (s: GameState, type: string) => s.items.filter((i) => i.type === type && i.at.kind === "room" && i.at.id === cfg.deliveryRoom).length;

describe("merchant ships", () => {
  it("uses the owner's numbers: about 2 a day, 4 cycles, 2 AP a deal, delivered to Front Storage", () => {
    expect([cfg.arrivalChance * DEFAULT_CONFIG.cyclesPerDay, cfg.stayCycles, cfg.deal.cost.ap, cfg.deliveryRoom]).toEqual([2, 4, 2, "STORAGE_FRONT"]);
  });

  describe("arrival and departure", () => {
    it("arrives at a cycle change with its deals rolled within the original's ranges", () => {
      const s = nextCycle(ship(1));
      expect(s.merchants.list).toHaveLength(1);
      const m = s.merchants.list[0]!;
      expect(m.kind).toBe("transport");
      expect(m.leavesAt).toBe(s.cycle + cfg.stayCycles);
      const templates = cfg.kinds.transport.events[m.event]!;
      expect(m.deals).toHaveLength(templates.length);
      m.deals.forEach((deal, i) => {
        const t = templates[i]!;
        expect(deal.skill).toBe(t.skill);
        deal.receive.forEach((a, j) => {
          const [min, max] = t.receive[j]!.count;
          expect(a.count).toBeGreaterThanOrEqual(min);
          expect(a.count).toBeLessThanOrEqual(max);
        });
      });
    });

    it("doesn't arrive before Mush are chosen", () => {
      const s = ship(1);
      s.hunters.since = null;
      merchantsCycle(s);
      expect(s.merchants.list).toEqual([]);
    });

    it("several can be in orbit at once", () => {
      let s = ship(1);
      s = nextCycle(nextCycle(s));
      expect(s.merchants.list.length).toBe(2);
      expect(new Set(s.merchants.list.map((m) => m.id)).size).toBe(2);
    });

    it("leaves once its stay is over", () => {
      let s = ship();
      arriveMerchant(s, "transport");
      for (let i = 0; i < cfg.stayCycles - 1; i++) s = nextCycle(s);
      expect(s.merchants.list).toHaveLength(1);
      s = nextCycle(s);
      expect(s.merchants.list).toEqual([]);
    });

    it("is left behind when the Daedalus travels", () => {
      const s = ship();
      arriveMerchant(s, "transport");
      jump(s, player(s, "p0"), 1);
      expect(s.merchants.list).toEqual([]);
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
      expect(next.merchants.list).toEqual([]);
      expect(player(next, "p0").ap).toBe(player(s, "p0").ap - cfg.deal.cost.ap);
      // Nothing public: only the officer's private line. The trade never names the role.
      const added = next.log.slice(logBefore).filter((e) => e.key !== "actionStarted");
      expect(added.map((e) => [e.key, e.visibleTo])).toEqual([["merchantDealClosed", ["p0"]]]);
      expect(next.chat.length).toBe(chatBefore);
    });

    it("an active player is never traded; with too few inactive crew the deal is shown blocked", () => {
      const s = ship();
      const m = withMerchant(s, [crewForFuel]);
      expect(offered(s, "p0")).not.toContainEqual(close(m.id, 0));
      expect(applyAction(s, "p0", close(m.id, 0)).ok).toBe(false);
      expect(viewFor(s, "p0").comms.terminal?.merchants[0]?.deals[0]?.blocked).toBe("crew");
    });

    it("pays fuel and oxygen from the tanks", () => {
      const s = ship();
      s.ship.fuel = 10;
      const m = withMerchant(s, [{ give: [{ kind: "fuel", count: 6 }], receive: [{ kind: "item", item: "oxy_capsule", count: 12 }] }]);
      const next = must(applyAction(s, "p0", close(m.id, 0)));
      expect(next.ship.fuel).toBe(4);
      expect(storageCount(next, "oxy_capsule")).toBe(storageCount(s, "oxy_capsule") + 12);
      s.ship.fuel = 5;
      expect(viewFor(s, "p0").comms.terminal?.merchants[0]?.deals[0]?.blocked).toBe("fuel");
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
      m.deals[0]!.give = [{ kind: "item", item: "uncooked_ration", count: 2 }];
      expect(viewFor(s, "p0").comms.terminal?.merchants[0]?.deals[0]?.blocked).toBe("item");
    });

    it("a skill deal needs someone alive in the officer's room with the skill (eMush)", () => {
      const s = ship();
      const m = withMerchant(s, [{ give: [{ kind: "fuel", count: 1 }], receive: [{ kind: "item", item: "oxy_capsule", count: 1 }], skill: "diplomacy" }]);
      for (const p of s.players) p.skills = [];
      expect(viewFor(s, "p0").comms.terminal?.merchants[0]?.deals[0]?.blocked).toBe("skill");
      player(s, "p2").skills = ["diplomacy"];
      expect(offered(s, "p0")).toContainEqual(close(m.id, 0));
    });

    it("an illegal deal leaves the state unchanged", () => {
      const s = ship();
      withMerchant(s, [crewForFuel]);
      const before = clone(s);
      expect(applyAction(s, "p0", close("merchant-404", 0)).ok).toBe(false);
      expect(applyAction(s, "p1", close(s.merchants.list[0]!.id, 0)).ok).toBe(false);
      expect(s).toEqual(before);
    });
  });

  describe("visibility", () => {
    it("the merchants show only at a Com center terminal, to the living", () => {
      const s = ship();
      withMerchant(s, [crewForFuel]);
      expect(viewFor(s, "p1").comms.terminal?.merchants).toHaveLength(1);
      player(s, "p1").room = "FRONT_CORRIDOR";
      expect(viewFor(s, "p1").comms.terminal).toBeNull();
      expect(JSON.stringify(viewFor(s, "p1"))).not.toContain("merchant-");
    });
  });
});
