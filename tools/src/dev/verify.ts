// `npm run verify`: typecheck, lint and the full test suite in one command,
// with quiet output. A passing step prints one line; a failing step prints
// the tail of its output. Exits non-zero if any step failed. Meant to be run
// once, at the end of a change, so an AI session spends one turn on checks
// instead of three and doesn't keep pages of passing output in its context.
//
// The test step runs each workspace on its own with Vitest's JSON reporter
// as well, and after a pass prints a `slow` line for every test or file over
// budget (`slowTests.ts`, #383). It warns and never fails: timings are noisy.

import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { slowLines, type VitestReport } from "./slowTests.ts";

const TAIL_LINES = 120;
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
  const lines = output.trimEnd().split("\n");
  console.log(`FAIL  ${name} (${seconds}s), last ${Math.min(TAIL_LINES, lines.length)} of ${lines.length} lines:`);
  console.log(lines.slice(-TAIL_LINES).join("\n"));
}
process.exit(failed ? 1 : 0);

function npm(args: string[]): { ok: boolean; output: string } {
  const run = spawnSync("npm", args, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1", npm_config_loglevel: "notice" } });
  // Vitest colours its output even with NO_COLOR, so strip the ANSI codes.
  return { ok: run.status === 0, output: `${run.stdout ?? ""}${run.stderr ?? ""}`.replace(/\x1b\[[0-9;]*m/g, "") };
}

/** Every workspace's tests, all run even after a failure; the slow report only after a full pass. */
function runTests(): { ok: boolean; output: string; after: string[] } {
  const dir = mkdtempSync(join(tmpdir(), "mush2-verify-"));
  try {
    let ok = true;
    let output = "";
    for (const ws of TEST_WORKSPACES) {
      const run = npm(["run", "test", "-w", ws, "--", "--reporter=default", "--reporter=json", `--outputFile=${join(dir, `${ws}.json`)}`]);
      ok &&= run.ok;
      output += run.output;
    }
    if (!ok) return { ok, output, after: [] };
    const reports = TEST_WORKSPACES.map((ws) => JSON.parse(readFileSync(join(dir, `${ws}.json`), "utf8")) as VitestReport);
    return { ok, output, after: slowLines(reports, ROOT) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
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
