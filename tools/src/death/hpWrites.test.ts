// "0 HP kills at once" holds only if every HP loss goes through damage() in
// shared/src/death.ts. This scans the rules source for any other write to `.hp`.
// It lives in tools because shared tests may not touch the filesystem.

import { readFileSync, readdirSync } from "node:fs";
import { relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SHARED = resolve(import.meta.dirname, "../../../shared/src");

/** Files allowed to set HP, and why none of them can lower it without killing. */
const ALLOWED = new Set([
  "death.ts", // damage(), killPlayer() and healDaily() (which only raises HP)
  "cheats.ts", // infiniteHp refills to the maximum
  "adjustStats.ts", // clamps HP down to a lowered maximum (maxHp is at least 1, so never kills)
  "actions/heal.ts", // healing only raises HP
  "actions/consume.ts", // eating only raises HP (a negative consume.hp counts as 0)
  "hunters.ts", // a hunter's hp, not a player's; at 0 the hunter is removed
]);

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = resolve(dir, e.name);
    if (e.isDirectory()) return sources(path);
    return e.name.endsWith(".ts") && !e.name.endsWith(".test.ts") ? [path] : [];
  });
}

describe("HP writes", () => {
  it("only death.ts lowers HP", () => {
    const offenders = sources(SHARED).flatMap((file) => {
      const name = relative(SHARED, file).replaceAll("\\", "/");
      if (ALLOWED.has(name)) return [];
      return readFileSync(file, "utf8")
        .split("\n")
        .flatMap((line, i) => (/\.hp\s*(?:[-+*/]?=)(?!=)/.test(line) ? [`${name}:${i + 1}: ${line.trim()}`] : []));
    });
    expect(offenders, "lower HP with damage() from death.ts instead").toEqual([]);
  });
});
