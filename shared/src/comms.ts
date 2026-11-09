// The communication center (owner, 2026-10-19 and 2026-10-21; plan in docs/plans/comms.md). Anyone can try to
// establish the link with Sol at the Com center terminal; with the link up, the Comms Officer decodes rebel bases'
// calls, contacts Xyloph and updates NERON. The state (`GameState.comms`) is shown read-only to anyone at the
// terminal; the actions' log lines are private to the actor. The link status itself goes to everyone.

import { gainMorale } from "./adjustStats.ts";
import { BLUEPRINT_ITEM, BLUEPRINTS } from "./blueprints.ts";
import { pushChat } from "./chat.ts";
import { BOOK_ITEM, newItemId } from "./items.ts";
import { PROJECT_COMPLETE, PROJECT_IDS } from "./projects.ts";
import { onProjectCompleted } from "./projectEffects.ts";
import { roll, rollInt } from "./rng.ts";
import { hasSkill, SKILLS } from "./skills.ts";
import { hasTitleAccess } from "./titles.ts";
import type { CommsTerminalView, DeepReadonly, GameConfig, GameState, ItemState, PlayerState, RoomId } from "./types.ts";

/**
 * The rebel bases, in the order they call (owner, 2026-10-21: the original's `rebel_center.json` order). Centauri
 * adds strength to expedition fights (expeditions.ts); Wolf can be decoded but has no effect yet.
 */
export const REBEL_BASES = ["WOLF", "SIRIUS", "CENTAURI", "KALADAAN", "LUYTEN_CETI", "CYGNI"] as const;
export type RebelBaseId = (typeof REBEL_BASES)[number];

/** The Xyloph database's live entries and their draw weights (the original's `xyloph_database.json`, above `$EOF`). */
export const XYLOPH_ENTRIES = {
  NOTHING: 4,
  SNOW_CRASH: 4,
  WIREFLESS_INFIDELITY: 4,
  MUSH_GENOME_DATA: 8,
  LOST_ANALYSIS: 1,
  NILS_CARLSSON_CONTACT: 2,
  NERON_BOOST: 12,
  KIVANC_TERZI_CONTACT: 4,
  COOK_BIBLE: 4,
  ZONG_CHUN_SAMPLE: 8,
  SCHOOL_MANUALS: 4,
  WORKSHOP_MANUALS: 4,
} as const;
export type XylophEntryId = keyof typeof XYLOPH_ENTRIES;
export const XYLOPH_IDS = Object.keys(XYLOPH_ENTRIES) as XylophEntryId[];

export const REBEL_COMPLETE = 100;
export const NERON_UPDATE_COMPLETE = 100;

/** Where Xyloph's items appear: the bridge, as in the original (`COMMAND_CENTER`). */
export const XYLOPH_DROP_ROOM: RoomId = "COMMAND_CENTER";

/** The Mush genome disk and the Mush test strain (Xyloph rewards; no effect yet). Named after their icons. */
export const GENOME_DISK_ITEM = "mush_floppy_disk";
export const MUSH_SAMPLE_ITEM = "mush_sample";

/** A rebel base's call: when it came, the first cycle it is lost (8 to 16 cycles later, rolled per base), and progress. */
export interface RebelCall {
  base: RebelBaseId;
  calledAt: number;
  expiresAt: number;
  progress: number;
}

export interface CommsState {
  /** Whether the link with Sol is up. Public: every view has it. */
  linked: boolean;
  /** The ship-wide chance (percent) of the next attempt to establish the link, the signal quality. */
  solChance: number;
  /** Every call so far, in `REBEL_BASES` order. */
  rebels: RebelCall[];
  /** Xyloph entries drawn so far, in order; never drawn twice. */
  xyloph: XylophEntryId[];
  /** NERON's version (from 1) and the percent done of the next update. */
  neron: { version: number; progress: number };
}

/** The state at the start: no link, no calls yet (the first comes with Mush selection, `callNextRebel`). */
export function newComms(config: DeepReadonly<GameConfig>): CommsState {
  return { linked: false, solChance: config.comms.sol.startChance, rebels: [], xyloph: [], neron: { version: 1, progress: 0 } };
}

/** Com center terminals in the player's room. */
export function comTerminalsHere(state: Readonly<GameState>, player: Readonly<PlayerState>) {
  return (state.equipment[player.room] ?? []).filter((equipment) => equipment.type === "COM_CENTER");
}

/** Whether the player may use the Comms Officer's actions: they hold the title (or bypass titles) and the link is up. */
export function canUseComms(state: Readonly<GameState>, player: Readonly<PlayerState>): boolean {
  return state.comms.linked && hasTitleAccess(state, player, "comms_officer");
}

export const isContacted = (call: Readonly<RebelCall>) => call.progress >= REBEL_COMPLETE;
export const isOpen = (state: Readonly<GameState>, call: Readonly<RebelCall>) => !isContacted(call) && state.cycle < call.expiresAt;

/** Whether a base's bonus is in effect: it was decoded to 100%. */
export function rebelContacted(state: Readonly<GameState>, base: RebelBaseId): boolean {
  return state.comms.rebels.some((call) => call.base === base && isContacted(call));
}

/** Whether a Xyloph entry has been drawn (Kivanç's decoding bonus, Zong Chun's ghost for the researches). */
export const xylophFound = (state: Readonly<GameState>, entry: XylophEntryId) => state.comms.xyloph.includes(entry);

/**
 * The chance (0 to 1) this player establishes the link: the ship's chance, doubled for a Radio Expert, or x1.5 when a
 * Radio Expert is in the room with them (the skill's description; owner said to build it, 2026-10-21). Never above 1.
 */
export function solChance(state: Readonly<GameState>, player: Readonly<PlayerState>): number {
  const { radioExpertFactor, radioExpertRoomFactor } = state.config.comms.sol;
  const helped = state.players.some((o) => o.id !== player.id && o.alive && o.room === player.room && hasSkill(o, "radio_expert"));
  const factor = hasSkill(player, "radio_expert") ? radioExpertFactor : helped ? radioExpertRoomFactor : 1;
  return Math.min(1, (state.comms.solChance * factor) / 100);
}

/** A failed attempt: the ship's chance goes up by `chancePerFail` (additive). */
export function solFailed(state: GameState): void {
  state.comms.solChance += state.config.comms.sol.chancePerFail;
}

/** The link drops; `qualityLoss` also lowers the chance, never below the start (owner, 2026-10-21). */
export function loseLink(state: GameState, qualityLoss = 0): void {
  state.comms.linked = false;
  state.comms.solChance = Math.max(state.config.comms.sol.startChance, state.comms.solChance - qualityLoss);
}

/**
 * The next base calls, if any are left: once at Mush selection, then once a day in the same cycle (owner,
 * 2026-10-21). Its window is rolled per base. NERON announces it in crew chat only while the link is up; a call
 * missed that way still shows at the terminal and can be decoded until it expires.
 */
export function callNextRebel(state: GameState): void {
  const base = REBEL_BASES[state.comms.rebels.length];
  if (!base) return;
  const { windowMin, windowMax } = state.config.comms.rebel;
  const expiresAt = state.cycle + roll(state, [windowMin, windowMax]);
  state.comms.rebels.push({ base, calledAt: state.cycle, expiresAt, progress: 0 });
  if (state.comms.linked) pushChat(state, "global", { from: null, isBot: false, text: "", system: { key: "rebelCalling", params: { base } } });
}

/**
 * The ship travels or leaves orbit: every open call ends at once and is lost, partly decoded or not (owner, 2026-11-07,
 * as upstream, where both fire the travel event). Its window closes now, so `isOpen` is false from this cycle on.
 */
export function endRebelCalls(state: GameState): void {
  for (const call of state.comms.rebels) if (isOpen(state, call)) call.expiresAt = state.cycle;
}

/** At a cycle change: the next base calls a day after the last one. Mutates a state the caller already cloned. */
export function commsCycle(state: GameState): void {
  const last = state.comms.rebels.at(-1);
  if (last && state.cycle === last.calledAt + state.config.cyclesPerDay) callNextRebel(state);
}

/**
 * One decode's progress: the average of two draws in [1, gainMax], rounded down (the original), plus +100% each for the
 * Rebel skill and for having contacted Kivanç Terzi (additive: both make it x3; owner, 2026-10-21).
 */
export function rollRebelGain(state: GameState, player: Readonly<PlayerState>): number {
  const { gainMax, rebelBonus, kivancBonus } = state.config.comms.rebel;
  const a = rollInt(state, gainMax);
  const b = rollInt(state, gainMax);
  const factor = 1 + (hasSkill(player, "rebel") ? rebelBonus : 0) + (xylophFound(state, "KIVANC_TERZI_CONTACT") ? kivancBonus : 0);
  return Math.floor((a + 1 + b + 1) / 2) * factor;
}

/** A base's bonus when it is reached, for the ones with a one-off effect (Kaladaan's and Cygni's morale). */
export function rebelReached(state: GameState, base: RebelBaseId): void {
  const morale = base === "KALADAAN" ? state.config.comms.rebel.kaladaanMorale : base === "CYGNI" ? state.config.comms.rebel.cygniMorale : 0;
  if (morale === 0) return;
  for (const p of state.players) if (p.alive) /*p.morale = Math.min(p.maxMorale, p.morale + morale)*/gainMorale(state, p, morale);
}

/** Extra AP a ration gives once Sirius has been reached. */
export function rationApBonus(state: Readonly<GameState>, itemType: string): number {
  const ration = itemType === "uncooked_ration" || itemType === "cooked_ration";
  return ration && rebelContacted(state, "SIRIUS") ? state.config.comms.rebel.siriusRationAp : 0;
}

/** Cygni's extra damage on every patrol ship hit once it has been reached (owner, 2026-11-07). */
export const patrolDamageBonus = (state: Readonly<GameState>) => (rebelContacted(state, "CYGNI") ? state.config.comms.rebel.cygniPatrolDamage : 0);

/** Luyten-Ceti's brain probes: once reached, nobody needs an iTrackie for global chat. */
export const noITrackieNeeded = (state: Readonly<GameState>) => rebelContacted(state, "LUYTEN_CETI");

/** The entries Xyloph has left; the action is gone once this is empty. */
export const xylophLeft = (state: Readonly<GameState>): XylophEntryId[] => XYLOPH_IDS.filter((id) => !xylophFound(state, id));

/** Draws one entry by weight from those left, with the seeded RNG. */
export function drawXyloph(state: GameState): XylophEntryId | null {
  const left = xylophLeft(state);
  const total = left.reduce((sum, id) => sum + XYLOPH_ENTRIES[id], 0);
  if (total === 0) return null;
  const pick = rollInt(state, total);
  let acc = 0;
  for (const id of left) {
    acc += XYLOPH_ENTRIES[id];
    if (pick < acc) return id;
  }
  return null;
}

function dropItem(state: GameState, item: Omit<ItemState, "id" | "at">): void {
  state.items.push({ id: newItemId(state), ...item, at: { kind: "room", id: XYLOPH_DROP_ROOM } });
}

function randomOf<T>(state: GameState, list: readonly T[]): T {
  return list[rollInt(state, list.length)]!;
}

/**
 * An entry's effect (owner, 2026-10-21). Items appear on the bridge floor. Lost analysis (#394), Zong Chun's ghost
 * (read through `xylophFound` by the researches) and Kivanç (besides the decoding bonus) are only recorded here.
 * Mutates a state the caller already cloned.
 */
export function applyXyloph(state: GameState, entry: XylophEntryId): void {
  const { xyloph } = state.config.comms;
  switch (entry) {
    case "SNOW_CRASH":
      loseLink(state);
      return;
    case "WIREFLESS_INFIDELITY":
      loseLink(state, xyloph.qualityLoss);
      return;
    case "MUSH_GENOME_DATA":
      dropItem(state, { type: GENOME_DISK_ITEM });
      return;
    case "NILS_CARLSSON_CONTACT":
      dropItem(state, { type: MUSH_SAMPLE_ITEM });
      return;
    case "NERON_BOOST":
      advanceNeron(state, xyloph.neronBoostPercent);
      return;
    case "COOK_BIBLE":
      dropItem(state, { type: BOOK_ITEM, teaches: "cook" });
      return;
    case "SCHOOL_MANUALS":
      for (let i = 0; i < xyloph.schoolBooks; i++) dropItem(state, { type: BOOK_ITEM, teaches: randomOf(state, SKILLS) });
      return;
    case "WORKSHOP_MANUALS":
      for (let i = 0; i < xyloph.workshopBlueprints; i++) dropItem(state, { type: BLUEPRINT_ITEM, builds: randomOf(state, Object.keys(BLUEPRINTS)) });
      return;
    default:
      return;
  }
}

/**
 * Moves NERON's update forward. At 100% NERON's version goes up by one, progress starts again, and a random
 * unfinished NERON project is completed at once (owner, 2026-10-21). Returns the project completed, if any.
 */
export function advanceNeron(state: GameState, percent: number): string | undefined {
  const neron = state.comms.neron;
  neron.progress = Math.min(NERON_UPDATE_COMPLETE, neron.progress + percent);
  if (neron.progress < NERON_UPDATE_COMPLETE) return undefined;
  neron.version += 1;
  neron.progress = 0;
  const unfinished = PROJECT_IDS.filter((id) => (state.projects[id] ?? 0) < PROJECT_COMPLETE);
  if (unfinished.length === 0) return undefined;
  const project = randomOf(state, unfinished);
  state.projects[project] = PROJECT_COMPLETE;
  onProjectCompleted(state, project);
  return project;
}

/** What the Com center terminal shows anyone standing at it. The drawn Xyloph entries are listed in database order, so the draw order stays out. */
export function commsTerminalView(state: Readonly<GameState>): CommsTerminalView {
  const { comms } = state;
  const last = comms.rebels.at(-1);
  const upcoming = REBEL_BASES[comms.rebels.length];
  return {
    solChance: comms.solChance,
    rebels: comms.rebels.map((call) => ({
      base: call.base,
      progress: call.progress,
      status: isContacted(call) ? "contacted" : isOpen(state, call) ? "open" : "lost",
      expiresAt: call.expiresAt,
    })),
    ...(last && upcoming && { nextRebel: { base: upcoming, at: last.calledAt + state.config.cyclesPerDay } }),
    xylophLeft: xylophLeft(state).length,
    xylophFound: XYLOPH_IDS.filter((id) => xylophFound(state, id)),
    neron: { ...comms.neron },
  };
}
