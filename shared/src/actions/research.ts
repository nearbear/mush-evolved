import { Action, isString } from "./action.ts";
import { ANY_CONSUMABLE, RESEARCH_COMPLETE, RESEARCH_IDS, RESEARCH_REQUIRES, type ResearchId } from "../research.ts";
import { logPublic } from "../log.ts";
import { equipmentHere } from "../equipment.ts";
import { ITEM_TYPES, newItemId, removeItem } from "../items.ts";
import { xylophFound } from "../comms.ts";
import { dropMycoAlarms } from "../mycoalarm.ts";
import { ANTI_MUSH_SERUM_ITEM } from "./vaccinate.ts";
import type { GameState, ItemState, PlayerState, RoomId } from "../types.ts";

/** Items in the room, on the floor or carried by someone alive there: what counts as "in the lab" for a research's items. */
function labItems(state: Readonly<GameState>, room: RoomId): ItemState[] {
  const here = new Set(state.players.filter((p) => p.alive && p.room === room).map((p) => p.id));
  return state.items.filter((i) => (i.at.kind === "room" ? i.at.id === room : here.has(i.at.id)));
}

const matches = (item: Readonly<ItemState>, need: string) => (need === ANY_CONSUMABLE ? ITEM_TYPES[item.type]?.consume !== undefined : item.type === need);

/** Whether the lab meets a research's requirements (RESEARCH_REQUIRES; owner, 2026-10-25). */
export function researchAllowed(state: Readonly<GameState>, room: RoomId, research: ResearchId): boolean {
  const needs = RESEARCH_REQUIRES[research];
  if (!needs) return true;
  if (needs.postSelection && state.preselection) return false;
  if (needs.chun && !xylophFound(state, "ZONG_CHUN_SAMPLE") && !state.players.some((p) => p.alive && p.room === room && p.character === "chun")) return false;
  const items = labItems(state, room);
  return (needs.items ?? []).every((need) => items.some((item) => matches(item, need)));
}

export type ResearchActionData = { type: "research"; equipment: string; research: string };

/**
 * Work on a research at the laboratory's research terminal (decided 2026-10-16): 2 AP (free with a Computer point, which is spent)
 * moves one research forward 25%. No repeat penalty yet, and anyone alive who is not dirty can help, while the lab meets the research's
 * RESEARCH_REQUIRES. Public room log.
 */
export class ResearchAction extends Action<ResearchActionData> {
  override terminal = true;

  constructor() {
    super("research", { equipment: isString, research: isString });
  }

  /** Computer points (`resources.comp`) make one research free (0 AP, like care points for a heal) (owner, 2026-10-16). */
  private paidWithComputer(state: Readonly<GameState>, player: Readonly<PlayerState>): boolean {
    return player.resources.comp > 0;
  }

  override getCost(state: Readonly<GameState>, player: Readonly<PlayerState>): { ap: number; mp: number } {
    return { ap: this.paidWithComputer(state, player) ? 0 : state.config.research.cost.ap, mp: 0 };
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
    if (player.statuses.includes("dirty")) return "dirty";
    return null;
  }

  override apply(state: GameState, player: PlayerState, target: ResearchActionData): void {
    if (this.paidWithComputer(state, player)) player.resources.comp -= 1;
    const progress = Math.min(RESEARCH_COMPLETE, (state.research[target.research] ?? 0) + state.config.research.effect.progressPercent);
    state.research[target.research] = progress;
    logPublic(state, player.room, progress >= RESEARCH_COMPLETE ? "researchCompleted" : "researched", { name: player.character, research: target.research, percent: progress });
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
