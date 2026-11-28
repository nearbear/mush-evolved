// Room log read state (#513, logRead.ts): one point per seat, counted in its body's `logSeen`, raised only, clamped,
// reset when the body changes, and moved to the end while connected once nothing missed is unread.
import { describe, expect, it } from "vitest";
import { logReadFor, presentLogRead, raiseLogRead, type LogRead } from "../src/logRead.ts";

const body = { id: "p0", logSeen: 10 };

describe("logReadFor", () => {
  it("starts a seat with no record with nothing unread", () => {
    expect(logReadFor(undefined, body)).toEqual({ body: "p0", readUpTo: 10, live: 10 });
  });

  it("starts over when the record counted for another body (a Transfer)", () => {
    expect(logReadFor({ body: "p3", readUpTo: 2, live: 4 }, body)).toEqual({ body: "p0", readUpTo: 10, live: 10 });
  });

  it("clamps a stored record to the body's lines", () => {
    expect(logReadFor({ body: "p0", readUpTo: 50, live: 40 }, body)).toEqual({ body: "p0", readUpTo: 10, live: 10 });
    expect(logReadFor({ body: "p0", readUpTo: 3, live: 7 }, body)).toEqual({ body: "p0", readUpTo: 3, live: 7 });
  });
});

describe("raiseLogRead", () => {
  const record: LogRead = { body: "p0", readUpTo: 4, live: 6 };

  it("raises the point, clamped to the body's lines", () => {
    expect(raiseLogRead(record, body, 7)).toEqual({ body: "p0", readUpTo: 7, live: 6 });
    expect(raiseLogRead(record, body, 999)).toEqual({ body: "p0", readUpTo: 10, live: 6 });
  });

  it("never lowers it, and says when nothing rose", () => {
    expect(raiseLogRead(record, body, 4)).toBeNull();
    expect(raiseLogRead(record, body, 0)).toBeNull();
    expect(raiseLogRead({ ...record, readUpTo: 10 }, body, 999)).toBeNull();
  });
});

describe("presentLogRead (the presence gap)", () => {
  it("reads every live line once nothing missed before the connection is unread", () => {
    // Connected at 6 with everything before read: lines 6 to 9 arrived live.
    expect(presentLogRead({ body: "p0", readUpTo: 6, live: 6 }, body, 6)).toEqual({ body: "p0", readUpTo: 10, live: 10 });
  });

  it("keeps the missed lines unread, and the live ones after them wait for the reader", () => {
    // Offline from 3 to 6: lines 3 to 5 were missed.
    expect(presentLogRead({ body: "p0", readUpTo: 3, live: 3 }, body, 6)).toEqual({ body: "p0", readUpTo: 3, live: 10 });
  });
});
