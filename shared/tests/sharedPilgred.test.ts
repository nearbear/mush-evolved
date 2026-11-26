import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { dayOf } from "../src/helpers.ts";
import { ITRACKIE_ITEM } from "../src/itemIds.ts";
import { PILGRED_COMPLETE } from "../src/pilgred.ts";
import { parseGameMessage } from "../src/protocol.ts";
import { applyInput } from "../src/replay.ts";
import { createGame, viewFor, type ActionResult } from "../src/rules.ts";
import { MAX_SHARED_PILGRED_TEXT_LENGTH, sharePilgred } from "../src/sharedPilgred.ts";
import type { GameState } from "../src/types.ts";
import { clone, makeSeats, must, player } from "./support.ts";

const seats = makeSeats(3, "others");

const error = (r: ActionResult): string => {
  if (r.ok) throw new Error("expected a failure");
  return r.error;
};

/** Everyone in the engine room with the PILGRED terminal; p0 and p1 are human, p2 is Mush. */
function game(): GameState {
  const s = createGame(seats, structuredClone(DEFAULT_CONFIG), 7);
  const pilgredRoom = Object.entries(s.equipment).find(([, list]) => list.some((e) => e.type === "PILGRED"))![0];
  for (const p of s.players) {
    p.room = pilgredRoom;
    p.role = "human";
  }
  player(s, "p2").role = "mush";
  return s;
}

describe("sharing PILGRED repair progress", () => {
  it("pins the progress for everyone who reads PILGRED, replaces on update, and posts system messages", () => {
    const before = game();
    const s1 = must(sharePilgred(before, "p0", 42, "  Need a Physicist!  "));
    const day = dayOf(s1);
    expect(s1.sharedPilgred).toEqual({
      percent: 42,
      text: "Need a Physicist!",
      by: "p0",
      ...day,
    });
    expect(s1.chat.filter((m) => m.channel === "pilgred").map((m) => m.system)).toEqual([
      { key: "pilgredShared", params: { name: player(s1, "p0").character } },
    ]);

    // Living players with an iTrackie anywhere on the ship see the shared progress; someone without an iTrackie does not.
    const moved = clone(s1);
    player(moved, "p1").room = "BRIDGE";
    expect(viewFor(moved, "p1").sharedPilgred).toEqual(s1.sharedPilgred);
    expect(viewFor(moved, "p1").pilgred).toBeNull(); // real progress stays room-scoped
    expect(viewFor(moved, "p1").canSharePilgred).toBe(false);
    expect(viewFor(moved, "p0").canSharePilgred).toBe(true);

    const noTrackie = clone(moved);
    noTrackie.items = noTrackie.items.filter((i) => !(i.type === ITRACKIE_ITEM && i.at.kind === "player" && i.at.id === "p1"));
    expect(viewFor(noTrackie, "p1").sharedPilgred).toBeNull();

    // Updating replaces the previous share, allows lies (unchecked against real progress), and posts pilgredShareUpdated.
    const s2 = must(sharePilgred(s1, "p2", 99, ""));
    expect(s2.sharedPilgred).toEqual({
      percent: 99,
      text: "",
      by: "p2",
      ...dayOf(s2),
    });
    expect(s2.pilgred.progress).toBe(0);
    expect(s2.chat.filter((m) => m.channel === "pilgred").map((m) => m.system)).toEqual([
      { key: "pilgredShared", params: { name: player(s1, "p0").character } },
      { key: "pilgredShareUpdated", params: { name: player(s2, "p2").character } },
    ]);
  });

  it("enforces room, life, iTrackie, percent range, and text limits without mutating state", () => {
    const s = game();
    const away = clone(s);
    player(away, "p0").room = "BRIDGE";
    expect(error(sharePilgred(away, "p0", 50, ""))).toBe("share_forbidden");

    const dead = clone(s);
    player(dead, "p0").alive = false;
    expect(error(sharePilgred(dead, "p0", 50, ""))).toBe("share_forbidden");
    expect(viewFor(dead, "p0").canSharePilgred).toBe(false);

    const bare = clone(s);
    bare.items = bare.items.filter((i) => !(i.type === ITRACKIE_ITEM && i.at.kind === "player" && i.at.id === "p0"));
    expect(error(sharePilgred(bare, "p0", 50, ""))).toBe("share_forbidden");
    expect(viewFor(bare, "p0").canSharePilgred).toBe(false);

    expect(error(sharePilgred(s, "p0", -1, ""))).toBe("share_pilgred_invalid");
    expect(error(sharePilgred(s, "p0", PILGRED_COMPLETE + 1, ""))).toBe("share_pilgred_invalid");
    expect(error(sharePilgred(s, "p0", 12.5, ""))).toBe("share_pilgred_invalid");
    expect(error(sharePilgred(s, "p0", Number.NaN, ""))).toBe("share_pilgred_invalid");
    expect(error(sharePilgred(s, "p0", 50, "x".repeat(MAX_SHARED_PILGRED_TEXT_LENGTH + 1)))).toBe("share_text_invalid");

    expect(sharePilgred(s, "p0", 0, "").ok).toBe(true);
    expect(sharePilgred(s, "p0", PILGRED_COMPLETE, "x".repeat(MAX_SHARED_PILGRED_TEXT_LENGTH)).ok).toBe(true);
    expect(s.sharedPilgred).toBeNull();
  });

  it("replays from sharePilgred input and parses from the wire", () => {
    const replayed = must(applyInput(game(), { type: "sharePilgred", percent: 65, text: "almost", by: "p0" }));
    expect(replayed.sharedPilgred?.percent).toBe(65);
    expect(replayed.sharedPilgred?.text).toBe("almost");

    const parse = (v: unknown) => parseGameMessage(JSON.stringify(v));
    expect(parse({ type: "sharePilgred", percent: 65, text: "ok", extra: 1 })).toEqual({
      type: "sharePilgred",
      percent: 65,
      text: "ok",
    });
    expect(parse({ type: "sharePilgred", percent: -1, text: "" })).toBeNull();
    expect(parse({ type: "sharePilgred", percent: 101, text: "" })).toBeNull();
    expect(parse({ type: "sharePilgred", percent: 12.5, text: "" })).toBeNull();
    expect(parse({ type: "sharePilgred", percent: "50", text: "" })).toBeNull();
    expect(parse({ type: "sharePilgred", percent: 50, text: 123 })).toBeNull();
  });
});
