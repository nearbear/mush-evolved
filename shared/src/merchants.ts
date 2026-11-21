// Merchant ships (owner, 2026-11-15, #143; plan in docs/plans/merchants.md). Phase 1: the shared system with the
// transport's 7 hails (owner, 2026-11-16): crew, a named crew member (Ian), items, fuel, oxygen and finished projects
// paid; items, random projects and the PILGRED repair received. At each cycle change
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
import type { CharacterId } from "./characters.ts";
import { isPilgredRepaired, PILGRED_COMPLETE } from "./pilgred.ts";
import { completeProject, loseProject, tradableProjects } from "./projectEffects.ts";
import { availableProjects, type ProjectId } from "./projects.ts";
import { logPublic } from "./log.ts";
import { hasSkill, type SkillId } from "./skills.ts";
import { addSignal, closeSignal, findSignal, loseSignal, officerSays, type Signal, say } from "./signals.ts";
import type { DeepReadonly, GameState, ItemState, PlayerState, RoomId } from "./types.ts";

/** The kinds of merchant ship built so far. The other five (owner, 2026-11-15) come in later phases. */
export const MERCHANT_KINDS = ["transport"] as const;
export type MerchantKind = (typeof MERCHANT_KINDS)[number];

/** An inclusive [min, max] range, rolled when the merchant arrives. */
export type QtyRange = readonly [number, number];

/**
 * What the ship pays, as a template. `crew`: random inactive players (the original's `RD_PLAYERS`); `character`: that
 * character's player, if inactive (the original's `IAN_SOULTON`); `item`: items of that type from the storage rooms'
 * floors; `oxygen` / `fuel`: from the ship's tanks (owner, 2026-11-15); `project`: finished projects the officer picks
 * (TECHNO_REWRITE; owner, 2026-11-16), each then lost for good.
 */
export type GiveTemplate =
  | { kind: "crew"; count: QtyRange }
  | { kind: "character"; character: CharacterId }
  | { kind: "item"; item: string; count: QtyRange }
  | { kind: "oxygen" | "fuel"; count: QtyRange }
  | { kind: "project"; count: QtyRange };
/**
 * What the ship gets: items on the Front Storage floor (owner, 2026-11-15); `project`: random unfinished projects,
 * finished at once; `pilgred`: PILGRED repaired. Later phases add escorts.
 */
export type ReceiveTemplate = { kind: "item"; item: string; count: QtyRange } | { kind: "project"; count: QtyRange } | { kind: "pilgred" };

/** One answer of a hail. `skill`: only offered when someone alive in the officer's room has it (eMush; not yet confirmed). */
export interface DealTemplate {
  give: GiveTemplate[];
  receive: ReceiveTemplate[];
  skill?: SkillId;
}

/** A rolled asset: the template with its count fixed. */
export type GiveAsset =
  | { kind: "crew"; count: number }
  | { kind: "character"; character: CharacterId; count: 1 }
  | { kind: "item"; item: string; count: number }
  | { kind: "oxygen" | "fuel"; count: number }
  | { kind: "project"; count: number };
export type ReceiveAsset = { kind: "item"; item: string; count: number } | { kind: "project"; count: number } | { kind: "pilgred"; count: 1 };

export interface MerchantDeal {
  give: GiveAsset[];
  receive: ReceiveAsset[];
  skill?: SkillId;
}

/** Why a deal can't be closed now, or null. Shown with the deal at the terminal, which lists it disabled (owner, 2026-11-15). */
export type DealBlock = "skill" | "crew" | "character" | "item" | "oxygen" | "fuel" | "project" | "pilgred";

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
    if (a.kind === "character") return [{ kind: "character", character: a.character, count: 1 }];
    const count = roll(dice, a.count);
    return count <= 0 ? [] : [a.kind === "item" ? { kind: "item", item: a.item, count } : { kind: a.kind, count }];
  });
  const receive = template.receive.flatMap((a): ReceiveAsset[] => {
    if (a.kind === "pilgred") return [{ kind: "pilgred", count: 1 }];
    const count = roll(dice, a.count);
    return count <= 0 ? [] : [a.kind === "item" ? { kind: "item", item: a.item, count } : { kind: "project", count }];
  });
  return { give, receive, ...(template.skill && { skill: template.skill }) };
}

/** A merchant signal that can still be talked to. */
export const isActiveMerchant = (s: Readonly<Signal>): boolean => s.kind === "merchant" && s.status === "active";

/** The merchants in orbit: their active signals, oldest first. */
export const merchantsInOrbit = (state: Readonly<GameState>): Signal[] => state.signals.list.filter(isActiveMerchant) as Signal[];

/**
 * Hails that can only come in some situations; any other is always open. PILGREDISSIM while PILGRED is broken (eMush)
 * and once 3 inactive players exist (owner, 2026-11-16); the project hails while a project can still be finished
 * (eMush).
 */
const EVENT_OPEN: Readonly<Record<string, (state: Readonly<GameState>) => boolean>> = {
  PILGREDISSIM: (state) => !isPilgredRepaired(state) && tradableCrew(state).length >= 3,
  GOOD_PROJECTIONS: (state) => availableProjects(state).length > 0,
  TECHNO_REWRITE: (state) => availableProjects(state).length > 0,
};

/** The hails of `kind` that can come now, in config order. */
export const openEvents = (state: Readonly<GameState>, kind: MerchantKind): string[] =>
  Object.keys(state.config.merchants.kinds[kind].events).filter((id) => EVENT_OPEN[id]?.(state) ?? true);

/**
 * A merchant of `kind` arrives now: one of its open hails drawn uniformly, its deals rolled, as a new active signal
 * waiting for Contact. Mutates a state the caller already cloned.
 */
export function arriveMerchant(state: GameState, kind: MerchantKind): Signal {
  const events = state.config.merchants.kinds[kind].events;
  const ids = openEvents(state, kind);
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

/**
 * Items of `type` lying on a storage room's floor, not hidden (a hidden item is never counted, so a deal can't reveal
 * it). A hydropot with a plant in it isn't an empty pot, so it never pays (owner, 2026-11-21).
 */
export function storageItems(state: Readonly<GameState>, type: string): ItemState[] {
  const rooms = storageRooms(state);
  return state.items.filter(
    (i) => i.type === type && i.at.kind === "room" && rooms.includes(i.at.id) && i.hiddenBy === undefined && i.plant === undefined,
  ) as ItemState[];
}

/** The player of `character` if a merchant can take them: alive and inactive, like any traded crew member. */
export const tradableCharacter = (state: Readonly<GameState>, character: CharacterId): PlayerState | undefined =>
  tradableCrew(state).find((p) => p.character === character);

/** How many finished projects `deal` asks the officer to pick (TECHNO_REWRITE), 0 for any other deal. */
export const dealProjectCount = (deal: DeepReadonly<MerchantDeal>): number =>
  deal.give.reduce((n, a) => (a.kind === "project" ? n + a.count : n), 0);

/**
 * Whether `projects` is a valid pick for `deal`: exactly as many distinct finished projects as it asks for, each one a
 * merchant can take (`tradableProjects`). A deal without projects takes none.
 */
export function validProjectPick(state: Readonly<GameState>, deal: DeepReadonly<MerchantDeal>, projects: readonly string[]): boolean {
  const tradable: readonly string[] = tradableProjects(state);
  return projects.length === dealProjectCount(deal) && new Set(projects).size === projects.length && projects.every((p) => tradable.includes(p));
}

const SKILFUL_ROLES: readonly SkillId[] = ["botanic", "diplomacy", "biologist"];

const hasDealSkill = (player: Readonly<PlayerState>, skill: SkillId): boolean =>
  hasSkill(player, skill) || (SKILFUL_ROLES.includes(skill) && hasSkill(player, "skilful"));

/**
 * Why `officer` can't close `deal` now, or null if they can. The skill check is eMush's (someone alive in the officer's
 * room has it); the rest is what the ship holds.
 */
export function dealBlock(state: Readonly<GameState>, officer: Readonly<PlayerState>, deal: DeepReadonly<MerchantDeal>): DealBlock | null {
  if (deal.skill && !state.players.some((p) => p.alive && p.room === officer.room && hasDealSkill(p, deal.skill!))) return "skill";
  for (const asset of deal.give) {
    switch (asset.kind) {
      case "crew":
        if (tradableCrew(state).length < asset.count) return "crew";
        break;
      case "character":
        if (!tradableCharacter(state, asset.character)) return "character";
        break;
      case "project":
        if (tradableProjects(state).length < dealProjectCount(deal)) return "project";
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
  // Repaired since the merchant arrived: the deal would buy nothing (owner, 2026-11-21).
  if (deal.receive.some((a) => a.kind === "pilgred") && isPilgredRepaired(state)) return "pilgred";
  return null;
}

/**
 * Closes a deal: the ship pays (`projects`: the finished projects the officer picked, for a deal that takes some), the
 * goods land on the delivery room's floor or take effect, and the conversation ends with the merchant's acceptance
 * (eMush removes the transport once a deal is accepted). Returns the traded players. The caller has checked
 * `dealBlock` and `validProjectPick`. Mutates a state the caller already cloned.
 */
export function closeDeal(state: GameState, officer: Readonly<PlayerState>, signalId: string, index: number, projects: readonly ProjectId[] = []): PlayerState[] {
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
      case "character": {
        const p = tradableCharacter(state, asset.character);
        if (p) {
          killPlayer(state, p, "traded");
          traded.push(p);
        }
        break;
      }
      case "project":
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
  // The picked projects are lost before any is received, so the merchant never hands one straight back (owner, 2026-11-21).
  for (const project of projects) loseProject(state, project);
  const room = state.config.merchants.deliveryRoom;
  for (const asset of deal.receive) {
    switch (asset.kind) {
      case "item":
        spawnInRoom(state, room, asset.item, asset.count);
        break;
      case "project":
        // Any unfinished project (owner, 2026-11-21), each with the public line NERON's own completions get.
        for (const project of withDice(state, (dice) => rollShuffle(dice, availableProjects(state))).slice(0, asset.count)) {
          completeProject(state, project);
          logPublic(state, undefined, "neronProjectCompleted", { project });
        }
        break;
      case "pilgred":
        state.pilgred.progress = PILGRED_COMPLETE;
        break;
    }
  }
  officerSays(state, signal, officer, "signals.officer.deal", { deal: index });
  closeSignal(state, signal, "deal", { from: "signal", key: merchantLine(signal.merchant!.kind, "accept") });
  return traded;
}
