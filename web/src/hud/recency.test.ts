import { describe, expect, it } from "vitest";
import { recency } from "./recency.ts";

const S = 1000;
const MIN = 60 * S;
const H = 60 * MIN;
const D = 24 * H;

describe("recency", () => {
  it("says under a minute for anything less than 60 seconds", () => {
    expect(recency(0, 0)).toEqual({ key: "lessThanMinute" });
    expect(recency(0, 59 * S)).toEqual({ key: "lessThanMinute" });
  });
  it("counts whole minutes under an hour", () => {
    expect(recency(0, 60 * S)).toEqual({ key: "minutes", count: 1 });
    expect(recency(0, 47 * MIN + 30 * S)).toEqual({ key: "minutes", count: 47 });
    expect(recency(0, H - 1)).toEqual({ key: "minutes", count: 59 });
  });
  it("counts whole hours under a day", () => {
    expect(recency(0, H)).toEqual({ key: "hours", count: 1 });
    expect(recency(0, 23 * H + 59 * MIN)).toEqual({ key: "hours", count: 23 });
  });
  it("gives days and hours from a day on, dropping zero hours", () => {
    expect(recency(0, D + 2 * H)).toEqual({ key: "daysHours", days: 1, hours: 2 });
    expect(recency(0, D + 59 * MIN)).toEqual({ key: "days", days: 1 });
    expect(recency(0, 3 * D)).toEqual({ key: "days", days: 3 });
  });
  it("treats a future timestamp as just now", () => {
    expect(recency(10 * MIN, 0)).toEqual({ key: "lessThanMinute" });
  });
});
