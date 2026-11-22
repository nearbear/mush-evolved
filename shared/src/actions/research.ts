import { Action, type ActionCost, type ActionVisibility, DIRTY, isString } from "./action.ts";
import { cpuPriorityBonus } from "../bios.ts";
import { ANY_CONSUMABLE, RESEARCH_COMPLETE, RESEARCH_IDS, RESEARCH_REQUIRES, RESEARCH_SKILLS, type ResearchId, researchNeedOrder } from "../research.ts";
import { logPrivate, logPublic } from "../log.ts";
import { hasMushDied } from "../death.ts";
import { resetDrugDispenser } from "../drugs.ts";
import { DRUG_DISPENSER_EQUIPMENT, equipmentHere, SUPER_CALC_EQUIPMENT } from "../equipment.ts";
import { ITEM_TYPES, removeItem, spawnInRoom, SPORE_SUCKER_ITEM, STEROIDS_ITEM, STEROIDS_YIELD } from "../items.ts";
import { xylophFound } from "../comms.ts";
import { makeToken, type ResearchPool } from "../relay.ts";
import { assayDue, researchProgress, runAssay, type SampleCounts } from "../assay.ts";
import { hasSkill } from "../skills.ts";
import { removeStatus } from "../statuses.ts";
import { dropMycoAlarms } from "../mycoalarm.ts";
import { ANTI_MUSH_SERUM_ITEM } from "./vaccinate.ts";
import { MYCOSCAN_EQUIPMENT } from "./check_spores.ts";
import type { GameState, ItemState, PlayerState, RoomId } from "../types.ts";

/** Items in the room, on the floor or carried by someone alive there: what counts as "in the lab" for a research's items. */
function labItems(state: Readonly<GameState>, room: RoomId): ItemState[] {
  const here = new Set(state.players.filter((p) => p.alive && p.room === room).map((p) => p.id));
  return state.items.filter((i) => (i.at.kind === "room" ? i.at.id === room : here.has(i.at.id)));
}

const matches = (item: Readonly<ItemState>, need: string) => (need === ANY_CONSUMABLE ? ITEM_TYPES[item.type]?.consume !== undefined : item.type === need);

/**
 * Which of a research's requirements (RESEARCH_REQUIRES) the lab meets, in `researchNeedOrder`'s order: each item, then
 * Chun, then post-selection, then dead Mush. Empty when it has none.
 */
export function researchNeedsMet(state: Readonly<GameState>, room: RoomId, research: ResearchId): boolean[] {
  const needs = RESEARCH_REQUIRES[research];
  if (!needs) return [];
  const items = labItems(state, room);
  return researchNeedOrder(needs).map((need) => {
    if (need === "chun") return xylophFound(state, "ZONG_CHUN_SAMPLE") || state.players.some((p) => p.alive && p.room === room && p.character === "chun");
    if (need === "postSelection") return !state.preselection;
    if (need === "deadMush") return hasMushDied(state);
    return items.some((item) => matches(item, need.item));
  });
}

/** `researchNeedsMet` for every research that has requirements: what the terminal's checklist shows (`PlayerView.researchNeeds`). */
export function researchNeedsView(state: Readonly<GameState>, room: RoomId): Record<string, boolean[]> {
  return Object.fromEntries(RESEARCH_IDS.filter((id) => RESEARCH_REQUIRES[id]).map((id) => [id, researchNeedsMet(state, room, id)]));
}

/** Whether the lab meets a research's requirements (RESEARCH_REQUIRES; owner, 2026-10-25), or unrestricted terminals bypasses them. */
export function researchAllowed(state: Readonly<GameState>, room: RoomId, research: ResearchId, player?: Readonly<Pick<PlayerState, "cheats">>): boolean {
  if (player?.cheats.includes("freeHacking")) return true;
  return researchNeedsMet(state, room, research).every(Boolean);
}

/**
 * Whether `player` may work on lab research (or Mush own-spoil) under the current BIOS crew lock (owner, 2026-11-21):
 * anyone unless the lock is on research, in which case only Biologists, Medics, Polyvalent (`skilful`), or `freeHacking`.
 */
export const canWorkResearch = (state: Readonly<GameState>, player: Readonly<PlayerState>): boolean =>
  state.bios.crew_lock !== "research" ||
  hasSkill(player, "biologist") ||
  hasSkill(player, "medic") ||
  hasSkill(player, "skilful") ||
  player.cheats.includes("freeHacking");

export type ResearchActionData = { type: "research"; equipment: string; research: string };

/** A research's pool, made on first use. */
export function researchPool(state: GameState, research: string): ResearchPool {
  return (state.relay.research[research] ??= { tokens: [], pending: [] });
}

/** "chun:3,paola:1": an assay line's counts, which the client turns into names (web/src/i18n/names.ts). */
function countsParam(state: Readonly<GameState>, counts: SampleCounts): string {
  return counts.map(([by, n]) => `${state.players.find((p) => p.id === by)?.character ?? by}:${n}`).join(",");
}

/**
 * Adds `player`'s pending sample to a research (docs/plans/archive/research-sabotage.md), contaminated by themselves when `spoiled`
 * (a Mush's own spoil), then runs an assay if one is due and completes the research if it leaves it at 100.
 */
export function addSample(state: GameState, player: Readonly<PlayerState>, research: ResearchId, spoiled: boolean): void {
  const config = state.config.research;
  const pool = researchPool(state, research);
  pool.pending.push({ ...makeToken(state, config.progress, player, RESEARCH_SKILLS, cpuPriorityBonus(state, "research")), ...(spoiled && { contaminatedBy: player.id }) });
  const before = researchProgress(pool, config.progress, RESEARCH_COMPLETE);
  // Owner, 2026-10-30: research is private; the sample list and the assay lines are the record of who worked.
  logPrivate(state, player.id, "researched", { name: player.character, research, percent: before.verified + before.pending });
  if (!assayDue(pool, config.progress, config.assayMarks, RESEARCH_COMPLETE)) return;
  const { tested, spoiled: lost } = runAssay(state, pool, config.spoilChance);
  const verified = researchProgress(pool, config.progress, RESEARCH_COMPLETE).verified;
  state.research[research] = verified;
  // Owner, 2026-10-31: the line names everyone tested and whose samples spoiled, never why.
  const testedCount = tested.reduce((n, [, c]) => n + c, 0);
  const spoiledCount = lost.reduce((n, [, c]) => n + c, 0);
  if (spoiledCount === 0) logPublic(state, player.room, "assayPassed", { research, count: testedCount, tested: countsParam(state, tested) });
  else logPublic(state, player.room, "assaySpoiled", { research, count: testedCount, tested: countsParam(state, tested), spoiled: spoiledCount, spoiledBy: countsParam(state, lost) });
  if (verified >= RESEARCH_COMPLETE) completeResearch(state, player.room, research);
}

/** Genius (owner, 2026-11-05): uses up the status and completes the research now, skipping the assay. Requirements were already checked. */
function finishAtOnce(state: GameState, player: PlayerState, research: ResearchId): void {
  removeStatus(player, "genius");
  logPrivate(state, player.id, "researched", { name: player.character, research, percent: RESEARCH_COMPLETE });
  state.research[research] = RESEARCH_COMPLETE;
  completeResearch(state, player.room, research);
}

/** Completion's effects (owner, 2026-10-25/31), at the assay that leaves the research at 100. Its lines name nobody. */
function completeResearch(state: GameState, room: RoomId, research: ResearchId): void {
  logPublic(state, room, "researchCompleted", { research });
  // `kill_sample`: completing it uses up one of these from the lab, the floor first.
  for (const type of RESEARCH_REQUIRES[research]?.consumes ?? []) {
    const items = labItems(state, room).filter((i) => i.type === type);
    const used = items.find((i) => i.at.kind === "room") ?? items[0];
    if (used) removeItem(state, used.id);
  }
  if (research === "MYCO_ALARM") {
    dropMycoAlarms(state, room);
    logPublic(state, room, "mycoAlarmsBuilt");
  }
  // Owner, 2026-11-01 (eMushpedia): completing it adds a MycoScan to the lab for good (check_spores.ts).
  if (research === "MYCOSCAN") {
    const id = `${room}:${MYCOSCAN_EQUIPMENT}`;
    const equipment = (state.equipment[room] ??= []);
    if (!equipment.some((e) => e.id === id)) equipment.push({ id, type: MYCOSCAN_EQUIPMENT });
    logPublic(state, room, "mycoscanBuilt");
  }
  // Owner, 2026-10-25: completing it leaves one serum on the lab floor.
  if (research === "ANTI_MUSH_SERUM") {
    spawnInRoom(state, room, ANTI_MUSH_SERUM_ITEM);
    logPublic(state, room, "serumBuilt");
  }
  // Owner, 2026-11-01: completing it spawns 4 anabolic steroids on the lab floor (no extra log line).
  // Owner, 2026-11-20: completing it leaves one Spore Sucker on the lab floor (no extra log line).
  if (research === "SPORE_EXTRACTOR") spawnInRoom(state, room, SPORE_SUCKER_ITEM);
  if (research === "STEROIDS") spawnInRoom(state, room, STEROIDS_ITEM, STEROIDS_YIELD);
  // Owner, 2026-11-10: completing it adds the Drug Dispenser (DRUG_DISP) to the Medlab for good.
  if (research === "DRUG_DISPENSER") {
    const medlab = "SICK_BAY";
    const id = `${medlab}:${DRUG_DISPENSER_EQUIPMENT}`;
    const equipment = (state.equipment[medlab] ??= []);
    if (!equipment.some((e) => e.id === id)) equipment.push({ id, type: DRUG_DISPENSER_EQUIPMENT });
    resetDrugDispenser(state);
  }
  // Owner, 2026-11-02 (eMushpedia "Super Calculateur", Data/research.json): completing it adds the Super Calculator to the Nexus for good.
  if (research === "SUPER_CALC") {
    const nexus = "NEXUS_ROOM";
    const id = `${nexus}:${SUPER_CALC_EQUIPMENT}`;
    const equipment = (state.equipment[nexus] ??= []);
    if (!equipment.some((e) => e.id === id)) equipment.push({ id, type: SUPER_CALC_EQUIPMENT });
  }
}

/**
 * Work on a research at the laboratory's research terminal (decided 2026-10-16): 2 AP (free with a Computer point, which is spent)
 * adds a pending sample to the research's pool (relay.ts: 6-9%, +4 per Biologist or Medic skill, the pool arranged for the least relay penalty; owner, 2026-10-30), tested at the next assay (assay.ts). Anyone alive who is not dirty can help, while the lab meets the research's
 * RESEARCH_REQUIRES. Private log line; assays and completion go in the room's history.
 */
export class ResearchAction extends Action<ResearchActionData> {
  override terminal = true;
  override visibility: ActionVisibility = "private";

  constructor() {
    super("research", { equipment: isString, research: isString });
  }

  /** Computer points (`resources.comp`) make one research free (0 AP, like care points for a heal) (owner, 2026-10-16). */
  override getCost(state: Readonly<GameState>, player: Readonly<PlayerState>): ActionCost {
    return player.resources.comp > 0 ? { ap: 0, mp: 0, paidBy: "comp" } : { ap: state.config.research.cost.ap, mp: 0 };
  }

  override dirtChance(state: Readonly<GameState>): number {
    return state.config.research.dirtyChance;
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): ResearchActionData[] {
    if (!canWorkResearch(state, player)) return [];
    return equipmentHere(state, player, "RESEARCH_LAB").flatMap((lab) =>
      RESEARCH_IDS.filter((id) => (state.research[id] ?? 0) < RESEARCH_COMPLETE && researchAllowed(state, player.room, id, player)).map((research): ResearchActionData => ({ type: "research", equipment: lab.id, research })),
    );
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: ResearchActionData): string | null {
    if (!equipmentHere(state, player, "RESEARCH_LAB").some((lab) => lab.id === target.equipment)) return "cant_research";
    if (!canWorkResearch(state, player)) return "crew_lock";
    if (!(RESEARCH_IDS as readonly string[]).includes(target.research)) return "no_such_research";
    if ((state.research[target.research] ?? 0) >= RESEARCH_COMPLETE) return "research_done";
    if (!researchAllowed(state, player.room, target.research as ResearchId, player)) return "research_needs";
    if (player.statuses.includes("dirty")) return DIRTY;
    return null;
  }

  override apply(state: GameState, player: PlayerState, target: ResearchActionData): void {
    if (player.statuses.includes("genius")) finishAtOnce(state, player, target.research as ResearchId);
    else addSample(state, player, target.research as ResearchId, false);
  }
}
