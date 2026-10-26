// Issue #102: every new state field needs a viewFor leak test. shared/tests/leakFields.ts lists each field with who
// may see it and which test checks that; shared/tests/leaks.test.ts compares it with the keys of a real game, which
// misses optional fields nobody set. This reads the interfaces in the source instead, so those are caught too.
// It lives in tools because shared tests may not touch the filesystem.

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { type FieldRule, GAME_STATE_FIELDS, ITEM_STATE_FIELDS, PLAYER_STATE_FIELDS } from "../../../shared/tests/leakFields.ts";

const SHARED = resolve(import.meta.dirname, "../../../shared");

/** The field names of `export interface <name> { ... }` in a shared source file (two-space indented, as Biome leaves them). */
function interfaceFields(file: string, name: string): string[] {
  const source = readFileSync(resolve(SHARED, "src", file), "utf8");
  const body = source.match(new RegExp(`^export interface ${name}\\b[^{]*\\{\\n([\\s\\S]*?)^\\}`, "m"))?.[1];
  if (body === undefined) throw new Error(`No interface ${name} in ${file}`);
  return [...body.matchAll(/^ {2}(?:readonly )?(\w+)\??:/gm)].map((m) => m[1]!);
}

const unlisted = (fields: string[], listed: Record<string, FieldRule>) => fields.filter((f) => !(f in listed));
const gone = (fields: string[], listed: Record<string, FieldRule>) => Object.keys(listed).filter((f) => !fields.includes(f));

describe("leakFields.ts matches the state interfaces", () => {
  const game = interfaceFields("types/state.ts", "GameState");
  const player = [...interfaceFields("types.ts", "Seat"), ...interfaceFields("types/player.ts", "PlayerState")];
  const item = interfaceFields("types.ts", "ItemState");

  it("lists every field (add it there, with the viewFor test that checks it)", () => {
    expect(unlisted(game, GAME_STATE_FIELDS)).toEqual([]);
    expect(unlisted(player, PLAYER_STATE_FIELDS)).toEqual([]);
    expect(unlisted(item, ITEM_STATE_FIELDS)).toEqual([]);
  });

  it("lists no field that no longer exists", () => {
    expect(gone(game, GAME_STATE_FIELDS)).toEqual([]);
    expect(gone(player, PLAYER_STATE_FIELDS)).toEqual([]);
    expect(gone(item, ITEM_STATE_FIELDS)).toEqual([]);
  });

  it("names test files that exist", () => {
    const rules = [GAME_STATE_FIELDS, PLAYER_STATE_FIELDS, ITEM_STATE_FIELDS].flatMap((r) => Object.entries(r));
    const missing = rules.filter(([, r]) => !existsSync(resolve(SHARED, "tests", r.test))).map(([f, r]) => `${f}: ${r.test}`);
    expect(missing).toEqual([]);
  });
});
