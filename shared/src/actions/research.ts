import { Action, type ActionCost, type ActionVisibility, DIRTY, isString } from "./action.ts";
import { ANY_CONSUMABLE, RESEARCH_COMPLETE, RESEARCH_IDS, RESEARCH_REQUIRES, RESEARCH_SKILLS, type ResearchId, researchNeedOrder } from "../research.ts";
import { logPrivate, logPublic } from "../log.ts";
import { equipmentHere } from "../equipment.ts";
import { ITEM_TYPES, newItemId, removeItem } from "../items.ts";
import { xylophFound } from "../comms.ts";
import { contribute } from "../relay.ts";
import { dropMycoAlarms } from "../mycoalarm.ts";
import { ANTI_MUSH_SERUM_ITEM } from "./vaccinate.ts";
import type { GameState, ItemState, PlayerState, RoomId } from "../types.ts";

/** Items in the room, on the floor or carried by someone alive there: what counts as "in the lab" for a research's items. */
function labItems(state: Readonly<GameState>, room: RoomId): ItemState[] {
  const here = new Set(state.players.filter((p) => p.alive && p.room === room).map((p) => p.id));
  return state.items.filter((i) => (i.at.kind === "room" ? i.at.id === room : here.has(i.at.id)));
}

const matches = (item: Readonly<ItemState>, need: string) => (need === ANY_CONSUMABLE ? ITEM_TYPES[item.type]?.consume !== undefined : item.type === need);

/**
 * Which of a research's requirements (RESEARCH_REQUIRES) the lab meets, in `researchNeedOrder`'s order: each item, then
 * Chun, then post-selection. Empty when it has none.
 */
export function researchNeedsMet(state: Readonly<GameState>, room: RoomId, research: ResearchId): boolean[] {
  const needs = RESEARCH_REQUIRES[research];
  if (!needs) return [];
  const items = labItems(state, room);
  return researchNeedOrder(needs).map((need) => {
    if (need === "chun") return xylophFound(state, "ZONG_CHUN_SAMPLE") || state.players.some((p) => p.alive && p.room === room && p.character === "chun");
    if (need === "postSelection") return !state.preselection;
    return items.some((item) => matches(item, need.item));
  });
}

/** `researchNeedsMet` for every research that has requirements: what the terminal's checklist shows (`PlayerView.researchNeeds`). */
export function researchNeedsView(state: Readonly<GameState>, room: RoomId): Record<string, boolean[]> {
  return Object.fromEntries(RESEARCH_IDS.filter((id) => RESEARCH_REQUIRES[id]).map((id) => [id, researchNeedsMet(state, room, id)]));
}

/** Whether the lab meets a research's requirements (RESEARCH_REQUIRES; owner, 2026-10-25). */
export function researchAllowed(state: Readonly<GameState>, room: RoomId, research: ResearchId): boolean {
  return researchNeedsMet(state, room, research).every(Boolean);
}

export type ResearchActionData = { type: "research"; equipment: string; research: string };

/**
 * Work on a research at the laboratory's research terminal (decided 2026-10-16): 2 AP (free with a Computer point, which is spent)
 * adds a relay token to the research's pool (relay.ts: 6-9%, +4 per Biologist or Medic skill, the pool arranged for the least relay penalty; owner, 2026-10-30). Anyone alive who is not dirty can help, while the lab meets the research's
 * RESEARCH_REQUIRES. Private log line; completion goes in the room's history.
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
    return equipmentHere(state, player, "RESEARCH_LAB").flatMap((lab) =>
      RESEARCH_IDS.filter((id) => (state.research[id] ?? 0) < RESEARCH_COMPLETE && researchAllowed(state, player.room, id)).map((research): ResearchActionData => ({ type: "research", equipment: lab.id, research })),
    );
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: ResearchActionData): string | null {
    if (!equipmentHere(state, player, "RESEARCH_LAB").some((lab) => lab.id === target.equipment)) return "cant_research";
    if (!(RESEARCH_IDS as readonly string[]).includes(target.research)) return "no_such_research";
    if ((state.research[target.research] ?? 0) >= RESEARCH_COMPLETE) return "research_done";
    if (!researchAllowed(state, player.room, target.research as ResearchId)) return "research_needs";
    if (player.statuses.includes("dirty")) return DIRTY;
    return null;
  }

  override apply(state: GameState, player: PlayerState, target: ResearchActionData): void {
    const pool = (state.relay.research[target.research] ??= { tokens: [] });
    const progress = contribute(state, pool, state.config.research.progress, player, RESEARCH_SKILLS, RESEARCH_COMPLETE);
    state.research[target.research] = progress;
    // Owner, 2026-10-30: research is private, its token list is the evidence; only completion goes in the room's history.
    if (progress >= RESEARCH_COMPLETE) logPublic(state, player.room, "researchCompleted", { name: player.character, research: target.research, percent: progress });
    else logPrivate(state, player.id, "researched", { name: player.character, research: target.research, percent: progress });
    // `kill_sample`: completing it uses up one of these from the lab, the floor first.
    if (progress >= RESEARCH_COMPLETE) {
      for (const type of RESEARCH_REQUIRES[target.research as ResearchId]?.consumes ?? []) {
        const items = labItems(state, player.room).filter((i) => i.type === type);
        const used = items.find((i) => i.at.kind === "room") ?? items[0];
        if (used) removeItem(state, used.id);
      }
    }
    if (progress >= RESEARCH_COMPLETE && target.research === "MYCO_ALARM") {
      dropMycoAlarms(state, player.room);
      logPublic(state, player.room, "mycoAlarmsBuilt");
    }
    // Owner, 2026-10-25: completing it leaves one serum on the lab floor.
    if (progress >= RESEARCH_COMPLETE && target.research === "ANTI_MUSH_SERUM") {
      state.items.push({ id: newItemId(state), type: ANTI_MUSH_SERUM_ITEM, at: { kind: "room", id: player.room } });
      logPublic(state, player.room, "serumBuilt");
    }
  }
}
