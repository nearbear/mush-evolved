import { Action, type ActionCost, isString } from "./action.ts";
import { equipmentHere } from "../equipment.ts";
import { PROJECT_COMPLETE, PROJECT_IDS, projectSkills } from "../projects.ts";
import { contribute } from "../relay.ts";
import { logPublic } from "../log.ts";
import type { GameState, PlayerState } from "../types.ts";

export type ProjectActionData = { type: "project"; equipment: string; project: string };

/**
 * Work on a NERON project at NERON's core, exactly like research (decided 2026-10-18): 2 AP (free with a Designer or Computer point,
 * which is spent; the Designer point goes first, since it works nowhere else, owner 2026-10-24) adds a relay token to the project's pool (relay.ts; owner, 2026-10-30), +4 for each of the project's two skills (PROJECTS; owner, 2026-10-27). Anyone alive who is not dirty can help. Nothing happens on completion
 * yet beyond a log line. Public room log.
 */
export class ProjectAction extends Action<ProjectActionData> {
  override terminal = true;

  constructor() {
    super("project", { equipment: isString, project: isString });
  }

  /** Designer points (`resources.core`, projects only) or Computer points (`resources.comp`) make one project action free (owner, 2026-10-18 and 2026-10-24). */
  /** The Designer point goes first, since it works nowhere else. */
  override getCost(state: Readonly<GameState>, player: Readonly<PlayerState>): ActionCost {
    if (player.resources.core > 0) return { ap: 0, mp: 0, paidBy: "core" };
    if (player.resources.comp > 0) return { ap: 0, mp: 0, paidBy: "comp" };
    return { ap: state.config.project.cost.ap, mp: 0 };
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): ProjectActionData[] {
    return equipmentHere(state, player, "NERON_CORE").flatMap((core) =>
      PROJECT_IDS.filter((id) => (state.projects[id] ?? 0) < PROJECT_COMPLETE).map((project): ProjectActionData => ({ type: "project", equipment: core.id, project })),
    );
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: ProjectActionData): string | null {
    if (!equipmentHere(state, player, "NERON_CORE").some((core) => core.id === target.equipment)) return "cant_project";
    if (!(PROJECT_IDS as readonly string[]).includes(target.project)) return "no_such_project";
    if ((state.projects[target.project] ?? 0) >= PROJECT_COMPLETE) return "project_done";
    if (player.statuses.includes("dirty")) return "dirty";
    return null;
  }

  override apply(state: GameState, player: PlayerState, target: ProjectActionData): void {
    const pool = (state.relay.projects[target.project] ??= { tokens: [] });
    const progress = contribute(state, pool, state.config.project.progress, player, projectSkills(target.project), PROJECT_COMPLETE);
    state.projects[target.project] = progress;
    logPublic(state, player.room, progress >= PROJECT_COMPLETE ? "projectCompleted" : "projectWorked", { name: player.character, project: target.project, percent: progress });
  }
}
