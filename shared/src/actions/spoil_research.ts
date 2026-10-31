import { Action, type ActionCost, type ActionVisibility, isString } from "./action.ts";
import { addSample, ResearchAction, type ResearchActionData } from "./research.ts";
import type { ResearchId } from "../research.ts";
import type { GameState, PlayerState } from "../types.ts";

export type SpoilResearchActionData = { type: "spoil_research"; equipment: string; research: string };

const research = new ResearchAction();
const asResearch = (target: SpoilResearchActionData): ResearchActionData => ({ ...target, type: "research" });

/**
 * A Mush's own spoil (docs/plans/research-sabotage.md; owner, 2026-10-31): a second button next to Participate that only Mush
 * see, at the same price, needs and dirt chance. It adds a sample that looks like any other until the next assay, where
 * it always spoils. Everything others can see matches Participate: the same private line, the same busy bar, and the
 * action history records it as own spoil, so Interrogate and Chitchat can reveal it, like Extract spore (they leak by
 * design; docs/rules/rules-design.md).
 */
export class SpoilResearchAction extends Action<SpoilResearchActionData> {
  override terminal = true;
  override visibility: ActionVisibility = "private";

  constructor() {
    super("spoil_research", { equipment: isString, research: isString });
  }

  override getCost(state: Readonly<GameState>, player: Readonly<PlayerState>): ActionCost {
    return research.getCost(state, player);
  }

  override dirtChance(state: Readonly<GameState>): number {
    return research.dirtChance(state);
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): SpoilResearchActionData[] {
    if (player.role !== "mush") return [];
    return research.getCandidates(state, player).map((c): SpoilResearchActionData => ({ ...c, type: "spoil_research" }));
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: SpoilResearchActionData): string | null {
    if (player.role !== "mush") return "not_mush";
    return research.validate(state, player, asResearch(target));
  }

  override apply(state: GameState, player: PlayerState, target: SpoilResearchActionData): void {
    addSample(state, player, target.research as ResearchId, true);
  }
}
