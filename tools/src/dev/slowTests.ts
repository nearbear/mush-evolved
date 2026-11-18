// The slow-test report `npm run verify` prints after a passing test step
// (#383). Pure: it reads Vitest's JSON reports (already parsed) and returns
// the lines to print. Budgets are in docs/process/testing.md, "Test cost".

/** A single test over this is slow. */
export const TEST_BUDGET_MS = 1000;
/** A file whose tests add up to more than this is slow. */
export const FILE_BUDGET_MS = 3000;

/**
 * Files already over budget when the check landed, each with its own
 * ceiling (about 1.5x its time on 2026-11-07), so the warning means "new or
 * slower". `file` caps the sum of the file's tests, `test` its slowest test;
 * a missing one means the normal budget. Shrink or drop an entry when a file
 * gets faster.
 */
export const SLOW_ALLOWED: Record<string, { file?: number; test?: number; why: string }> = {
  "shared/tests/replay.test.ts": { file: 18_000, test: 8_000, why: "replays whole random games step by step, on one seed (the rebuild and perspective checks only in npm run test:slow, #382)" },
  "server/tests/GameRoom.bots.test.ts": { file: 9_500, test: 2_000, why: "single player and model bots drive a real room with bots on fake timers" },
  "shared/tests/replayView.test.ts": { file: 7_000, test: 5_000, why: "one shared 4,000-step recorded 16-seat game" },
  "server/tests/goals.test.ts": { file: 5_000, test: 4_500, why: "long seeded GoalBot runs for every character" },
  "tools/tests/shipLayout/shipLayout.test.ts": { test: 1_600, why: "regenerates ship-art.json to check it is up to date" },
};

/** The parts of Vitest's JSON reporter output this reads. */
export interface VitestReport {
  testResults: { name: string; assertionResults: { fullName: string; duration?: number | null }[] }[];
}

/**
 * `slow` lines for tests and files over budget (or over their allowlist
 * entry), slowest first. File time is the sum of its tests' durations: it
 * leaves out import and transform time, which swings with the cache.
 */
export function slowLines(reports: VitestReport[], root: string): string[] {
  const found: { ms: number; text: string }[] = [];
  for (const report of reports) {
    for (const file of report.testResults) {
      const path = relative(file.name, root);
      const allowed = SLOW_ALLOWED[path];
      const fileLimit = allowed?.file ?? FILE_BUDGET_MS;
      const testLimit = allowed?.test ?? TEST_BUDGET_MS;
      let sum = 0;
      for (const test of file.assertionResults) {
        const ms = test.duration ?? 0;
        sum += ms;
        if (ms > testLimit) found.push({ ms, text: `${path} > ${test.fullName} ${seconds(ms)}${limitNote(allowed?.test)}` });
      }
      if (sum > fileLimit) found.push({ ms: sum, text: `${path} ${seconds(sum)}${limitNote(allowed?.file)}` });
    }
  }
  return found.sort((a, b) => b.ms - a.ms).map((f) => `slow  ${f.text}`);
}

function relative(name: string, root: string): string {
  const prefix = root.endsWith("/") ? root : `${root}/`;
  return name.startsWith(prefix) ? name.slice(prefix.length) : name;
}

function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

function limitNote(limit: number | undefined): string {
  return limit === undefined ? "" : ` (allowlisted up to ${seconds(limit)})`;
}
