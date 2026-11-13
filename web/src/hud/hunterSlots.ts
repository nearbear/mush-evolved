// Each hunter's number in the patrol cockpit (PatrolCockpit.tsx), and the order you step through them in. The rules
// give hunters no number, so this is the view's own bookkeeping: a hunter takes the lowest free slot when it first shows
// up and keeps it until it is gone. Its number in its kind ("Arack 2") works the same way, within its kind, so "Hunter 3"
// stays Hunter 3 when another one dies. It also counts each hunter's hits (its hp going down from one
// view to the next), which replays the sprite's hit flash. Pure: `track` returns the same object when nothing changed.

export interface Formation {
  /** Hunter id -> slot, from 0. */
  slots: Readonly<Record<string, number>>;
  hp: Readonly<Record<string, number>>;
  /** Hunter id -> how many times its hp has dropped while in view. */
  hits: Readonly<Record<string, number>>;
  /** Hunter id -> its kind (`HunterType`), and its number among that kind, from 1. */
  kinds: Readonly<Record<string, string>>;
  numbers: Readonly<Record<string, number>>;
}

export const NO_FORMATION: Formation = { slots: {}, hp: {}, hits: {}, kinds: {}, numbers: {} };

type Tracked = { id: string; hp: number; type?: string };

/** The lowest number from 1 not in `taken`, which it then joins. */
function lowestFree(taken: Set<number>, from: number): number {
  let n = from;
  while (taken.has(n)) n++;
  taken.add(n);
  return n;
}

/** The formation after a new list of hunters: the ones still there keep their slots, new ones fill the gaps. */
export function track(prev: Formation, list: readonly Tracked[]): Formation {
  const same = list.length === Object.keys(prev.slots).length && list.every((h) => prev.slots[h.id] !== undefined && prev.hp[h.id] === h.hp);
  if (same) return prev;
  const taken = new Set(list.flatMap((h) => prev.slots[h.id] ?? []));
  const slots: Record<string, number> = {};
  const hp: Record<string, number> = {};
  const hits: Record<string, number> = {};
  const kinds: Record<string, string> = {};
  const numbers: Record<string, number> = {};
  const kept = list.filter((h) => prev.numbers[h.id] !== undefined);
  const numbered = new Map<string, Set<number>>();
  for (const h of kept) {
    const kind = h.type ?? "hunter";
    if (!numbered.has(kind)) numbered.set(kind, new Set());
    numbered.get(kind)!.add(prev.numbers[h.id]!);
  }
  for (const h of list) {
    const kind = h.type ?? "hunter";
    if (!numbered.has(kind)) numbered.set(kind, new Set());
    kinds[h.id] = kind;
    numbers[h.id] = prev.numbers[h.id] ?? lowestFree(numbered.get(kind)!, 1);
    slots[h.id] = prev.slots[h.id] ?? lowestFree(taken, 0);
    hp[h.id] = h.hp;
    hits[h.id] = (prev.hits[h.id] ?? 0) + (h.hp < (prev.hp[h.id] ?? h.hp) ? 1 : 0);
  }
  return { slots, hp, hits, kinds, numbers };
}

/** The occupied slots, lowest first. */
const occupied = (f: Formation): number[] => Object.values(f.slots).sort((a, b) => a - b);

/** The slot you are aiming at: `aim` if a hunter is in it, else the next occupied one after it (wrapping); undefined with no hunters. */
export function aimedSlot(f: Formation, aim: number): number | undefined {
  const all = occupied(f);
  return all.find((s) => s >= aim) ?? all[0];
}

/** The occupied slot one step before (-1) or after (+1) the aimed one, wrapping. */
export function stepAim(f: Formation, aim: number, dir: -1 | 1): number {
  const all = occupied(f);
  const at = all.indexOf(aimedSlot(f, aim) ?? -1);
  if (at < 0) return aim;
  return all[(at + dir + all.length) % all.length]!;
}

/** The slot of the next hunter of `kind` after the aimed one (wrapping), for the cockpit's pack: `aim` if there is none. */
export function nextOfKind(f: Formation, aim: number, kind: string): number {
  const own = Object.keys(f.slots)
    .filter((id) => f.kinds[id] === kind)
    .map((id) => f.slots[id]!)
    .sort((a, b) => a - b);
  const at = aimedSlot(f, aim) ?? -1;
  return own.find((s) => s > at) ?? own[0] ?? aim;
}

/** The hunter in a slot. */
export const hunterIn = (f: Formation, slot: number | undefined): string | undefined => Object.keys(f.slots).find((id) => f.slots[id] === slot);
