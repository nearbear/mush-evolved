import { describe, expect, it } from "vitest";
import { actionVisibility } from "../src/actions.ts";
import { applyXyloph, advanceNeron, drawXyloph, REBEL_BASES, rebelCalls, rollRebelGain, solChance, XYLOPH_ENTRIES, XYLOPH_IDS } from "../src/comms.ts";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { ITEM_TYPES } from "../src/itemTypes.ts";
import { PROJECT_COMPLETE, PROJECT_IDS } from "../src/projects.ts";
import { parseGameMessage } from "../src/protocol.ts";
import { applyAction, createGame, viewFor } from "../src/rules.ts";
import { chatChannels, createChannel } from "../src/chat.ts";
import { addStatus } from "../src/statuses.ts";
import type { Action, GameState } from "../src/types.ts";
import { clone, costOf, makeSeats, must, nextCycle, offered, option, player, rebelCallAt, testConfig } from "./support.ts";
import { GENOME_DISK_ITEM, MUSH_SAMPLE_ITEM } from "../src/itemIds.ts";

const TERMINAL = "COMMAND_CENTER:COM_CENTER";
const cfg = DEFAULT_CONFIG.comms;
const contactSol: Action = { type: "contact_sol", equipment: TERMINAL };
const xyloph: Action = { type: "contact_xyloph", equipment: TERMINAL };
const updateNeron: Action = { type: "update_neron", equipment: TERMINAL };
const decode = (base: string): Action => ({ type: "decode_rebel", equipment: TERMINAL, base });

/** Three players on the bridge; p0 is the Comms Officer. `linked` puts the link with Sol up. */
function ship(linked = false): GameState {
  const s = createGame(makeSeats(3), testConfig(), 11);
  for (const p of s.players) p.room = "COMMAND_CENTER";
  s.titles.comms_officer = "p0";
  s.comms.linked = linked;
  return s;
}

const has = (s: GameState, id: string, type: Action["type"]) => offered(s, id).some((a) => a.type === type);

describe("communication center", () => {
  it("has the original's twelve Xyloph entries", () => {
    expect(XYLOPH_IDS).toHaveLength(12);
  });

  it("a broken Stellar antenna makes contacting Sol, decoding, Xyloph and NERON updates cost 1 more AP", () => {
    // Sol is offered only while the link is down, decoding only while it is up.
    for (const [linked, action] of [[false, contactSol], [true, decode("WOLF")]] as const) {
      const s = ship(linked);
      const before = costOf(s, "p0", action)?.ap;
      expect(before).toBeDefined();
      s.equipment.MOTOR_ROOM!.find((e) => e.id === "MOTOR_ROOM:STELLAR_ANTENNA")!.broken = true;
      expect(costOf(s, "p0", action)?.ap).toBe(before! + DEFAULT_CONFIG.antenna.brokenApSurcharge);
    }
  });

  it("every comms action is private", () => {
    for (const type of ["contact_sol", "decode_rebel", "contact_xyloph", "update_neron"] as const) expect(actionVisibility(type)).toBe("private");
  });

  it("parses the new actions and rejects malformed ones", () => {
    for (const action of [contactSol, xyloph, updateNeron, decode("SIRIUS")]) {
      expect(parseGameMessage(JSON.stringify({ type: "action", action }))).toEqual({ type: "action", action });
    }
    expect(parseGameMessage(JSON.stringify({ type: "action", action: { type: "decode_rebel", equipment: TERMINAL } }))).toBeNull();
  });

  describe("the link with Sol", () => {
    it("is offered to anyone at the terminal while the link is down, at the ship's chance", () => {
      const s = ship();
      expect(costOf(s, "p1", contactSol)).toEqual({ ap: cfg.sol.cost.ap, mp: 0 });
      expect(option(s, "p1", contactSol)?.chance).toBeCloseTo(cfg.sol.startChance / 100);
      expect(has(ship(true), "p1", "contact_sol")).toBe(false);
      const elsewhere = ship();
      player(elsewhere, "p1").room = "REFECTORY";
      expect(has(elsewhere, "p1", "contact_sol")).toBe(false);
    });

    it("the dirty can't try", () => {
      const s = ship();
      addStatus(player(s, "p1"), "dirty");
      expect(applyAction(s, "p1", contactSol).ok).toBe(false);
    });

    it("each failure adds to the ship-wide chance, and a success links with a private line", () => {
      let s = ship();
      let fails = 0;
      while (!s.comms.linked) {
        player(s, "p1").ap = s.config.maxAp;
        s = must(applyAction(s, "p1", contactSol));
        if (!s.comms.linked) fails++;
        expect(s.comms.solChance).toBe(cfg.sol.startChance + fails * cfg.sol.chancePerFail);
      }
      expect(s.log.filter((e) => e.key === "solFailed")).toHaveLength(fails);
      expect(s.log.find((e) => e.key === "solLinked")).toMatchObject({ visibleTo: ["p1"] });
      // The link is public; the log lines are not.
      expect(viewFor(s, "p2").comms.linked).toBe(true);
      expect(viewFor(s, "p2").log.some((e) => e.key === "solLinked" || e.key === "solFailed")).toBe(false);
    });

    it("Radio Expert doubles the actor's chance and gives x1.5 to roommates", () => {
      const s = ship();
      s.comms.solChance = 20;
      player(s, "p0").skills.push("radio_expert");
      expect(solChance(s, player(s, "p0"))).toBeCloseTo(0.2 * cfg.sol.radioExpertFactor);
      expect(solChance(s, player(s, "p1"))).toBeCloseTo(0.2 * cfg.sol.radioExpertRoomFactor);
      player(s, "p0").room = "REFECTORY";
      expect(solChance(s, player(s, "p1"))).toBeCloseTo(0.2);
    });
  });

  describe("rebel bases", () => {
    it("the first calls at Mush selection, the next one a day later, in the original's order", () => {
      let s = ship();
      for (const p of s.players) p.cheats = ["infiniteHp"]; // the humans must outlive the whole run, or the game ends
      const bases = (state: GameState) => rebelCalls(state).map((c) => c.rebel!.base);
      expect(bases(s)).toEqual(["WOLF"]);
      const first = rebelCalls(s)[0]!;
      expect(first).toMatchObject({ kind: "rebel", status: "active", step: "decoding", number: 1, feed: [], rebel: { base: "WOLF", progress: 0 } });
      expect(first.arrivedAt).toBe(s.cycle);
      expect(first.endsAt - first.arrivedAt).toBeGreaterThanOrEqual(cfg.rebel.windowMin);
      expect(first.endsAt - first.arrivedAt).toBeLessThanOrEqual(cfg.rebel.windowMax);
      for (let i = 0; i < s.config.cyclesPerDay * (REBEL_BASES.length + 1); i++) s = nextCycle(s);
      expect(bases(s)).toEqual([...REBEL_BASES]);
      expect(rebelCalls(s).map((c) => c.arrivedAt - first.arrivedAt)).toEqual(REBEL_BASES.map((_, i) => i * s.config.cyclesPerDay));
      // Every window has closed by now: each call is lost, with the "Signal lost" line, and kept in the list.
      expect(rebelCalls(s).every((c) => c.status === "lost" && c.feed.at(-1)?.key === "signals.lost")).toBe(true);
    });

    it("NERON announces a call in crew chat only while the link is up", () => {
      let s = ship(true);
      for (let i = 0; i < s.config.cyclesPerDay; i++) s = nextCycle(s);
      expect(s.chat.filter((m) => m.system?.key === "rebelCalling").map((m) => m.system?.params)).toEqual([{ base: "SIRIUS" }]);
      let quiet = ship(false);
      for (let i = 0; i < quiet.config.cyclesPerDay; i++) quiet = nextCycle(quiet);
      expect(rebelCalls(quiet)).toHaveLength(2);
      expect(quiet.chat.some((m) => m.system?.key === "rebelCalling")).toBe(false);
    });

    it("only the Comms Officer decodes, with the link up, and only open calls", () => {
      const s = ship(true);
      expect(offered(s, "p0")).toContainEqual(decode("WOLF"));
      expect(costOf(s, "p0", decode("WOLF"))).toEqual({ ap: cfg.rebel.cost.ap, mp: 0 });
      expect(has(s, "p1", "decode_rebel")).toBe(false);
      expect(applyAction(s, "p1", decode("WOLF")).ok).toBe(false);
      expect(applyAction(ship(false), "p0", decode("WOLF")).ok).toBe(false);
      expect(applyAction(s, "p0", decode("SIRIUS")).ok).toBe(false);
      const expired = clone(s);
      expired.cycle = rebelCalls(expired)[0]!.endsAt;
      expect(applyAction(expired, "p0", decode("WOLF")).ok).toBe(false);
      let lapsed = s;
      while (lapsed.cycle < rebelCalls(s)[0]!.endsAt) lapsed = nextCycle(lapsed);
      expect(rebelCalls(lapsed)[0]!.status).toBe("lost");
      expect(offered(lapsed, "p0")).not.toContainEqual(decode("WOLF"));
    });

    it("a decode gains the average of two 1..40 draws; Rebel and Kivanç add +100% each", () => {
      for (let seed = 1; seed < 200; seed++) {
        const s = ship(true);
        s.rng = seed;
        const gain = rollRebelGain(clone(s), player(s, "p0"));
        expect(gain).toBeGreaterThanOrEqual(1);
        expect(gain).toBeLessThanOrEqual(cfg.rebel.gainMax);
        player(s, "p0").skills.push("rebel");
        expect(rollRebelGain(clone(s), player(s, "p0"))).toBe(gain * (1 + cfg.rebel.rebelBonus));
        s.comms.xyloph.push("KIVANC_TERZI_CONTACT");
        expect(rollRebelGain(clone(s), player(s, "p0"))).toBe(gain * (1 + cfg.rebel.rebelBonus + cfg.rebel.kivancBonus));
      }
    });

    it("a Computer point pays for a decode", () => {
      const s = ship(true);
      player(s, "p0").resources.comp = 1;
      expect(costOf(s, "p0", decode("WOLF"))).toEqual({ ap: 0, mp: 0, paidBy: "comp" });
      const ap = player(s, "p0").ap;
      const next = must(applyAction(s, "p0", decode("WOLF")));
      expect([player(next, "p0").ap, player(next, "p0").resources.comp]).toEqual([ap, 0]);
    });

    it("each decode is an exchange in the call's feed: the officer's line, then the message at the new progress", () => {
      const next = must(applyAction(ship(true), "p0", decode("WOLF")));
      const call = rebelCalls(next)[0]!;
      const progress = call.rebel!.progress;
      expect(progress).toBeGreaterThan(0);
      expect(call.feed).toEqual([
        { from: "officer", officer: player(next, "p0").character, at: next.cycle, key: "signals.officer.decode" },
        { from: "signal", at: next.cycle, key: "signals.rebel.message.WOLF", params: { progress } },
      ]);
      expect(call.status).toBe("active");
      const again = must(applyAction(next, "p0", decode("WOLF")));
      expect(rebelCalls(again)[0]!.feed).toHaveLength(4);
      expect(rebelCalls(again)[0]!.feed[3]!.params).toEqual({ progress: rebelCalls(again)[0]!.rebel!.progress });
    });

    it("at 100% the whole message closes the conversation and the call is reached", () => {
      const s = ship(true);
      rebelCallAt(s, "KALADAAN", 99, 100);
      const next = must(applyAction(s, "p0", decode("KALADAAN")));
      const call = rebelCalls(next).find((c) => c.rebel!.base === "KALADAAN")!;
      expect(call.status).toBe("reached");
      expect(call.rebel!.progress).toBe(100);
      expect(call.feed.at(-1)).toEqual({ from: "signal", at: next.cycle, key: "signals.rebel.message.KALADAAN", params: { progress: 100 }, closes: true });
      expect(applyAction(next, "p0", decode("KALADAAN")).ok).toBe(false);
    });

    it("a hacker's decode is signed by the Comms Officer", () => {
      const s = ship(true);
      s.titles.comms_officer = "p1";
      player(s, "p0").hackedEquipment = [TERMINAL];
      expect(viewFor(s, "p0").comms.terminal?.signals).toHaveLength(1);
      const next = must(applyAction(s, "p0", decode("WOLF")));
      expect(rebelCalls(next)[0]!.feed[0]!.officer).toBe(player(s, "p1").character);
    });

    it("progress is private in the log, and the calls and their schedule go only to Comms Officer access", () => {
      const next = must(applyAction(ship(true), "p0", decode("WOLF")));
      const progress = rebelCalls(next)[0]!.rebel!.progress;
      expect(next.log.find((e) => e.key === "rebelDecoded")).toMatchObject({ visibleTo: ["p0"], params: { base: "WOLF", percent: progress } });
      expect(viewFor(next, "p1").log.some((e) => e.key === "rebelDecoded")).toBe(false);
      const officer = viewFor(next, "p0").comms.terminal!;
      expect(officer.signals?.[0]).toMatchObject({ kind: "rebel", name: { key: "comms.rebels.WOLF.name" }, status: "active", rebel: { base: "WOLF", progress } });
      expect(officer.nextRebel).toEqual({ base: "SIRIUS", at: rebelCalls(next)[0]!.arrivedAt + next.config.cyclesPerDay });
      const other = viewFor(next, "p1").comms.terminal!;
      expect(other).not.toHaveProperty("signals");
      expect(other).not.toHaveProperty("nextRebel");
      expect(JSON.stringify(other)).not.toMatch(/WOLF|SIRIUS|rebel/);
      // A new officer reads the old officer's decodes; the old one no longer sees them.
      next.titles.comms_officer = "p1";
      expect(viewFor(next, "p1").comms.terminal?.signals?.[0]?.feed).toHaveLength(2);
      expect(viewFor(next, "p0").comms.terminal).not.toHaveProperty("signals");
      player(next, "p1").room = "REFECTORY";
      expect(viewFor(next, "p1").comms.terminal).toBeNull();
    });

    /** Decodes `base` (already calling) until it is reached. */
    function reach(s: GameState, base: string): GameState {
      rebelCallAt(s, base as never, 99, 100);
      return must(applyAction(s, "p0", decode(base)));
    }

    it("Kaladaan gives +6 morale to everyone living, Cygni +3", () => {
      const s = ship(true);
      for (const p of s.players) p.morale = 2;
      const k = reach(s, "KALADAAN");
      expect(k.players.map((p) => p.morale)).toEqual([2, 2, 2].map((m) => m + cfg.rebel.kaladaanMorale));
      expect(k.log.find((e) => e.key === "rebelContacted")).toMatchObject({ visibleTo: ["p0"], params: { base: "KALADAAN" } });
      expect(reach(ship(true), "CYGNI").players[1]!.morale).toBe(DEFAULT_CONFIG.startMorale + cfg.rebel.cygniMorale);
    });

    it("Sirius makes rations give +1 AP", () => {
      const s = reach(ship(true), "SIRIUS");
      s.items.push({ id: "ration", type: "cooked_ration", at: { kind: "player", id: "p1" } });
      player(s, "p1").ap = 3;
      expect(player(must(applyAction(s, "p1", { type: "consume", item: "ration" })), "p1").ap).toBe(3 + ITEM_TYPES.cooked_ration!.consume!.ap + cfg.rebel.siriusRationAp);
    });

    it("Luyten-Ceti opens global chat without an iTrackie", () => {
      const s = ship(true);
      s.items = s.items.filter((i) => !(i.at.kind === "player" && i.at.id === "p1"));
      expect(chatChannels(s, player(s, "p1"))).not.toContain("global");
      expect(chatChannels(reach(s, "LUYTEN_CETI"), player(s, "p1"))).toContain("global");
    });

    it("Luyten-Ceti also lets a player without an iTrackie open a private channel", () => {
      const s = ship(true);
      s.items = s.items.filter((i) => !(i.at.kind === "player" && i.at.id === "p1"));
      expect(createChannel(s, "p1")).toEqual({ ok: false, error: "channel_needs_itrackie" });
      expect(createChannel(reach(s, "LUYTEN_CETI"), "p1").ok).toBe(true);
    });
  });

  it("a Computer point pays for contacting Sol, Xyloph and NERON updates", () => {
    const s = ship(true);
    player(s, "p0").resources.comp = 1;
    for (const a of [xyloph, updateNeron]) expect(costOf(s, "p0", a)).toEqual({ ap: 0, mp: 0, paidBy: "comp" });
    const down = ship(false); // contacting Sol is offered only while the link is down
    player(down, "p0").resources.comp = 1;
    expect(costOf(down, "p0", contactSol)).toEqual({ ap: 0, mp: 0, paidBy: "comp" });
    const ap = player(s, "p0").ap;
    const next = must(applyAction(s, "p0", xyloph));
    expect([player(next, "p0").ap, player(next, "p0").resources.comp]).toEqual([ap, 0]);
  });

  describe("Xyloph", () => {
    it("only the Comms Officer, with the link up; never repeats; gone once the table runs out", () => {
      let s = ship(true);
      expect(costOf(s, "p0", xyloph)).toEqual({ ap: cfg.xyloph.cost.ap, mp: 0 });
      expect(has(s, "p1", "contact_xyloph")).toBe(false);
      expect(has(ship(false), "p0", "contact_xyloph")).toBe(false);
      for (let i = 0; i < XYLOPH_IDS.length; i++) {
        s.comms.linked = true; // the link-loss entries drop it
        player(s, "p0").ap = s.config.maxAp;
        s = must(applyAction(s, "p0", xyloph));
      }
      expect([...s.comms.xyloph].sort()).toEqual([...XYLOPH_IDS].sort());
      s.comms.linked = true;
      expect(has(s, "p0", "contact_xyloph")).toBe(false);
      expect(applyAction(s, "p0", xyloph).ok).toBe(false);
    });

    it("draws by weight", () => {
      const counts: Record<string, number> = {};
      const s = ship(true);
      for (let seed = 0; seed < 5900; seed++) {
        s.rng = seed * 7919;
        const entry = drawXyloph(s)!;
        counts[entry] = (counts[entry] ?? 0) + 1;
      }
      // NERON_BOOST (12) is drawn most, LOST_ANALYSIS (1) least.
      expect(Math.max(...Object.values(counts))).toBe(counts.NERON_BOOST);
      expect(counts.LOST_ANALYSIS!).toBeLessThan(counts.NILS_CARLSSON_CONTACT!);
      expect(XYLOPH_ENTRIES.NERON_BOOST).toBe(12);
    });

    it("the entry is in the actor's private log only", () => {
      const next = must(applyAction(ship(true), "p0", xyloph));
      const line = next.log.find((e) => e.key === "xylophContacted");
      expect(line).toMatchObject({ visibleTo: ["p0"], params: { entry: next.comms.xyloph[0] } });
      const theirs = viewFor(next, "p1");
      expect(theirs.log.some((e) => e.key === "xylophContacted")).toBe(false);
      expect(theirs.comms.terminal?.xylophLeft).toBe(XYLOPH_IDS.length - 1);
      expect(theirs.comms.terminal?.xylophFound).toEqual([next.comms.xyloph[0]]);
      expect(JSON.stringify(theirs.log)).not.toContain(next.comms.xyloph[0]!);
    });

    it("link-loss entries drop the link; Wireless infidelity also cuts the chance, never below 4%", () => {
      const s = ship(true);
      s.comms.solChance = 30;
      applyXyloph(s, "SNOW_CRASH");
      expect([s.comms.linked, s.comms.solChance]).toEqual([false, 30]);
      s.comms.linked = true;
      applyXyloph(s, "WIREFLESS_INFIDELITY");
      expect([s.comms.linked, s.comms.solChance]).toEqual([false, 30 - cfg.xyloph.qualityLoss]);
      applyXyloph(s, "WIREFLESS_INFIDELITY");
      expect(s.comms.solChance).toBe(cfg.sol.startChance);
    });

    it("items appear on the bridge floor", () => {
      const at = { kind: "room", id: "COMMAND_CENTER" };
      const dropped = (entry: Parameters<typeof applyXyloph>[1]) => {
        const s = ship(true);
        const before = s.items.length;
        applyXyloph(s, entry);
        return s.items.slice(before);
      };
      expect(dropped("MUSH_GENOME_DATA")).toEqual([expect.objectContaining({ type: GENOME_DISK_ITEM, at })]);
      expect(dropped("NILS_CARLSSON_CONTACT")).toEqual([expect.objectContaining({ type: MUSH_SAMPLE_ITEM, at })]);
      expect(dropped("COOK_BIBLE")).toEqual([expect.objectContaining({ type: "book", teaches: "cook", at })]);
      const books = dropped("SCHOOL_MANUALS");
      expect(books).toHaveLength(cfg.xyloph.schoolBooks);
      for (const b of books) expect(b).toMatchObject({ type: "book", at, teaches: expect.any(String) });
      const blueprints = dropped("WORKSHOP_MANUALS");
      expect(blueprints).toHaveLength(cfg.xyloph.workshopBlueprints);
      for (const b of blueprints) expect(b).toMatchObject({ type: "blueprint", at, builds: expect.any(String) });
      expect(dropped("NOTHING")).toEqual([]);
    });

    it("NERON's lost database moves the update forward 25%", () => {
      const s = ship(true);
      applyXyloph(s, "NERON_BOOST");
      expect(s.comms.neron).toEqual({ version: 1, progress: cfg.xyloph.neronBoostPercent });
    });
  });

  describe("NERON update", () => {
    it("only the Comms Officer, with the link up, 25% per action, private", () => {
      const s = ship(true);
      expect(costOf(s, "p0", updateNeron)).toEqual({ ap: cfg.neron.cost.ap, mp: 0 });
      expect(has(s, "p1", "update_neron")).toBe(false);
      expect(has(ship(false), "p0", "update_neron")).toBe(false);
      const next = must(applyAction(s, "p0", updateNeron));
      expect(next.comms.neron).toEqual({ version: 1, progress: cfg.neron.progressPercent });
      expect(next.log.find((e) => e.key === "neronUpdating")).toMatchObject({ visibleTo: ["p0"] });
      expect(viewFor(next, "p1").comms.terminal?.neron).toEqual({ version: 1, progress: cfg.neron.progressPercent });
    });

    it("at 100% the version goes up, progress restarts, and a random unfinished project completes", () => {
      const s = ship(true);
      for (const id of PROJECT_IDS.slice(1)) s.projects[id] = PROJECT_COMPLETE;
      s.comms.neron.progress = 100 - cfg.neron.progressPercent;
      const next = must(applyAction(s, "p0", updateNeron));
      expect(next.comms.neron).toEqual({ version: 2, progress: 0 });
      expect(next.projects[PROJECT_IDS[0]]).toBe(PROJECT_COMPLETE);
      expect(next.log.find((e) => e.key === "neronUpdatedProject")).toMatchObject({ visibleTo: ["p0"], params: { version: 2, project: PROJECT_IDS[0] } });
      // With every project done, the version still goes up.
      const done = clone(next);
      done.comms.neron.progress = 100;
      expect(advanceNeron(done, 0)).toBeUndefined();
      expect(done.comms.neron.version).toBe(3);
    });
  });

  it("the link is in every view, the terminal screen only at the terminal and not for the dead", () => {
    const s = ship(true);
    player(s, "p2").room = "REFECTORY";
    expect(viewFor(s, "p2").comms).toEqual({ linked: true, terminal: null });
    expect(viewFor(s, "p1").comms.terminal).not.toBeNull();
    player(s, "p1").alive = false;
    expect(viewFor(s, "p1").comms.terminal).toBeNull();
  });

  it("an illegal action leaves the state unchanged", () => {
    const s = ship(false);
    const before = JSON.stringify(s);
    for (const a of [xyloph, updateNeron, decode("WOLF")]) expect(applyAction(s, "p0", a).ok).toBe(false);
    expect(JSON.stringify(s)).toBe(before);
  });
});
