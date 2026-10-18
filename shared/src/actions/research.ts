import { Action } from "./action.ts";
import { RESEARCH_COMPLETE, RESEARCH_IDS } from "../research.ts";
import { logPublic } from "../log.ts";
import { dropMycoAlarms } from "../mycoalarm.ts";
import type { GameState, PlayerState } from "../types.ts";

export type ResearchActionData = { type: "research"; equipment: string; research: string };

/**
 * Work on a research at the laboratory's research terminal (decided 2026-10-16): 2 AP (free with a Computer point, which is spent)
 * moves one research forward 25%. No repeat penalty yet, and anyone alive who is not dirty can help. Nothing happens on completion yet beyond
 * a log line. Public room log.
 */
export class ResearchAction extends Action<ResearchActionData> {
  constructor() {
    super("research");
  }

  /** Computer points (`resources.comp`) make one research free (0 AP, like care points for a heal) (owner, 2026-10-16). */
  private paidWithComputer(state: Readonly<GameState>, player: Readonly<PlayerState>): boolean {
    return player.resources.comp > 0;
  }

  override getCost(state: Readonly<GameState>, player: Readonly<PlayerState>): { ap: number; mp: number } {
    return { ap: this.paidWithComputer(state, player) ? 0 : state.config.research.cost.ap, mp: 0 };
  }

  private labs(state: Readonly<GameState>, player: Readonly<PlayerState>) {
    return (state.config.equipment[player.room] ?? []).filter((equipment) => equipment.type === "RESEARCH_LAB");
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): ResearchActionData[] {
    return this.labs(state, player).flatMap((lab) =>
      RESEARCH_IDS.filter((id) => (state.research[id] ?? 0) < RESEARCH_COMPLETE).map((research): ResearchActionData => ({ type: "research", equipment: lab.id, research })),
    );
  }

  override check(state: Readonly<GameState>, player: Readonly<PlayerState>, target: ResearchActionData): string | null {
    if (!this.labs(state, player).some((lab) => lab.id === target.equipment)) return "cant_research";
    if (!(RESEARCH_IDS as readonly string[]).includes(target.research)) return "no_such_research";
    if ((state.research[target.research] ?? 0) >= RESEARCH_COMPLETE) return "research_done";
    if (player.statuses.includes("dirty")) return "dirty";
    return this.canAfford(state, player, target);
  }

  override apply(state: GameState, player: PlayerState, target: ResearchActionData): void {
    if (this.paidWithComputer(state, player)) player.resources.comp -= 1;
    const progress = Math.min(RESEARCH_COMPLETE, (state.research[target.research] ?? 0) + state.config.research.effect.progressPercent);
    state.research[target.research] = progress;
    logPublic(state, player.room, progress >= RESEARCH_COMPLETE ? "researchCompleted" : "researched", { name: player.character, research: target.research, percent: progress });
    if (progress >= RESEARCH_COMPLETE && target.research === "MYCO_ALARM") {
      dropMycoAlarms(state, player.room);
      logPublic(state, player.room, "mycoAlarmsBuilt");
    }
  }
}
