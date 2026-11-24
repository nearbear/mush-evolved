// Incremental test-cache logic for `npm run verify` (Gradle-style UP-TO-DATE inputs).
//
// Each workspace's test suite depends on:
//   1. `sourceHash` — content hash of all non-test source/config/helper files across the repo.
//   2. `docHash`    — content hash of tracked docs (only invalidates `tools/tests/docs/docPaths.test.ts`).
//   3. Per-file hashes of each `*.test.ts(x)` file in that workspace.
//
// When `sourceHash` matches the previous run, any test file that passed last time and whose
// own hash is unchanged is skipped; only previously failed, modified, or newly added test
// files run. Any change to `source` files (including shared test helpers like `support.ts`)
// invalidates every workspace and triggers a full run.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { VitestReport } from "./slowTests.ts";

export const CACHE_VERSION = 1;
export const DOC_PATHS_TEST = "tools/tests/docs/docPaths.test.ts";

export type FileKind =
  | { kind: "test"; workspace: string }
  | { kind: "doc" }
  | { kind: "source" }
  | { kind: "ignored" };

export interface RepoSnapshot {
  sourceHash: string;
  docHash: string;
  /** Workspace -> (repo-relative test path -> sha256 hex). */
  tests: Record<string, Record<string, string>>;
}

export interface WorkspaceCache {
  sourceHash: string;
  docHash: string;
  /** Repo-relative test path -> sha256 hex at the time it last passed. */
  passed: Record<string, string>;
  /** Repo-relative test paths that failed in the last run. */
  failed: string[];
}

export interface VerifyCache {
  version: number;
  workspaces: Record<string, WorkspaceCache>;
}

export type WorkspacePlan =
  | { mode: "full" }
  | { mode: "incremental"; files: string[]; cachedCount: number };

const TEST_RE = /^(shared|tools|web|server)\/.*\.test\.tsx?$/;
const IGNORED_RE = [
  /^docs\/scratchpad\//,
  /^docs\/process\/ai-workflow\.md$/,
  /^\.screenshots\//,
  /^reference\//,
  /^tools\/tests\/browser\//,
];
const DOC_RE = [
  /^docs\//,
  /^(CLAUDE|AGENTS|README)\.md$/,
  /^\.(claude|agents)\//,
  /^Mush\/.*\.md$/,
];

/** Classify a repo-relative path into how it affects `npm run verify`'s test step. */
export function classifyFile(relPath: string): FileKind {
  for (const re of IGNORED_RE) if (re.test(relPath)) return { kind: "ignored" };

  if (relPath.startsWith("Mush/")) {
    if (relPath.endsWith(".md")) return { kind: "doc" };
    if (relPath.startsWith("Mush/derived/") || relPath === "Mush/package.json") return { kind: "source" };
    return { kind: "ignored" };
  }

  const testMatch = TEST_RE.exec(relPath);
  if (testMatch) return { kind: "test", workspace: testMatch[1]! };

  for (const re of DOC_RE) if (re.test(relPath)) return { kind: "doc" };

  return { kind: "source" };
}

/** Decide whether a workspace needs a full run or only a subset of test files. */
export function planWorkspaceTests(
  workspace: string,
  snapshot: RepoSnapshot,
  cached: WorkspaceCache | undefined,
  forceFull: boolean,
): WorkspacePlan {
  if (forceFull || !cached || cached.sourceHash !== snapshot.sourceHash) {
    return { mode: "full" };
  }

  const currentTests = snapshot.tests[workspace] ?? {};
  const failedSet = new Set(cached.failed);
  const docsChanged = cached.docHash !== snapshot.docHash;
  const toRun: string[] = [];
  let cachedCount = 0;

  for (const [relPath, hash] of Object.entries(currentTests)) {
    const docInvalidated = docsChanged && relPath === DOC_PATHS_TEST;
    if (docInvalidated || failedSet.has(relPath) || cached.passed[relPath] !== hash) {
      toRun.push(relPath);
    } else {
      cachedCount++;
    }
  }

  return { mode: "incremental", files: toRun.sort(), cachedCount };
}

/**
 * Update a workspace's cache entry from a Vitest JSON report.
 * Returns `undefined` if the report is missing or invalid on a failing run (forcing a full
 * run next time instead of trusting partial results).
 */
export function mergeWorkspaceResult(
  workspace: string,
  snapshot: RepoSnapshot,
  previous: WorkspaceCache | undefined,
  plan: WorkspacePlan,
  report: VitestReport | null,
  root: string,
): WorkspaceCache | undefined {
  if (!report) return undefined;

  const currentTests = snapshot.tests[workspace] ?? {};
  const passed: Record<string, string> = {};
  const failed = new Set<string>();

  if (plan.mode === "incremental" && previous && previous.sourceHash === snapshot.sourceHash) {
    for (const [path, hash] of Object.entries(previous.passed)) {
      if (currentTests[path] === hash) passed[path] = hash;
    }
    for (const path of previous.failed) {
      if (path in currentTests) failed.add(path);
    }
  }

  for (const file of report.testResults) {
    const relPath = relativeToRoot(file.name, root);
    const hash = currentTests[relPath];
    if (!hash) continue;
    const fileFailed = file.status === "failed" || file.assertionResults.some((a) => a.status === "failed");
    if (fileFailed) {
      delete passed[relPath];
      failed.add(relPath);
    } else {
      failed.delete(relPath);
      passed[relPath] = hash;
    }
  }

  return {
    sourceHash: snapshot.sourceHash,
    docHash: snapshot.docHash,
    passed,
    failed: [...failed].sort(),
  };
}

/** Build a content-hash snapshot of the repo's tracked and untracked (non-ignored) files. */
export function snapshotRepo(root: string): RepoSnapshot {
  const out = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  const paths = out.split(/\r?\n/).filter(Boolean).sort();

  const sourceHasher = createHash("sha256");
  const docHasher = createHash("sha256");
  const tests: Record<string, Record<string, string>> = {};

  for (const relPath of paths) {
    const kind = classifyFile(relPath);
    if (kind.kind === "ignored") continue;

    const abs = join(root, relPath);
    if (!existsSync(abs)) continue;
    let content: Buffer;
    try {
      content = readFileSync(abs);
    } catch {
      continue;
    }

    if (kind.kind === "source") {
      sourceHasher.update(relPath).update("\0").update(content).update("\0");
    } else if (kind.kind === "doc") {
      docHasher.update(relPath).update("\0").update(content).update("\0");
    } else {
      const wsTests = (tests[kind.workspace] ??= {});
      wsTests[relPath] = createHash("sha256").update(content).digest("hex");
    }
  }

  return {
    sourceHash: sourceHasher.digest("hex"),
    docHash: docHasher.digest("hex"),
    tests,
  };
}

/** Per-worktree cache file path in the OS temp directory (isolated per checkout, never tracked). */
export function cachePathForRoot(root: string): string {
  const key = createHash("sha256").update(root).digest("hex").slice(0, 12);
  return join(tmpdir(), `mush2-verify-cache-${key}.json`);
}

export function loadVerifyCache(cachePath: string): VerifyCache {
  try {
    const raw = JSON.parse(readFileSync(cachePath, "utf8")) as Partial<VerifyCache>;
    if (raw.version === CACHE_VERSION && raw.workspaces && typeof raw.workspaces === "object") {
      return { version: CACHE_VERSION, workspaces: raw.workspaces };
    }
  } catch {
    // Missing or corrupt cache: start fresh.
  }
  return { version: CACHE_VERSION, workspaces: {} };
}

export function saveVerifyCache(cachePath: string, cache: VerifyCache): void {
  try {
    writeFileSync(cachePath, JSON.stringify(cache), "utf8");
  } catch {
    // Non-fatal: failing to persist cache only means the next run is full.
  }
}

function relativeToRoot(name: string, root: string): string {
  const prefix = root.endsWith("/") ? root : `${root}/`;
  return name.startsWith(prefix) ? name.slice(prefix.length) : name;
}
