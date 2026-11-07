// The `title` attribute is invisible on touch and to keyboard users and unreliable in screen readers
// (web/CLAUDE.md). Name elements with visible text or aria-label; use Hint, IconButton, or a Popover for
// hover text. This scans the client for `title=` on any JSX element. A component prop that happens to be
// called title must be renamed (e.g. `heading`). It lives in tools because web tests don't scan source.

import { readFileSync, readdirSync } from "node:fs";
import { relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const WEB = resolve(import.meta.dirname, "../../../web/src");

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = resolve(dir, e.name);
    if (e.isDirectory()) return sources(path);
    return e.name.endsWith(".tsx") ? [path] : [];
  });
}

describe("title attribute", () => {
  it("is not used anywhere in the client", () => {
    const offenders = sources(WEB).flatMap((file) =>
      readFileSync(file, "utf8")
        .split("\n")
        .flatMap((line, i) => (/(?<![\w-])title\s*=\s*[{"']/.test(line) ? [`${relative(WEB, file)}:${i + 1}: ${line.trim()}`] : [])),
    );
    expect(offenders, "use aria-label plus a Hint/Popover instead of title=").toEqual([]);
  });
});
