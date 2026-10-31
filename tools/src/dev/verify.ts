// `npm run verify`: typecheck, lint and the full test suite in one command,
// with quiet output. A passing step prints one line; a failing step prints
// the tail of its output. Exits non-zero if any step failed. Meant to be run
// once, at the end of a change, so an AI session spends one turn on checks
// instead of three and doesn't keep pages of passing output in its context.

import { spawnSync } from "node:child_process";

const TAIL_LINES = 120;

const steps: [name: string, args: string[]][] = [
  ["typecheck", ["run", "typecheck"]],
  ["lint", ["run", "lint"]],
  ["test", ["test"]],
];

let failed = 0;
for (const [name, args] of steps) {
  const started = Date.now();
  const run = spawnSync("npm", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1", npm_config_loglevel: "notice" } });
  const seconds = ((Date.now() - started) / 1000).toFixed(0);
  // Vitest colours its output even with NO_COLOR, so strip the ANSI codes.
  const output = `${run.stdout ?? ""}${run.stderr ?? ""}`.replace(/\x1b\[[0-9;]*m/g, "");
  if (run.status === 0) {
    const summary = name === "test" ? testSummary(output) : "";
    console.log(`ok    ${name} (${seconds}s)${summary ? `: ${summary}` : ""}`);
    continue;
  }
  failed++;
  const lines = output.trimEnd().split("\n");
  console.log(`FAIL  ${name} (${seconds}s), last ${Math.min(TAIL_LINES, lines.length)} of ${lines.length} lines:`);
  console.log(lines.slice(-TAIL_LINES).join("\n"));
}
process.exit(failed ? 1 : 0);

/** Vitest's "Tests  N passed" lines, one per workspace, summed. */
function testSummary(output: string): string {
  let passed = 0;
  let files = 0;
  for (const m of output.matchAll(/^\s*Tests\s+(\d+) passed/gm)) passed += Number(m[1]);
  for (const m of output.matchAll(/^\s*Test Files\s+(\d+) passed/gm)) files += Number(m[1]);
  return passed ? `${passed} tests in ${files} files passed` : "";
}
