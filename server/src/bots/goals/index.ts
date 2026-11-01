// The goal registry. Adding a goal means adding its file and listing it here; its rank is its own `priority`.

import { eat } from "./eat.ts";
import { explore } from "./explore.ts";
import { pickSkill } from "./pickSkill.ts";
import { project } from "./project.ts";
import { repairHull } from "./repairHull.ts";
import { repairPilgred } from "./repairPilgred.ts";
import { research } from "./research.ts";
import { rest } from "./rest.ts";
import { returnToSol } from "./returnToSol.ts";
import { shower } from "./shower.ts";
import type { Goal, GoalDef } from "./types.ts";

export type { BotMemory, Goal, GoalDef, GoalStep } from "./types.ts";

/** The solo goals, which a bot without a key plays by priority. */
export const SOLO_GOALS: readonly GoalDef[] = [returnToSol, pickSkill, eat, shower, repairPilgred, repairHull, research, project, rest, explore];

/** Offered only when nothing else is: end the cycle (`ready`) when End cycle is on, otherwise wait for the clock. */
export const END_CYCLE: Goal = { id: "endCycle", key: "endCycle", step: () => ({ kind: "wait" }) };
