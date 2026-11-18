// The goal registry. Adding a goal means adding its file and listing it here; its rank is its own `priority`.

import { astro } from "./astro.ts";
import { commsOfficer } from "./commsOfficer.ts";
import { contactSol } from "./contactSol.ts";
import { eat } from "./eat.ts";
import { expeditionLaunch } from "./expeditionLaunch.ts";
import { expeditionPlan } from "./expeditionPlan.ts";
import { expeditionPrep } from "./expeditionPrep.ts";
import { explore } from "./explore.ts";
import { leaveIcarus } from "./leaveIcarus.ts";
import { extinguish } from "./extinguish.ts";
import { patrolShootHunters } from "./patrolShootHunters.ts";
import { pickSkill } from "./pickSkill.ts";
import { project } from "./project.ts";
import { repairDoor } from "./repairDoor.ts";
import { repairHull } from "./repairHull.ts";
import { repairOxygen } from "./repairOxygen.ts";
import { research } from "./research.ts";
import { rest } from "./rest.ts";
import { setOutPots } from "./setOutPots.ts";
import { returnToSol } from "./returnToSol.ts";
import { crewShootHunters, shootHunters } from "./shootHunters.ts";
import { shower } from "./shower.ts";
import { shrinkDorm } from "./shrinkDorm.ts";
import { snoop } from "./snoop.ts";
import { sowHere } from "./sow.ts";
import { tendPlants } from "./tendPlants.ts";
import { travel } from "./travel.ts";
import type { Goal, GoalDef } from "./types.ts";

/** The goals that fight hunters: a resting bot gets up for them (`GoalBot`). */
export const HUNTER_GOALS: ReadonlySet<string> = new Set([shootHunters.id, crewShootHunters.id, patrolShootHunters.id]);

export type { BotMemory, BotSocial, ExpeditionKind, Goal, GoalDef, GoalStep } from "./types.ts";

/**
 * The solo goals, which a bot without a key plays by priority. Not `repairPilgred` (owner, 2026-11-01): returning to Sol
 * with a Mush alive is a Mush win, and in single player the human is the Mush. It comes back once bots can tell every
 * Mush is dead, which waits for the public dead Mush count.
 */
export const SOLO_GOALS: readonly GoalDef[] = [
  leaveIcarus,
  returnToSol,
  pickSkill,
  snoop,
  eat,
  sowHere,
  extinguish,
  repairOxygen,
  patrolShootHunters,
  shootHunters,
  expeditionLaunch,
  expeditionPrep,
  shower,
  repairDoor,
  repairHull,
  contactSol,
  setOutPots,
  tendPlants,
  travel,
  astro,
  expeditionPlan,
  commsOfficer,
  crewShootHunters,
  research,
  project,
  shrinkDorm,
  rest,
  explore,
];

/** Offered only when nothing else is: end the cycle (`ready`) when End cycle is on, otherwise wait for the clock. */
export const END_CYCLE: Goal = { id: "endCycle", key: "endCycle", label: "End your cycle and wait for the next one", step: () => ({ kind: "wait" }) };

export { HELP_MAX_TIMES, HELP_TASKS, helpGoal, helpKey, helpTasks, targeted, type HelpParams, type HelpTask } from "./help.ts";
