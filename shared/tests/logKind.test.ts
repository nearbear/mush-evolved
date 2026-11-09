import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { CAMERA_EQUIPMENT } from "../src/equipment.ts";
import { logCovert, logPrivate, logPublic, logSecret } from "../src/log.ts";
import { normalizeLogEntry } from "../src/normalizeState.ts";
import { createGame, seatViewFor, viewFor } from "../src/rules.ts";
import type { GameState, LogLine } from "../src/types.ts";
import { installCameraIn } from "./cameras.ts";
import { makeSeats, noHunters, noIncidents, player } from "./support.ts";

// Log line kind (owner, 2026-11-05, #366; rules-design.md "Log line kind"): each line records its kind, from the
// writer, and whether a secret or covert one leaked. Every seat that sees a line sees both.
const config = noHunters(noIncidents({ ...DEFAULT_CONFIG, mushCount: 1, startItems: [], startSkills: [] }));

/** p0 and p1 in the refectory, p2 in the laboratory, p3 dead in the refectory. */
function ship(): GameState {
  const s = createGame(makeSeats(4), config, 3);
  for (const id of ["p0", "p1", "p3"]) player(s, id).room = "REFECTORY";
  player(s, "p2").room = "LABORATORY";
  player(s, "p3").alive = false;
  return s;
}

/** The line `key` as `id`'s view has it, or undefined. */
const line = (s: GameState, id: string, key: string): LogLine | undefined => viewFor(s, id).log.find((e) => e.key === key);
const tag = (e: LogLine | undefined) => e && { kind: e.kind, leaked: e.leaked, level: e.level };

describe("log line kind", () => {
  it("a public line has no kind, and nothing leaked", () => {
    const s = ship();
    logPublic(s, "REFECTORY", "said");
    expect(tag(line(s, "p1", "said"))).toEqual({ kind: undefined, leaked: undefined, level: undefined });
  });

  it("a private line is private, to its actor only", () => {
    const s = ship();
    logPrivate(s, "p0", "mine");
    expect(tag(line(s, "p0", "mine"))).toEqual({ kind: "private", leaked: undefined, level: undefined });
    for (const id of ["p1", "p2", "p3"]) expect(line(s, id, "mine")).toBeUndefined();
  });

  it("a secret line nobody witnessed is secret and not leaked, to its actor only", () => {
    const s = ship();
    player(s, "p1").room = "LABORATORY";
    logSecret(s, "p0", "hid");
    expect(tag(line(s, "p0", "hid"))).toEqual({ kind: "secret", leaked: undefined, level: undefined });
    for (const id of ["p1", "p2", "p3"]) expect(line(s, id, "hid")).toBeUndefined();
  });

  it("a witnessed secret line is secret and leaked, for the actor and the witness; the dead and other rooms see nothing", () => {
    const s = ship();
    logSecret(s, "p0", "hid");
    for (const id of ["p0", "p1"]) expect(tag(line(s, id, "hid"))).toEqual({ kind: "secret", leaked: true, level: "warning" });
    for (const id of ["p2", "p3"]) expect(line(s, id, "hid")).toBeUndefined();
  });

  it("a secret line hidden from someone leaks to the other witnesses only, and not at all with no other witness", () => {
    const s = ship();
    logSecret(s, "p0", "alone", undefined, "p1");
    expect(tag(line(s, "p0", "alone"))).toEqual({ kind: "secret", leaked: undefined, level: undefined });
    expect(line(s, "p1", "alone")).toBeUndefined();
    player(s, "p2").room = "REFECTORY";
    logSecret(s, "p0", "seen", undefined, "p1");
    for (const id of ["p0", "p2"]) expect(tag(line(s, id, "seen"))).toEqual({ kind: "secret", leaked: true, level: "warning" });
    expect(line(s, "p1", "seen")).toBeUndefined();
  });

  it("a covert line is covert: the actor's own without a camera, leaked to the room on one", () => {
    const s = ship();
    logCovert(s, "p0", "unseen");
    expect(tag(line(s, "p0", "unseen"))).toEqual({ kind: "covert", leaked: undefined, level: undefined });
    expect(line(s, "p1", "unseen")).toBeUndefined();
    installCameraIn(s, "REFECTORY");
    logCovert(s, "p0", "filmed");
    for (const id of ["p0", "p1"]) expect(tag(line(s, id, "filmed"))).toEqual({ kind: "covert", leaked: true, level: "warning" });
    for (const id of ["p2", "p3"]) expect(line(s, id, "filmed")).toBeUndefined();
  });

  it("a camera doesn't leak an action aimed at itself", () => {
    const s = ship();
    installCameraIn(s, "REFECTORY");
    logCovert(s, "p0", "jellied", { equipment: CAMERA_EQUIPMENT });
    expect(tag(line(s, "p0", "jellied"))).toEqual({ kind: "covert", leaked: undefined, level: undefined });
    expect(line(s, "p1", "jellied")).toBeUndefined();
  });

  it("an Outcast's secret and covert lines are room history with their kind, leaked but not a warning", () => {
    const s = ship();
    player(s, "p0").outcastBy = "p1";
    player(s, "p1").room = "LABORATORY";
    logSecret(s, "p0", "hid");
    logCovert(s, "p0", "spiked");
    player(s, "p1").room = "REFECTORY";
    expect(tag(line(s, "p1", "hid"))).toEqual({ kind: "secret", leaked: true, level: undefined });
    expect(tag(line(s, "p1", "spiked"))).toEqual({ kind: "covert", leaked: true, level: undefined });
    expect(line(s, "p3", "hid")).toBeUndefined();
  });

  it("an alarm is a warning with no kind", () => {
    const s = ship();
    logPublic(s, undefined, "oxygenOut", undefined, "warning");
    expect(tag(line(s, "p2", "oxygenOut"))).toEqual({ kind: undefined, leaked: undefined, level: "warning" });
  });

  it("the replay's seat view carries the same kind and leak", () => {
    const s = ship();
    logSecret(s, "p0", "hid");
    const e = seatViewFor(s, "p1").log.find((l) => l.key === "hid");
    expect(e && { kind: e.kind, leaked: e.leaked }).toEqual({ kind: "secret", leaked: true });
  });

  it("survives normalizing, and an older line without it reads as public", () => {
    const s = ship();
    logSecret(s, "p0", "hid");
    const e = s.log.at(-1)!;
    expect(normalizeLogEntry(structuredClone(e))).toEqual(e);
    const { kind: _k, leaked: _l, level: _v, ...old } = e;
    expect(normalizeLogEntry(old)).toEqual(old);
  });
});
