// Docs are referenced by repo-rooted path (`docs/plans/patrol.md`) from CLAUDE.md files, skills, code comments, tests
// and other docs, mostly inside backticks rather than as Markdown links, so ordinary link checkers miss them. This
// finds every such path in the tracked files and fails if it doesn't exist, so a moved or renamed doc can't leave
// stale pointers behind. It also checks relative Markdown links between docs.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "../../..");

/** Not maintained: notes and drafts, and an append-only log whose old entries keep the paths they had at the time. */
const SKIPPED = [/^docs\/scratchpad\//, /^docs\/process\/ai-workflow\.md$/];
const TEXT = /\.(md|ts|tsx|js|mjs|cjs|json|jsonc|css|html|toml|ya?ml|txt|sql)$/;

/** Tracked text files to scan. Under `Mush/` only Markdown: the rest is game data that never names a doc. */
function scannedFiles(): string[] {
  const out = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { cwd: ROOT, encoding: "utf8" });
  return out
    .split("\n")
    .filter((f) => f !== "" && TEXT.test(f))
    .filter((f) => !f.startsWith("Mush/") || f.endsWith(".md"))
    .filter((f) => !SKIPPED.some((re) => re.test(f)))
    .filter((f) => existsSync(resolve(ROOT, f)));
}

interface Broken {
  where: string;
  target: string;
}

/** `docs/<path>.md` paths anywhere in a file, anchors stripped. Not after a word character or `/`, so `foo/docs/x.md` is skipped. */
function rootedPaths(text: string): { line: number; target: string }[] {
  const found: { line: number; target: string }[] = [];
  text.split("\n").forEach((line, i) => {
    for (const m of line.matchAll(/(?<![\w/-])(?:\.\/)?(docs\/[\w./-]*?\.md)(?![\w-])/g)) found.push({ line: i + 1, target: m[1]! });
  });
  return found;
}

/** Relative Markdown link targets (`[text](../x.md#anchor)`) in a Markdown file; URLs and pure anchors are skipped. */
function relativeLinks(text: string): { line: number; target: string }[] {
  const found: { line: number; target: string }[] = [];
  text.split("\n").forEach((line, i) => {
    for (const m of line.matchAll(/\]\(([^)\s#]+?\.md)(?:#[^)]*)?\)/g)) {
      if (!/^[a-z]+:/i.test(m[1]!)) found.push({ line: i + 1, target: m[1]! });
    }
  });
  return found;
}

describe("doc paths", () => {
  const files = scannedFiles();

  it("scans the repo", () => {
    expect(files).toContain("CLAUDE.md");
    expect(files.length).toBeGreaterThan(100);
  });

  it("every docs/<path>.md path names an existing file", () => {
    const broken: Broken[] = [];
    for (const f of files) {
      for (const { line, target } of rootedPaths(readFileSync(resolve(ROOT, f), "utf8"))) {
        if (!existsSync(resolve(ROOT, target))) broken.push({ where: `${f}:${line}`, target });
      }
    }
    expect(broken).toEqual([]);
  });

  it("every relative Markdown link in docs resolves", () => {
    const broken: Broken[] = [];
    for (const f of files.filter((f) => f.startsWith("docs/") && f.endsWith(".md"))) {
      for (const { line, target } of relativeLinks(readFileSync(resolve(ROOT, f), "utf8"))) {
        if (!existsSync(resolve(ROOT, dirname(f), target))) broken.push({ where: `${f}:${line}`, target });
      }
    }
    expect(broken).toEqual([]);
  });
});
