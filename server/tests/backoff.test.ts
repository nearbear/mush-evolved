import { describe, expect, it } from "vitest";
import { Backoff } from "../src/backoff.ts";

describe("Backoff", () => {
  it("doubles the wait on each failure up to the max, and starts over after a success", () => {
    const b = new Backoff(1_000, 3_000);
    expect(b.dueAt).toBeNull();
    expect(b.due(0)).toBe(false);
    expect(b.fail(10)).toBe(1_000);
    expect(b.dueAt).toBe(1_010);
    expect(b.due(1_009)).toBe(false);
    expect(b.due(1_010)).toBe(true);
    expect(b.fail(0)).toBe(2_000);
    expect(b.fail(0)).toBe(3_000);
    expect(b.fail(0)).toBe(3_000);
    b.succeed();
    expect(b.dueAt).toBeNull();
    expect(b.fail(0)).toBe(1_000);
  });
});
