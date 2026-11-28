import { describe, expect, it } from "vitest";
import type { ActionOf, ActionType } from "../src/actions.ts";
import { BIOS_OPTIONS } from "../src/bios.ts";
import { MAX_CHAT_LENGTH } from "../src/chat.ts";
import { CHEATS, ROLE_CHEATS } from "../src/cheats.ts";
import { MAX_NOTE_LENGTH, MAX_NOTE_TABS } from "../src/notes.ts";
import { MAX_NAME_LENGTH, MAX_SETUP_ID_LENGTH, parseGameMessage, parseMatchmakerMessage } from "../src/protocol.ts";
import { MAX_SHARED_PLANET_LENGTH } from "../src/sharedPlanets.ts";
import { MUSH_SKILLS, SKILLS } from "../src/skills.ts";
import { MAX_SPOT_CELL } from "../src/spot.ts";

const parse = (msg: unknown) => parseGameMessage(JSON.stringify(msg));
const parseMatchmaker = (msg: unknown) => parseMatchmakerMessage(JSON.stringify(msg));

describe("Wire parsers: raw input boundary (#107)", () => {
  const BAD_RAW = [
    "",
    "   ",
    "\n\t",
    "{",
    "}",
    '{"type":',
    "{type: 'resume'}",
    "undefined",
    "NaN",
    "<xml></xml>",
    "null",
    "true",
    "false",
    "123",
    "-1",
    '"resume"',
    '"queue"',
    "[]",
    "[1, 2]",
    '[{"type":"resume"}]',
  ];

  it.each(BAD_RAW)("parseGameMessage rejects malformed or non-object raw JSON: %j", (raw) => {
    expect(parseGameMessage(raw)).toBeNull();
  });

  it.each(BAD_RAW)("parseMatchmakerMessage rejects malformed or non-object raw JSON: %j", (raw) => {
    expect(parseMatchmakerMessage(raw)).toBeNull();
  });
});

describe("parseMatchmakerMessage (#107)", () => {
  it("parses a vote for a setup id, and refuses a missing, empty, overlong or non-string one (#236)", () => {
    expect(parseMatchmaker({ type: "vote", setupId: "standard" })).toEqual({ type: "vote", setupId: "standard" });
    expect(parseMatchmaker({ type: "vote", setupId: "x".repeat(MAX_SETUP_ID_LENGTH) })).toEqual({ type: "vote", setupId: "x".repeat(MAX_SETUP_ID_LENGTH) });
    for (const setupId of [undefined, "", "x".repeat(MAX_SETUP_ID_LENGTH + 1), 3, null, ["standard"]]) {
      expect(parseMatchmaker({ type: "vote", setupId })).toBeNull();
    }
  });

  it("parses resume, queue, and singlePlayer", () => {
    expect(parseMatchmaker({ type: "resume" })).toEqual({ type: "resume" });
    expect(parseMatchmakerMessage('{"type":"resume"}')).toEqual({ type: "resume" });
    expect(parseMatchmaker({ type: "queue", name: "Alice", character: "jinsu" })).toEqual({
      type: "queue",
      name: "Alice",
      character: "jinsu",
    });
    expect(parseMatchmaker({ type: "singlePlayer", name: "Bob", character: "chun" })).toEqual({
      type: "singlePlayer",
      name: "Bob",
      character: "chun",
    });
  });

  it("strips fields not part of the message shape", () => {
    expect(parseMatchmaker({ type: "resume", extra: 1, name: "Alice", __proto__: { evil: 1 } })).toEqual({
      type: "resume",
    });
    expect(parseMatchmaker({ type: "queue", name: "Alice", character: "jinsu", extra: 1, role: "mush" })).toEqual({
      type: "queue",
      name: "Alice",
      character: "jinsu",
    });
    expect(parseMatchmaker({ type: "singlePlayer", name: "Bob", character: "chun", extra: 1 })).toEqual({
      type: "singlePlayer",
      name: "Bob",
      character: "chun",
    });
  });

  it("trims whitespace and caps player names at MAX_NAME_LENGTH (24 chars)", () => {
    expect(parseMatchmaker({ type: "queue", name: "  Alice  ", character: "jinsu" })).toEqual({
      type: "queue",
      name: "Alice",
      character: "jinsu",
    });
    expect(parseMatchmaker({ type: "singlePlayer", name: " \t\n Bob \n\t ", character: "chun" })).toEqual({
      type: "singlePlayer",
      name: "Bob",
      character: "chun",
    });

    const exact = "A".repeat(MAX_NAME_LENGTH);
    expect(parseMatchmaker({ type: "queue", name: exact, character: "jinsu" })).toEqual({
      type: "queue",
      name: exact,
      character: "jinsu",
    });

    const oversized = "B".repeat(MAX_NAME_LENGTH + 10);
    expect(parseMatchmaker({ type: "queue", name: oversized, character: "jinsu" })).toEqual({
      type: "queue",
      name: "B".repeat(MAX_NAME_LENGTH),
      character: "jinsu",
    });

    const paddedOversized = "   " + "C".repeat(MAX_NAME_LENGTH + 5) + "   ";
    expect(parseMatchmaker({ type: "queue", name: paddedOversized, character: "jinsu" })).toEqual({
      type: "queue",
      name: "C".repeat(MAX_NAME_LENGTH),
      character: "jinsu",
    });
  });

  const BAD_MATCHMAKER_INPUTS: Array<[label: string, msg: unknown]> = [
    ["empty object", {}],
    ["unknown message type", { type: "unknown" }],
    ["empty string type", { type: "" }],
    ["numeric type", { type: 123 }],
    ["null type", { type: null }],
    ["boolean type", { type: true }],
    ["array type", { type: ["queue"] }],
    ["game message type chat", { type: "chat", channel: "global", text: "hi" }],
    ["game message type action", { type: "action", action: { type: "ready" } }],
    ["prototype type constructor", { type: "constructor" }],
    ["prototype type __proto__", { type: "__proto__" }],
    ["prototype type toString", { type: "toString" }],
    ["empty name", { type: "queue", name: "", character: "jinsu" }],
    ["whitespace-only name (spaces)", { type: "queue", name: "   ", character: "jinsu" }],
    ["whitespace-only name (tabs/newlines)", { type: "singlePlayer", name: " \t\n ", character: "chun" }],
    ["missing name on queue", { type: "queue", character: "jinsu" }],
    ["number name", { type: "queue", name: 123, character: "jinsu" }],
    ["null name", { type: "queue", name: null, character: "jinsu" }],
    ["boolean name", { type: "queue", name: true, character: "jinsu" }],
    ["array name", { type: "queue", name: ["Alice"], character: "jinsu" }],
    ["object name", { type: "queue", name: { name: "Alice" }, character: "jinsu" }],
    ["missing character on queue", { type: "queue", name: "Alice" }],
    ["unknown character id", { type: "queue", name: "Alice", character: "nobody" }],
    ["character role instead of id", { type: "queue", name: "Alice", character: "mush" }],
    ["character with underscore", { type: "queue", name: "Alice", character: "jin_su" }],
    ["empty character", { type: "queue", name: "Alice", character: "" }],
    ["number character", { type: "queue", name: "Alice", character: 123 }],
    ["null character", { type: "queue", name: "Alice", character: null }],
    ["boolean character", { type: "queue", name: "Alice", character: true }],
    ["array character", { type: "queue", name: "Alice", character: ["jinsu"] }],
    ["object character", { type: "queue", name: "Alice", character: { id: "jinsu" } }],
    ["prototype character constructor", { type: "queue", name: "Alice", character: "constructor" }],
    ["prototype character __proto__", { type: "queue", name: "Alice", character: "__proto__" }],
    ["singlePlayer missing name", { type: "singlePlayer", character: "chun" }],
    ["singlePlayer missing character", { type: "singlePlayer", name: "Bob" }],
    ["singlePlayer unknown character", { type: "singlePlayer", name: "Bob", character: "unknown" }],
    ["singlePlayer wrong name type", { type: "singlePlayer", name: 456, character: "chun" }],
    ["singlePlayer wrong character type", { type: "singlePlayer", name: "Bob", character: 123 }],
  ];

  it.each(BAD_MATCHMAKER_INPUTS)("refuses bad matchmaker input: %s", (_label, msg) => {
    expect(parseMatchmaker(msg)).toBeNull();
  });
});

describe("parseGameMessage: message-level wire table (#107)", () => {
  const BAD_TOP_LEVEL_GAME_INPUTS: Array<[label: string, msg: unknown]> = [
    ["empty object", {}],
    ["unknown message type", { type: "unknown" }],
    ["empty string type", { type: "" }],
    ["numeric type", { type: 123 }],
    ["null type", { type: null }],
    ["boolean type", { type: true }],
    ["array type", { type: ["chat"] }],
    ["object type", { type: {} }],
    ["prototype type constructor", { type: "constructor" }],
    ["prototype type __proto__", { type: "__proto__" }],
    ["prototype type toString", { type: "toString" }],
    ["matchmaker queue message", { type: "queue", name: "Alice", character: "jinsu" }],
    ["matchmaker singlePlayer message", { type: "singlePlayer", name: "Bob", character: "chun" }],
    ["matchmaker resume message", { type: "resume" }],
  ];

  it.each(BAD_TOP_LEVEL_GAME_INPUTS)("refuses bad top-level game message: %s", (_label, msg) => {
    expect(parse(msg)).toBeNull();
  });
});

describe("chat wire parser (#107)", () => {
  it("parses valid chat messages across all channel kinds, dropping extra fields", () => {
    for (const channel of ["global", "mush", "graveyard", "pc-1", "th-1", "sp-1", "sr-1"]) {
      expect(parse({ type: "chat", channel, text: "hello", extra: 1, author: "p1" })).toEqual({
        type: "chat",
        channel,
        text: "hello",
      });
    }
  });

  it("enforces generous string length cap (MAX_CHAT_LENGTH * 4)", () => {
    const maxText = "a".repeat(MAX_CHAT_LENGTH * 4);
    expect(parse({ type: "chat", channel: "global", text: maxText })).toEqual({
      type: "chat",
      channel: "global",
      text: maxText,
    });
    const oversized = "a".repeat(MAX_CHAT_LENGTH * 4 + 1);
    expect(parse({ type: "chat", channel: "global", text: oversized })).toBeNull();
  });

  const BAD_CHAT_INPUTS: Array<[label: string, msg: unknown]> = [
    ["missing channel", { type: "chat", text: "hello" }],
    ["missing text", { type: "chat", channel: "global" }],
    ["unknown channel string", { type: "chat", channel: "nope", text: "hello" }],
    ["unsupported channel general", { type: "chat", channel: "general", text: "hello" }],
    ["incomplete private channel prefix pc-", { type: "chat", channel: "pc-", text: "hello" }],
    ["incomplete thread prefix th-", { type: "chat", channel: "th-", text: "hello" }],
    ["incomplete shared planet prefix sp-", { type: "chat", channel: "sp-", text: "hello" }],
    ["incomplete shared report prefix sr-", { type: "chat", channel: "sr-", text: "hello" }],
    ["non-numeric thread id", { type: "chat", channel: "th-abc", text: "hello" }],
    ["non-numeric private channel id", { type: "chat", channel: "pc-abc", text: "hello" }],
    ["prototype channel constructor", { type: "chat", channel: "constructor", text: "hello" }],
    ["prototype channel __proto__", { type: "chat", channel: "__proto__", text: "hello" }],
    ["number channel", { type: "chat", channel: 1, text: "hello" }],
    ["null channel", { type: "chat", channel: null, text: "hello" }],
    ["boolean channel", { type: "chat", channel: true, text: "hello" }],
    ["array channel", { type: "chat", channel: ["global"], text: "hello" }],
    ["object channel", { type: "chat", channel: { id: "global" }, text: "hello" }],
    ["number text", { type: "chat", channel: "global", text: 123 }],
    ["null text", { type: "chat", channel: "global", text: null }],
    ["boolean text", { type: "chat", channel: "global", text: true }],
    ["array text", { type: "chat", channel: "global", text: ["hello"] }],
    ["object text", { type: "chat", channel: "global", text: { text: "hello" } }],
  ];

  it.each(BAD_CHAT_INPUTS)("refuses bad chat input: %s", (_label, msg) => {
    expect(parse(msg)).toBeNull();
  });
});

describe("walk wire parser (#107)", () => {
  it("parses valid walk messages, dropping extra fields", () => {
    expect(parse({ type: "walk", x: 1, y: 2, sitting: true, extra: 1 })).toEqual({
      type: "walk",
      x: 1,
      y: 2,
      sitting: true,
    });
    expect(
      parse({
        type: "walk",
        x: -5,
        y: 0,
        sitting: false,
        behind: { x: -5, y: -1, extra: 2 },
        extra: 1,
      })
    ).toEqual({
      type: "walk",
      x: -5,
      y: 0,
      sitting: false,
      behind: { x: -5, y: -1 },
    });
  });

  const BAD_WALK_INPUTS: Array<[label: string, msg: unknown]> = [
    ["missing x", { type: "walk", y: 2, sitting: true }],
    ["missing y", { type: "walk", x: 1, sitting: true }],
    ["missing sitting", { type: "walk", x: 1, y: 2 }],
    ["float x", { type: "walk", x: 1.5, y: 2, sitting: true }],
    ["float y", { type: "walk", x: 1, y: 2.5, sitting: true }],
    ["string x", { type: "walk", x: "1", y: 2, sitting: true }],
    ["string y", { type: "walk", x: 1, y: "2", sitting: true }],
    ["NaN x", { type: "walk", x: Number.NaN, y: 2, sitting: true }],
    ["Infinity y", { type: "walk", x: 1, y: Number.POSITIVE_INFINITY, sitting: true }],
    ["x exceeds MAX_SPOT_CELL", { type: "walk", x: MAX_SPOT_CELL + 1, y: 0, sitting: false }],
    ["x below -MAX_SPOT_CELL", { type: "walk", x: -MAX_SPOT_CELL - 1, y: 0, sitting: false }],
    ["y exceeds MAX_SPOT_CELL", { type: "walk", x: 0, y: MAX_SPOT_CELL + 1, sitting: false }],
    ["string sitting", { type: "walk", x: 1, y: 2, sitting: "true" }],
    ["number sitting", { type: "walk", x: 1, y: 2, sitting: 1 }],
    ["null sitting", { type: "walk", x: 1, y: 2, sitting: null }],
    ["behind is string", { type: "walk", x: 1, y: 2, sitting: false, behind: "chair" }],
    ["behind is null", { type: "walk", x: 1, y: 2, sitting: false, behind: null }],
    ["behind is array", { type: "walk", x: 1, y: 2, sitting: false, behind: [0, 2] }],
    ["behind float coordinate", { type: "walk", x: 1, y: 2, sitting: false, behind: { x: 0.5, y: 2 } }],
    ["behind missing y", { type: "walk", x: 1, y: 2, sitting: false, behind: { x: 0 } }],
    ["behind x exceeds MAX_SPOT_CELL", { type: "walk", x: 1, y: 2, sitting: false, behind: { x: MAX_SPOT_CELL + 1, y: 2 } }],
  ];

  it.each(BAD_WALK_INPUTS)("refuses bad walk input: %s", (_label, msg) => {
    expect(parse(msg)).toBeNull();
  });
});

describe("toggleCheckbox wire parser (#107)", () => {
  it("parses valid toggleCheckbox, dropping extra fields", () => {
    expect(parse({ type: "toggleCheckbox", channel: "global", seq: 5, line: 1, extra: 1 })).toEqual({
      type: "toggleCheckbox",
      channel: "global",
      seq: 5,
      line: 1,
    });
    expect(parse({ type: "toggleCheckbox", channel: "pc-1", seq: 0, line: 0 })).toEqual({
      type: "toggleCheckbox",
      channel: "pc-1",
      seq: 0,
      line: 0,
    });
  });

  const BAD_TOGGLE_INPUTS: Array<[label: string, msg: unknown]> = [
    ["missing channel", { type: "toggleCheckbox", seq: 1, line: 0 }],
    ["missing seq", { type: "toggleCheckbox", channel: "global", line: 0 }],
    ["missing line", { type: "toggleCheckbox", channel: "global", seq: 1 }],
    ["unknown channel", { type: "toggleCheckbox", channel: "nope", seq: 1, line: 0 }],
    ["negative seq", { type: "toggleCheckbox", channel: "global", seq: -1, line: 0 }],
    ["negative line", { type: "toggleCheckbox", channel: "global", seq: 1, line: -1 }],
    ["float seq", { type: "toggleCheckbox", channel: "global", seq: 1.5, line: 0 }],
    ["float line", { type: "toggleCheckbox", channel: "global", seq: 1, line: 0.5 }],
    ["string seq", { type: "toggleCheckbox", channel: "global", seq: "1", line: 0 }],
    ["string line", { type: "toggleCheckbox", channel: "global", seq: 1, line: "0" }],
    ["NaN seq", { type: "toggleCheckbox", channel: "global", seq: Number.NaN, line: 0 }],
    ["Infinity seq", { type: "toggleCheckbox", channel: "global", seq: Number.POSITIVE_INFINITY, line: 0 }],
  ];

  it.each(BAD_TOGGLE_INPUTS)("refuses bad toggleCheckbox input: %s", (_label, msg) => {
    expect(parse(msg)).toBeNull();
  });
});

describe("createChannel wire parser (#107)", () => {
  it("parses valid createChannel, dropping extra fields", () => {
    expect(parse({ type: "createChannel", extra: 1 })).toEqual({ type: "createChannel" });
    expect(parse({ type: "createChannel", name: "Bridge Crew", extra: 1 })).toEqual({
      type: "createChannel",
      name: "Bridge Crew",
    });
    expect(parse({ type: "createChannel", members: ["p1", "p2"], extra: 1 })).toEqual({
      type: "createChannel",
      members: ["p1", "p2"],
    });
    expect(parse({ type: "createChannel", name: "Bridge Crew", members: ["p1"], extra: 1 })).toEqual({
      type: "createChannel",
      name: "Bridge Crew",
      members: ["p1"],
    });
  });

  it("enforces bounds on name and members", () => {
    const maxName = "n".repeat(MAX_NAME_LENGTH * 4);
    expect(parse({ type: "createChannel", name: maxName })).toEqual({ type: "createChannel", name: maxName });
    expect(parse({ type: "createChannel", name: maxName + "x" })).toBeNull();

    const maxMembers = Array.from({ length: 16 }, (_, i) => `p${i}`);
    expect(parse({ type: "createChannel", members: maxMembers })).toEqual({
      type: "createChannel",
      members: maxMembers,
    });
    const tooManyMembers = Array.from({ length: 17 }, (_, i) => `p${i}`);
    expect(parse({ type: "createChannel", members: tooManyMembers })).toBeNull();

    const maxMemberId = "a".repeat(64);
    expect(parse({ type: "createChannel", members: [maxMemberId] })).toEqual({
      type: "createChannel",
      members: [maxMemberId],
    });
    expect(parse({ type: "createChannel", members: [maxMemberId + "x"] })).toBeNull();
  });

  const BAD_CREATE_CHANNEL_INPUTS: Array<[label: string, msg: unknown]> = [
    ["numeric name", { type: "createChannel", name: 123 }],
    ["null name", { type: "createChannel", name: null }],
    ["boolean name", { type: "createChannel", name: true }],
    ["string members", { type: "createChannel", members: "p1" }],
    ["numeric members", { type: "createChannel", members: 123 }],
    ["null members", { type: "createChannel", members: null }],
    ["member item is number", { type: "createChannel", members: [123] }],
    ["member item is null", { type: "createChannel", members: [null] }],
  ];

  it.each(BAD_CREATE_CHANNEL_INPUTS)("refuses bad createChannel input: %s", (_label, msg) => {
    expect(parse(msg)).toBeNull();
  });
});

describe("createThread wire parser (#107)", () => {
  it("parses valid createThread, dropping extra fields", () => {
    expect(parse({ type: "createThread", name: "Discussion", extra: 1 })).toEqual({
      type: "createThread",
      name: "Discussion",
    });
    expect(parse({ type: "createThread", name: "Discussion", from: 4, extra: 1 })).toEqual({
      type: "createThread",
      name: "Discussion",
      from: 4,
    });
  });

  it("enforces name length bound", () => {
    const maxName = "t".repeat(MAX_NAME_LENGTH * 4);
    expect(parse({ type: "createThread", name: maxName })).toEqual({ type: "createThread", name: maxName });
    expect(parse({ type: "createThread", name: maxName + "x" })).toBeNull();
  });

  const BAD_CREATE_THREAD_INPUTS: Array<[label: string, msg: unknown]> = [
    ["missing name", { type: "createThread" }],
    ["numeric name", { type: "createThread", name: 123 }],
    ["null name", { type: "createThread", name: null }],
    ["negative from", { type: "createThread", name: "Plan", from: -1 }],
    ["float from", { type: "createThread", name: "Plan", from: 1.5 }],
    ["string from", { type: "createThread", name: "Plan", from: "1" }],
    ["NaN from", { type: "createThread", name: "Plan", from: Number.NaN }],
  ];

  it.each(BAD_CREATE_THREAD_INPUTS)("refuses bad createThread input: %s", (_label, msg) => {
    expect(parse(msg)).toBeNull();
  });
});

describe("sharePlanet and shareReport wire parser (#107)", () => {
  it("parses valid sharePlanet and shareReport, dropping extra fields", () => {
    expect(parse({ type: "sharePlanet", planet: "pl1", sectors: [null], text: "info", extra: 1 })).toEqual({
      type: "sharePlanet",
      planet: "pl1",
      sectors: [null],
      text: "info",
    });
    expect(parse({ type: "shareReport", report: "rep1", text: "info", extra: 1 })).toEqual({
      type: "shareReport",
      report: "rep1",
      text: "info",
    });
  });

  it("enforces identifier and text length bounds", () => {
    const maxId = "x".repeat(64);
    const maxText = "t".repeat(MAX_SHARED_PLANET_LENGTH * 4);
    expect(parse({ type: "sharePlanet", planet: maxId, sectors: [], text: maxText })).toEqual({
      type: "sharePlanet",
      planet: maxId,
      sectors: [],
      text: maxText,
    });
    expect(parse({ type: "sharePlanet", planet: maxId + "x", sectors: [], text: "t" })).toBeNull();
    expect(parse({ type: "sharePlanet", planet: "pl1", sectors: [], text: maxText + "x" })).toBeNull();
    expect(parse({ type: "sharePlanet", planet: "pl1", sectors: Array(33).fill(null), text: "t" })).toBeNull();

    expect(parse({ type: "shareReport", report: maxId, text: maxText })).toEqual({
      type: "shareReport",
      report: maxId,
      text: maxText,
    });
    expect(parse({ type: "shareReport", report: maxId + "x", text: "t" })).toBeNull();
    expect(parse({ type: "shareReport", report: "rep1", text: maxText + "x" })).toBeNull();
  });

  const BAD_SHARE_INPUTS: Array<[label: string, msg: unknown]> = [
    ["sharePlanet missing planet", { type: "sharePlanet", sectors: [], text: "text" }],
    ["sharePlanet missing text", { type: "sharePlanet", planet: "pl1", sectors: [] }],
    ["sharePlanet missing sectors", { type: "sharePlanet", planet: "pl1", text: "text" }],
    ["sharePlanet numeric planet", { type: "sharePlanet", planet: 123, sectors: [], text: "text" }],
    ["sharePlanet numeric text", { type: "sharePlanet", planet: "pl1", sectors: [], text: 123 }],
    ["sharePlanet unknown tag", { type: "sharePlanet", planet: "pl1", sectors: ["NOPE"], text: "text" }],
    ["shareReport missing report", { type: "shareReport", text: "text" }],
    ["shareReport missing text", { type: "shareReport", report: "rep1" }],
    ["shareReport numeric report", { type: "shareReport", report: 123, text: "text" }],
    ["shareReport numeric text", { type: "shareReport", report: "rep1", text: 123 }],
  ];

  it.each(BAD_SHARE_INPUTS)("refuses bad share input: %s", (_label, msg) => {
    expect(parse(msg)).toBeNull();
  });
});

describe("invite and leaveChannel wire parser (#107)", () => {
  it("parses valid invite and leaveChannel, dropping extra fields", () => {
    expect(parse({ type: "invite", channel: "pc-1", player: "p2", extra: 1 })).toEqual({
      type: "invite",
      channel: "pc-1",
      player: "p2",
    });
    expect(parse({ type: "leaveChannel", channel: "pc-1", extra: 1 })).toEqual({
      type: "leaveChannel",
      channel: "pc-1",
    });
  });

  const BAD_CHANNEL_MEMBERSHIP_INPUTS: Array<[label: string, msg: unknown]> = [
    ["invite missing channel", { type: "invite", player: "p1" }],
    ["invite non-private channel global", { type: "invite", channel: "global", player: "p1" }],
    ["invite non-private channel thread", { type: "invite", channel: "th-1", player: "p1" }],
    ["invite invalid private channel format", { type: "invite", channel: "pc-", player: "p1" }],
    ["invite numeric channel", { type: "invite", channel: 123, player: "p1" }],
    ["invite missing player", { type: "invite", channel: "pc-1" }],
    ["invite numeric player", { type: "invite", channel: "pc-1", player: 123 }],
    ["invite null player", { type: "invite", channel: "pc-1", player: null }],
    ["leaveChannel missing channel", { type: "leaveChannel" }],
    ["leaveChannel non-private channel global", { type: "leaveChannel", channel: "global" }],
    ["leaveChannel non-private channel thread", { type: "leaveChannel", channel: "th-1" }],
    ["leaveChannel invalid private channel format", { type: "leaveChannel", channel: "pc-abc" }],
  ];

  it.each(BAD_CHANNEL_MEMBERSHIP_INPUTS)("refuses bad channel membership input: %s", (_label, msg) => {
    expect(parse(msg)).toBeNull();
  });
});

describe("cheats and lifecycle wire parser (#107)", () => {
  it("parses cheats, roleCheat, cheatRoom, clearQueue, and acknowledgeTransfer, dropping extra fields", () => {
    for (const cheat of CHEATS) {
      expect(parse({ type: "cheat", cheat, on: true, extra: 1 })).toEqual({ type: "cheat", cheat, on: true });
      expect(parse({ type: "cheat", cheat, on: false, extra: 1 })).toEqual({ type: "cheat", cheat, on: false });
    }
    for (const role of ROLE_CHEATS) {
      expect(parse({ type: "roleCheat", role, extra: 1 })).toEqual({ type: "roleCheat", role });
    }
    expect(parse({ type: "cheatRoom", extra: 1 })).toEqual({ type: "cheatRoom" });
    expect(parse({ type: "clearQueue", extra: 1 })).toEqual({ type: "clearQueue" });
    expect(parse({ type: "acknowledgeTransfer", extra: 1 })).toEqual({ type: "acknowledgeTransfer" });
  });

  it("parses a Superkube option, leaving its argument's kind to applyKube (#170)", () => {
    expect(parse({ type: "kube", op: "cure", extra: 1 })).toEqual({ type: "kube", op: "cure" });
    expect(parse({ type: "kube", op: "hp", arg: 5 })).toEqual({ type: "kube", op: "hp", arg: 5 });
    expect(parse({ type: "kube", op: "teleport", arg: "LABORATORY" })).toEqual({ type: "kube", op: "teleport", arg: "LABORATORY" });
    for (const bad of [{ op: "constructor" }, { op: "nope" }, { op: "hp", arg: 1.5 }, { op: "hp", arg: null }, { op: "spawn", arg: "x".repeat(65) }, { op: "spawn", arg: ["a"] }]) {
      expect(parse({ type: "kube", ...bad })).toBeNull();
    }
  });

  const BAD_CHEAT_INPUTS: Array<[label: string, msg: unknown]> = [
    ["cheat unknown cheat name", { type: "cheat", cheat: "godMode", on: true }],
    ["cheat prototype constructor", { type: "cheat", cheat: "constructor", on: true }],
    ["cheat prototype __proto__", { type: "cheat", cheat: "__proto__", on: true }],
    ["cheat string on", { type: "cheat", cheat: "infiniteAp", on: "true" }],
    ["cheat numeric on", { type: "cheat", cheat: "infiniteAp", on: 1 }],
    ["cheat null on", { type: "cheat", cheat: "infiniteAp", on: null }],
    ["roleCheat unknown role", { type: "roleCheat", role: "alien" }],
    ["roleCheat numeric role", { type: "roleCheat", role: 123 }],
    ["roleCheat prototype constructor", { type: "roleCheat", role: "constructor" }],
    ["roleCheat prototype __proto__", { type: "roleCheat", role: "__proto__" }],
  ];

  it.each(BAD_CHEAT_INPUTS)("refuses bad cheat input: %s", (_label, msg) => {
    expect(parse(msg)).toBeNull();
  });
});

describe("actions: move and ready wire parser (#107)", () => {
  it("parses move and ready actions, dropping extra fields", () => {
    expect(parse({ type: "action", action: { type: "move", to: "bridge", extra: 1, seat: "p1" } })).toEqual({
      type: "action",
      action: { type: "move", to: "bridge" },
    });
    expect(parse({ type: "action", action: { type: "ready", extra: 1, target: "p1" } })).toEqual({
      type: "action",
      action: { type: "ready" },
    });
  });

  const BAD_ACTION_INPUTS: Array<[label: string, msg: unknown]> = [
    ["missing action object", { type: "action" }],
    ["null action", { type: "action", action: null }],
    ["string action", { type: "action", action: "move" }],
    ["array action", { type: "action", action: ["ready"] }],
    ["number action", { type: "action", action: 123 }],
    ["empty action object", { type: "action", action: {} }],
    ["unknown action type", { type: "action", action: { type: "dance" } }],
    ["prototype action type constructor", { type: "action", action: { type: "constructor" } }],
    ["prototype action type __proto__", { type: "action", action: { type: "__proto__" } }],
    ["prototype action type toString", { type: "action", action: { type: "toString" } }],
    ["numeric action type", { type: "action", action: { type: 123 } }],
    ["null action type", { type: "action", action: { type: null } }],
    ["move missing to", { type: "action", action: { type: "move" } }],
    ["move numeric to", { type: "action", action: { type: "move", to: 123 } }],
    ["move null to", { type: "action", action: { type: "move", to: null } }],
    ["move boolean to", { type: "action", action: { type: "move", to: true } }],
    ["move object to", { type: "action", action: { type: "move", to: { room: "bridge" } } }],
  ];

  it.each(BAD_ACTION_INPUTS)("refuses bad action wire input: %s", (_label, msg) => {
    expect(parse(msg)).toBeNull();
  });
});

describe("Leave ship (a cheat)", () => {
  it("parses with nothing else carried", () => {
    expect(parse({ type: "leaveShip", seat: "p1" })).toEqual({ type: "leaveShip" });
  });
});

describe("chatPage (#355)", () => {
  it("parses a channel and a page, dropping anything extra", () => {
    expect(parse({ type: "chatPage", channel: "global", page: 3, seat: "p1" })).toEqual({ type: "chatPage", channel: "global", page: 3 });
    expect(parse({ type: "chatPage", channel: "pc-2", page: 0 })).toEqual({ type: "chatPage", channel: "pc-2", page: 0 });
  });

  it("refuses unknown channels and pages that aren't whole numbers from 0", () => {
    for (const bad of [{ channel: "nope", page: 0 }, { channel: "global", page: -1 }, { channel: "global", page: 1.5 }, { channel: "global", page: "1" }, { channel: "global" }]) {
      expect(parse({ type: "chatPage", ...bad })).toBeNull();
    }
  });
});

describe("chatRead (#400)", () => {
  it("parses counts per channel, dropping anything extra", () => {
    expect(parse({ type: "chatRead", read: { global: 12, "pc-2": 0, mush: 3, "th-1": 4, "sp-0": 1, "sr-7": 2 }, seat: "p1" })).toEqual({
      type: "chatRead",
      read: { global: 12, "pc-2": 0, mush: 3, "th-1": 4, "sp-0": 1, "sr-7": 2 },
    });
    expect(parse({ type: "chatRead", read: {} })).toEqual({ type: "chatRead", read: {} });
  });

  it("refuses unknown channels, bad counts and anything but a plain object", () => {
    for (const read of [
      { nope: 1 },
      { global: -1 },
      { global: 1.5 },
      { global: "3" },
      { global: null },
      { global: Number.MAX_SAFE_INTEGER + 1 },
      [3],
      null,
      "global",
      undefined,
    ]) {
      expect(parse({ type: "chatRead", read })).toBeNull();
    }
  });

  it("refuses __proto__ and other prototype names", () => {
    expect(parseGameMessage('{"type":"chatRead","read":{"__proto__":1}}')).toBeNull();
    expect(parseGameMessage('{"type":"chatRead","read":{"global":1,"constructor":2}}')).toBeNull();
  });

  it("caps the entries at 256", () => {
    const read = (n: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`pc-${i}`, i]));
    expect(parse({ type: "chatRead", read: read(256) })).toEqual({ type: "chatRead", read: read(256) });
    expect(parse({ type: "chatRead", read: read(257) })).toBeNull();
  });
});

describe("note (#503)", () => {
  it("parses a tab and its text, dropping anything extra", () => {
    expect(parse({ type: "note", tab: 0, text: "hi", seat: "p1" })).toEqual({ type: "note", tab: 0, text: "hi" });
    expect(parse({ type: "note", tab: MAX_NOTE_TABS - 1, text: "a".repeat(MAX_NOTE_LENGTH) })).toEqual({ type: "note", tab: MAX_NOTE_TABS - 1, text: "a".repeat(MAX_NOTE_LENGTH) });
  });

  it("refuses a bad tab, a 17th tab, non-text and text over the limit", () => {
    for (const bad of [
      { tab: -1, text: "" },
      { tab: 1.5, text: "" },
      { tab: "0", text: "" },
      { tab: MAX_NOTE_TABS, text: "" },
      { tab: 0, text: 3 },
      { tab: 0 },
      { tab: 0, text: "a".repeat(MAX_NOTE_LENGTH + 1) },
    ]) {
      expect(parse({ type: "note", ...bad })).toBeNull();
    }
  });
});

describe("model key messages (BYOK)", () => {
  const ok = { type: "setModel", provider: "openrouter", model: "meta-llama/llama-3.3-70b-instruct:free", apiKey: "sk-or-v1-abc123" };

  it("parses setModel and clearModel, dropping anything extra", () => {
    expect(parse({ ...ok, baseUrl: "https://evil.test" })).toEqual(ok);
    expect(parse({ type: "clearModel", apiKey: "x" })).toEqual({ type: "clearModel" });
  });

  it("refuses providers off the allowlist, and keys or model names that could break the request", () => {
    expect(parse({ ...ok, provider: "https://evil.test/v1" })).toBeNull();
    expect(parse({ ...ok, apiKey: "" })).toBeNull();
    expect(parse({ ...ok, apiKey: "sk-1\r\nx-evil: 1" })).toBeNull();
    expect(parse({ ...ok, apiKey: "a".repeat(513) })).toBeNull();
    expect(parse({ ...ok, model: "" })).toBeNull();
    expect(parse({ ...ok, model: 'm", "max_tokens": 99999' })).toBeNull();
    expect(parse({ ...ok, model: 3 })).toBeNull();
  });
});

describe("actions from a client", () => {
  // One of each shape. The type makes it list every action type, so a new action can't be left out.
  const SAMPLES: { [K in ActionType]: ActionOf<K>[] } = {
    ready: [{ type: "ready" }],
    claim_slot: [{ type: "claim_slot", plan: "plan-1", slot: 0 }],
    withdraw_slot: [{ type: "withdraw_slot", plan: "plan-1", slot: 0 }],
    mark_done: [{ type: "mark_done", plan: "plan-1", slot: 2 }],
    cancel_plan: [{ type: "cancel_plan", plan: "plan-1" }],
    summon: [{ type: "summon", plan: "plan-1" }],
    move: [{ type: "move", to: "bridge" }],
    take: [{ type: "take", item: "i1" }],
    drop: [{ type: "drop", item: "i1" }],
    reinforce: [{ type: "reinforce", item: "i1" }, { type: "reinforce", equipment: "e1" }],
    upgrade_drone: [{ type: "upgrade_drone", item: "i1", upgrade: "turbo" }],
    dismantle: [{ type: "dismantle", item: "i1" }, { type: "dismantle", equipment: "e1" }],
    access: [{ type: "access", equipment: "e1" }],
    hack: [{ type: "hack", equipment: "e1" }],
    research: [{ type: "research", equipment: "e1", research: "r1" }],
    spoil_research: [{ type: "spoil_research", equipment: "e1", research: "r1" }],
    contaminate: [{ type: "contaminate", equipment: "e1", research: "r1" }],
    project: [{ type: "project", equipment: "e1", project: "p1" }],
    repair_pilgred: [{ type: "repair_pilgred", equipment: "e1" }],
    return_to_sol: [{ type: "return_to_sol", equipment: "e1" }],
    travel_to_eden: [{ type: "travel_to_eden", equipment: "e1" }],
    compute_eden: [{ type: "compute_eden", equipment: "e1" }],
    turn_ship: [{ type: "turn_ship", equipment: "e1", side: "left" }],
    set_launch_key: [{ type: "set_launch_key", equipment: "e1", title: "commander", on: true }],
    travel: [{ type: "travel", equipment: "e1" }],
    leave_orbit: [{ type: "leave_orbit", equipment: "e1" }],
    take_fuel: [{ type: "take_fuel", equipment: "e1" }],
    load_fuel: [{ type: "load_fuel", equipment: "e1" }],
    unload_fuel: [{ type: "unload_fuel", equipment: "e1" }],
    return_fuel: [{ type: "return_fuel", equipment: "e1" }],
    take_oxygen: [{ type: "take_oxygen", equipment: "e1" }],
    return_oxygen: [{ type: "return_oxygen", equipment: "e1" }],
    check_combustion: [{ type: "check_combustion", equipment: "e1" }],
    contact_sol: [{ type: "contact_sol", equipment: "e1" }],
    decode_rebel: [{ type: "decode_rebel", equipment: "e1", base: "b1" }],
    contact_xyloph: [{ type: "contact_xyloph", equipment: "e1" }],
    update_neron: [{ type: "update_neron", equipment: "e1" }],
    contact_signal: [{ type: "contact_signal", equipment: "e1", signal: "s1" }],
    close_deal: [
      { type: "close_deal", equipment: "e1", signal: "s1", deal: 0 },
      { type: "close_deal", equipment: "e1", signal: "s1", deal: 1, projects: ["PLASMA_SHIELD", "FIRE_SENSOR"] },
    ],
    refuse_signal: [{ type: "refuse_signal", equipment: "e1", signal: "s1" }],
    set_bios: [
      { type: "set_bios", equipment: "e1", option: BIOS_OPTIONS[0]!, value: true },
      { type: "set_bios", equipment: "e1", option: "cpu_priority", value: "projects" },
      { type: "set_bios", equipment: "e1", option: "crew_lock", value: "research" },
    ],
    scan_planet: [{ type: "scan_planet", equipment: "e1" }],
    analyze_planet: [{ type: "analyze_planet", equipment: "e1", planet: "pl1" }],
    delete_planet: [{ type: "delete_planet", equipment: "e1", planet: "pl1" }],
    turret_attack: [{ type: "turret_attack", equipment: "e1", hunter: "h1" }],
    patrol_attack: [{ type: "patrol_attack", equipment: "e1", hunter: "h1" }],
    repair_hull: [{ type: "repair_hull", item: "i1" }],
    repair: [{ type: "repair", equipment: "e1" }, { type: "repair", door: "BRIDGE|CORRIDOR_FRONT" }],
    extinguish: [{ type: "extinguish", item: "i1" }],
    ignite: [{ type: "ignite" }],
    u_turn: [{ type: "u_turn" }],
    sabotage_expedition: [{ type: "sabotage_expedition" }],
    sabotage_door: [{ type: "sabotage_door", door: "BRIDGE|CORRIDOR_FRONT" }],
    extinguish_manually: [{ type: "extinguish_manually" }],
    takeoff: [{ type: "takeoff", equipment: "e1" }],
    board_icarus: [{ type: "board_icarus", equipment: "e1" }],
    leave_icarus: [{ type: "leave_icarus" }],
    icarus_takeoff: [{ type: "icarus_takeoff" }],
    land_on_planet: [{ type: "land_on_planet", equipment: "e1" }],
    land: [{ type: "land", equipment: "e1" }],
    collect_scrap: [{ type: "collect_scrap", equipment: "e1" }],
    renovate: [{ type: "renovate", equipment: "e1" }],
    open_capsule: [{ type: "open_capsule", item: "i1" }],
    open_lunchbox: [{ type: "open_lunchbox", item: "i1" }],
    dispense: [{ type: "dispense", equipment: "e1" }],
    play_arcade: [{ type: "play_arcade", equipment: "SPACESHIP_BAY_AA:DYNARCADE" }],
    listen_jukebox: [{ type: "listen_jukebox", equipment: "REFECTORY:BEAT_BOX" }],
    check_jukebox: [{ type: "check_jukebox", equipment: "REFECTORY:BEAT_BOX" }],
    consume: [{ type: "consume", item: "i1" }],
    hide: [{ type: "hide", item: "i1" }],
    search: [{ type: "search" }],
    snoop: [{ type: "snoop" }],
    check_spores: [{ type: "check_spores", equipment: "LABORATORY:MYCOSCAN" }],
    dispense_drug: [{ type: "dispense_drug", equipment: "SICK_BAY:DRUG_DISP", drug: "drug_0" }],
    cook: [{ type: "cook", item: "i1" }],
    express_cook: [{ type: "express_cook", item: "i1" }],
    hyperfreeze: [{ type: "hyperfreeze", item: "i1" }],
    water: [{ type: "water", item: "i1" }],
    treat: [{ type: "treat", item: "i1" }],
    sow: [{ type: "sow", item: "i1" }],
    graft: [{ type: "graft", item: "i1", fruit: "i2" }],
    build: [{ type: "build", item: "i1" }],
    jettison: [{ type: "jettison", item: "i1" }],
    install: [{ type: "install", item: "i1" }],
    uninstall: [{ type: "uninstall", equipment: "e1" }],
    examine: [{ type: "examine", target: { kind: "equipment", id: "e1" } }, { type: "examine", target: { kind: "item", id: "i1" } }],
    bond: [{ type: "bond", target: "p1" }],
    dtt: [{ type: "dtt", target: "p1" }],
    stt: [{ type: "stt", target: "p1" }],
    extract_spore: [{ type: "extract_spore" }],
    spike: [{ type: "spike", target: "p1" }],
    tube_transfer: [{ type: "tube_transfer", item: "i1" }],
    consume_spore: [{ type: "consume_spore" }],
    fungal_cuisine: [{ type: "fungal_cuisine", item: "i1" }],
    body_transfer: [{ type: "body_transfer", target: "p1" }],
    reset_skills: [{ type: "reset_skills" }],
    mass_mouldering: [{ type: "mass_mouldering" }],
    demoralize: [{ type: "demoralize", target: "p1" }],
    give_disease: [{ type: "give_disease", target: "p1" }],
    trap_room: [{ type: "trap_room" }],
    grow_fairy_ring: [{ type: "grow_fairy_ring" }],
    tap_fairy_ring: [{ type: "tap_fairy_ring" }],
    nightmare: [{ type: "nightmare", target: "p1" }],
    lie_down: [{ type: "lie_down", equipment: "e1" }],
    report_fire: [{ type: "report_fire" }],
    report_equipment: [{ type: "report_equipment", equipment: "e1" }],
    report_door: [{ type: "report_door", door: "BRIDGE|FRONT_CORRIDOR" }],
    get_up: [{ type: "get_up" }],
    guard: [{ type: "guard" }],
    stop_guarding: [{ type: "stop_guarding" }],
    enter_nimble: [{ type: "enter_nimble" }],
    exit_nimble: [{ type: "exit_nimble" }],
    become_ninja: [{ type: "become_ninja" }],
    delog: [{ type: "delog" }],
    radio_piracy: [{ type: "radio_piracy", equipment: "e1", target: "p1" }],
    radio_piracy_room: [{ type: "radio_piracy_room", target: "p1" }],
    factory_reset: [{ type: "factory_reset", item: "i1" }],
    become_normal: [{ type: "become_normal" }],
    accommodate: [{ type: "accommodate", target: "p1" }],
    accept_accommodation: [{ type: "accept_accommodation", target: "p1" }],
    stop_accommodation: [{ type: "stop_accommodation", target: "p1" }],
    shower: [{ type: "shower", equipment: "e1" }],
    heal: [{ type: "heal", target: "p1" }],
    surgery: [{ type: "surgery", target: "p1" }],
    use_bandage: [{ type: "use_bandage", target: "p1" }],
    remove_spore: [{ type: "remove_spore", item: "sucker" }],
    vaccinate: [{ type: "vaccinate", target: "p1" }],
    punch: [{ type: "punch", target: "p1" }],
    throw_out: [{ type: "throw_out", target: "p1", to: "CORRIDOR_1" }],
    interrogate: [{ type: "interrogate", target: "p1" }],
    chitchat: [{ type: "chitchat", target: "p1" }],
    premonition: [{ type: "premonition", subject: "p1" }],
    comfort: [{ type: "comfort", target: "p1" }],
    anathema: [{ type: "anathema", target: "p1" }],
    protect: [{ type: "protect", target: "p1" }],
    coup: [{ type: "coup", equipment: "NEXUS_ROOM:NERON_CORE" }],
    issue_mission: [{ type: "issue_mission", subordinate: "p1" }],
    fiery_speech: [{ type: "fiery_speech" }],
    boring_speech: [{ type: "boring_speech" }],
    attack: [{ type: "attack", weapon: "i1", target: "p1" }, { type: "attack", weapon: "i1" }],
    pick_skill: [{ type: "pick_skill", skill: SKILLS[0] }, { type: "pick_skill", skill: MUSH_SKILLS[0] }],
    become_genius: [{ type: "become_genius" }],
    ceasefire: [{ type: "ceasefire" }],
    apprenticeship: [{ type: "apprenticeship", target: "p1", skill: SKILLS[0] }],
    read_book: [{ type: "read_book", item: "i1" }],
    tear: [{ type: "tear", item: "i1" }],
    print_list: [{ type: "print_list", item: "i1" }],
    caress: [{ type: "caress", item: "i1" }],
    mush_caress: [{ type: "mush_caress", item: "i1" }],
  };
  const all = Object.values(SAMPLES).flat();
  const asAction = (action: unknown) => parse({ type: "action", action });

  it.each(all.map((a) => [a.type, a] as const))("parses %s back to itself", (_type, action) => {
    expect(asAction(action)).toEqual({ type: "action", action });
  });

  it("strips fields the action doesn't have, at every level", () => {
    for (const action of all) {
      const extra = { ...action, extra: 1, __proto__: { polluted: 1 }, ...("target" in action && typeof action.target === "object" ? { target: { ...action.target, extra: 1 } } : {}) };
      const parsed = asAction(extra);
      expect(parsed).toEqual({ type: "action", action });
      expect(JSON.stringify(parsed)).toBe(JSON.stringify({ type: "action", action }));
    }
  });

  it("refuses unknown types, prototype keys, and missing or wrongly typed fields", () => {
    for (const type of ["nope", "constructor", "toString", "__proto__", "hasOwnProperty", 3, null]) expect(asAction({ type })).toBeNull();
    expect(asAction(["ready"])).toBeNull();
    for (const action of all) {
      for (const key of Object.keys(action).filter((k) => k !== "type")) {
        // Dismantle and reinforce take either field, so it still parses with one of them gone.
        if (action.type === "dismantle" || action.type === "reinforce") continue;
        const { [key]: _dropped, ...missing } = action as Record<string, unknown>;
        // A deal's project pick is only there for a deal that takes projects (TECHNO_REWRITE).
        const optional = (action.type === "attack" && key === "target") || (action.type === "close_deal" && key === "projects");
        if (!optional) expect(asAction(missing), `${action.type} without ${key}`).toBeNull();
        // A plan's slot and a merchant deal are indexes: a number is their right type, so they get a wrong one.
        const wrong = key === "slot" || key === "deal" ? "7" : 7;
        expect(asAction({ ...action, [key]: wrong }), `${action.type} with a wrongly typed ${key}`).toBeNull();
      }
    }
    expect(asAction({ type: "dismantle" })).toBeNull();
    expect(asAction({ type: "reinforce" })).toBeNull();
    expect(asAction({ type: "turn_ship", equipment: "e1", side: "up" })).toBeNull();
    expect(asAction({ type: "set_bios", equipment: "e1", option: "nope", value: true })).toBeNull();
    expect(asAction({ type: "set_bios", equipment: "e1", option: BIOS_OPTIONS[0], value: "true" })).toBeNull();
    expect(asAction({ type: "pick_skill", skill: "nope" })).toBeNull();
    for (const slot of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) expect(asAction({ type: "claim_slot", plan: "plan-1", slot })).toBeNull();
    expect(asAction({ type: "examine", target: { kind: "player", id: "p1" } })).toBeNull();
    expect(asAction({ type: "examine", target: { kind: "room", id: "bridge" } })).toBeNull();
    expect(asAction({ type: "examine", target: "p1" })).toBeNull();
    expect(asAction({ type: "close_deal", equipment: "e1", signal: "s1", deal: 0, projects: ["A", 3] })).toBeNull();
    expect(asAction({ type: "close_deal", equipment: "e1", signal: "s1", deal: 0, projects: Array.from({ length: 9 }, () => "A") })).toBeNull();
  });
});

describe("postPlan (channel plans)", () => {
  const plan = {
    channel: "pc-1",
    room: "REFECTORY",
    purpose: "meal",
    slots: [
      { kind: "onCall" },
      { kind: "onCall", reservedFor: "p2" },
      { kind: "task", task: { type: "heal", target: "p1" } },
      { kind: "task", task: { type: "research", research: "x" }, reservedFor: "p3" },
      { kind: "task", task: { type: "project", project: "y" } },
      { kind: "task", task: { type: "bring", itemType: "medikit" } },
      { kind: "task", task: { type: "fiery_speech" } },
    ],
  };

  it("parses a draft as sent", () => {
    expect(parse({ type: "postPlan", plan })).toEqual({ type: "postPlan", plan });
  });

  it("rebuilds it with known keys only, at every level", () => {
    const extra = {
      type: "postPlan",
      by: "p9",
      plan: {
        ...plan,
        author: "p9",
        status: "called",
        slots: [
          { kind: "onCall", holder: "p9", outcome: "arrived" },
          { kind: "task", task: { type: "fiery_speech", target: "p1" }, done: true, holder: "p9", struck: "already_done" },
          { kind: "task", task: { type: "heal", target: "p1", research: "x", note: "hi" } },
        ],
      },
    };
    expect(parse(extra)).toEqual({
      type: "postPlan",
      plan: {
        channel: "pc-1",
        room: "REFECTORY",
        purpose: "meal",
        slots: [{ kind: "onCall" }, { kind: "task", task: { type: "fiery_speech" } }, { kind: "task", task: { type: "heal", target: "p1" } }],
      },
    });
  });

  it("refuses malformed drafts", () => {
    const bad = (p: unknown) => expect(parse({ type: "postPlan", plan: p }), JSON.stringify(p)).toBeNull();
    bad(undefined);
    bad([]);
    bad({ ...plan, channel: "global" });
    bad({ ...plan, channel: "mush" });
    bad({ ...plan, room: 3 });
    bad({ ...plan, room: "" });
    bad({ ...plan, room: "R".repeat(65) });
    bad({ ...plan, purpose: "party" });
    bad({ ...plan, purpose: "constructor" });
    bad({ ...plan, slots: "onCall" });
    bad({ ...plan, slots: Array.from({ length: 65 }, () => ({ kind: "onCall" })) });
    bad({ ...plan, slots: [null] });
    bad({ ...plan, slots: [{ kind: "relay" }] });
    bad({ ...plan, slots: [{ kind: "onCall", reservedFor: 4 }] });
    bad({ ...plan, slots: [{ kind: "onCall", reservedFor: "" }] });
    bad({ ...plan, slots: [{ kind: "task" }] });
    bad({ ...plan, slots: [{ kind: "task", task: { type: "execute", action: "move" } }] });
    bad({ ...plan, slots: [{ kind: "task", task: { type: "heal" } }] });
    bad({ ...plan, slots: [{ kind: "task", task: { type: "research", research: { id: "x" } } }] });
    bad({ ...plan, slots: [{ kind: "task", task: { type: "bring", itemType: "x".repeat(65) } }] });
    bad({ ...plan, slots: [{ kind: "task", task: { type: "toString" } }] });
  });
});
