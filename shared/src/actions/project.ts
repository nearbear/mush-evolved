import { Action, type ActionCost, isString } from "./action.ts";
import { equipmentHere } from "../equipment.ts";
import { PROJECT_COMPLETE, PROJECT_IDS, projectSkills, type ProjectId } from "../projects.ts";
import { relayGainRange, rollRelayGain, touchRelay } from "../relay.ts";
import { logPublic } from "../log.ts";
import { removeStatus } from "../statuses.ts";
import { offeredProjects, onProjectCompleted } from "../projectEffects.ts";
import type { GameState, PlayerState } from "../types.ts";

export type ProjectActionData = { type: "project"; equipment: string; project: string };

/**
 * Work on a NERON project at NERON's core (2 AP; free with a Designer or Computer point, which is spent; the Designer
 * point goes first since it works nowhere else, owner 2026-10-24). Only 3 randomly drawn projects are offered at a time
 * (or all unfinished ones with unrestricted terminals). Rolls progress directly with a per-project relay streak penalty
 * for consecutive contributions by the same player (no tokens; owner, 2026-11-14). Completing one offered project retires
 * the other two offered alongside it. On completion the project's effects start (projectEffects.ts). Public room log.
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
    const offered = offeredProjects(state, player);
    return equipmentHere(state, player, "NERON_CORE").flatMap((core) =>
      offered.map((project): ProjectActionData => ({ type: "project", equipment: core.id, project })),
    );
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: ProjectActionData): string | null {
    if (!equipmentHere(state, player, "NERON_CORE").some((core) => core.id === target.equipment)) return "cant_project";
    if (!(PROJECT_IDS as readonly string[]).includes(target.project)) return "no_such_project";
    if ((state.projects[target.project] ?? 0) >= PROJECT_COMPLETE) return "project_done";
    if (!offeredProjects(state, player).includes(target.project as ProjectId)) return "invalid_project";
    if (player.statuses.includes("dirty")) return "dirty";
    return null;
  }

  override apply(state: GameState, player: PlayerState, target: ProjectActionData): void {
    const project = target.project as ProjectId;
    const batch = offeredProjects(state);
    // Genius (owner, 2026-11-05): the next project finishes at once, and the status is used up.
    const genius = player.statuses.includes("genius");
    if (genius) removeStatus(player, "genius");
    const gain = genius ? PROJECT_COMPLETE : rollRelayGain(state, relayGainRange(state.config.project.progress, player, projectSkills(project), state.relay.projects[project]));
    if (!genius) touchRelay(state.relay.projects, project, player.id);
    const progress = Math.min(PROJECT_COMPLETE, (state.projects[project] ?? 0) + gain);
    state.projects[project] = progress;
    logPublic(state, player.room, progress >= PROJECT_COMPLETE ? "projectCompleted" : "projectWorked", { name: player.character, project, percent: progress });
    if (progress >= PROJECT_COMPLETE) {
      // Retire the 3 offered projects when one of them finishes; completing an unoffered project via cheat retires only itself.
      const retired = batch.includes(project) ? new Set(batch) : new Set([project]);
      state.projectDeck = state.projectDeck.filter((id) => !retired.has(id));
      onProjectCompleted(state, project);
    }
  }
}
