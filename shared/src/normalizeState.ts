// Normalizing stored state on load (#384, docs/plans/normalize-state.md): a snapshot read from storage goes through
// these before the game continues from it, the way `resolveConfig` treats `ConfigOverrides`. One function per stored
// type, each returning an object literal that names every field, so only listed keys survive and a type's new field
// doesn't compile until its normalizer handles it.
//
// Rules for this file:
//
// - Every return literal is `AllKeys<T>` (through `stripUndefined<T>`): it lists every key, optional ones included.
// - A field that has always existed uses `need()`: corrupt data throws `NormalizeError` instead of being papered over.
//   Never `raw.x!`, which would turn a missing required field into one `stripUndefined` silently deletes.
// - A field added later uses `added(raw, key, default)`, with a default that is right for a game in progress, taken
//   from the game's own data or its config (`ctx.config`), never from a separate fresh game. A `next*` counter added
//   later is rebuilt from its data (the highest id plus one), not defaulted.
// - The nullish-coalescing operator never appears here: it would turn a stored `null` (`winner`, `orbit`,
//   `satietyZeroSince`, ...) into the default. `added()` defaults only `undefined`. A test greps this file for it.
// - Every union in the stored state has a discriminant (`kind` or `type`), and its normalizer is a `switch` on it whose
//   `default` checks `raw.kind satisfies undefined`: under `Partial`, the discriminant left over once every variant is
//   handled is `undefined`, so a new variant fails to compile until it has a case. At run time an unknown or missing
//   discriminant throws.
// - A nested struct calls its own normalizer. Dictionaries and arrays of primitives are copied as they are (`dict`,
//   `[...x]`); values are not type-checked, since this server wrote them and the only drift is between versions.
// - The result shares nothing with its input.
//
// Input is `Partial<T>`: the shape it was written as, with any field possibly missing.

import { resolveConfig } from "./config.ts";
import { clone } from "./helpers.ts";
import { newNpcState, type NpcState } from "./npcs.ts";
import { type LostAnalysisState, rollLostAnalysis } from "./lostAnalysis.ts";
import { streamFor } from "./rng.ts";
import type { DrugDispenserState, DrugEffect } from "./drugs.ts";
import type { FruitDisease, FruitEffect, PendingDisease } from "./fruits.ts";
import type { FullView, SeatStart, SeatStarts } from "./fullView.ts";
import { PROJECT_IDS } from "./projects.ts";
import type { GiveAsset, MerchantDeal, ReceiveAsset } from "./merchants.ts";
import type { FeedEntry, MerchantData, RebelData, Signal, SignalsState } from "./signals.ts";
import type { RelayPool, RelayStreak, RelayToken, ResearchPool, Sample } from "./relay.ts";
import type { DiseaseTracker } from "./diseases.ts";
import type {
  ChatMark,
  ChatMessage,
  ChatOutbox,
  ChatThread,
  ConfigOverrides,
  Container,
  DeepReadonly,
  DoorState,
  Equipment,
  ActiveExpedition,
  ExpeditionEvent,
  ExpeditionReport,
  GameConfig,
  GameCore,
  GameState,
  Hunter,
  HunterTarget,
  Report,
  DocumentRow,
  DocumentState,
  DroneState,
  ItemState,
  LogEntry,
  Plan,
  PlanSlot,
  PlanTask,
  Planet,
  PlantState,
  PlayerId,
  PlayerState,
  PreselectionRules,
  PrivateChannel,
  SealedChatPage,
  SharedPlanetState,
  SharedReportState,
  ShipResources,
  SpaceDebris,
  Spot,
} from "./types.ts";

// Upgrade steps (docs/plans/normalize-state.md, "Versions and upgrade steps").

/**
 * The stored shape's version, written with every snapshot. A new field never bumps it: it takes `added()` in its
 * normalizer. Bump it, and add a step below, only for what a default can't express: a removed, renamed or moved field,
 * a changed type or meaning, a renamed or removed registry id, or a change to what `resolveConfig` derives from an
 * override key. A step lands in a deploy of its own (docs/ops/deploy.md: roll back only to the same version). Something
 * that never reached a deploy (test or production) is in no stored snapshot, so changing or removing it needs no step.
 */
export const STATE_VERSION = 123;

/**
 * The oldest stored version this build reads: 114, the shape the normalizers were written against. A snapshot below it
 * is dropped on load (the record is kept), as every version change did before them. Raise it only to end every live
 * game on purpose, and never above `STATE_VERSION`.
 */
export const MIN_STATE_VERSION = 114;

/** A snapshot stored by a newer build than this one. */
export class TooNewError extends Error {
  override name = "TooNewError";
}

/**
 * One upgrade: brings a snapshot stored at version `to - 1` to version `to`. It works on loose JSON, since it reads a
 * shape no type describes any more, and mutates what it is given.
 */
export interface UpgradeStep {
  to: number;
  /**
   * The stored paths this step removes, renames or changes the value of, so the fixture test (server/tests/
   * storedRooms.test.ts) expects them to differ: `game.players[].foo`, `overrides.bar`, `game.equipment.*[].baz` (an
   * array element is `[]`, a dictionary key `*`; a path covers everything below it).
   */
  paths?: readonly string[];
  /** The registry ids this step renames or removes, as `<registry>.<id>` (`ITEM_TYPES.old_kit`): the registry snapshot test then expects them gone. */
  ids?: readonly string[];
  run(game: Record<string, unknown>, overrides: Record<string, unknown>): void;
}

const upgradeTo115: UpgradeStep = {
  to: 115,
  ids: ["SKILLS.oisif"],
  run(game) {
    const players = game.players as Array<Record<string, unknown>> | undefined;
    if (players) {
      for (const p of players) {
        if (Array.isArray(p.skills)) {
          p.skills = p.skills.filter((s) => s !== "oisif");
        }
        if (p.bookSkill === "oisif") {
          delete p.bookSkill;
        }
      }
    }
  },
};

/**
 * Before 116, `game.relay.projects` stored token pools (`{ tokens }`); projects now store only a `RelayStreak`
 * (`{ lastBy, streak }`). Convert any non-empty token list into the trailing contributor's streak and drop empty pools.
 */
const upgradeTo116: UpgradeStep = {
  to: 116,
  paths: ["game.relay.projects"],
  run: (game) => {
    const relay = game.relay as { projects?: Record<string, { tokens?: { by: PlayerId }[]; lastBy?: PlayerId | null; streak?: number }> } | undefined;
    if (!relay || !relay.projects) return;
    const next: Record<string, RelayStreak> = {};
    for (const [id, entry] of Object.entries(relay.projects)) {
      if (!entry) continue;
      if (Array.isArray(entry.tokens)) {
        const last = entry.tokens.at(-1);
        if (!last) continue;
        let streak = 0;
        for (let i = entry.tokens.length - 1; i >= 0 && entry.tokens[i]!.by === last.by; i--) streak++;
        next[id] = { lastBy: last.by, streak };
      } else if (entry.lastBy !== undefined && typeof entry.streak === "number") {
        next[id] = { lastBy: entry.lastBy, streak: entry.streak };
      }
    }
    relay.projects = next;
  },
};

/** Before 117, a player could hold the `selfDisease` cheat; the Superkube (#170) replaced it. */
const upgradeTo117: UpgradeStep = {
  to: 117,
  paths: ["game.players[].cheats"],
  run: (game) => {
    const players = game.players as Array<Record<string, unknown>> | undefined;
    if (!players) return;
    for (const p of players) {
      if (Array.isArray(p.cheats)) p.cheats = p.cheats.filter((c) => c !== "selfDisease");
    }
  },
};

/** Before 118, the removed `crazy_eye` and `daunting` skills could be held by players. */
const upgradeTo118: UpgradeStep = {
  to: 118,
  ids: ["SKILLS.crazy_eye", "SKILLS.daunting"],
  run: (game) => {
    const players = game.players as Array<Record<string, unknown>> | undefined;
    if (!players) return;
    for (const p of players) {
      if (Array.isArray(p.skills)) {
        p.skills = p.skills.filter((s) => s !== "crazy_eye" && s !== "daunting");
      }
      if (p.bookSkill === "crazy_eye" || p.bookSkill === "daunting") {
        delete p.bookSkill;
      }
    }
  },
};

/**
 * Before 119, merchant ships in orbit were `game.merchants` (`{ list: { id, kind, event, arrivedAt, leavesAt, deals }[],
 * nextId }`); they are now merchant signals in `game.signals` (signals.ts). Each becomes an active signal waiting for
 * Contact, with an empty feed; one already gone was dropped then, so there is no history to carry over.
 */
const upgradeTo119: UpgradeStep = {
  to: 119,
  paths: ["game.merchants"],
  run: (game) => {
    const merchants = game.merchants as { list?: Array<Record<string, unknown>> } | undefined;
    delete game.merchants;
    if (!merchants?.list || game.signals) return;
    const counts: Record<string, number> = {};
    game.signals = {
      list: merchants.list.map((m, i) => {
        const kind = m.kind as string;
        counts[kind] = (kind in counts ? counts[kind]! : 0) + 1;
        return {
          id: `signal-${i + 1}`,
          kind: "merchant",
          arrivedAt: m.arrivedAt,
          endsAt: m.leavesAt,
          status: "active",
          step: "hail",
          number: counts[kind],
          feed: [],
          merchant: { kind, event: m.event, deals: m.deals },
        };
      }),
      nextId: merchants.list.length + 1,
    };
  },
};

/**
 * Before 120, rebel calls were `game.comms.rebels` (`{ base, calledAt, expiresAt, progress }[]`); they are now rebel
 * signals in `game.signals` (signals.ts, docs/plans/signals.md step 3), after the signals already there, oldest first.
 * A call decoded to 100% is `reached`, one past its window `lost` (with the "Signal lost" line at its end), the rest
 * active. The feed of earlier decodes was never kept, so it starts empty.
 */
const upgradeTo120: UpgradeStep = {
  to: 120,
  paths: ["game.comms.rebels", "game.signals"],
  run: (game) => {
    const comms = game.comms as { rebels?: Array<{ base: string; calledAt: number; expiresAt: number; progress: number }> } | undefined;
    const rebels = comms?.rebels;
    if (comms) delete comms.rebels;
    if (!rebels) return;
    const signals = (game.signals !== undefined ? game.signals : { list: [], nextId: 1 }) as { list: unknown[]; nextId: number };
    for (const call of rebels) {
      const reached = call.progress >= 100;
      const lost = !reached && (game.cycle as number) >= call.expiresAt;
      signals.list.push({
        id: `signal-${signals.nextId++}`,
        kind: "rebel",
        arrivedAt: call.calledAt,
        endsAt: call.expiresAt,
        status: reached ? "reached" : lost ? "lost" : "active",
        step: "decoding",
        number: 1,
        feed: lost ? [{ from: "system", at: call.expiresAt, key: "signals.lost", closes: true }] : [],
        rebel: { base: call.base, progress: call.progress },
      });
    }
    game.signals = signals;
  },
};

/**
 * Before 121, an expedition away had `landed` (the landing was a step of its own) and `suitless` (members left in the
 * Icarus for want of a spacesuit). The landing now happens at takeoff and only the suited board (owner, 2026-11-17): an
 * expedition not yet landed skips its landing, and its suitless members explore.
 */
const upgradeTo121: UpgradeStep = {
  to: 121,
  paths: ["game.expedition.landed", "game.expedition.suitless"],
  run: (game) => {
    const away = game.expedition as Record<string, unknown> | null | undefined;
    if (!away) return;
    delete away.landed;
    delete away.suitless;
  },
};

/** Before 122, a player could hold the `fuelPlanet` cheat; the Superkube's Warp (kube.ts) replaced it. */
const upgradeTo122: UpgradeStep = {
  to: 122,
  paths: ["game.players[].cheats"],
  run: (game) => {
    const players = game.players as Array<Record<string, unknown>> | undefined;
    if (!players) return;
    for (const p of players) {
      if (Array.isArray(p.cheats)) p.cheats = p.cheats.filter((c) => c !== "fuelPlanet");
    }
  },
};

/**
 * Before 123, boarding the docked Icarus moved the player into its craft room (`ICARUS_CRAFT`). Now they stay in the
 * Icarus Bay (`ICARUS`) with `boardedIcarus` until takeoff (#469). Anyone in the craft while the Icarus is docked (not
 * lost, no Icarus expedition away) is put back in the bay, boarded, standing anywhere; the craft's floor goes onto the bay's.
 */
const upgradeTo123: UpgradeStep = {
  to: 123,
  paths: ["game.players[].room", "game.players[].boardedIcarus", "game.players[].spot", "game.items[].at"],
  run: (game) => {
    const away = game.expedition as { ship?: unknown } | null | undefined;
    if (game.icarusLost === true || (away && away.ship === null)) return;
    const players = Array.isArray(game.players) ? (game.players as Array<Record<string, unknown>>) : [];
    const items = Array.isArray(game.items) ? (game.items as Array<{ at?: { kind?: string; id?: string } }>) : [];
    for (const p of players) {
      if (p.room !== "ICARUS_CRAFT") continue;
      p.room = "ICARUS";
      delete p.spot;
      if (p.alive === true) p.boardedIcarus = true;
    }
    for (const item of items) {
      if (item.at?.kind === "room" && item.at.id === "ICARUS_CRAFT") item.at.id = "ICARUS";
    }
  },
};

/** Every step, in order of `to`: `upgradeTo115`, `upgradeTo116`, ... */
export const UPGRADE_STEPS: readonly UpgradeStep[] = [upgradeTo115, upgradeTo116, upgradeTo117, upgradeTo118, upgradeTo119, upgradeTo120, upgradeTo121, upgradeTo122, upgradeTo123];

/**
 * Brings a stored snapshot from version `from` to `STATE_VERSION`, before it is normalized: runs every step with
 * `from < to <= STATE_VERSION`, in order, mutating `raw` (a copy as storage hands it back). Throws `TooNewError` for a
 * `from` above `STATE_VERSION`. `steps` is for tests.
 */
export function upgrade(raw: { game: unknown; overrides: unknown }, from: number, steps: readonly UpgradeStep[] = UPGRADE_STEPS): void {
  for (const step of stepsFrom(from, steps)) step.run(raw.game as Record<string, unknown>, raw.overrides as Record<string, unknown>);
}

/** The steps a snapshot stored at `from` still needs, in order. Throws `TooNewError` for a `from` above `STATE_VERSION`. */
function stepsFrom(from: number, steps: readonly UpgradeStep[]): UpgradeStep[] {
  if (from > STATE_VERSION) throw new TooNewError(`stored at version ${from}, this build reads up to ${STATE_VERSION}`);
  return steps.filter((step) => step.to > from && step.to <= STATE_VERSION);
}

/** Every key of `T`, optional ones included, each with its own type (`undefined` allowed where it is optional). */
export type AllKeys<T> = { [K in keyof Required<T>]: T[K] };

/** A stored snapshot this build can't read: a required field is missing, or a union's discriminant is unknown. */
export class NormalizeError extends Error {
  override name = "NormalizeError";
}

/** What every normalizer can read: the game's resolved config, for defaults of fields added later. */
export interface NormalizeContext {
  config: DeepReadonly<GameConfig>;
}

/** A field that has always existed: throws when it is `undefined`. A `null` passes through. */
export function need<T extends object, K extends keyof T>(raw: T, key: K, type: string): Exclude<T[K], undefined> {
  const value = raw[key];
  if (value === undefined) throw new NormalizeError(`${type}.${String(key)} missing`);
  return value as Exclude<T[K], undefined>;
}

/** A field added after some snapshots were stored: `fallback` when it is `undefined`, never when it is `null`. */
export function added<T extends object, K extends keyof T>(raw: T, key: K, fallback: Exclude<T[K], undefined>): Exclude<T[K], undefined> {
  const value = raw[key];
  return value === undefined ? fallback : (value as Exclude<T[K], undefined>);
}

/**
 * Drops the keys whose value is `undefined` (absent optional fields, and the `undefined`-valued keys Durable Object
 * storage keeps through structured clone). Takes the literal as `AllKeys<T>`, so it must name every key of `T`.
 */
export function stripUndefined<T extends object>(obj: AllKeys<T>): T {
  const out = obj as Record<string, unknown>;
  for (const key of Object.keys(out)) if (out[key] === undefined) delete out[key];
  return obj as T;
}

/** A dictionary (or array) of primitives, copied deep so the result shares nothing with the input. */
export function dict<T>(raw: T): T {
  return clone(raw);
}

/** A dictionary of structs, each value through its normalizer. */
export function mapValues<K extends string, A, B>(raw: Partial<Record<K, A>>, fn: (value: A) => B): Record<K, B> {
  return Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, fn(value as A)])) as Record<K, B>;
}

/** An unknown or missing discriminant, for a union normalizer's `default`. */
function unknownVariant(type: string, key: string, value: unknown): NormalizeError {
  return new NormalizeError(value === undefined ? `${type}.${key} missing` : `${type}.${key} unknown: ${JSON.stringify(value)}`);
}

const opt = <A, B>(value: A | undefined, fn: (value: A) => B): B | undefined => (value === undefined ? undefined : fn(value));
const orNull = <A, B>(value: A | null, fn: (value: A) => B): B | null => (value === null ? null : fn(value));
const copy = <T>(list: readonly T[]): T[] => [...list];

// Items.

export function normalizeContainer(raw: Partial<Container>): Container {
  const t = "Container";
  switch (raw.kind) {
    case "player":
      return stripUndefined<Container>({ kind: "player", id: need(raw, "id", t) });
    case "room":
      return stripUndefined<Container>({ kind: "room", id: need(raw, "id", t) });
    default:
      throw unknownVariant(t, "kind", raw.kind satisfies undefined);
  }
}

export function normalizePlant(raw: Partial<PlantState>): PlantState {
  const t = "PlantState";
  return stripUndefined<PlantState>({ species: need(raw, "species", t), age: need(raw, "age", t), thirst: need(raw, "thirst", t), sick: need(raw, "sick", t) });
}

/** The fields an item has wherever it is, in a container or in space. */
function itemFields(raw: Partial<SpaceDebris>, t: string): AllKeys<SpaceDebris> {
  return {
    id: need(raw, "id", t),
    type: need(raw, "type", t),
    of: raw.of,
    builds: raw.builds,
    charges: raw.charges,
    teaches: raw.teaches,
    spores: raw.spores,
    plant: opt(raw.plant, normalizePlant),
    broken: raw.broken,
    jelly: raw.jelly,
    shield: raw.shield,
    spoil: raw.spoil,
    drone: opt(raw.drone, normalizeDrone),
    document: opt(raw.document, normalizeDocument),
    owner: raw.owner,
    mush: raw.mush,
  };
}

export function normalizeDocumentRow(raw: Partial<DocumentRow>): DocumentRow {
  const t = "DocumentRow";
  return { character: need(raw, "character", t), negative: need(raw, "negative", t) };
}

export function normalizeDocument(raw: Partial<DocumentState>): DocumentState {
  const t = "DocumentState";
  switch (raw.kind) {
    case "lost_analysis":
      return { kind: "lost_analysis", rows: need(raw, "rows", t).map(normalizeDocumentRow) };
    default:
      throw unknownVariant(t, "kind", raw.kind satisfies undefined);
  }
}

export function normalizeLostAnalysis(raw: Partial<LostAnalysisState>): LostAnalysisState {
  const t = "LostAnalysisState";
  return { rng: need(raw, "rng", t), rows: orNull(need(raw, "rows", t), (rows) => rows.map(normalizeDocumentRow)) };
}

/**
 * A game saved before the lost analysis (#394): a stream derived from where its `rng` stands and, once the Mush are
 * chosen, rows rolled now with the alpha Mush as the starting Mush bodies (right unless a Transfer or cure happened).
 */
function lostAnalysisFor(raw: Partial<Omit<GameState, "config">>, config: DeepReadonly<GameConfig>): LostAnalysisState {
  const t = "GameState";
  const state: LostAnalysisState = { rng: streamFor(need(raw, "rng", t), "lost-analysis"), rows: null };
  if (need(raw, "preselection", t)) return state;
  const aboard = need(raw, "players", t).map((p) => ({ character: need(p, "character", "PlayerState"), mush: need(p, "alpha", "PlayerState") }));
  state.rows = rollLostAnalysis(state, aboard, config.comms.xyloph.lostAnalysisPerMush);
  return state;
}

export function normalizeDrone(raw: Partial<DroneState>): DroneState {
  const t = "DroneState";
  const failures = need(raw, "failures", t);
  return { name: need(raw, "name", t), serial: need(raw, "serial", t), upgrades: [...need(raw, "upgrades", t)], failures: { repair: failures.repair, extinguish: failures.extinguish, shoot: failures.shoot } };
}

export function normalizeNpcs(raw: Partial<NpcState>): NpcState {
  const t = "NpcState";
  return { rng: need(raw, "rng", t), droneNames: [...need(raw, "droneNames", t)] };
}

export function normalizeItem(raw: Partial<ItemState>): ItemState {
  const t = "ItemState";
  return stripUndefined<ItemState>({ ...itemFields(raw, t), at: normalizeContainer(need(raw, "at", t)), hiddenBy: raw.hiddenBy });
}

export function normalizeDrug(raw: Partial<DrugEffect>): DrugEffect {
  const t = "DrugEffect";
  return stripUndefined<DrugEffect>({ morale: need(raw, "morale", t), ap: need(raw, "ap", t), mp: need(raw, "mp", t), treats: [...need(raw, "treats", t)] });
}

export function normalizeFruitDisease(raw: Partial<FruitDisease>): FruitDisease {
  const t = "FruitDisease";
  return stripUndefined<FruitDisease>({ id: need(raw, "id", t), odds: need(raw, "odds", t) });
}

export function normalizeFruit(raw: Partial<FruitEffect>): FruitEffect {
  const t = "FruitEffect";
  return stripUndefined<FruitEffect>({
    ap: need(raw, "ap", t),
    morale: need(raw, "morale", t),
    hp: need(raw, "hp", t),
    buffs: [...need(raw, "buffs", t)],
    diseases: need(raw, "diseases", t).map(normalizeFruitDisease),
    growCycles: need(raw, "growCycles", t),
  });
}

export function normalizePendingDisease(raw: Partial<PendingDisease>): PendingDisease {
  const t = "PendingDisease";
  return stripUndefined<PendingDisease>({ id: need(raw, "id", t), atCycle: need(raw, "atCycle", t) });
}

export function normalizeDrugDispenser(raw: Partial<DrugDispenserState>): DrugDispenserState {
  const t = "DrugDispenserState";
  return { list: [...need(raw, "list", t)], used: need(raw, "used", t) };
}

export function normalizeDebris(raw: Partial<SpaceDebris>): SpaceDebris {
  return stripUndefined<SpaceDebris>(itemFields(raw, "SpaceDebris"));
}

export function normalizeEquipment(raw: Partial<Equipment>): Equipment {
  const t = "Equipment";
  return stripUndefined<Equipment>({ id: need(raw, "id", t), type: need(raw, "type", t), broken: raw.broken, jelly: raw.jelly, shield: raw.shield });
}

// Players.

export function normalizeSpot(raw: Partial<Spot>): Spot {
  const t = "Spot";
  switch (raw.kind) {
    case "cell":
      return stripUndefined<Spot>({ kind: "cell", x: need(raw, "x", t), y: need(raw, "y", t), sitting: raw.sitting });
    case "door":
      return stripUndefined<Spot>({ kind: "door", door: need(raw, "door", t) });
    case "occupancy":
      return stripUndefined<Spot>({ kind: "occupancy", equipment: need(raw, "equipment", t), chair: raw.chair });
    default:
      throw unknownVariant(t, "kind", raw.kind satisfies undefined);
  }
}

export function normalizeDiseaseTracker(raw: Partial<DiseaseTracker>): DiseaseTracker {
  const t = "DiseaseTracker";
  return stripUndefined<DiseaseTracker>({
    name: need(raw, "name", t),
    duration: need(raw, "duration", t),
    resistance: need(raw, "resistance", t),
    complete: need(raw, "complete", t),
    forever: need(raw, "forever", t),
  });
}


type AccommodationOffer = NonNullable<PlayerState["accommodationOffers"]>[number];

export function normalizeAccommodationOffer(raw: Partial<AccommodationOffer>): AccommodationOffer {
  const t = "AccommodationOffer";
  return stripUndefined<AccommodationOffer>({ by: need(raw, "by", t), until: need(raw, "until", t) });
}

/**
 * What happens to a player's action under way and queue (#384, "The action queue" in docs/plans/normalize-state.md).
 * `drop`, for a live game: both are emptied (amendment 5). Nothing has been paid for them, and the player presses
 * again. That keeps `Action` out of the shape this file covers. `keep`, for a replay frame: both are copied through
 * as stored, unchecked, so a replay still shows action bars. They are display only: if an older `Action` shape breaks
 * `viewFor`, `perspective` throws a `HistoryError`.
 */
export type QueueMode = { queue: "drop" | "keep" };

/** A player, with their `Seat` fields. */
export function normalizePlayer(raw: Partial<PlayerState>, mode: QueueMode): PlayerState {
  const t = "PlayerState";
  const resources = need(raw, "resources", t);
  const r = "PlayerState.resources";
  return stripUndefined<PlayerState>({
    id: need(raw, "id", t),
    name: need(raw, "name", t),
    isBot: need(raw, "isBot", t),
    botKind: raw.botKind,
    character: need(raw, "character", t),
    mind: need(raw, "mind", t),
    transferUsed: raw.transferUsed,
    epigeneticsUsed: raw.epigeneticsUsed,
    massMoulderingUsed: raw.massMoulderingUsed,
    apprenticeUsed: raw.apprenticeUsed,
    geniusUsed: raw.geniusUsed,
    ceasefireUsed: raw.ceasefireUsed,
    caressedCat: raw.caressedCat,
    bodyTakenBy: raw.bodyTakenBy,
    role: need(raw, "role", t),
    alpha: need(raw, "alpha", t),
    room: need(raw, "room", t),
    spot: opt(raw.spot, normalizeSpot),
    enteredFrom: raw.enteredFrom,
    ap: need(raw, "ap", t),
    maxAp: need(raw, "maxAp", t),
    lyingIn: raw.lyingIn,
    lyingSince: raw.lyingSince,
    boardedIcarus: raw.boardedIcarus,
    pushedBy: raw.pushedBy,
    outcastBy: raw.outcastBy,
    protectedBy: raw.protectedBy,
    coupPending: raw.coupPending,
    lastSeenAt: raw.lastSeenAt,
    inactivity: raw.inactivity,
    boringToday: raw.boringToday,
    fertileToday: raw.fertileToday,
    doormanToday: raw.doormanToday,
    chitchatToday: raw.chitchatToday,
    interrogatedToday: raw.interrogatedToday,
    snoopedToday: opt(raw.snoopedToday, copy),
    mycoscannedToday: raw.mycoscannedToday,
    cpuPriorityChangedToday: added(raw, "cpuPriorityChangedToday", false),
    hackedEquipment: opt(raw.hackedEquipment, copy),
    unheard: opt(raw.unheard, dict),
    history: copy(need(raw, "history", t)),
    logSeen: need(raw, "logSeen", t),
    accommodationOffers: opt(raw.accommodationOffers, (offers) => offers.map(normalizeAccommodationOffer)),
    mp: need(raw, "mp", t),
    maxMp: need(raw, "maxMp", t),
    hp: need(raw, "hp", t),
    maxHp: need(raw, "maxHp", t),
    morale: need(raw, "morale", t),
    maxMorale: need(raw, "maxMorale", t),
    satiety: need(raw, "satiety", t),
    satietyZeroSince: need(raw, "satietyZeroSince", t),
    statuses: copy(need(raw, "statuses", t)),
    diseaseTrackers: need(raw, "diseaseTrackers", t).map(normalizeDiseaseTracker),
    immuneUntil: raw.immuneUntil,
    treatDiseaseUntil: raw.treatDiseaseUntil,
    energizeUntil: raw.energizeUntil,
    perceptionUntil: raw.perceptionUntil,
    pendingDiseases: opt(raw.pendingDiseases, (list) => list.map(normalizePendingDisease)),
    spores: need(raw, "spores", t),
    // Fixed keys: a new resource doesn't compile until it has a default here.
    resources: {
      eng: need(resources, "eng", r),
      exp: need(resources, "exp", r),
      comp: need(resources, "comp", r),
      garden: need(resources, "garden", r),
      core: need(resources, "core", r),
      shoot: need(resources, "shoot", r),
      cook: need(resources, "cook", r),
      heal: need(resources, "heal", r),
      pilgred: need(resources, "pilgred", r),
    } satisfies AllKeys<PlayerState["resources"]>,
    modifiers: copy(need(raw, "modifiers", t)),
    skills: copy(need(raw, "skills", t)),
    bookSkill: raw.bookSkill,
    mushSkills: copy(need(raw, "mushSkills", t)),
    alive: need(raw, "alive", t),
    ready: need(raw, "ready", t),
    current: mode.queue === "drop" ? null : clone(need(raw, "current", t)),
    queue: mode.queue === "drop" ? [] : clone(need(raw, "queue", t)),
    cheats: copy(need(raw, "cheats", t)),
  });
}

// Log and chat.

export function normalizeLogEntry(raw: Partial<LogEntry>): LogEntry {
  const t = "LogEntry";
  const visibleTo = need(raw, "visibleTo", t);
  return stripUndefined<LogEntry>({
    id: need(raw, "id", t),
    cycle: need(raw, "cycle", t),
    at: raw.at,
    key: need(raw, "key", t),
    params: opt(raw.params, dict),
    room: raw.room,
    visibleTo: visibleTo === "all" ? "all" : copy(visibleTo),
    level: raw.level,
    kind: raw.kind,
    leaked: raw.leaked,
  });
}

type SystemMessage = NonNullable<ChatMessage["system"]>;

export function normalizeSystemMessage(raw: Partial<SystemMessage>): SystemMessage {
  return stripUndefined<SystemMessage>({ key: need(raw, "key", "ChatMessage.system"), params: opt(raw.params, dict) });
}

export function normalizeChatMessage(raw: Partial<ChatMessage>): ChatMessage {
  const t = "ChatMessage";
  return stripUndefined<ChatMessage>({
    id: need(raw, "id", t),
    seq: need(raw, "seq", t),
    cycle: need(raw, "cycle", t),
    at: raw.at,
    channel: need(raw, "channel", t),
    from: need(raw, "from", t),
    isBot: need(raw, "isBot", t),
    text: need(raw, "text", t),
    system: opt(raw.system, normalizeSystemMessage),
  });
}

export function normalizeChatMark(raw: Partial<ChatMark>): ChatMark {
  const t = "ChatMark";
  return stripUndefined<ChatMark>({ from: need(raw, "from", t), tasks: copy(need(raw, "tasks", t)), checked: copy(need(raw, "checked", t)) });
}

export function normalizePrivateChannel(raw: Partial<PrivateChannel>): PrivateChannel {
  const t = "PrivateChannel";
  return stripUndefined<PrivateChannel>({
    id: need(raw, "id", t),
    name: need(raw, "name", t),
    members: copy(need(raw, "members", t)),
    createdBy: need(raw, "createdBy", t),
    planningClosed: raw.planningClosed,
    day: need(raw, "day", t),
    cycleOfDay: need(raw, "cycleOfDay", t),
  });
}

export function normalizeSharedReport(raw: Partial<SharedReportState>): SharedReportState {
  const t = "SharedReportState";
  return stripUndefined<SharedReportState>({
    id: need(raw, "id", t),
    text: need(raw, "text", t),
    by: need(raw, "by", t),
    day: need(raw, "day", t),
    cycleOfDay: need(raw, "cycleOfDay", t),
    report: need(raw, "report", t),
  });
}

export function normalizeThread(raw: Partial<ChatThread>): ChatThread {
  const t = "ChatThread";
  return stripUndefined<ChatThread>({ id: need(raw, "id", t), name: need(raw, "name", t), from: raw.from, createdBy: need(raw, "createdBy", t), cycle: need(raw, "cycle", t) });
}

export function normalizeSharedPlanet(raw: Partial<SharedPlanetState>): SharedPlanetState {
  const t = "SharedPlanetState";
  return stripUndefined<SharedPlanetState>({
    id: need(raw, "id", t),
    // Entries shared before structured shares (docs/plans/expedition-ui.md): the text's first line stands for the
    // name, and no sector slots.
    name: added(raw, "name", need(raw, "text", t).split("\n", 1)[0]!),
    sectors: added(raw, "sectors", []),
    text: need(raw, "text", t),
    by: need(raw, "by", t),
    day: need(raw, "day", t),
    cycleOfDay: need(raw, "cycleOfDay", t),
    stale: need(raw, "stale", t),
    planet: need(raw, "planet", t),
  });
}

export function normalizeSealedChatPage(raw: Partial<SealedChatPage>): SealedChatPage {
  const t = "SealedChatPage";
  return stripUndefined<SealedChatPage>({ channel: need(raw, "channel", t), page: need(raw, "page", t), messages: need(raw, "messages", t).map(normalizeChatMessage) });
}

type DroppedChannel = ChatOutbox["dropped"][number];

export function normalizeOutbox(raw: Partial<ChatOutbox>): ChatOutbox {
  const t = "ChatOutbox";
  const dropped = (d: Partial<DroppedChannel>) => stripUndefined<DroppedChannel>({ channel: need(d, "channel", t), pages: need(d, "pages", t) });
  return stripUndefined<ChatOutbox>({ sealed: need(raw, "sealed", t).map(normalizeSealedChatPage), dropped: need(raw, "dropped", t).map(dropped) });
}

// Plans.

export function normalizePlanTask(raw: Partial<PlanTask>): PlanTask {
  const t = "PlanTask";
  switch (raw.type) {
    case "research":
      return stripUndefined<PlanTask>({ type: "research", research: need(raw, "research", t) });
    case "project":
      return stripUndefined<PlanTask>({ type: "project", project: need(raw, "project", t) });
    case "repair_pilgred":
      return stripUndefined<PlanTask>({ type: "repair_pilgred" });
    case "heal":
      return stripUndefined<PlanTask>({ type: "heal", target: need(raw, "target", t) });
    case "comfort":
      return stripUndefined<PlanTask>({ type: "comfort", target: need(raw, "target", t) });
    case "stt":
      return stripUndefined<PlanTask>({ type: "stt", target: need(raw, "target", t) });
    case "fiery_speech":
      return stripUndefined<PlanTask>({ type: "fiery_speech" });
    case "boring_speech":
      return stripUndefined<PlanTask>({ type: "boring_speech" });
    case "bring":
      return stripUndefined<PlanTask>({ type: "bring", itemType: need(raw, "itemType", t) });
    default:
      throw unknownVariant(t, "type", raw.type satisfies undefined);
  }
}

export function normalizePlanSlot(raw: Partial<PlanSlot>): PlanSlot {
  const t = "PlanSlot";
  switch (raw.kind) {
    case "onCall":
      return stripUndefined<PlanSlot>({ kind: "onCall", holder: need(raw, "holder", t), reservedFor: raw.reservedFor, outcome: raw.outcome });
    case "task":
      return stripUndefined<PlanSlot>({
        kind: "task",
        task: normalizePlanTask(need(raw, "task", t)),
        holder: need(raw, "holder", t),
        reservedFor: raw.reservedFor,
        done: need(raw, "done", t),
        struck: raw.struck,
      });
    default:
      throw unknownVariant(t, "kind", raw.kind satisfies undefined);
  }
}

export function normalizePlan(raw: Partial<Plan>): Plan {
  const t = "Plan";
  return stripUndefined<Plan>({
    id: need(raw, "id", t),
    channel: need(raw, "channel", t),
    author: need(raw, "author", t),
    room: need(raw, "room", t),
    purpose: need(raw, "purpose", t),
    slots: need(raw, "slots", t).map(normalizePlanSlot),
    status: need(raw, "status", t),
    postedDay: need(raw, "postedDay", t),
  });
}

// Ship systems.

export function normalizeShip(raw: Partial<ShipResources>): ShipResources {
  const t = "ShipResources";
  return stripUndefined<ShipResources>({
    oxygen: need(raw, "oxygen", t),
    fuel: need(raw, "fuel", t),
    combustion: need(raw, "combustion", t),
    hull: need(raw, "hull", t),
    plasmaShield: need(raw, "plasmaShield", t),
  });
}

type Comms = GameCore["comms"];

export function normalizeComms(raw: Partial<Comms>): Comms {
  const t = "CommsState";
  const neron = need(raw, "neron", t);
  return stripUndefined<Comms>({
    linked: need(raw, "linked", t),
    solChance: need(raw, "solChance", t),
    xyloph: copy(need(raw, "xyloph", t)),
    neron: stripUndefined<Comms["neron"]>({ version: need(neron, "version", "CommsState.neron"), progress: need(neron, "progress", "CommsState.neron") }),
  });
}

type Navigation = GameCore["navigation"];
type Arriving = NonNullable<Navigation["arriving"]>;
type LastTurn = NonNullable<Navigation["lastTurn"]>;

export function normalizeNavigation(raw: Partial<Navigation>): Navigation {
  const t = "Navigation";
  const arriving = (a: Partial<Arriving>) => stripUndefined<Arriving>({ planet: need(a, "planet", "Navigation.arriving") });
  const lastTurn = (l: Partial<LastTurn>) => stripUndefined<LastTurn>({ n: need(l, "n", "Navigation.lastTurn"), side: need(l, "side", "Navigation.lastTurn") });
  return stripUndefined<Navigation>({
    heading: need(raw, "heading", t),
    orbit: need(raw, "orbit", t),
    arriving: orNull(need(raw, "arriving", t), arriving),
    lastTurn: orNull(need(raw, "lastTurn", t), lastTurn),
  });
}

/** A door's state (doors.ts, #330). */
export function normalizeDoor(raw: Partial<DoorState>): DoorState {
  return stripUndefined<DoorState>({ broken: raw.broken });
}

export function normalizeReport(raw: Partial<Report>): Report {
  const t = "Report";
  switch (raw.kind) {
    case "fire":
      return stripUndefined<Report>({ kind: "fire", room: need(raw, "room", t), by: need(raw, "by", t) });
    case "equipment":
      return stripUndefined<Report>({ kind: "equipment", equipment: need(raw, "equipment", t), by: need(raw, "by", t) });
    case "door":
      return stripUndefined<Report>({ kind: "door", door: need(raw, "door", t), by: need(raw, "by", t) });
    default:
      throw unknownVariant(t, "kind", raw.kind satisfies undefined);
  }
}

export function normalizeHunterTarget(raw: Partial<HunterTarget>): HunterTarget {
  const t = "HunterTarget";
  switch (raw.kind) {
    case "ship":
      return stripUndefined<HunterTarget>({ kind: "ship" });
    case "patrol":
      return stripUndefined<HunterTarget>({ kind: "patrol", id: need(raw, "id", t) });
    case "hunter":
      return stripUndefined<HunterTarget>({ kind: "hunter", id: need(raw, "id", t) });
    default:
      throw unknownVariant(t, "kind", raw.kind satisfies undefined);
  }
}

export function normalizeHunter(raw: Partial<Hunter>): Hunter {
  const t = "Hunter";
  // `type` and `countdown` came with the other kinds (#388): a hunter stored before them is a plain hunter.
  return stripUndefined<Hunter>({
    id: need(raw, "id", t),
    type: added(raw, "type", "hunter"),
    hp: need(raw, "hp", t),
    hitChance: need(raw, "hitChance", t),
    target: orNull(need(raw, "target", t), normalizeHunterTarget),
    countdown: added(raw, "countdown", null),
  });
}

type Hunters = GameCore["hunters"];

export function normalizeHunters(raw: Partial<Hunters>): Hunters {
  const t = "Hunters";
  return stripUndefined<Hunters>({ points: need(raw, "points", t), since: need(raw, "since", t), list: need(raw, "list", t).map(normalizeHunter), nextId: need(raw, "nextId", t) });
}

export function normalizeGiveAsset(raw: Partial<GiveAsset>): GiveAsset {
  const t = "GiveAsset";
  switch (raw.kind) {
    case "crew":
      return stripUndefined<GiveAsset>({ kind: "crew", count: need(raw, "count", t) });
    case "character":
      return stripUndefined<GiveAsset>({ kind: "character", character: need(raw, "character", t), count: need(raw, "count", t) });
    case "project":
      return stripUndefined<GiveAsset>({ kind: "project", count: need(raw, "count", t) });
    case "item":
      return stripUndefined<GiveAsset>({ kind: "item", item: need(raw, "item", t), count: need(raw, "count", t) });
    case "oxygen":
    case "fuel":
      return stripUndefined<GiveAsset>({ kind: raw.kind, count: need(raw, "count", t) });
    default:
      throw unknownVariant(t, "kind", raw.kind satisfies undefined);
  }
}

export function normalizeReceiveAsset(raw: Partial<ReceiveAsset>): ReceiveAsset {
  const t = "ReceiveAsset";
  switch (raw.kind) {
    case "item":
      return stripUndefined<ReceiveAsset>({ kind: "item", item: need(raw, "item", t), count: need(raw, "count", t) });
    case "project":
    case "pilgred":
      return stripUndefined<ReceiveAsset>({ kind: raw.kind, count: need(raw, "count", t) } as ReceiveAsset);
    default:
      throw unknownVariant(t, "kind", raw.kind satisfies undefined);
  }
}

export function normalizeMerchantDeal(raw: Partial<MerchantDeal>): MerchantDeal {
  const t = "MerchantDeal";
  return stripUndefined<MerchantDeal>({ give: need(raw, "give", t).map(normalizeGiveAsset), receive: need(raw, "receive", t).map(normalizeReceiveAsset), skill: raw.skill });
}

export function normalizeMerchantData(raw: Partial<MerchantData>, ctx: NormalizeContext): MerchantData {
  const t = "MerchantData";
  const kind = need(raw, "kind", t);
  return stripUndefined<MerchantData>({
    kind,
    event: need(raw, "event", t),
    deals: need(raw, "deals", t).map(normalizeMerchantDeal),
    // Shooting a merchant (2026-11-21): one stored before it is unhurt.
    hp: added(raw, "hp", ctx.config.merchants.kinds[kind].hp),
    fleeing: raw.fleeing,
  });
}

export function normalizeFeedEntry(raw: Partial<FeedEntry>): FeedEntry {
  const t = "FeedEntry";
  return stripUndefined<FeedEntry>({
    from: need(raw, "from", t),
    at: need(raw, "at", t),
    officer: raw.officer,
    key: need(raw, "key", t),
    params: opt(raw.params, dict),
    closes: raw.closes,
  });
}

export function normalizeSignal(raw: Partial<Signal>, ctx: NormalizeContext): Signal {
  const t = "Signal";
  return stripUndefined<Signal>({
    id: need(raw, "id", t),
    kind: need(raw, "kind", t),
    arrivedAt: need(raw, "arrivedAt", t),
    endsAt: need(raw, "endsAt", t),
    status: need(raw, "status", t),
    step: need(raw, "step", t),
    number: need(raw, "number", t),
    feed: need(raw, "feed", t).map(normalizeFeedEntry),
    merchant: opt(raw.merchant, (m) => normalizeMerchantData(m, ctx)),
    rebel: opt(raw.rebel, normalizeRebelData),
  });
}

export function normalizeRebelData(raw: Partial<RebelData>): RebelData {
  const t = "RebelData";
  return stripUndefined<RebelData>({ base: need(raw, "base", t), progress: need(raw, "progress", t) });
}

export function normalizeSignals(raw: Partial<SignalsState>, ctx: NormalizeContext): SignalsState {
  const t = "SignalsState";
  return stripUndefined<SignalsState>({ list: need(raw, "list", t).map((s) => normalizeSignal(s, ctx)), nextId: need(raw, "nextId", t) });
}

type PatrolShip = GameCore["patrolShips"][string];

export function normalizePatrolShip(raw: Partial<PatrolShip>): PatrolShip {
  const t = "PatrolShip";
  return stripUndefined<PatrolShip>({ armor: need(raw, "armor", t), charges: need(raw, "charges", t), out: need(raw, "out", t), destroyed: need(raw, "destroyed", t),
    // Phase 5 (#359): no ship could land on a planet before it.
    onPlanet: added(raw, "onPlanet", null),
  });
}

export function normalizeRelayToken(raw: Partial<RelayToken>): RelayToken {
  const t = "RelayToken";
  return stripUndefined<RelayToken>({ by: need(raw, "by", t), base: need(raw, "base", t), roll: need(raw, "roll", t), unpenalized: raw.unpenalized });
}

export function normalizeSample(raw: Partial<Sample>): Sample {
  return stripUndefined<Sample>({ ...normalizeRelayToken(raw), unpenalized: raw.unpenalized, contaminatedBy: raw.contaminatedBy });
}

export function normalizeRelayPool(raw: Partial<RelayPool>): RelayPool {
  return stripUndefined<RelayPool>({ tokens: need(raw, "tokens", "RelayPool").map(normalizeRelayToken) });
}

export function normalizeResearchPool(raw: Partial<ResearchPool>): ResearchPool {
  const t = "ResearchPool";
  return stripUndefined<ResearchPool>({ tokens: need(raw, "tokens", t).map(normalizeSample), pending: need(raw, "pending", t).map(normalizeSample) });
}

export function normalizeRelayStreak(raw: Partial<RelayStreak>): RelayStreak {
  const t = "RelayStreak";
  return stripUndefined<RelayStreak>({ lastBy: need(raw, "lastBy", t), streak: need(raw, "streak", t) });
}

type Relay = GameCore["relay"];

export function normalizeRelay(raw: Partial<Relay>): Relay {
  const t = "Relay";
  return stripUndefined<Relay>({ research: mapValues(need(raw, "research", t), normalizeResearchPool), projects: mapValues(need(raw, "projects", t), normalizeRelayStreak) });
}

type Pilgred = GameCore["pilgred"];

export function normalizePilgred(raw: Partial<Pilgred>): Pilgred {
  const t = "Pilgred";
  return stripUndefined<Pilgred>({ progress: need(raw, "progress", t), pool: normalizeRelayPool(need(raw, "pool", t)) });
}

// Planets and expeditions.

type Sector = Planet["sectors"][number];

export function normalizeSector(raw: Partial<Sector>): Sector {
  const t = "Planet.sectors";
  return stripUndefined<Sector>({ tag: need(raw, "tag", t), known: need(raw, "known", t), explored: raw.explored });
}

export function normalizePlanet(raw: Partial<Planet>): Planet {
  const t = "Planet";
  return stripUndefined<Planet>({
    id: need(raw, "id", t),
    name: need(raw, "name", t),
    direction: need(raw, "direction", t),
    distance: need(raw, "distance", t),
    sectors: need(raw, "sectors", t).map(normalizeSector),
    inexhaustible: raw.inexhaustible,
  });
}

type Fight = NonNullable<ExpeditionEvent["fight"]>;
type Hurt = NonNullable<ExpeditionEvent["hurt"]>[number];
type Found = NonNullable<ExpeditionEvent["found"]>[number];

export function normalizeExpeditionEvent(raw: Partial<ExpeditionEvent>): ExpeditionEvent {
  const t = "ExpeditionEvent";
  const fight = (f: Partial<Fight>) =>
    stripUndefined<Fight>({ strength: need(f, "strength", `${t}.fight`), grenades: need(f, "grenades", `${t}.fight`), won: need(f, "won", `${t}.fight`) });
  const hurt = (h: Partial<Hurt>) => stripUndefined<Hurt>({ name: need(h, "name", `${t}.hurt`), hp: need(h, "hp", `${t}.hurt`) });
  const found = (f: Partial<Found>) => stripUndefined<Found>({ item: need(f, "item", `${t}.found`), count: need(f, "count", `${t}.found`) });
  return stripUndefined<ExpeditionEvent>({
    sector: need(raw, "sector", t),
    kind: need(raw, "kind", t),
    amount: raw.amount,
    item: raw.item,
    creature: raw.creature,
    found: opt(raw.found, (list) => list.map(found)),
    fight: opt(raw.fight, fight),
    hurt: opt(raw.hurt, (list) => list.map(hurt)),
    died: opt(raw.died, copy),
    who: raw.who,
    avoided: opt(raw.avoided, (a) => ({ name: need(a, "name", `${t}.avoided`), item: need(a, "item", `${t}.avoided`) })),
  });
}

export function normalizeExpedition(raw: Partial<ExpeditionReport>): ExpeditionReport {
  const t = "ExpeditionReport";
  return stripUndefined<ExpeditionReport>({
    id: need(raw, "id", t),
    members: copy(need(raw, "members", t)),
    crew: copy(need(raw, "crew", t)),
    planet: need(raw, "planet", t),
    events: need(raw, "events", t).map(normalizeExpeditionEvent),
    lostAt: opt(raw.lostAt, (m) => ({ ...m })),
    ship: raw.ship,
  });
}

export function normalizeActiveExpedition(raw: Partial<ActiveExpedition>): ActiveExpedition {
  const t = "ActiveExpedition";
  return stripUndefined<ActiveExpedition>({
    report: need(raw, "report", t),
    planet: need(raw, "planet", t),
    sectors: copy(need(raw, "sectors", t)),
    nextAt: need(raw, "nextAt", t),
    carried: mapValues(need(raw, "carried", t), copy),
    // Slice D (#358): nobody could sabotage before it.
    sabotaged: added(raw, "sabotaged", false),
    // 2026-11-17: before it, a Sabotage covered every sector after it; the one under way keeps covering the next.
    sabotageNext: added(raw, "sabotageNext", raw.sabotaged === true),
    // Expedition UI slice 1 (2026-11-19): an expedition under way before it shows no HP until its next step.
    hp: added(raw, "hp", {}),
    // Phase 5 (#359): only the Icarus went before it.
    ship: added(raw, "ship", null),
  });
}

// Config overrides and seat starts (the server's `StoredRoom`, and `FullView.starts`).

export function normalizePreselection(raw: Partial<PreselectionRules>): PreselectionRules {
  const t = "PreselectionRules";
  const endsOn = need(raw, "endsOn", t);
  return stripUndefined<PreselectionRules>({
    seats: need(raw, "seats", t),
    endsOn: stripUndefined<PreselectionRules["endsOn"]>({ day: need(endsOn, "day", `${t}.endsOn`), cycle: need(endsOn, "cycle", `${t}.endsOn`) }),
    mushCount: need(raw, "mushCount", t),
    twoMushAbove: need(raw, "twoMushAbove", t),
    minPlayers: need(raw, "minPlayers", t),
  });
}

export function normalizeOverrides(raw: Partial<ConfigOverrides>): ConfigOverrides {
  return stripUndefined<ConfigOverrides>({
    mushCount: raw.mushCount,
    manualCycles: raw.manualCycles,
    instantExpeditions: raw.instantExpeditions,
    cycleHours: raw.cycleHours,
    sharedSpots: raw.sharedSpots,
    setupId: raw.setupId,
    cheatRoom: raw.cheatRoom,
    preselection: opt(raw.preselection, normalizePreselection),
  });
}

export function normalizeSeatStart(raw: Partial<SeatStart>): SeatStart {
  return stripUndefined<SeatStart>({ role: need(raw, "role", "SeatStart"), character: need(raw, "character", "SeatStart") });
}

export function normalizeSeatStarts(raw: Partial<SeatStarts>): SeatStarts {
  return mapValues(raw, normalizeSeatStart);
}

// The game.

/** The game's own data, shared by the live game and a replay frame. */
export function normalizeCore(raw: Partial<GameCore>, ctx: NormalizeContext, mode: QueueMode): GameCore {
  const t = "GameCore";
  const bios = need(raw, "bios", t);
  const titles = need(raw, "titles", t);
  const projects = dict(need(raw, "projects", t));
  return stripUndefined<GameCore>({
    cycle: need(raw, "cycle", t),
    phase: need(raw, "phase", t),
    preselection: need(raw, "preselection", t),
    winner: need(raw, "winner", t),
    ending: need(raw, "ending", t),
    players: need(raw, "players", t).map((p) => normalizePlayer(p, mode)),
    items: need(raw, "items", t).map(normalizeItem),
    nextItemId: need(raw, "nextItemId", t),
    equipment: mapValues(need(raw, "equipment", t), (list) => list.map(normalizeEquipment)),
    dispensedOn: dict(need(raw, "dispensedOn", t)),
    drugs: mapValues(added(raw, "drugs", {}), normalizeDrug),
    fruits: mapValues(added(raw, "fruits", {}), normalizeFruit),
    drugDispenser: normalizeDrugDispenser(added(raw, "drugDispenser", { list: [], used: false })),
    log: need(raw, "log", t).map(normalizeLogEntry),
    nextLogId: need(raw, "nextLogId", t),
    chat: need(raw, "chat", t).map(normalizeChatMessage),
    nextChatId: need(raw, "nextChatId", t),
    chatSeq: dict(need(raw, "chatSeq", t)),
    chatMarks: mapValues(need(raw, "chatMarks", t), normalizeChatMark),
    channels: need(raw, "channels", t).map(normalizePrivateChannel),
    nextChannelId: need(raw, "nextChannelId", t),
    plans: need(raw, "plans", t).map(normalizePlan),
    nextPlanId: need(raw, "nextPlanId", t),
    threads: need(raw, "threads", t).map(normalizeThread),
    nextThreadId: need(raw, "nextThreadId", t),
    // Fixed keys, like `titles` and `PlayerState.resources`: a new BIOS option doesn't compile until it has a default.
    bios: {
      actopi: need(bios, "actopi", `${t}.bios`),
      death_announcements: need(bios, "death_announcements", `${t}.bios`),
      plasma_shield: need(bios, "plasma_shield", `${t}.bios`),
      cpu_priority: added(bios, "cpu_priority", "none"),
      crew_lock: added(bios, "crew_lock", "piloting"),
    } satisfies AllKeys<GameCore["bios"]>,
    bonds: dict(need(raw, "bonds", t)),
    sharedOnDay: dict(need(raw, "sharedOnDay", t)),
    contamination: dict(need(raw, "contamination", t)),
    ship: normalizeShip(need(raw, "ship", t)),
    sporesToday: need(raw, "sporesToday", t),
    // Commander's Issue mission (#462): not yet used today in a game stored before it.
    missionIssuedToday: added(raw, "missionIssuedToday", false),
    spikedOn: dict(need(raw, "spikedOn", t)),
    research: dict(need(raw, "research", t)),
    projects,
    projectDeck: copy(added(raw, "projectDeck", PROJECT_IDS.filter((id) => !(projects[id] !== undefined && projects[id] >= 100)))),
    // A game saved before TECHNO_REWRITE (#143) has traded no project away.
    lostProjects: copy(added(raw, "lostProjects", [])),
    relay: normalizeRelay(need(raw, "relay", t)),
    pilgred: normalizePilgred(need(raw, "pilgred", t)),
    comms: normalizeComms(need(raw, "comms", t)),
    planets: mapValues(need(raw, "planets", t), (list) => list.map(normalizePlanet)),
    nextPlanetId: need(raw, "nextPlanetId", t),
    sharedPlanets: need(raw, "sharedPlanets", t).map(normalizeSharedPlanet),
    nextSharedPlanetId: need(raw, "nextSharedPlanetId", t),
    expeditions: need(raw, "expeditions", t).map(normalizeExpedition),
    nextExpeditionId: need(raw, "nextExpeditionId", t),
    // Shared reports (#356): none in a game stored before them.
    sharedReports: added(raw, "sharedReports", []).map(normalizeSharedReport),
    nextSharedReportId: added(raw, "nextSharedReportId", 1),
    // Phase 2 (#356): none under way in a game stored before it, where every expedition was over at takeoff.
    expedition: orNull(added(raw, "expedition", null), normalizeActiveExpedition),
    // Stranding (#356): no game stored before it could lose the Icarus.
    icarusLost: added(raw, "icarusLost", false),
    navigation: normalizeNavigation(need(raw, "navigation", t)),
    hunters: normalizeHunters(need(raw, "hunters", t)),
    // Signals (docs/plans/signals.md): none in a game stored before merchants (#143); upgradeTo119 moved those.
    signals: normalizeSignals(added(raw, "signals", { list: [], nextId: 1 }), ctx),
    turrets: dict(need(raw, "turrets", t)),
    patrolShips: mapValues(need(raw, "patrolShips", t), normalizePatrolShip),
    space: need(raw, "space", t).map(normalizeDebris),
    failureStreaks: dict(need(raw, "failureStreaks", t)),
    incidentPoints: need(raw, "incidentPoints", t),
    // Doors (#330): every door working in a game stored before them.
    doors: mapValues(added(raw, "doors", {}), normalizeDoor),
    fires: copy(need(raw, "fires", t)),
    // Ceasefire (owner, 2026-11-17): none active in a game stored before it.
    ceasefires: dict(added(raw, "ceasefires", {})),
    // Reports (#444): none in a game stored before them.
    reports: added(raw, "reports", []).map(normalizeReport),
    pendingFires: copy(need(raw, "pendingFires", t)),
    titles: {
      commander: need(titles, "commander", `${t}.titles`),
      neron_admin: need(titles, "neron_admin", `${t}.titles`),
      comms_officer: need(titles, "comms_officer", `${t}.titles`),
    } satisfies AllKeys<GameCore["titles"]>,
    now: need(raw, "now", t),
  });
}

/**
 * A live game as stored (without its config) back to a whole `GameState`: the config is resolved from `overrides`
 * (already normalized), so it picks up this build's balance numbers.
 */
export function normalizeGame(raw: Partial<Omit<GameState, "config">>, overrides: ConfigOverrides): GameState {
  const t = "GameState";
  const config = resolveConfig(overrides);
  return stripUndefined<GameState>({
    ...normalizeCore(raw, { config }, { queue: "drop" }),
    config,
    rng: need(raw, "rng", t),
    // A game saved before the NPCs had a stream of their own derives one from where its `rng` stands.
    npcs: normalizeNpcs(added(raw, "npcs", newNpcState(need(raw, "rng", t)))),
    lostAnalysis: normalizeLostAnalysis(added(raw, "lostAnalysis", lostAnalysisFor(raw, config))),
    // A game saved before merchants (#143) derives their stream from where its `rng` stands.
    merchantRng: added(raw, "merchantRng", streamFor(need(raw, "rng", t), "merchants")),
    chatOutbox: normalizeOutbox(need(raw, "chatOutbox", t)),
  });
}

/**
 * Whether the stored snapshot has an action under way or queued, which `normalizeGame` drops. The server then records
 * a `dropQueues` input (docs/plans/normalize-state.md, "The action queue"), which does the same, so the record still rebuilds the state it stores.
 */
export function hasQueues(raw: Partial<Omit<GameState, "config">>): boolean {
  const players = need(raw, "players", "GameState");
  return players.some((p) => (p.current !== null && p.current !== undefined) || (p.queue !== undefined && p.queue.length > 0));
}

/**
 * The overrides a frame's resolved config was built from, read back out of it. Every override key is named, so a new
 * one doesn't compile until it is read back here. A key missing from an older config stays unset, so it takes this
 * build's default.
 */
export function overridesOf(config: Partial<DeepReadonly<GameConfig>>): ConfigOverrides {
  const { preselection, setupId } = config;
  return stripUndefined<ConfigOverrides>({
    mushCount: config.mushCount,
    manualCycles: config.manualCycles,
    instantExpeditions: config.instantExpeditions,
    cycleHours: config.cycleHours,
    sharedSpots: config.sharedSpots,
    // False in the config means no cheat room, which the overrides say by leaving the key out.
    cheatRoom: config.cheatRoom || undefined,
    // Null in the config means no setup or no pre-selection, which the overrides say by leaving the key out.
    setupId: setupId === null ? undefined : setupId,
    preselection: preselection === null || preselection === undefined ? undefined : normalizePreselection(preselection),
  });
}

/**
 * A replay frame (docs/plans/normalize-state.md, "Normalizers"). Its config is stored whole, but may predate newer config
 * fields, so it is rebuilt from its overrides (`overridesOf`, then `resolveConfig`): the frame shows this build's
 * balance numbers, as a live game does on every reload, `view.actions` costs included. The action queues are kept.
 */
export function normalizeFullView(raw: Partial<FullView>, overrides: ConfigOverrides = overridesOf(need(raw, "config", "FullView"))): FullView {
  const t = "FullView";
  const config = resolveConfig(overrides);
  return stripUndefined<FullView>({
    ...normalizeCore(raw, { config }, { queue: "keep" }),
    config,
    starts: orNull(need(raw, "starts", t), normalizeSeatStarts),
  });
}

/**
 * A replay frame recorded at stored version `from` (its copy's `BuildStamp`), brought to this build: the upgrade steps
 * it still needs, then `normalizeFullView`. A step sees the frame as its `game` and the overrides read back from its
 * config (`overridesOf`) as its `overrides`. The frame itself is never changed: rebuilt frames share their parts.
 * Throws `TooNewError` or `NormalizeError`; `readFrame` (viewHistory.ts) turns either into a `HistoryError`.
 */
export function normalizeFrame(raw: Partial<FullView>, from: number, steps: readonly UpgradeStep[] = UPGRADE_STEPS): FullView {
  const due = stepsFrom(from, steps);
  if (due.length === 0) return normalizeFullView(raw);
  const game = clone(raw) as Record<string, unknown>;
  const overrides = { ...overridesOf(need(raw, "config", "FullView")) };
  for (const step of due) step.run(game, overrides);
  return normalizeFullView(game as Partial<FullView>, normalizeOverrides(overrides));
}
