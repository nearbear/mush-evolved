// Formats test failures from Vitest's JSON reporter for `npm run verify` so
// passing tests and workspaces never drown out or truncate real failures.

import type { VitestReport } from "./slowTests.ts";

/** Strip ANSI escape codes that Vitest sometimes embeds in failure messages. */
export function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}

/**
 * Format only the failed files and assertions from a single workspace's Vitest
 * JSON report. Returns null if the report contains no recorded failures (e.g.
 * an unhandled error or worker crash that exited non-zero without failing a
 * test), signaling the caller to fall back to raw output.
 */
export function formatTestFailures(workspace: string, report: VitestReport, root: string): string | null {
  const blocks: string[] = [];
  for (const file of report.testResults) {
    const path = relative(file.name, root);
    const failedAssertions = file.assertionResults.filter((a) => a.status === "failed");
    if (failedAssertions.length > 0) {
      for (const test of failedAssertions) {
        const header = `FAIL  [${workspace}] ${path} > ${test.fullName}`;
        const details = (test.failureMessages ?? [])
          .map((m) => stripAnsi(m).trim())
          .filter(Boolean)
          .join("\n");
        blocks.push(details ? `${header}\n${details}` : header);
      }
    } else if (file.status === "failed") {
      const header = `FAIL  [${workspace}] ${path}`;
      const details = file.message ? stripAnsi(file.message).trim() : "";
      blocks.push(details ? `${header}\n${details}` : header);
    }
  }
  return blocks.length > 0 ? blocks.join("\n\n") : null;
}

function relative(name: string, root: string): string {
  const prefix = root.endsWith("/") ? root : `${root}/`;
  return name.startsWith(prefix) ? name.slice(prefix.length) : name;
}
