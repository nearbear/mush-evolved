// `cloneState` and `fullViewFor` share `state.config` by reference, and `DEFAULT_CONFIG` is deep-frozen.
// This scans `shared/src/**` for writes through `.config`, type-cast bypasses, and regressions back to `clone(state)`.

import { readFileSync, readdirSync } from "node:fs";
import { relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SHARED = resolve(import.meta.dirname, "../../shared/src");

/** Files allowed to write `.config` (on cloned historical frames before `normalizeFullView` re-resolves config). */
const CONFIG_WRITE_ALLOWED = new Set(["normalizeState.ts"]);

const CONFIG_WRITE_PATTERNS = [
  /\.config(?:\.[A-Za-z0-9_$]+|\[[^\]]+\])*\s*(?:[-+*/%&|^]?=(?![=>])|\+\+|--)/,
  /\.config(?:\.[A-Za-z0-9_$]+|\[[^\]]+\])*\.(?:push|pop|shift|unshift|splice|sort|reverse|fill|set|delete|add|clear)\(/,
  /Object\.assign\(\s*[^,]*\.config\b/,
  /\.config\b[^\n]*\bas\s+unknown\s+as\b/,
];

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = resolve(dir, e.name);
    if (e.isDirectory()) return sources(path);
    return e.name.endsWith(".ts") && !e.name.endsWith(".test.ts") ? [path] : [];
  });
}

describe("config aliasing guards", () => {
  it("never writes through .config or casts .config via `as unknown as` in shared/src", () => {
    const offenders = sources(SHARED).flatMap((file) => {
      const name = relative(SHARED, file).replaceAll("\\", "/");
      if (CONFIG_WRITE_ALLOWED.has(name)) return [];
      return readFileSync(file, "utf8")
        .split("\n")
        .flatMap((line, i) => (CONFIG_WRITE_PATTERNS.some((re) => re.test(line)) ? [`${name}:${i + 1}: ${line.trim()}`] : []));
    });
    expect(offenders, "state.config is shared by reference and must never be mutated").toEqual([]);
  });

  it("uses cloneState(state) instead of clone(state) / clone(next) in shared/src", () => {
    const offenders = sources(SHARED).flatMap((file) => {
      const name = relative(SHARED, file).replaceAll("\\", "/");
      return readFileSync(file, "utf8")
        .split("\n")
        .flatMap((line, i) => (/\bclone\(\s*(?:state|next)\s*\)/.test(line) ? [`${name}:${i + 1}: ${line.trim()}`] : []));
    });
    expect(offenders, "use cloneState(state) so state.config is not deep-cloned").toEqual([]);
  });
});
