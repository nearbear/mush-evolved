// Merchant ships (owner, 2026-11-15, #143; plan in docs/plans/merchants.md). Phase 1, first slice: the shared system
// with the transport's crew/fuel/oxygen deals (HUMAN_VS_FUEL, HUMAN_VS_OXY; owner, 2026-11-15). At each cycle change
// after pre-selection a merchant may arrive (about 2 a day); it stays `stayCycles` cycles and leaves at once when the
// Daedalus travels or leaves orbit. Its deals are rolled from the original's templates when it arrives. The comms
// officer closes one at the Com center terminal (actions/close_deal.ts): the ship pays from the storage rooms' floors,
// the tanks, or its inactive crew (from anywhere), and the goods appear on the Front Storage floor. A traded player
// dies with no corpse (death.ts, cause `traded`).
//
// Not built yet (docs/plans/merchants.md): the other kinds, refusing, shooting a merchant, arrival and deal
// announcements, the space view, and the client.

import { killPlayer } from "./death.ts";
import { isInactive } from "./inactivity.ts";
import { spawnInRoom } from "./items.ts";
import { type HasRng, roll, rollFloat, rollInt, rollShuffle, rollWeighted } from "./rng.ts";
import { hasSkill, type SkillId } from "./skills.ts";
import type { DeepReadonly, GameState, ItemState, MerchantView, PlayerState, RoomId } from "./types.ts";

/** The kinds of merchant ship built so far. The other five (owner, 2026-11-15) come in later phases. */
export const MERCHANT_KINDS = ["transport"] as const;
export type MerchantKind = (typeof MERCHANT_KINDS)[number];

/** An inclusive [min, max] range, rolled when the merchant arrives. */
export type QtyRange = readonly [number, number];

/**
 * What the ship pays, as a template. `crew`: random inactive players (the original's `RD_PLAYERS`); `item`: items of
 * that type from the storage rooms' floors; `oxygen` / `fuel`: from the ship's tanks (owner, 2026-11-15).
 */
export type GiveTemplate = { kind: "crew"; count: QtyRange } | { kind: "item"; item: string; count: QtyRange } | { kind: "oxygen" | "fuel"; count: QtyRange };
/** What the ship gets: items on the Front Storage floor (owner, 2026-11-15). Later phases add projects, PILGRED, escorts. */
export type ReceiveTemplate = { kind: "item"; item: string; count: QtyRange };

/** One answer of a hail. `skill`: only offered when someone alive in the officer's room has it (eMush; not yet confirmed). */
export interface DealTemplate {
  give: GiveTemplate[];
  receive: ReceiveTemplate[];
  skill?: SkillId;
}

/** A rolled asset: the template with its count fixed. */
export type GiveAsset = { kind: "crew"; count: number } | { kind: "item"; item: string; count: number } | { kind: "oxygen" | "fuel"; count: number };
export type ReceiveAsset = { kind: "item"; item: string; count: number };

export interface MerchantDeal {
  give: GiveAsset[];
  receive: ReceiveAsset[];
  skill?: SkillId;
}

/** A merchant in orbit. `event` is the hail it came with (the original's `trade_events` id); it leaves at `leavesAt`. */
export interface Merchant {
  id: string;
  kind: MerchantKind;
  event: string;
  arrivedAt: number;
  leavesAt: number;
  deals: MerchantDeal[];
}

export interface MerchantsState {
  list: Merchant[];
  nextId: number;
}

export const newMerchants = (): MerchantsState => ({ list: [], nextId: 1 });

/** Why a deal can't be closed now, or null. Shown with the deal at the terminal, which lists it disabled (owner, 2026-11-15). */
export type DealBlock = "skill" | "crew" | "item" | "oxygen" | "fuel";

/** Rolls on the merchants' own stream (`GameState.merchantRng`), so merchants never shift the game's other rolls. */
function withDice<T>(state: GameState, f: (dice: HasRng) => T): T {
  const dice: HasRng = { rng: state.merchantRng };
  const result = f(dice);
  state.merchantRng = dice.rng;
  return result;
}

/** Rolls a template's counts. An asset rolled to 0 is left out (eMush). */
function rollDeal(dice: HasRng, template: DeepReadonly<DealTemplate>): MerchantDeal {
  const give = template.give.flatMap((a): GiveAsset[] => {
    const count = roll(dice, a.count);
    return count <= 0 ? [] : [a.kind === "item" ? { kind: "item", item: a.item, count } : { kind: a.kind, count }];
  });
  const receive = template.receive.flatMap((a): ReceiveAsset[] => {
    const count = roll(dice, a.count);
    return count <= 0 ? [] : [{ kind: "item", item: a.item, count }];
  });
  return { give, receive, ...(template.skill && { skill: template.skill }) };
}

/** A merchant of `kind` arrives now: one of its hails drawn uniformly, its deals rolled. Mutates a state the caller already cloned. */
export function arriveMerchant(state: GameState, kind: MerchantKind): Merchant {
  const events = state.config.merchants.kinds[kind].events;
  const ids = Object.keys(events);
  const event = withDice(state, (dice) => ids[rollInt(dice, ids.length)]!);
  const merchant: Merchant = {
    id: `merchant-${state.merchants.nextId++}`,
    kind,
    event,
    arrivedAt: state.cycle,
    leavesAt: state.cycle + state.config.merchants.stayCycles,
    deals: withDice(state, (dice) => events[event]!.map((t) => rollDeal(dice, t))),
  };
  state.merchants.list.push(merchant);
  return merchant;
}

/**
 * At a cycle change: merchants whose stay is over leave, then one may arrive (`arrivalChance`, kind by weight), once the
 * game proper has started (hunters' `since`, set with Mush selection). Mutates a state the caller already cloned.
 */
export function merchantsCycle(state: GameState): void {
  state.merchants.list = state.merchants.list.filter((m) => state.cycle < m.leavesAt);
  if (state.hunters.since === null) return;
  const { arrivalChance, kinds } = state.config.merchants;
  const kind = withDice(state, (dice) =>
    rollFloat(dice) < arrivalChance ? MERCHANT_KINDS[rollWeighted(dice, MERCHANT_KINDS.map((k) => kinds[k].weight))]! : null,
  );
  if (kind) arriveMerchant(state, kind);
}

/** The Daedalus travels or leaves orbit: every merchant is left behind (owner, 2026-11-15). */
export function merchantsLeave(state: GameState): void {
  state.merchants.list = [];
}

/** Living inactive players: the crew a merchant can take (owner, 2026-10-14 and 2026-11-15: inactive only, from anywhere). */
export const tradableCrew = (state: Readonly<GameState>): PlayerState[] => state.players.filter((p) => p.alive && isInactive(p)) as PlayerState[];

const storageRooms = (state: Readonly<GameState>): readonly RoomId[] => state.config.merchants.storageRooms;

/** Items of `type` lying on a storage room's floor, not hidden (a hidden item is never counted, so a deal can't reveal it). */
export function storageItems(state: Readonly<GameState>, type: string): ItemState[] {
  const rooms = storageRooms(state);
  return state.items.filter((i) => i.type === type && i.at.kind === "room" && rooms.includes(i.at.id) && i.hiddenBy === undefined) as ItemState[];
}

/**
 * Why `officer` can't close `deal` now, or null if they can. The skill check is eMush's (someone alive in the officer's
 * room has it); the rest is what the ship holds.
 */
export function dealBlock(state: Readonly<GameState>, officer: Readonly<PlayerState>, deal: DeepReadonly<MerchantDeal>): DealBlock | null {
  if (deal.skill && !state.players.some((p) => p.alive && p.room === officer.room && hasSkill(p, deal.skill!))) return "skill";
  for (const asset of deal.give) {
    switch (asset.kind) {
      case "crew":
        if (tradableCrew(state).length < asset.count) return "crew";
        break;
      case "item":
        if (storageItems(state, asset.item).length < asset.count) return "item";
        break;
      case "oxygen":
      case "fuel":
        if (state.ship[asset.kind] < asset.count) return asset.kind;
        break;
    }
  }
  return null;
}

/**
 * Closes a deal: the ship pays, the goods land on the delivery room's floor, and the merchant leaves (eMush removes the
 * transport once a deal is accepted). Returns the traded players. The caller has checked `dealBlock`. Mutates a state
 * the caller already cloned.
 */
export function closeDeal(state: GameState, merchantId: string, index: number): PlayerState[] {
  const merchant = state.merchants.list.find((m) => m.id === merchantId);
  const deal = merchant?.deals[index];
  if (!merchant || !deal) return [];
  const traded: PlayerState[] = [];
  for (const asset of deal.give) {
    switch (asset.kind) {
      case "crew":
        for (const p of withDice(state, (dice) => rollShuffle(dice, tradableCrew(state))).slice(0, asset.count)) {
          killPlayer(state, p, "traded");
          traded.push(p);
        }
        break;
      case "item": {
        const paid = new Set(storageItems(state, asset.item).slice(0, asset.count).map((i) => i.id));
        state.items = state.items.filter((i) => !paid.has(i.id));
        break;
      }
      case "oxygen":
      case "fuel":
        state.ship[asset.kind] -= asset.count;
        break;
    }
  }
  const room = state.config.merchants.deliveryRoom;
  for (const asset of deal.receive) spawnInRoom(state, room, asset.item, asset.count);
  state.merchants.list = state.merchants.list.filter((m) => m.id !== merchantId);
  return traded;
}

/** The merchants as the Com center terminal shows them to `viewer` (comms.ts, `commsTerminalView`): every deal, with why it is blocked. */
export function merchantsView(state: Readonly<GameState>, viewer: Readonly<PlayerState>): MerchantView[] {
  return state.merchants.list.map((m) => ({
    id: m.id,
    kind: m.kind,
    event: m.event,
    leavesAt: m.leavesAt,
    deals: m.deals.map((deal) => ({
      give: deal.give.map((a) => ({ ...a })),
      receive: deal.receive.map((a) => ({ ...a })),
      ...(deal.skill && { skill: deal.skill }),
      blocked: dealBlock(state, viewer, deal),
    })),
  }));
}
