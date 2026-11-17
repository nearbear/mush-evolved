import { describe, expect, it } from "vitest";
import { jump } from "../src/actions/travel.ts";
import { characterUsername } from "../src/characters.ts";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { arriveMerchant, merchantsInOrbit } from "../src/merchants.ts";
import { applyAction, createGame, viewFor } from "../src/rules.ts";
import { findSignal, type Signal } from "../src/signals.ts";
import type { Action, GameConfig, GameState } from "../src/types.ts";
import { costOf, makeSeats, must, nextCycle, noHunters, noIncidents, offered, player } from "./support.ts";

const TERMINAL = "COMMAND_CENTER:COM_CENTER";
const cfg = DEFAULT_CONFIG.merchants;
const contact = (signal: string): Action => ({ type: "contact_signal", equipment: TERMINAL, signal });
const refuse = (signal: string): Action => ({ type: "refuse_signal", equipment: TERMINAL, signal });
const close = (signal: string, deal: number): Action => ({ type: "close_deal", equipment: TERMINAL, signal, deal });

/** Four players on the bridge; p0 is the Comms Officer. Merchants arrive only when a test calls `arriveMerchant`. */
function ship(): GameState {
  const config: GameConfig = { ...noIncidents(noHunters(DEFAULT_CONFIG)), merchants: { ...cfg, arrivalChance: 0 } };
  const s = createGame(makeSeats(4), config, 7);
  for (const p of s.players) p.room = "COMMAND_CENTER";
  s.titles.comms_officer = "p0";
  return s;
}

/** A transport whose first deal the ship can always pay: one fuel for one oxygen capsule. */
function hailing(s: GameState): Signal {
  const m = arriveMerchant(s, "transport");
  m.merchant!.deals = [{ give: [{ kind: "fuel", count: 1 }], receive: [{ kind: "item", item: "oxy_capsule", count: 1 }] }];
  return m;
}

const signalsOf = (s: GameState, id: string) => viewFor(s, id).comms.terminal?.signals;
const merchantSignalsOf = (s: GameState, id: string) => signalsOf(s, id)?.filter((v) => v.kind === "merchant");

describe("signals", () => {
  describe("contact", () => {
    it("is free, for the comms officer at the terminal, and adds the hail", () => {
      const s = ship();
      const m = hailing(s);
      expect(offered(s, "p0")).toContainEqual(contact(m.id));
      expect(costOf(s, "p0", contact(m.id))).toMatchObject({ ap: 0, mp: 0 });
      expect(offered(s, "p1").some((a) => a.type === "contact_signal")).toBe(false);
      expect(applyAction(s, "p1", contact(m.id)).ok).toBe(false);
      const next = must(applyAction(s, "p0", contact(m.id)));
      expect(player(next, "p0").ap).toBe(player(s, "p0").ap);
      const after = findSignal(next, m.id)!;
      expect(after.step).toBe("offers");
      expect(after.feed.map((e) => [e.from, e.key, e.officer])).toEqual([
        ["signal", `signals.merchant.transport.hail.${m.merchant!.event}`, undefined],
      ]);
      // Once contacted, it can't be contacted again.
      expect(offered(next, "p0").some((a) => a.type === "contact_signal")).toBe(false);
    });

    it("is private: one line for the officer, nothing for the room", () => {
      const s = ship();
      const m = hailing(s);
      const next = must(applyAction(s, "p0", contact(m.id)));
      expect(next.log.slice(s.log.length).map((e) => [e.key, e.visibleTo])).toEqual([["signalContacted", ["p0"]]]);
      expect(next.chat.length).toBe(s.chat.length);
    });

    it("a hacker signs as the Comms Officer, never as themselves", () => {
      const s = ship();
      const m = hailing(s);
      player(s, "p1").hackedEquipment = [TERMINAL];
      expect(offered(s, "p1")).toContainEqual(contact(m.id));
      const next = must(applyAction(must(applyAction(s, "p1", contact(m.id))), "p1", refuse(m.id)));
      expect(findSignal(next, m.id)!.feed[1]).toMatchObject({ from: "officer", officer: player(s, "p0").character });
      expect(JSON.stringify(findSignal(next, m.id)!.feed)).not.toContain(player(s, "p1").character);
    });
  });

  describe("arrival", () => {
    it("NERON announces a merchant in crew chat to everyone: its kind, nothing of its hail or deals", () => {
      const s = ship();
      hailing(s);
      const added = s.chat.filter((c) => c.system?.key === "merchantHailing");
      expect(added.map((c) => [c.channel, c.from, c.system])).toEqual([["global", null, { key: "merchantHailing", params: { merchant: "transport" } }]]);
      expect(JSON.stringify(added)).not.toMatch(/signal-|HUMAN_VS/);
    });
  });

  describe("after contact", () => {
    it("deals and No thank you wait for Contact", () => {
      const s = ship();
      const m = hailing(s);
      expect(offered(s, "p0").some((a) => a.type === "close_deal" || a.type === "refuse_signal")).toBe(false);
      expect(applyAction(s, "p0", close(m.id, 0)).ok).toBe(false);
      expect(applyAction(s, "p0", refuse(m.id)).ok).toBe(false);
      const next = must(applyAction(s, "p0", contact(m.id)));
      expect(offered(next, "p0")).toEqual(expect.arrayContaining([close(m.id, 0), refuse(m.id)]));
    });

    it("No thank you is free and private, and closes the conversation as refused", () => {
      const s0 = ship();
      const m = hailing(s0);
      const s = must(applyAction(s0, "p0", contact(m.id)));
      expect(costOf(s, "p0", refuse(m.id))).toMatchObject({ ap: 0, mp: 0 });
      const next = must(applyAction(s, "p0", refuse(m.id)));
      expect(player(next, "p0").ap).toBe(player(s, "p0").ap);
      const after = findSignal(next, m.id)!;
      expect(after.status).toBe("refused");
      expect(after.feed.slice(1).map((e) => [e.from, e.key, e.closes])).toEqual([
        ["officer", "signals.officer.refuse", undefined],
        ["signal", "signals.merchant.transport.farewell", true],
      ]);
      expect(next.log.slice(s.log.length).map((e) => [e.key, e.visibleTo])).toEqual([["signalRefused", ["p0"]]]);
      expect(merchantsInOrbit(next)).toEqual([]);
      expect(offered(next, "p0").some((a) => a.type === "close_deal" || a.type === "refuse_signal")).toBe(false);
    });

    it("a deal closes the conversation as deal, recording which deal and who made it", () => {
      const s0 = ship();
      const m = hailing(s0);
      const s = must(applyAction(s0, "p0", contact(m.id)));
      const next = must(applyAction(s, "p0", close(m.id, 0)));
      const after = findSignal(next, m.id)!;
      expect(after.status).toBe("deal");
      expect(after.feed.slice(1).map((e) => [e.from, e.key, e.officer, e.params, e.closes])).toEqual([
        ["officer", "signals.officer.deal", player(s, "p0").character, { deal: 0 }, undefined],
        ["signal", "signals.merchant.transport.accept", undefined, undefined, true],
      ]);
    });
  });

  describe("losing a signal", () => {
    it("at the end of its stay, contacted or not, with a Signal lost line; kept in the list", () => {
      let s = ship();
      const quiet = hailing(s);
      const talking = hailing(s);
      s = must(applyAction(s, "p0", contact(talking.id)));
      for (let i = 0; i < cfg.stayCycles; i++) s = nextCycle(s);
      for (const id of [quiet.id, talking.id]) {
        const signal = findSignal(s, id)!;
        expect(signal.status).toBe("lost");
        expect(signal.feed.at(-1)).toMatchObject({ from: "system", key: "signals.lost", closes: true });
      }
      expect(s.signals.list.filter((sig) => sig.kind === "merchant")).toHaveLength(2);
      expect(merchantSignalsOf(s, "p0")?.map((v) => v.status)).toEqual(["lost", "lost"]);
    });

    it("when the Daedalus travels", () => {
      let s = ship();
      const m = hailing(s);
      s = must(applyAction(s, "p0", contact(m.id)));
      jump(s, player(s, "p0"), 1);
      expect(findSignal(s, m.id)?.status).toBe("lost");
    });

    it("when the Daedalus leaves orbit", () => {
      const s = ship();
      const m = hailing(s);
      s.navigation.orbit = "planet-x";
      s.ship.combustion = s.config.navigation.leaveOrbit.fuel;
      const next = must(applyAction(s, "p0", { type: "leave_orbit", equipment: "COMMAND_CENTER:PILOT_MODULE" }));
      expect(findSignal(next, m.id)?.status).toBe("lost");
    });

    it("an ended signal's status never changes again", () => {
      let s = ship();
      const m = hailing(s);
      s = must(applyAction(s, "p0", contact(m.id)));
      s = must(applyAction(s, "p0", refuse(m.id)));
      jump(s, player(s, "p0"), 1);
      expect(findSignal(s, m.id)?.status).toBe("refused");
      expect(findSignal(s, m.id)?.feed.some((e) => e.key === "signals.lost")).toBe(false);
    });
  });

  describe("names", () => {
    it("is its kind's name, with a number when another of the same kind is active", () => {
      let s = ship();
      const first = hailing(s);
      hailing(s);
      expect(merchantSignalsOf(s, "p0")?.map((v) => v.name)).toEqual([{ key: "signals.names.merchant.transport" }, { key: "signals.names.merchant.transport_numbered", params: { n: 2 } }]);
      s = must(applyAction(s, "p0", contact(first.id)));
      s = must(applyAction(s, "p0", refuse(first.id)));
      // The first is no longer active, so the next one takes its plain name again.
      const third = hailing(s);
      expect(merchantSignalsOf(s, "p0")?.find((v) => v.id === third.id)?.name).toEqual({ key: "signals.names.merchant.transport" });
    });
  });

  describe("visibility", () => {
    it("a non-officer at the terminal gets no signals field at all", () => {
      let s = ship();
      const m = hailing(s);
      s = must(applyAction(s, "p0", contact(m.id)));
      const terminal = viewFor(s, "p1").comms.terminal;
      expect(terminal).not.toBeNull();
      expect(terminal && "signals" in terminal).toBe(false);
      expect(JSON.stringify(viewFor(s, "p1"))).not.toMatch(/signal-|HUMAN_VS|signals\.merchant/);
    });

    it("the officer sees them only at a Com center terminal", () => {
      const s = ship();
      hailing(s);
      expect(merchantSignalsOf(s, "p0")).toHaveLength(1);
      player(s, "p0").room = "FRONT_CORRIDOR";
      expect(viewFor(s, "p0").comms.terminal).toBeNull();
      expect(JSON.stringify(viewFor(s, "p0"))).not.toContain("signal-");
    });

    it("a hacker with a working hack on the terminal sees them", () => {
      const s = ship();
      const m = hailing(s);
      player(s, "p1").hackedEquipment = [TERMINAL];
      expect(merchantSignalsOf(s, "p1")).toHaveLength(1);
      expect(offered(s, "p1")).toContainEqual(contact(m.id));
    });

    it("a new officer reads the old conversations; the old officer no longer sees them", () => {
      let s = ship();
      const m = hailing(s);
      s = must(applyAction(s, "p0", contact(m.id)));
      s = must(applyAction(s, "p0", refuse(m.id)));
      s.titles.comms_officer = "p1";
      expect(signalsOf(s, "p1")?.find((v) => v.id === m.id)?.feed.map((e) => e.officer)).toContain(player(s, "p0").character);
      expect(signalsOf(s, "p0")).toBeUndefined();
    });
  });
});

describe("characterUsername", () => {
  it("is the given name's initial and the surname, lower case", () => {
    expect(characterUsername("paola")).toBe("prinaldo");
    expect(characterUsername("chao")).toBe("cwang");
    expect(characterUsername("jinsu")).toBe("jkim");
    expect(characterUsername("kuanti")).toBe("klai");
  });
});
