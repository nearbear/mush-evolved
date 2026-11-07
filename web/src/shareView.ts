// Structural sharing for incoming views. The server sends each view as fresh JSON, so without this every object in it
// is new on every update and no `memo` or `useMemo` keyed on part of the view can ever skip. `shareUnchanged` keeps the
// previous object wherever the new one is equal by content, so `view.chat`, `view.threads` and the rest stay the very
// same objects across a move that didn't touch them (web/CLAUDE.md "Render cost").
//
// Arrays are matched by position: a list that loses an item from the front (the room log's window sliding) shares only
// the items before the change. That costs a re-render, never a wrong one.

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/** `next`, with every part equal to the same part of `prev` replaced by `prev`'s object. Never mutates either. */
export function shareUnchanged<T>(prev: unknown, next: T): T {
  if (prev === next) return next;
  if (Array.isArray(next)) {
    if (!Array.isArray(prev)) return next;
    let same = prev.length === next.length;
    const out = next.map((item, i) => {
      const shared = shareUnchanged(prev[i], item);
      if (shared !== prev[i]) same = false;
      return shared;
    });
    return (same ? prev : out) as T;
  }
  if (isObject(next)) {
    if (!isObject(prev)) return next;
    const keys = Object.keys(next);
    let same = keys.length === Object.keys(prev).length;
    const out: Record<string, unknown> = {};
    for (const key of keys) {
      const shared = shareUnchanged(prev[key], next[key]);
      out[key] = shared;
      if (shared !== prev[key] || !(key in prev)) same = false;
    }
    return (same ? prev : out) as T;
  }
  return next;
}
