import type { PlayerView, SkillId } from "@mush2/shared";
import { dutyPriority, hasBotSkill, holdsTrigger } from "../duties.ts";
import { act, canAfford, goTo, where } from "./blocks.ts";
import { payable, sowJob } from "./sow.ts";
import type { GoalDef, GoalStep } from "./types.ts";

/** The skills that see plant sickness (`isBotanistRole` in shared/src/botany.ts). */
const BOTANIST_SKILLS: readonly SkillId[] = ["botanic", "skilful"];

export const isBotanist = (view: PlayerView): boolean =>
  holdsTrigger(view, "plants") || BOTANIST_SKILLS.some((s) => hasBotSkill(view, s));

/**
 * The next garden job the bot can pay for here, most urgent first: sow a banana into an empty garden pot (`sowJob`;
 * owner, 2026-11-12: planting comes before watering), water a thirsty plant (unwatered, it gives no oxygen or fruit at
 * day start), then treat a sick one (only the Botanist role is offered just the sick ones).
 */
export function gardenJob(view: PlayerView, reserve: number): GoalStep | null {
  const sow = sowJob(view, reserve);
  if (sow) return sow;
  for (const type of ["water", "treat"] as const) {
    const job = view.actions.find((o) => o.action.type === type && payable(view, o, reserve));
    if (job) return act(job.action);
  }
  return null;
}

/**
 * Tend the garden (owner, 2026-11-01): a Botanist-role bot (Botanist or Skilful, who see sickness) walks to the garden
 * once a day, since every plant gets thirstier at each day start, and sows, waters and treats (`gardenJob`) down to the
 * AP reserve. Garden points pay there first. Other bots leave the plants alone. What the plants need is seen only on
 * arrival (a view shows items only in the bot's own room); while there, any job it sees is also offered.
 */
export const tendPlants: GoalDef = {
  id: "tendPlants",
  get priority() {
    return dutyPriority("plants");
  },
  options(view, memory) {
    if (!isBotanist(view)) return [];
    const garden = view.config.gardenRoom;
    const here = view.you.room === garden;
    if (here ? !gardenJob(view, memory.reserve) : memory.today.has(`tendPlants:${garden}`)) return [];
    const apNeeded = view.you.resources.garden > 0 ? 0 : view.config.waterAp;
    if (!here && !canAfford(view, garden, apNeeded, memory.reserve, memory)) return [];
    return [
      {
        id: "tendPlants",
        key: `tendPlants:${garden}`,
        label: `Tend the plants ${where(view, garden)}: sow, water, treat`, // i18n-ignore: model prompt text, not player-visible
        step(v, m) {
          const walk = goTo(v, garden);
          if (walk) return walk;
          const job = gardenJob(v, m.reserve);
          if (job) return job;
          m.today.add(`tendPlants:${garden}`);
          return { kind: "done" };
        },
      },
    ];
  },
};
