// The goal registry. Adding a goal means adding its file and listing it here; its rank is its own `priority`.

import { eat } from "./eat.ts";
import { explore } from "./explore.ts";
import { pickSkill } from "./pickSkill.ts";
import { project } from "./project.ts";
import { repairHull } from "./repairHull.ts";
import { research } from "./research.ts";
import { rest } from "./rest.ts";
import { returnToSol } from "./returnToSol.ts";
import { shootHunters } from "./shootHunters.ts";
import { shower } from "./shower.ts";
import { snoop } from "./snoop.ts";
import { tendPlants } from "./tendPlants.ts";
import type { Goal, GoalDef } from "./types.ts";

export type { BotMemory, Goal, GoalDef, GoalStep } from "./types.ts";

/**
 * The solo goals, which a bot without a key plays by priority. Not `repairPilgred` (owner, 2026-11-01): returning to Sol
 * with a Mush alive is a Mush win, and in single player the human is the Mush. It comes back once bots can tell every
 * Mush is dead, which waits for the public dead Mush count.
 */
export const SOLO_GOALS: readonly GoalDef[] = [returnToSol, pickSkill, snoop, eat, shower, shootHunters, repairHull, tendPlants, research, project, rest, explore];

/** Offered only when nothing else is: end the cycle (`ready`) when End cycle is on, otherwise wait for the clock. */
export const END_CYCLE: Goal = { id: "endCycle", key: "endCycle", label: "End your cycle and wait for the next one", step: () => ({ kind: "wait" }) };
