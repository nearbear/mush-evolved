import { Action, type ActionCost, isString } from "./action.ts";
import { equipmentHere } from "../equipment.ts";
import { PROJECT_COMPLETE, PROJECT_IDS, projectDone, projectSkills, type ProjectId } from "../projects.ts";
import { relayGainRange, rollRelayGain, touchRelay } from "../relay.ts";
import { logPublic } from "../log.ts";
import { hasSkill } from "../skills.ts";
import { removeStatus } from "../statuses.ts";
import { completeProject, offeredProjects } from "../projectEffects.ts";
import type { GameState, PlayerState } from "../types.ts";

export type ProjectActionData = { type: "project"; equipment: string; project: string };

/**
 * Whether `player` may work on NERON projects under the current BIOS crew lock (owner, 2026-11-21): anyone unless the
 * lock is on projects, in which case only Designers (or `freeHacking`).
 */
export const canWorkProject = (state: Readonly<GameState>, player: Readonly<PlayerState>): boolean =>
  state.bios.crew_lock !== "projects" || hasSkill(player, "designer") || player.cheats.includes("freeHacking");

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
    if (!canWorkProject(state, player)) return [];
    const offered = offeredProjects(state, player);
    return equipmentHere(state, player, "NERON_CORE").flatMap((core) =>
      offered.map((project): ProjectActionData => ({ type: "project", equipment: core.id, project })),
    );
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: ProjectActionData): string | null {
    if (!equipmentHere(state, player, "NERON_CORE").some((core) => core.id === target.equipment)) return "cant_project";
    if (!canWorkProject(state, player)) return "crew_lock";
    if (!(PROJECT_IDS as readonly string[]).includes(target.project)) return "no_such_project";
    if (projectDone(state, target.project as ProjectId)) return "project_done";
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
    logPublic(state, player.room, progress >= PROJECT_COMPLETE ? "projectCompleted" : "projectWorked", { name: player.character, project, percent: progress });
    if (progress >= PROJECT_COMPLETE) {
      // Retire the 3 offered projects when one of them finishes; completing an unoffered project via cheat retires only itself.
      completeProject(state, project, batch.includes(project) ? batch : [project]);
    } else {
      state.projects[project] = progress;
    }
  }
}
