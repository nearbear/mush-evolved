// `npm run verify`: typecheck, lint and the full test suite in one command,
// with quiet output. A passing step prints one line; a failing step prints its
// errors without truncation (for tests, only failed tests/files from Vitest's
// JSON report, falling back to that workspace's raw output if the report is
// missing or has no recorded failures). Exits non-zero if any step failed.
// Meant to be run once, at the end of a change, so an AI session spends one
// turn on checks instead of three and doesn't keep pages of passing output in
// its context.
//
// The test step runs each workspace on its own with Vitest's JSON reporter
// as well, and after a pass prints a `slow` line for every test or file over
// budget (`slowTests.ts`, #383). It warns and never fails: timings are noisy.

import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { slowLines, type VitestReport } from "./slowTests.ts";
import { formatTestFailures, stripAnsi } from "./testFailures.ts";

const ROOT = resolve(import.meta.dirname, "../../..");
const webOnly = process.argv.includes("--web");
/** The root `npm test` runs these, in this order. Kept sequential so timings aren't skewed by contention. */
const TEST_WORKSPACES = webOnly ? ["web"] : ["shared", "tools", "web", "server"];

const steps: [name: string, run: () => { ok: boolean; output: string; after?: string[] }][] = [
  ["typecheck", () => npm(["run", "typecheck"])],
  ["lint", () => npm(["run", "lint"])],
  ["test", runTests],
  ...(webOnly ? [["build", () => npm(["run", "build"])] as [string, () => { ok: boolean; output: string }]] : []),
];

let failed = 0;
for (const [name, run] of steps) {
  const started = Date.now();
  const { ok, output, after = [] } = run();
  const seconds = ((Date.now() - started) / 1000).toFixed(0);
  if (ok) {
    const summary = name === "test" ? testSummary(output) : "";
    console.log(`ok    ${name} (${seconds}s)${summary ? `: ${summary}` : ""}`);
    for (const line of after) console.log(line);
    continue;
  }
  failed++;
  console.log(`FAIL  ${name} (${seconds}s):`);
  console.log(output.trimEnd());
}
process.exit(failed ? 1 : 0);

function npm(args: string[]): { ok: boolean; output: string } {
  const run = spawnSync("npm", args, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1", npm_config_loglevel: "notice" } });
  // Vitest colours its output even with NO_COLOR, so strip the ANSI codes.
  return { ok: run.status === 0, output: stripAnsi(`${run.stdout ?? ""}${run.stderr ?? ""}`) };
}

/** Every workspace's tests, all run even after a failure; the slow report only after a full pass. */
function runTests(): { ok: boolean; output: string; after: string[] } {
  const dir = mkdtempSync(join(tmpdir(), "mush2-verify-"));
  try {
    let ok = true;
    let passedOutput = "";
    const failures: string[] = [];
    for (const ws of TEST_WORKSPACES) {
      const reportPath = join(dir, `${ws}.json`);
      const run = npm(["run", "test", "-w", ws, "--", "--reporter=default", "--reporter=json", `--outputFile=${reportPath}`]);
      if (run.ok) {
        passedOutput += run.output;
        continue;
      }
      ok = false;
      const formatted = readFailureReport(ws, reportPath);
      failures.push(formatted ?? `FAIL  [${ws}] (raw output):\n${run.output.trimEnd()}`);
    }
    if (!ok) return { ok, output: failures.join("\n\n"), after: [] };
    const reports = TEST_WORKSPACES.map((ws) => JSON.parse(readFileSync(join(dir, `${ws}.json`), "utf8")) as VitestReport);
    return { ok, output: passedOutput, after: slowLines(reports, ROOT) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function readFailureReport(ws: string, reportPath: string): string | null {
  try {
    const report = JSON.parse(readFileSync(reportPath, "utf8")) as VitestReport;
    return formatTestFailures(ws, report, ROOT);
  } catch {
    return null;
  }
}

/** Vitest's "Tests  N passed" lines, one per workspace, summed. */
function testSummary(output: string): string {
  let passed = 0;
  let files = 0;
  for (const m of output.matchAll(/^\s*Tests\s+(\d+) passed/gm)) passed += Number(m[1]);
  for (const m of output.matchAll(/^\s*Test Files\s+(\d+) passed/gm)) files += Number(m[1]);
  return passed ? `${passed} tests in ${files} files passed` : "";
}
