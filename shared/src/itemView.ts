import { plantView } from "./botany.ts";
import { visibleItemsIn } from "./items.ts";
import { copyDocument } from "./lostAnalysis.ts";
import { hasSkill } from "./skills.ts";
import { seesSpoil } from "./spoilage.ts";
import type { DroneState, GameState, ItemState, ItemView, PlayerState } from "./types.ts";

/** Shielding (actions/reinforce.ts) is seen by living Engineers and Mush only. */
export const seesShield = (viewer: Readonly<PlayerState>): boolean =>
  viewer.alive && (viewer.role === "mush" || hasSkill(viewer, "engineer"));

/** A drone's public part (#411): name, serial and upgrades; its failure counts never leave the server. */
const droneView = ({ name, serial, upgrades }: Readonly<DroneState>): NonNullable<ItemView["drone"]> => ({
  name,
  serial,
  upgrades: [...upgrades],
});

/** An item as `viewer` sees it; a plant's sickness only for the Botanist role (`plantView`). */
export function itemView(
  { id, type, of, builds, charges, teaches, plant, spores, hiddenBy, broken, jelly, shield, drone, document, spoil, mush }: Readonly<ItemState>,
  viewer: Readonly<PlayerState>,
): ItemView {
  return {
    id,
    type,
    ...(broken && { broken }),
    ...(spoil !== undefined && seesSpoil(viewer) && { spoil }),
    ...(jelly !== undefined && viewer.role === "mush" && viewer.alive && { jelly }),
    ...(shield !== undefined && seesShield(viewer) && { shield }),
    ...(hiddenBy === viewer.id && { hidden: true as const }),
    ...(spores && viewer.role === "mush" && viewer.alive && { spores }),
    ...(mush && viewer.role === "mush" && viewer.alive && { mush }),
    ...(of !== undefined && { of }),
    ...(builds !== undefined && { builds }),
    ...(charges !== undefined && { charges }),
    ...(teaches !== undefined && { teaches }),
    ...(plant && { plant: plantView(plant, viewer) }),
    ...(drone && { drone: droneView(drone) }),
    ...(document && { document: copyDocument(document) }),
  };
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value).sort()) {
      const v = (value as Record<string, unknown>)[k];
      if (v !== undefined) out[k] = canonical(v);
    }
    return out;
  }
  return value;
}

/**
 * Key identifying an item by everything the viewer can see on it, ignoring `id`.
 * Two items with the same key are indistinguishable to this viewer and stack into one UI slot.
 */
export function itemViewKey(item: Readonly<ItemView>): string {
  const { id: _id, ...visible } = item;
  return JSON.stringify(canonical(visible));
}

export interface ItemStack {
  key: string;
  items: ItemView[];
}

/** Groups items that look identical to the viewer (`itemViewKey`) into stacks, preserving first-seen order. */
export function stackItemViews(items: readonly ItemView[]): ItemStack[] {
  const byKey = new Map<string, ItemStack>();
  for (const item of items) {
    const key = itemViewKey(item);
    const existing = byKey.get(key);
    if (existing) existing.items.push(item);
    else byKey.set(key, { key, items: [item] });
  }
  return [...byKey.values()];
}

/**
 * When a player takes or consumes a room item from a stack of items that look identical to them,
 * prefer the one with the highest spore count (owner, 2026-11-21).
 * Because `itemViewKey` includes `spores` for living Mush, a Mush choosing an unspiked stack
 * never gets swapped onto a spiked item, while a human (who cannot see `spores`) always gets the
 * most spiked item from that stack.
 */
export function preferSpikedInRoom(state: Readonly<GameState>, player: Readonly<PlayerState>, item: ItemState): ItemState {
  if (item.at.kind !== "room") return item;
  const key = itemViewKey(itemView(item, player));
  let best = item;
  let bestSpores = item.spores ?? 0;
  for (const candidate of visibleItemsIn(state, item.at, player)) {
    const spores = candidate.spores ?? 0;
    if (spores > bestSpores && itemViewKey(itemView(candidate, player)) === key) {
      best = candidate;
      bestSpores = spores;
    }
  }
  return best;
}
