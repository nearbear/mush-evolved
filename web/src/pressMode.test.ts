import { beforeEach, describe, expect, it } from "vitest";
import { doublePressTipDue, HINT_AFTER_LAPSES, HINT_UNTIL_DONE, noteFired, noteLapse, resetDoublePressCount, setSinglePress } from "./pressMode.ts";

const lapse = (n: number) => {
  for (let i = 0; i < n; i++) noteLapse();
};

describe("double press tip", () => {
  beforeEach(() => {
    setSinglePress(false);
    resetDoublePressCount();
  });

  it("applies after enough lone presses in a row, and stays until an action fires", () => {
    lapse(HINT_AFTER_LAPSES - 1);
    expect(doublePressTipDue()).toBe(false);
    noteLapse();
    expect(doublePressTipDue()).toBe(true);
    noteLapse();
    expect(doublePressTipDue()).toBe(true);
    noteFired(true);
    expect(doublePressTipDue()).toBe(false);
  });

  it("any fired action resets the run, a single-press one too", () => {
    lapse(HINT_AFTER_LAPSES - 1);
    noteFired(false);
    lapse(HINT_AFTER_LAPSES - 1);
    expect(doublePressTipDue()).toBe(false);
  });

  it("stops once the player has done more than the threshold with a double press", () => {
    for (let i = 0; i < HINT_UNTIL_DONE; i++) noteFired(true);
    lapse(HINT_AFTER_LAPSES);
    expect(doublePressTipDue()).toBe(true);
    noteFired(true);
    lapse(HINT_AFTER_LAPSES * 2);
    expect(doublePressTipDue()).toBe(false);
  });

  it("single-press actions don't count toward knowing how", () => {
    for (let i = 0; i <= HINT_UNTIL_DONE; i++) noteFired(false);
    lapse(HINT_AFTER_LAPSES);
    expect(doublePressTipDue()).toBe(true);
  });

  it("resetting the count lets the tip teach again", () => {
    for (let i = 0; i <= HINT_UNTIL_DONE; i++) noteFired(true);
    lapse(HINT_AFTER_LAPSES);
    expect(doublePressTipDue()).toBe(false);
    resetDoublePressCount();
    lapse(HINT_AFTER_LAPSES);
    expect(doublePressTipDue()).toBe(true);
  });

  it("never applies with single press on, and turning it on clears it", () => {
    lapse(HINT_AFTER_LAPSES);
    setSinglePress(true);
    expect(doublePressTipDue()).toBe(false);
    lapse(HINT_AFTER_LAPSES * 2);
    expect(doublePressTipDue()).toBe(false);
  });
});
