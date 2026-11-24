import { describe, expect, it } from "vitest";
import type { VitestReport } from "../../src/dev/slowTests.ts";
import {
  classifyFile,
  DOC_PATHS_TEST,
  mergeWorkspaceResult,
  planWorkspaceTests,
  type RepoSnapshot,
  type WorkspaceCache,
} from "../../src/dev/verifyCache.ts";

const ROOT = "/repo";

function snap(overrides: Partial<RepoSnapshot> = {}): RepoSnapshot {
  return {
    sourceHash: "src-1",
    docHash: "doc-1",
    tests: {
      shared: {
        "shared/tests/a.test.ts": "ha-1",
        "shared/tests/b.test.ts": "hb-1",
      },
      tools: {
        [DOC_PATHS_TEST]: "hd-1",
        "tools/tests/dev/verifyCache.test.ts": "hv-1",
      },
    },
    ...overrides,
  };
}

function report(entries: { path: string; ok: boolean }[]): VitestReport {
  return {
    testResults: entries.map(({ path, ok }) => ({
      name: `${ROOT}/${path}`,
      status: ok ? "passed" : "failed",
      assertionResults: [{ fullName: "case", status: ok ? "passed" : "failed" }],
    })),
  };
}

describe("verifyCache: classifyFile", () => {
  it("classifies workspace test files, excluding browser tests", () => {
    expect(classifyFile("shared/tests/ship.test.ts")).toEqual({ kind: "test", workspace: "shared" });
    expect(classifyFile("web/src/tips.test.ts")).toEqual({ kind: "test", workspace: "web" });
    expect(classifyFile("web/tests/hud/App.test.tsx")).toEqual({ kind: "test", workspace: "web" });
    expect(classifyFile("server/tests/goals.test.ts")).toEqual({ kind: "test", workspace: "server" });
    expect(classifyFile("tools/tests/dev/slowTests.test.ts")).toEqual({ kind: "test", workspace: "tools" });
    expect(classifyFile("tools/tests/browser/smoke.test.ts")).toEqual({ kind: "ignored" });
  });

  it("treats non-test helpers, source files, configs, and derived assets as source", () => {
    expect(classifyFile("shared/src/ship.ts")).toEqual({ kind: "source" });
    expect(classifyFile("shared/tests/support.ts")).toEqual({ kind: "source" });
    expect(classifyFile("package.json")).toEqual({ kind: "source" });
    expect(classifyFile("Mush/derived/ship-map.json")).toEqual({ kind: "source" });
    expect(classifyFile("Mush/package.json")).toEqual({ kind: "source" });
  });

  it("treats docs as doc and workflow log, scratchpad, and raw Mush art as ignored", () => {
    expect(classifyFile("docs/rules/implemented-rules.md")).toEqual({ kind: "doc" });
    expect(classifyFile("CLAUDE.md")).toEqual({ kind: "doc" });
    expect(classifyFile("Mush/README.md")).toEqual({ kind: "doc" });
    expect(classifyFile("docs/process/ai-workflow.md")).toEqual({ kind: "ignored" });
    expect(classifyFile("docs/scratchpad/notes.txt")).toEqual({ kind: "ignored" });
    expect(classifyFile("Mush/img/foo.png")).toEqual({ kind: "ignored" });
    expect(classifyFile("reference/emush/foo.php")).toEqual({ kind: "ignored" });
  });
});

describe("verifyCache: planWorkspaceTests", () => {
  const baseCache: WorkspaceCache = {
    sourceHash: "src-1",
    docHash: "doc-1",
    passed: {
      "shared/tests/a.test.ts": "ha-1",
      "shared/tests/b.test.ts": "hb-1",
    },
    failed: [],
  };

  it("forces a full run when cache is missing, source changed, or forceFull is true", () => {
    expect(planWorkspaceTests("shared", snap(), undefined, false)).toEqual({ mode: "full" });
    expect(planWorkspaceTests("shared", snap({ sourceHash: "src-2" }), baseCache, false)).toEqual({ mode: "full" });
    expect(planWorkspaceTests("shared", snap(), baseCache, true)).toEqual({ mode: "full" });
  });

  it("skips all tests when nothing changed", () => {
    expect(planWorkspaceTests("shared", snap(), baseCache, false)).toEqual({
      mode: "incremental",
      files: [],
      cachedCount: 2,
    });
  });

  it("runs only changed, newly added, and previously failed test files", () => {
    const cacheWithFailure: WorkspaceCache = {
      ...baseCache,
      passed: { "shared/tests/a.test.ts": "ha-1" },
      failed: ["shared/tests/b.test.ts"],
    };
    const nextSnap = snap({
      tests: {
        shared: {
          "shared/tests/a.test.ts": "ha-2",
          "shared/tests/b.test.ts": "hb-1",
          "shared/tests/c.test.ts": "hc-1",
        },
      },
    });
    expect(planWorkspaceTests("shared", nextSnap, cacheWithFailure, false)).toEqual({
      mode: "incremental",
      files: ["shared/tests/a.test.ts", "shared/tests/b.test.ts", "shared/tests/c.test.ts"],
      cachedCount: 0,
    });
  });

  it("re-runs only docPaths.test.ts when docs change", () => {
    const toolsCache: WorkspaceCache = {
      sourceHash: "src-1",
      docHash: "doc-1",
      passed: {
        [DOC_PATHS_TEST]: "hd-1",
        "tools/tests/dev/verifyCache.test.ts": "hv-1",
      },
      failed: [],
    };
    expect(planWorkspaceTests("tools", snap({ docHash: "doc-2" }), toolsCache, false)).toEqual({
      mode: "incremental",
      files: [DOC_PATHS_TEST],
      cachedCount: 1,
    });
  });
});

describe("verifyCache: mergeWorkspaceResult", () => {
  it("records passing and failing files after a full run, then promotes fixed files after an incremental run", () => {
    const s1 = snap();
    const afterFull = mergeWorkspaceResult(
      "shared",
      s1,
      undefined,
      { mode: "full" },
      report([
        { path: "shared/tests/a.test.ts", ok: true },
        { path: "shared/tests/b.test.ts", ok: false },
      ]),
      ROOT,
    );
    expect(afterFull).toEqual({
      sourceHash: "src-1",
      docHash: "doc-1",
      passed: { "shared/tests/a.test.ts": "ha-1" },
      failed: ["shared/tests/b.test.ts"],
    });

    const s2 = snap({
      tests: {
        shared: {
          "shared/tests/a.test.ts": "ha-1",
          "shared/tests/b.test.ts": "hb-2",
        },
      },
    });
    const plan2 = planWorkspaceTests("shared", s2, afterFull, false);
    expect(plan2).toEqual({ mode: "incremental", files: ["shared/tests/b.test.ts"], cachedCount: 1 });

    const afterFix = mergeWorkspaceResult(
      "shared",
      s2,
      afterFull,
      plan2,
      report([{ path: "shared/tests/b.test.ts", ok: true }]),
      ROOT,
    );
    expect(afterFix).toEqual({
      sourceHash: "src-1",
      docHash: "doc-1",
      passed: {
        "shared/tests/a.test.ts": "ha-1",
        "shared/tests/b.test.ts": "hb-2",
      },
      failed: [],
    });
  });

  it("drops the workspace cache when the report is missing (e.g. worker crash)", () => {
    expect(mergeWorkspaceResult("shared", snap(), undefined, { mode: "full" }, null, ROOT)).toBeUndefined();
  });
});
