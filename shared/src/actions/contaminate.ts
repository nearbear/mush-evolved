import { Action, type ActionCost, type ActionVisibility, isString } from "./action.ts";
import { researchPool } from "./research.ts";
import { contaminate } from "../assay.ts";
import { canWorkResearch } from "../bios.ts";
import { equipmentHere } from "../equipment.ts";
import { logPrivate } from "../log.ts";
import { RESEARCH_COMPLETE, RESEARCH_IDS } from "../research.ts";
import { hasSkill } from "../skills.ts";
import type { GameState, PlayerState } from "../types.ts";

export type ContaminateActionData = { type: "contaminate"; equipment: string; research: string };

/** Whether a research has a pending sample made by someone other than `player`. */
function othersPending(state: Readonly<GameState>, player: Readonly<PlayerState>, research: string): boolean {
  return (state.relay.research[research]?.pending ?? []).some((s) => s.by !== player.id);
}

/**
 * Saboteur's (`sapper`) Contaminate (docs/plans/archive/research-sabotage.md; owner, 2026-10-31): 1 AP at the research terminal
 * contaminates a pending sample made by someone else that isn't already contaminated, from a contributor with the
 * fewest samples in that research (assay.ts, `contaminationCandidates`), and it spoils at the next assay. The holder
 * does not pick. Private, not covert, so a camera doesn't see it; no daily limit.
 *
 * It is offered whenever someone else has a pending sample, contaminated or not, and does nothing when all of them
 * already are: offering it only for clean samples would tell the Saboteur that another player's sample was spoiled by
 * its maker, so that player is Mush (Claude, 2026-10-31; flagged to the owner).
 */
export class ContaminateAction extends Action<ContaminateActionData> {
  override terminal = true;
  override visibility: ActionVisibility = "private";

  constructor() {
    super("contaminate", { equipment: isString, research: isString });
  }

  override getCost(state: Readonly<GameState>): ActionCost {
    return { ap: state.config.research.contaminate.cost.ap, mp: 0 };
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): ContaminateActionData[] {
    if (!hasSkill(player, "sapper") || !canWorkResearch(state, player)) return [];
    return equipmentHere(state, player, "RESEARCH_LAB").flatMap((lab) =>
      RESEARCH_IDS.filter((id) => (state.research[id] ?? 0) < RESEARCH_COMPLETE && othersPending(state, player, id)).map((research): ContaminateActionData => ({ type: "contaminate", equipment: lab.id, research })),
    );
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: ContaminateActionData): string | null {
    if (!hasSkill(player, "sapper")) return "no_skill";
    if (!equipmentHere(state, player, "RESEARCH_LAB").some((lab) => lab.id === target.equipment)) return "cant_research";
    if (!canWorkResearch(state, player)) return "crew_lock";
    if (!(RESEARCH_IDS as readonly string[]).includes(target.research)) return "no_such_research";
    if ((state.research[target.research] ?? 0) >= RESEARCH_COMPLETE) return "research_done";
    if (!othersPending(state, player, target.research)) return "nothing_to_contaminate";
    return null;
  }

  override apply(state: GameState, player: PlayerState, target: ContaminateActionData): void {
    contaminate(state, researchPool(state, target.research), player.id);
    logPrivate(state, player.id, "contaminated", { name: player.character, research: target.research });
  }
}
