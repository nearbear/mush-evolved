// A small JSON diff for the replay history (#335, docs/rules/rules-design.md "Replay history and storage"): each
// input's change to the full view. Hand-written so shared keeps no dependency.
//
// Arrays are the reason it isn't a plain recursive object diff. The log and chat grow at the end, so their change is
// an append; both also lose runs of old entries from the middle of the list (a log line leaving the window, a chat
// channel's page leaving the state when the next one seals, #355), and a body's action history drops from the front.
// Items with a numeric `id` (log lines, chat messages) are in id order, so one whose id is below the item it meets
// has left; for others a removal is found by looking a few items ahead. Anything else is patched in place by position.
//
// Values are plain JSON. A key holding `undefined` counts as missing, as it does once stored as JSON.

/** How `diffView` describes a change. `undefined` where there is none. */
export type ViewDiff =
  /** Replace the value. */
  | { k: "s"; v: unknown }
  /** An object: these keys changed (or are new), and these are gone. */
  | { k: "o"; c?: Record<string, ViewDiff>; d?: string[] }
  /**
   * An array: drop the items at `r` (old indices, ascending), patch the survivors at `e` (new indices), then append
   * `a`.
   */
  | { k: "a"; r?: number[]; e?: Record<number, ViewDiff>; a?: unknown[] };

/** How far past a mismatch to look for the item it should line up with, as a removal (chat drops one at a time). */
const REMOVAL_LOOKAHEAD = 8;

type Json = Record<string, unknown>;

/** An item's numeric `id`, if it has one. */
const idOf = (value: unknown): number | undefined => (isObject(value) && typeof value.id === "number" ? value.id : undefined);

const isObject = (value: unknown): value is Json => typeof value === "object" && value !== null && !Array.isArray(value);

/** Plain-JSON equality, with `undefined` keys counting as missing. */
export function jsonEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!jsonEqual(a[i], b[i])) return false;
    return true;
  }
  if (!isObject(a) || !isObject(b)) return false;
  for (const key in a) if (a[key] !== undefined && !jsonEqual(a[key], b[key])) return false;
  for (const key in b) if (b[key] !== undefined && a[key] === undefined) return false;
  return true;
}

/** What turns `prev` into `next`, or `undefined` when they are equal. Neither is changed. */
export function diffView(prev: unknown, next: unknown): ViewDiff | undefined {
  if (prev === next) return undefined;
  if (Array.isArray(prev) && Array.isArray(next)) return diffArray(prev, next);
  if (isObject(prev) && isObject(next)) return diffObject(prev, next);
  return { k: "s", v: next };
}

function diffObject(prev: Json, next: Json): ViewDiff | undefined {
  const c: Record<string, ViewDiff> = {};
  const d: string[] = [];
  for (const key in next) {
    if (next[key] === undefined) continue;
    const change = prev[key] === undefined ? { k: "s" as const, v: next[key] } : diffView(prev[key], next[key]);
    if (change) c[key] = change;
  }
  for (const key in prev) if (prev[key] !== undefined && next[key] === undefined) d.push(key);
  const changed = Object.keys(c).length > 0;
  if (!changed && d.length === 0) return undefined;
  return { k: "o", ...(changed && { c }), ...(d.length > 0 && { d }) };
}

function diffArray(prev: readonly unknown[], next: readonly unknown[]): ViewDiff | undefined {
  const r: number[] = [];
  const e: Record<number, ViewDiff> = {};
  let edits = 0;
  let i = 0;
  let j = 0;
  while (i < prev.length && j < next.length) {
    if (jsonEqual(prev[i], next[j])) {
      i++;
      j++;
      continue;
    }
    // In id order, an item whose id is below the one it meets was removed.
    const [was, now] = [idOf(prev[i]), idOf(next[j])];
    if (was !== undefined && now !== undefined && was < now) {
      r.push(i++);
      continue;
    }
    // Some were removed (maybe with others appended in the same input): skip to the first one that lines up, if it's
    // close. A wrong match (repeated values) only makes the diff bigger, never wrong.
    const extra = Math.min(prev.length - i - 1, REMOVAL_LOOKAHEAD);
    let skip = 0;
    for (let m = 1; m <= extra; m++) {
      if (jsonEqual(prev[i + m], next[j])) {
        skip = m;
        break;
      }
    }
    if (skip > 0) {
      for (let m = 0; m < skip; m++) r.push(i + m);
      i += skip;
      continue;
    }
    e[j] = diffView(prev[i], next[j])!;
    edits++;
    i++;
    j++;
  }
  for (; i < prev.length; i++) r.push(i);
  const a = next.slice(j);
  if (r.length === 0 && edits === 0 && a.length === 0) return undefined;
  // Nothing survived as it was: the whole array is no bigger.
  if (edits + a.length >= next.length && r.length + edits >= prev.length) return { k: "s", v: next };
  return { k: "a", ...(r.length > 0 && { r }), ...(edits > 0 && { e }), ...(a.length > 0 && { a }) };
}

/**
 * `prev` with `diff` applied, as a new value: `prev` is never changed, and what the diff doesn't touch is shared with
 * it (so don't mutate the result in place). `undefined` (no change) gives back `prev`.
 */
export function applyDiff(prev: unknown, diff: ViewDiff | undefined): unknown {
  if (!diff) return prev;
  switch (diff.k) {
    case "s":
      return diff.v;
    case "o": {
      if (!isObject(prev)) throw new Error("An object diff on something that isn't an object");
      const out: Json = { ...prev };
      for (const key of diff.d ?? []) delete out[key];
      for (const [key, change] of Object.entries(diff.c ?? {})) out[key] = applyDiff(prev[key], change);
      return out;
    }
    case "a": {
      if (!Array.isArray(prev)) throw new Error("An array diff on something that isn't an array");
      const removed = new Set(diff.r);
      const out = removed.size > 0 ? prev.filter((_, i) => !removed.has(i)) : [...prev];
      for (const [index, change] of Object.entries(diff.e ?? {})) out[Number(index)] = applyDiff(out[Number(index)], change);
      if (diff.a) out.push(...diff.a);
      return out;
    }
  }
}
