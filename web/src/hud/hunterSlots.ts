// Each hunter's number in the patrol cockpit (PatrolCockpit.tsx), and the order you step through them in. The rules
// give hunters no number, so this is the view's own bookkeeping: a hunter takes the lowest free slot when it first shows
// up and keeps it until it is gone, so "Hunter 3" stays Hunter 3 when another one dies. It also counts each hunter's hits (its hp going down from one
// view to the next), which replays the sprite's hit flash. Pure: `track` returns the same object when nothing changed.

export interface Formation {
  /** Hunter id -> slot, from 0. */
  slots: Readonly<Record<string, number>>;
  hp: Readonly<Record<string, number>>;
  /** Hunter id -> how many times its hp has dropped while in view. */
  hits: Readonly<Record<string, number>>;
}

export const NO_FORMATION: Formation = { slots: {}, hp: {}, hits: {} };

/** The formation after a new list of hunters: the ones still there keep their slots, new ones fill the gaps. */
export function track(prev: Formation, list: readonly { id: string; hp: number }[]): Formation {
  const same = list.length === Object.keys(prev.slots).length && list.every((h) => prev.slots[h.id] !== undefined && prev.hp[h.id] === h.hp);
  if (same) return prev;
  const taken = new Set(list.flatMap((h) => prev.slots[h.id] ?? []));
  const slots: Record<string, number> = {};
  const hp: Record<string, number> = {};
  const hits: Record<string, number> = {};
  let free = 0;
  for (const h of list) {
    let slot = prev.slots[h.id];
    if (slot === undefined) {
      while (taken.has(free)) free++;
      slot = free;
      taken.add(slot);
    }
    slots[h.id] = slot;
    hp[h.id] = h.hp;
    hits[h.id] = (prev.hits[h.id] ?? 0) + (h.hp < (prev.hp[h.id] ?? h.hp) ? 1 : 0);
  }
  return { slots, hp, hits };
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

/** The hunter in a slot. */
export const hunterIn = (f: Formation, slot: number | undefined): string | undefined => Object.keys(f.slots).find((id) => f.slots[id] === slot);
