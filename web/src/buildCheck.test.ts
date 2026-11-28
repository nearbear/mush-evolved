import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildWatcher, GRACE_MS, isOutdated } from "./buildCheck.ts";

describe("isOutdated", () => {
  it("is true when the server runs another build", () => {
    expect(isOutdated("bbb", "aaa")).toBe(true);
  });
  it("is false for the same build", () => {
    expect(isOutdated("aaa", "aaa")).toBe(false);
  });
  it("ignores dev on either side", () => {
    expect(isOutdated("dev", "aaa")).toBe(false);
    expect(isOutdated("aaa", "dev")).toBe(false);
  });
});

describe("buildWatcher", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("notifies once a mismatch has gone unanswered for the grace period", () => {
    const notify = vi.fn();
    const onBuild = buildWatcher("aaa", notify);
    onBuild("old");
    vi.advanceTimersByTime(GRACE_MS - 1);
    expect(notify).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(notify).toHaveBeenCalledOnce();
  });
  it("calls the notice off when a matching build arrives in time", () => {
    const notify = vi.fn();
    const onBuild = buildWatcher("aaa", notify);
    onBuild("old");
    vi.advanceTimersByTime(GRACE_MS / 2);
    onBuild("aaa");
    vi.advanceTimersByTime(GRACE_MS * 2);
    expect(notify).not.toHaveBeenCalled();
  });
  it("doesn't restart the wait on repeated mismatches, and notifies only once", () => {
    const notify = vi.fn();
    const onBuild = buildWatcher("aaa", notify);
    onBuild("old");
    vi.advanceTimersByTime(GRACE_MS - 1);
    onBuild("old");
    vi.advanceTimersByTime(1);
    onBuild("old");
    vi.advanceTimersByTime(GRACE_MS * 2);
    expect(notify).toHaveBeenCalledOnce();
  });
  it("never notifies for dev or a matching build", () => {
    const notify = vi.fn();
    const onBuild = buildWatcher("aaa", notify);
    onBuild("dev");
    onBuild("aaa");
    vi.advanceTimersByTime(GRACE_MS * 2);
    expect(notify).not.toHaveBeenCalled();
  });
});
