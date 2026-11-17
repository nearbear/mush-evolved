// Merchant ships (owner, 2026-11-15, #143; plan in docs/plans/merchants.md). Phase 1, first slice: the shared system
// with the transport's crew/fuel/oxygen deals (HUMAN_VS_FUEL, HUMAN_VS_OXY; owner, 2026-11-15). At each cycle change
// after pre-selection a merchant may arrive (about 2 a day); it stays `stayCycles` cycles and is lost at once when the
// Daedalus travels or leaves orbit. Its deals are rolled from the original's templates when it arrives. Each merchant
// is a signal (signals.ts, owner 2026-11-16): the comms officer contacts it at the Com center terminal
// (actions/contact_signal.ts), then closes one deal (actions/close_deal.ts) or says No thank you
// (actions/refuse_signal.ts). For a deal the ship pays from the storage rooms' floors, the tanks, or its inactive crew
// (from anywhere), and the goods appear on the Front Storage floor. A traded player dies with no corpse (death.ts,
// cause `traded`).
//
// NERON announces each arrival ship-wide in crew chat (kind only; owner, 2026-11-16). Not built yet
// (docs/plans/merchants.md): the other kinds, shooting a merchant, deal announcements, and the space view.

import { pushChat } from "./chat.ts";
import { killPlayer } from "./death.ts";
import { isInactive } from "./inactivity.ts";
import { spawnInRoom } from "./items.ts";
import { type HasRng, roll, rollFloat, rollInt, rollShuffle, rollWeighted } from "./rng.ts";
import { hasSkill, type SkillId } from "./skills.ts";
import { addSignal, closeSignal, findSignal, loseSignal, officerSays, type Signal, say } from "./signals.ts";
import type { DeepReadonly, GameState, ItemState, PlayerState, RoomId } from "./types.ts";

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

/** A merchant signal that can still be talked to. */
export const isActiveMerchant = (s: Readonly<Signal>): boolean => s.kind === "merchant" && s.status === "active";

/** The merchants in orbit: their active signals, oldest first. */
export const merchantsInOrbit = (state: Readonly<GameState>): Signal[] => state.signals.list.filter(isActiveMerchant) as Signal[];

/**
 * A merchant of `kind` arrives now: one of its hails drawn uniformly, its deals rolled, as a new active signal waiting
 * for Contact. Mutates a state the caller already cloned.
 */
export function arriveMerchant(state: GameState, kind: MerchantKind): Signal {
  const events = state.config.merchants.kinds[kind].events;
  const ids = Object.keys(events);
  const event = withDice(state, (dice) => ids[rollInt(dice, ids.length)]!);
  const deals = withDice(state, (dice) => events[event]!.map((t) => rollDeal(dice, t)));
  const signal = addSignal(state, "merchant", state.cycle + state.config.merchants.stayCycles, { merchant: { kind, event, deals } });
  // NERON tells the whole crew in crew chat (owner, 2026-11-16): the ship's kind, nothing of its hail or deals.
  pushChat(state, "global", { from: null, isBot: false, text: "", system: { key: "merchantHailing", params: { merchant: kind } } });
  return signal;
}

/**
 * At a cycle change: merchants whose stay is over are lost, then one may arrive (`arrivalChance`, kind by weight), once
 * the game proper has started (hunters' `since`, set with Mush selection). Mutates a state the caller already cloned.
 */
export function merchantsCycle(state: GameState): void {
  for (const m of merchantsInOrbit(state)) if (state.cycle >= m.endsAt) loseSignal(state, m);
  if (state.preselection || state.hunters.since === null) return;
  const { arrivalChance, kinds } = state.config.merchants;
  const kind = withDice(state, (dice) =>
    rollFloat(dice) < arrivalChance ? MERCHANT_KINDS[rollWeighted(dice, MERCHANT_KINDS.map((k) => kinds[k].weight))]! : null,
  );
  if (kind) arriveMerchant(state, kind);
}

/** The Daedalus travels or leaves orbit: every merchant is left behind and lost, contacted or not (owner, 2026-11-15 and 2026-11-16). */
export function merchantsLeave(state: GameState): void {
  for (const m of merchantsInOrbit(state)) loseSignal(state, m);
}

/** The feed's key for a line of a merchant ship of `kind` (`hail.<event>`, `accept`, `farewell`). */
export const merchantLine = (kind: MerchantKind, line: string): string => `signals.merchant.${kind}.${line}`;

/**
 * Contact (actions/contact_signal.ts): the ship's hail; the deals are on offer next. No officer greeting: the feed holds
 * only the original's lines and plain speech (owner, 2026-11-16).
 */
export function contactMerchant(state: GameState, signal: Signal, next: string): void {
  const merchant = signal.merchant!;
  say(state, signal, { from: "signal", key: merchantLine(merchant.kind, `hail.${merchant.event}`) });
  signal.step = next;
}

/** No thank you (actions/refuse_signal.ts): the officer declines and the ship says farewell, closing the conversation. */
export function refuseMerchant(state: GameState, signal: Signal, officer: Readonly<PlayerState>): void {
  officerSays(state, signal, officer, "signals.officer.refuse");
  closeSignal(state, signal, "refused", { from: "signal", key: merchantLine(signal.merchant!.kind, "farewell") });
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
 * Closes a deal: the ship pays, the goods land on the delivery room's floor, and the conversation ends with the
 * merchant's acceptance (eMush removes the transport once a deal is accepted). Returns the traded players. The caller
 * has checked `dealBlock`. Mutates a state the caller already cloned.
 */
export function closeDeal(state: GameState, officer: Readonly<PlayerState>, signalId: string, index: number): PlayerState[] {
  const signal = findSignal(state, signalId);
  const deal = signal?.merchant?.deals[index];
  if (!signal || !deal) return [];
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
  officerSays(state, signal, officer, "signals.officer.deal", { deal: index });
  closeSignal(state, signal, "deal", { from: "signal", key: merchantLine(signal.merchant!.kind, "accept") });
  return traded;
}
