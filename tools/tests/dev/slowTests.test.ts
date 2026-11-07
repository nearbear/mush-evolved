import { describe, expect, it } from "vitest";
import { FILE_BUDGET_MS, SLOW_ALLOWED, slowLines, TEST_BUDGET_MS, type VitestReport } from "../../src/dev/slowTests.ts";

const ROOT = "/repo";
const report = (files: Record<string, number[]>): VitestReport => ({
  testResults: Object.entries(files).map(([name, ms]) => ({
    name: `${ROOT}/${name}`,
    assertionResults: ms.map((duration, i) => ({ fullName: `t${i}`, duration })),
  })),
});

describe("slow-test report (#383)", () => {
  it("is empty when every test and file is inside its budget", () => {
    expect(slowLines([report({ "a/x.test.ts": [TEST_BUDGET_MS, TEST_BUDGET_MS, FILE_BUDGET_MS - 2 * TEST_BUDGET_MS] })], ROOT)).toEqual([]);
  });

  it("names a slow test and a slow file, slowest first, by repo-relative path", () => {
    const lines = slowLines([report({ "a/x.test.ts": [1800, 900, 900] }), report({ "b/y.test.ts": [500, 4100] })], ROOT);
    expect(lines).toEqual(["slow  b/y.test.ts 4.6s", "slow  b/y.test.ts > t1 4.1s", "slow  a/x.test.ts 3.6s", "slow  a/x.test.ts > t0 1.8s"]);
  });

  it("counts a test with no duration (skipped) as zero", () => {
    const r: VitestReport = { testResults: [{ name: `${ROOT}/a.test.ts`, assertionResults: [{ fullName: "s", duration: null }, { fullName: "t" }] }] };
    expect(slowLines([r], ROOT)).toEqual([]);
  });

  it("holds an allowlisted file to its own entry, and still warns when it grows past it", () => {
    const [path, entry] = Object.entries(SLOW_ALLOWED).find(([, e]) => e.file !== undefined && e.test !== undefined) ?? [];
    if (!path || !entry?.file || !entry.test) throw new Error("no entry with both limits");
    // Tests of exactly the entry's test limit, adding up to exactly its file limit.
    const atLimit = Array.from({ length: Math.floor(entry.file / entry.test) }, () => entry.test as number);
    atLimit.push(entry.file - entry.test * atLimit.length);
    expect(slowLines([report({ [path]: atLimit })], ROOT)).toEqual([]);
    const lines = slowLines([report({ [path]: [...atLimit, entry.test + 1] })], ROOT);
    expect(lines).toHaveLength(2);
    expect(lines.every((l) => l.includes("allowlisted up to"))).toBe(true);
  });

  it("uses the normal budget for whichever limit an entry leaves out", () => {
    const [path] = Object.entries(SLOW_ALLOWED).find(([, e]) => e.file === undefined) ?? [];
    if (!path) throw new Error("no entry without a file limit");
    expect(slowLines([report({ [path]: [900, 900, 900, 900] })], ROOT)).toEqual([`slow  ${path} 3.6s`]);
  });
});
