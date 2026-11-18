import { DEFAULT_CONFIG, viewPath, type Plan, type PlayerView } from "@mush2/shared";
import { hasBotSkill } from "../duties.ts";
import { roomsHolding } from "../itemShare.ts";
import { activeSharedPlanet } from "../planetShare.ts";
import { orbitExplored } from "../reportShare.ts";
import { act, canAfford, find, goTo, nearest, offered } from "./blocks.ts";
import type { BotMemory, Goal, GoalDef, GoalStep } from "./types.ts";

export const EXPEDITION_LAUNCH_PRIORITY = 73.5;

const ICARUS = DEFAULT_CONFIG.expedition.room;
const CRAFT = DEFAULT_CONFIG.expedition.craft;

const openExpeditionPlan = (view: PlayerView) =>
  view.plans.find((p) => p.purpose === "expedition" && p.status === "open");

/** Whether sectors may be left to explore: not known to be all explored (`orbitExplored`). */
const hasKnownUnexplored = (view: PlayerView, memory: BotMemory): boolean => orbitExplored(view, memory) !== true;

const noTakeoffKey = (view: PlayerView): string => `noTakeoff:${view.navigation.orbitName ?? "orbit"}`;

/** Remembered for the cycle of a summons, so the launcher gives the summoned crew that cycle to board. */
const summonedKey = (plan: string, cycle: number): string => `expeditionSummoned:${plan}:${cycle}`;

/** Whether boarding needs a spacesuit this bot doesn't carry (unknown sectors count as airless). */
const lacksSpacesuit = (view: PlayerView): boolean =>
  !activeSharedPlanet(view)?.sectors.includes("OXYGEN") && !view.inventory.some((i) => i.type === "space_suit" && !i.broken);

/**
 * A step toward a working spacesuit, which boarding needs unless the planet has an Oxygen sector (owner, 2026-11-17),
 * or null when none is needed or none can be had: one on this room's floor, else the nearest room bots know holds one
 * (`itemShare.ts`). Sectors come from the shared planet, as for the crew (`expeditionPrep`); unknown means suited.
 */
function fetchSpacesuit(view: PlayerView, memory: BotMemory): GoalStep | null {
  if (!lacksSpacesuit(view)) return null;
  const take = find(view, "take", (a) => view.roomItems.some((i) => i.id === a.item && i.type === "space_suit" && !i.broken));
  if (take) return act(take);
  if (view.inventory.length >= view.inventorySlots) return null;
  const rooms = roomsHolding(memory, "space_suit").filter((r) => r !== view.you.room);
  const room = nearest(view, rooms).find((r) => canAfford(view, r, 0, memory.reserve, memory));
  return room ? goTo(view, room) : null;
}

/**
 * Holders of this launcher's summoned plan who stand in the bay, alive, during the cycle of the summons: they are
 * given that cycle to board (`expeditionPrep` boards on arrival). The next cycle the launcher goes without them, so a
 * holder who can't board (no spacesuit) or a person who never does holds the launch back one cycle at most.
 */
function crewStillBoarding(view: PlayerView, memory: BotMemory): boolean {
  const plan: Plan | undefined = view.plans.find((p) => p.purpose === "expedition" && p.status === "called" && p.author === view.you.id);
  if (!plan || !memory.today.has(summonedKey(plan.id, view.cycle))) return false;
  const holders = new Set(plan.slots.flatMap((s) => (s.kind === "onCall" && s.holder !== null && s.holder !== view.you.id ? [s.holder] : [])));
  return view.players.some((p) => holders.has(p.id) && p.alive && p.room === ICARUS);
}

/**
 * Once in orbit with unexplored sectors, a Pilot fetches a spacesuit if the planet needs one (`fetchSpacesuit`), walks
 * to `ICARUS` (the bay), runs `summon` on the open expedition plan
 * (if authored by them), waits that cycle for the summoned crew to board, boards the Icarus (`board_icarus`), and
 * launches from inside with `icarus_takeoff` (owner, 2026-11-17: the crew is whoever is aboard). If an open plan
 * belongs to another living Pilot, this Pilot defers so the author can summon the crew first. A Pilot refused either
 * step, or with no spacesuit to be had on a planet that needs one, remembers it for this orbit (`noTakeoffKey`); one left aboard gets off through `leaveIcarus`.
 */
export const expeditionLaunch: GoalDef = {
  id: "expeditionLaunch",
  priority: EXPEDITION_LAUNCH_PRIORITY,
  options(view, memory) {
    if (!view.you.alive || view.patrolShip !== null) return [];
    if (!hasBotSkill(view, "pilot")) return [];
    if (!view.navigation.orbiting || view.expedition !== null) return [];
    if (memory.once.has(noTakeoffKey(view))) return [];
    if (!hasKnownUnexplored(view, memory)) return [];

    const open = openExpeditionPlan(view);
    if (open && open.author !== view.you.id && view.players.some((p) => p.id === open.author && p.alive)) {
      return [];
    }

    if (view.you.room === CRAFT) {
      if (offered(view, "icarus_takeoff").length === 0) return [];
    } else if (view.you.room === ICARUS) {
      if (offered(view, "board_icarus").length === 0 && fetchSpacesuit(view, memory) === null) return [];
    } else {
      if (viewPath(view, view.you.room, ICARUS) === null) return [];
      if (!canAfford(view, ICARUS, 0, memory.reserve, memory)) return [];
    }

    const key = `expeditionLaunch:${view.navigation.orbitName ?? "orbit"}`;
    if (memory.ended.has(key)) return [];
    return [launchGoal(key)];
  },
};

function launchGoal(key: string): Goal {
  return {
    id: "expeditionLaunch",
    key,
    label: "Summon the expedition crew, board the Icarus and launch it", // i18n-ignore: model prompt text, not player-visible
    step(v, m) {
      if (!v.navigation.orbiting || v.expedition !== null) return { kind: "done" };
      if (v.you.room === CRAFT) {
        const offers = offered(v, "icarus_takeoff");
        if (offers.length === 0) {
          m.once.add(noTakeoffKey(v));
          return { kind: "done" };
        }
        const affordable = offers.find((o) => o.lacks.length === 0);
        return affordable ? act(affordable.action) : { kind: "wait" };
      }
      const suit = fetchSpacesuit(v, m);
      if (suit) return suit;
      if (v.you.room !== ICARUS) {
        const walk = goTo(v, ICARUS);
        if (walk) return walk;
      }
      // No suit to be had: give up before summoning a crew it couldn't fly.
      if (lacksSpacesuit(v)) {
        m.once.add(noTakeoffKey(v));
        return { kind: "done" };
      }
      const open = openExpeditionPlan(v);
      if (open && open.author === v.you.id) {
        const summon = find(v, "summon", (a) => a.plan === open.id);
        if (summon) {
          m.today.add(summonedKey(open.id, v.cycle));
          return act(summon);
        }
      }
      if (crewStillBoarding(v, m)) return { kind: "wait" };
      const board = find(v, "board_icarus");
      if (!board) {
        m.once.add(noTakeoffKey(v));
        return { kind: "done" };
      }
      return act(board);
    },
  };
}
