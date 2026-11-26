import { describe, expect, it } from "vitest";
import { sendChat } from "../src/chat.ts";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { dayOf } from "../src/helpers.ts";
import { ITRACKIE_ITEM } from "../src/itemIds.ts";
import { parseGameMessage } from "../src/protocol.ts";
import { applyInput } from "../src/replay.ts";
import { applyAction, createGame, viewFor, type ActionResult } from "../src/rules.ts";
import { MAX_SHARED_PLANET_LENGTH } from "../src/sharedPlanets.ts";
import { shareReport } from "../src/sharedReports.ts";
import type { GameState } from "../src/types.ts";
import { clone, makeSeats, must, nextCycle, player } from "./support.ts";

const seats = makeSeats(4, "others");

const error = (r: ActionResult): string => {
  if (r.ok) throw new Error("expected a failure");
  return r.error;
};

/** p0 and p1 went on an expedition to Fugunys (`ex-1`), p2 and p3 did not. Everyone is in a different room. */
function game(): GameState {
  const s = createGame(seats, structuredClone(DEFAULT_CONFIG), 7);
  ["LABORATORY", "COMMAND_CENTER", "REFECTORY", "CORRIDOR_A"].forEach((room, i) => (s.players[i]!.room = room));
  s.expeditions.push({ id: "ex-1", members: ["p0", "p1"], crew: [player(s, "p0").character, player(s, "p1").character], planet: "Fugunys", events: [] });
  s.nextExpeditionId = 2;
  return s;
}

const shared = (): GameState => must(shareReport(game(), "p0", "ex-1", "Landed, found 2 oxygen"));

describe("sharing expedition reports", () => {
  it("adds one entry per expedition, from anywhere and for free, for everyone who reads the Expeditions feature", () => {
    const before = game();
    const s = must(shareReport(before, "p0", "ex-1", "  Landed, found 2 oxygen \n then a fight  "));
    expect(s.sharedReports).toEqual([{ id: "sr-1", report: "ex-1", text: "Landed, found 2 oxygen \n then a fight", by: "p0", ...dayOf(s) }]);
    expect([player(s, "p0").ap, player(s, "p0").mp]).toEqual([player(before, "p0").ap, player(before, "p0").mp]);
    for (const id of ["p0", "p1", "p2", "p3"]) {
      const view = viewFor(s, id);
      expect(view.sharedReports).toEqual([{ id: "sr-1", text: "Landed, found 2 oxygen \n then a fight", by: "p0", ...dayOf(s) }]);
      // Which report an entry came from never goes out with the entry.
      expect(JSON.stringify(view.sharedReports)).not.toContain("ex-1");
    }
    // A member's own report names its entry, so the client knows sharing again appends; a non-member has no report.
    expect(viewFor(s, "p1").expeditions[0]!.shared).toBe("sr-1");
    expect(viewFor(s, "p2").expeditions).toEqual([]);
    expect(s.chat.filter((m) => m.channel === "expeditions").map((m) => m.system)).toEqual([
      { key: "reportShared", params: { name: player(s, "p0").character, planet: "Fugunys" } },
    ]);
  });

  it("sharing again, by any member, appends to the entry's thread and keeps the first text", () => {
    let s = must(sendChat(shared(), "p2", "sr-1", "Liar"));
    s = nextCycle(s);
    s = must(shareReport(s, "p1", "ex-1", "Also: Kuan Ti lost 2 HP"));
    s = must(shareReport(s, "p0", "ex-1", "And a starmap"));
    expect(s.sharedReports).toHaveLength(1);
    expect(s.sharedReports[0]).toMatchObject({ text: "Landed, found 2 oxygen", by: "p0" });
    expect(s.chat.filter((m) => m.channel === "sr-1").map((m) => [m.from, m.text])).toEqual([
      ["p2", "Liar"],
      ["p1", "Also: Kuan Ti lost 2 HP"],
      ["p0", "And a starmap"],
    ]);
    expect(s.chat.filter((m) => m.channel === "expeditions").map((m) => m.system!.key)).toEqual(["reportShared", "reportShareAppended", "reportShareAppended"]);
  });

  it("each entry is a thread with the feature's access: the living with an iTrackie post, the dead only read", () => {
    const s = shared();
    expect(viewFor(s, "p3").chatChannels).toContain("sr-1");
    const dead = clone(s);
    player(dead, "p3").alive = false;
    expect(viewFor(dead, "p3").sharedReports).toHaveLength(1);
    expect(viewFor(dead, "p3").readChannels).toContain("sr-1");
    expect(sendChat(dead, "p3", "sr-1", "boo").ok).toBe(false);
    // No iTrackie: no entries, no threads.
    const mine = viewFor(s, "p3").inventory.find((i) => i.type === ITRACKIE_ITEM)!.id;
    const bare = must(applyAction(s, "p3", { type: "drop", item: mine }));
    expect(viewFor(bare, "p3").sharedReports).toEqual([]);
    expect(viewFor(bare, "p3").readChannels).not.toContain("sr-1");
  });

  it("is never marked no longer applicable: a travel leaves the entry as it is", () => {
    const s = shared();
    s.ship.combustion = 3;
    s.titles.commander = "p1";
    const flown = must(applyAction(s, "p1", { type: "travel", equipment: "COMMAND_CENTER:PILOT_MODULE" }));
    expect(flown.sharedReports).toEqual(s.sharedReports);
  });

  it("needs a living member with an iTrackie, and a text of up to the shared planets' 500 characters", () => {
    const s = game();
    expect(error(shareReport(s, "p2", "ex-1", "I was there"))).toBe("report_not_found");
    expect(error(shareReport(s, "p0", "ex-9", "x"))).toBe("report_not_found");
    expect(error(shareReport(s, "p0", "ex-1", "   "))).toBe("share_text_invalid");
    expect(error(shareReport(s, "p0", "ex-1", "x".repeat(MAX_SHARED_PLANET_LENGTH + 1)))).toBe("share_text_invalid");
    expect(shareReport(s, "p0", "ex-1", "x".repeat(MAX_SHARED_PLANET_LENGTH)).ok).toBe(true);
    const dead = clone(s);
    player(dead, "p0").alive = false;
    expect(error(shareReport(dead, "p0", "ex-1", "x"))).toBe("report_share_forbidden");
    const mine = viewFor(s, "p0").inventory.find((i) => i.type === ITRACKIE_ITEM)!.id;
    const bare = must(applyAction(s, "p0", { type: "drop", item: mine }));
    expect(error(shareReport(bare, "p0", "ex-1", "x"))).toBe("report_share_forbidden");
    // The view says so, so the client offers Share only when it would work.
    expect([s, dead, bare].map((state) => viewFor(state, "p0").canShareReports)).toEqual([true, false, false]);
  });

  it("is replayed from the shareReport input and parsed from the client", () => {
    expect(must(applyInput(game(), { type: "shareReport", report: "ex-1", text: "x", by: "p0" })).sharedReports).toHaveLength(1);
    const parse = (msg: unknown) => parseGameMessage(JSON.stringify(msg));
    expect(parse({ type: "shareReport", report: "ex-1", text: "x" })).toEqual({ type: "shareReport", report: "ex-1", text: "x" });
    expect(parse({ type: "shareReport", report: 3, text: "x" })).toBeNull();
    expect(parse({ type: "shareReport", report: "ex-1" })).toBeNull();
    expect(parse({ type: "chat", channel: "sr-4", text: "hi" })).toEqual({ type: "chat", channel: "sr-4", text: "hi" });
  });
});
