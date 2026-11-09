// Walking stored JSON by key path, for the stored-state tests (#384): server/tests/storedRooms.test.ts (the committed
// fixtures) and normalizeState.test.ts. A path is a pattern: an array element is `[]`, a dictionary key is `*`, and
// a struct's key is its name, so `game.players[].skills[]` or `game.equipment.*[].type`.

/**
 * The dictionaries in a `StoredRoom` (keys are data: player ids, room ids, registry ids), by path. Everything else that
 * is an object is a struct, whose keys are field names. A dictionary of primitives gets no probe (`__probe` would be a
 * valid entry); a dictionary of structs gets none either (it would be an entry with no struct), but its values do.
 */
export const DICTS: ReadonlySet<string> = new Set([
  "starts",
  "game.equipment",
  "game.dispensedOn",
  "game.chatSeq",
  "game.chatMarks",
  "game.bonds",
  "game.sharedOnDay",
  "game.contamination",
  "game.spikedOn",
  "game.research",
  "game.projects",
  "game.relay.research",
  "game.relay.projects",
  "game.planets",
  "game.turrets",
  "game.patrolShips",
  "game.failureStreaks",
  "game.failureStreaks.*",
  "game.expeditions[].lostAt",
  "game.log[].params",
  "game.chat[].system.params",
  "game.chatOutbox.sealed[].messages[].system.params",
]);

/** Every value in `value`, with its path pattern and the concrete keys that reach it. `at` is the root's path. */
export function walk(value: unknown, visit: (path: string, keys: readonly (string | number)[], value: unknown) => void, at = "", keys: (string | number)[] = []): void {
  visit(at, keys, value);
  if (Array.isArray(value)) value.forEach((v, i) => walk(v, visit, `${at}[]`, [...keys, i]));
  else if (value !== null && typeof value === "object") {
    const dict = DICTS.has(at);
    for (const [k, v] of Object.entries(value)) walk(v, visit, `${at}${at ? "." : ""}${dict ? "*" : k}`, [...keys, k]);
  }
}

/** The value at `keys` in `value`, or `undefined`. */
export function at(value: unknown, keys: readonly (string | number)[]): unknown {
  let v = value;
  for (const k of keys) v = v !== null && typeof v === "object" ? (v as Record<string | number, unknown>)[k] : undefined;
  return v;
}

const isStruct = (path: string, value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value) && !DICTS.has(path);

export const PROBE = "__probe";

/** Puts `__probe` on every struct in `value` (mutating it); returns how many. */
export function addProbes(value: unknown, root = ""): number {
  const structs: Record<string, unknown>[] = [];
  walk(value, (path, _keys, v) => {
    if (isStruct(path, v)) structs.push(v);
  }, root);
  for (const s of structs) s[PROBE] = 1;
  return structs.length;
}

/** The paths of every object in `value` that still has a `__probe`. */
export function probesIn(value: unknown, root = ""): string[] {
  const found: string[] = [];
  walk(value, (path, _keys, v) => {
    if (v !== null && typeof v === "object" && PROBE in v) found.push(path || "(root)");
  }, root);
  return found;
}

/** Whether `path` is `pattern` or below it; a `*` segment in the pattern matches any key. */
export function under(path: string, pattern: string): boolean {
  const split = (p: string) => p.split(/\.|(?=\[\])/);
  const a = split(path);
  const b = split(pattern);
  return b.length <= a.length && b.every((seg, i) => seg === "*" || seg === a[i]);
}
