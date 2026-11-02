import { ITEM_TYPES, type ActionOption, type PlayerView } from "@mush2/shared";
import { act, canAfford, goTo, where } from "./blocks.ts";
import type { GoalDef, GoalStep } from "./types.ts";

/** The skills that see plant sickness (`isBotanistRole` in shared/src/botany.ts). */
const BOTANIST_SKILLS = ["botanic", "skilful"];

export const isBotanist = (view: PlayerView): boolean => view.you.skills.some((s) => BOTANIST_SKILLS.includes(s));

/** Whether an offered garden action can be paid while keeping the AP reserve (free with a garden point in the garden). */
const payable = (view: PlayerView, o: ActionOption, reserve: number): boolean => o.lacks.length === 0 && view.you.ap - o.cost.ap >= reserve;

/** An empty hydropot in the bot's room (the garden pots only; owner, 2026-11-01: no fetching pots from storage). */
const emptyPotHere = (view: PlayerView): boolean => view.roomItems.some((i) => i.type === "tree_pot" && !i.plant);

/**
 * The next garden job the bot can pay for here, most urgent first: water a thirsty plant (unwatered, it gives no oxygen
 * or fruit at day start), treat a sick one (only the Botanist role is offered just the sick ones), then sow a carried
 * fruit in an empty pot, picking one up off the floor first when it carries none.
 */
export function gardenJob(view: PlayerView, reserve: number): GoalStep | null {
  for (const type of ["water", "treat", "sow"] as const) {
    const job = view.actions.find((o) => o.action.type === type && payable(view, o, reserve));
    if (job) return act(job.action);
  }
  if (!emptyPotHere(view) || view.inventory.some((i) => ITEM_TYPES[i.type]?.fruit)) return null;
  const fruit = view.roomItems.find((i) => ITEM_TYPES[i.type]?.fruit);
  const take = fruit && view.actions.find((o) => o.action.type === "take" && o.action.item === fruit.id && o.lacks.length === 0);
  // Pick it up only when the sowing can be paid for afterwards.
  const sowAp = view.you.resources.garden > 0 ? 0 : view.config.sowAp;
  return take && view.you.ap - take.cost.ap - sowAp >= reserve ? act(take.action) : null;
}

/**
 * Tend the garden (owner, 2026-11-01): a Botanist-role bot (Botanist or Skilful, who see sickness) walks to the garden
 * once a day, since every plant gets thirstier at each day start, and waters, treats and sows (`gardenJob`) down to the
 * AP reserve. Garden points pay there first. Other bots leave the plants alone. What the plants need is seen only on
 * arrival (a view shows items only in the bot's own room); while there, any job it sees is also offered.
 */
export const tendPlants: GoalDef = {
  id: "tendPlants",
  // duties.ts: botanic, trigger "plants", priority 53.
  priority: 53,
  options(view, memory) {
    if (!isBotanist(view)) return [];
    const garden = view.config.gardenRoom;
    const here = view.you.room === garden;
    if (here ? !gardenJob(view, memory.reserve) : memory.today.has(`tendPlants:${garden}`)) return [];
    const apNeeded = view.you.resources.garden > 0 ? 0 : view.config.waterAp;
    if (!here && !canAfford(view, garden, apNeeded, memory.reserve)) return [];
    return [
      {
        id: "tendPlants",
        key: `tendPlants:${garden}`,
        label: `Tend the plants ${where(view, garden)}: water, treat, sow`, // i18n-ignore: model prompt text, not player-visible
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
