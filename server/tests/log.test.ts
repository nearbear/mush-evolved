import { afterEach, describe, expect, it, vi } from "vitest";
import { failure, failureName, logError, logWarn, snapshotFailure } from "../src/log.ts";

afterEach(() => vi.restoreAllMocks());

describe("log", () => {
  it("writes one JSON line with level and event", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    logWarn("tick_failed", { roomId: "abc", code: "game_over" });
    expect(warn).toHaveBeenCalledTimes(1);
    const [text] = warn.mock.calls[0] as [string];
    expect(text).not.toContain("\n");
    expect(JSON.parse(text)).toEqual({ level: "warn", event: "tick_failed", roomId: "abc", code: "game_over" });
  });

  it("logs errors at error level", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    logError("UNAVAILABLE", { roomId: "abc", storedVersion: 9, stateVersion: 8 });
    expect(JSON.parse(error.mock.calls[0]?.[0] as string)).toMatchObject({ level: "error", event: "UNAVAILABLE" });
  });

  it("replaces a code that isn't a bare rule code", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    logWarn("bot_action_illegal", { seat: "p1", code: "Alice is Mush" });
    expect(JSON.parse(warn.mock.calls[0]?.[0] as string).code).toBe("not_a_code");
  });

  it("keeps a normalizer's path but not the stored value after it", () => {
    const e = new Error('Player.role unknown: "mush"');
    e.name = "NormalizeError";
    expect(snapshotFailure(e)).toEqual({ errorName: "NormalizeError", message: "Player.role unknown" });
  });

  it("gives an infrastructure error's message, and only the name where the message could carry a request", () => {
    expect(failure(new TypeError("D1 down"))).toEqual({ errorName: "TypeError", message: "D1 down" });
    expect(failureName(new TypeError("prompt text"))).toEqual({ errorName: "TypeError" });
  });
});
