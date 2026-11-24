import { describe, expect, it } from "vitest";
import type { VitestReport } from "../../src/dev/slowTests.ts";
import { formatTestFailures } from "../../src/dev/testFailures.ts";

const ROOT = "/repo";

describe("formatTestFailures", () => {
  it("returns null when all files and assertions passed", () => {
    const report: VitestReport = {
      testResults: [
        {
          name: `${ROOT}/shared/tests/ok.test.ts`,
          status: "passed",
          assertionResults: [{ fullName: "works", status: "passed" }],
        },
      ],
    };
    expect(formatTestFailures("shared", report, ROOT)).toBeNull();
  });

  it("prints only failed assertions with repo-relative paths and strips ANSI codes", () => {
    const report: VitestReport = {
      testResults: [
        {
          name: `${ROOT}/shared/tests/pass.test.ts`,
          status: "passed",
          assertionResults: [{ fullName: "passes", status: "passed" }],
        },
        {
          name: `${ROOT}/shared/tests/fail.test.ts`,
          status: "failed",
          message: "duplicate file-level summary",
          assertionResults: [
            { fullName: "ok test", status: "passed" },
            {
              fullName: "broken test",
              status: "failed",
              failureMessages: ["\x1b[31mAssertionError: expected 1 to be 2\x1b[0m\n  at fail.test.ts:10"],
            },
          ],
        },
      ],
    };

    expect(formatTestFailures("shared", report, ROOT)).toBe(
      "FAIL  [shared] shared/tests/fail.test.ts > broken test\nAssertionError: expected 1 to be 2\n  at fail.test.ts:10",
    );
  });

  it("prints file-level errors when a suite fails without assertion results", () => {
    const report: VitestReport = {
      testResults: [
        {
          name: `${ROOT}/web/tests/syntax.test.ts`,
          status: "failed",
          message: "SyntaxError: Unexpected token",
          assertionResults: [],
        },
      ],
    };

    expect(formatTestFailures("web", report, ROOT)).toBe(
      "FAIL  [web] web/tests/syntax.test.ts\nSyntaxError: Unexpected token",
    );
  });
});
