import { FUEL_CAPSULE_ITEM, type PlayerView, type RoomId } from "@mush2/shared";
import { hasBotSkill, holdsTrigger } from "../duties.ts";
import { FUEL_LOADING_LINE, formatFuelReport, fuelClaimant, openFuelRequest } from "../fuelShare.ts";
import { act, canAfford, find, goTo, nearest, offered, roomsWith } from "./blocks.ts";
import { CHAMBER, FUEL_WAIT_CYCLES, TANK, atChamber, combustionReading, fuel, pauseIfOutOfPoints } from "./travel.ts";
import type { BotMemory, Goal, GoalDef, GoalStep } from "./types.ts";

/**
 * Where answering a fuel request ranks (Claude's pick, 2026-11-20, to confirm): between the coffee relay (76.5) and the
 * Commander's `travel` (77). The work itself is free; only the walks cost AP, and they keep the AP reserve.
 */
export const LOAD_FUEL_PRIORITY = 76.6;

/** Cycles a request waits for the preferred loaders before anyone may take it (Claude's pick, 2026-11-20). */
export const FUEL_HELP_AFTER_CYCLES = 1;

/**
 * The natural loaders (owner, 2026-11-20): Technicians (`engineer`) and Raluca, who get dirty anyway and tend to be
 * near the engines. They take a request at once; anyone else after `FUEL_HELP_AFTER_CYCLES`.
 */
export const preferredLoader = (view: PlayerView): boolean => hasBotSkill(view, "engineer") || view.you.character === "raluca";

const carried = (view: PlayerView): number => view.inventory.filter((i) => i.type === FUEL_CAPSULE_ITEM).length;

/**
 * Capsules to bring before reading the chamber: the request's level less where the last report left it (`FuelMemory.chamber`;
 * after a jump the chamber is empty), less what the hands hold.
 */
const toFetch = (view: PlayerView, memory: BotMemory, level: number): number => Math.max(0, level - (memory.fuel.chamber ?? 0) - carried(view));

/** Where the walk starts: the nearest tank when capsules are still to fetch, else the Motor Room. */
function firstStop(view: PlayerView, memory: BotMemory, level: number): RoomId | undefined {
  return toFetch(view, memory, level) > 0 ? nearest(view, roomsWith(view, [TANK]))[0] : nearest(view, roomsWith(view, [CHAMBER]))[0];
}

/** Whether helpers may still answer `request`: the Commander takes it over after `FUEL_WAIT_CYCLES`. */
const stillOurs = (view: PlayerView, request: { cycle: number }): boolean => view.cycle - request.cycle < FUEL_WAIT_CYCLES;

/**
 * Answer the Commander's fuel request (fuel relay, owner 2026-11-20; `fuelShare.ts`): claim it (`Fuel: loading`), take
 * capsules from a tank, check the chamber (free), load or unload it to exactly the level asked (travel burns everything
 * in it), and report once (`Fuel: chamber at <N>`). Not the Commander, who loads it himself only as a fallback (`travel`).
 */
export const loadFuel: GoalDef = {
  id: "loadFuel",
  priority: LOAD_FUEL_PRIORITY,
  options(view, memory) {
    if (holdsTrigger(view, "destination")) return [];
    if (view.navigation.traveling) return [];
    const request = openFuelRequest(memory.fuel);
    if (!request) return [];
    if (!stillOurs(view, request)) return [];
    if (!preferredLoader(view) && view.cycle - request.cycle < FUEL_HELP_AFTER_CYCLES) return [];
    const claimant = fuelClaimant(view, memory.fuel);
    if (claimant !== null && claimant !== view.you.id) return [];
    const key = `loadFuel:${request.seq}`;
    if (memory.ended.has(key)) return [];
    const stop = firstStop(view, memory, request.level);
    if (!stop || !canAfford(view, stop, 0, memory.reserve, memory)) return [];
    return [loadFuelGoal(view, key, request.seq, request.level)];
  },
};

function loadFuelGoal(view: PlayerView, key: string, seq: number, level: number): Goal {
  /** Whether this run of the goal has read the chamber itself: until then the bot's older readings may be stale. */
  let checked = false;
  /** Whether the hands filled up at a tank in this run of the goal: read the chamber with what is carried. */
  let handsFull = false;
  /** Whether the bot is taking capsules back to a tank to free its hands for unloading. */
  let returning = false;
  const dryTanks = new Set<RoomId>();
  return {
    id: "loadFuel",
    key,
    label: `Fill the combustion chamber to ${level} fuel for the Commander`, // i18n-ignore: model prompt text, not player-visible
    step(v: PlayerView, memory: BotMemory): GoalStep {
      const request = openFuelRequest(memory.fuel);
      if (!request || request.seq !== seq || !stillOurs(v, request)) return { kind: "done", again: true };
      const claimant = fuelClaimant(v, memory.fuel);
      if (claimant !== null && claimant !== v.you.id) return { kind: "done" };
      if (claimant === null) {
        if (!v.chatChannels.includes("global")) return { kind: "done" };
        return { kind: "social", message: { type: "chat", channel: "global", text: FUEL_LOADING_LINE } };
      }
      const hands = carried(v);
      const known = checked ? combustionReading(v) : null;
      if (known === null) {
        // Bring what the chamber likely lacks, then read it.
        const fetch = handsFull ? 0 : toFetch(v, memory, level);
        if (fetch > 0 && roomsWith(v, [TANK]).includes(v.you.room) && !dryTanks.has(v.you.room)) {
          const take = find(v, "take_fuel");
          if (take) return act(take);
          // Hands full: read the chamber with what is carried. None offered at all: this tank is out of order.
          if (offered(v, "take_fuel").length === 0) dryTanks.add(v.you.room);
          else handsFull = true;
        }
        if (fetch > 0 && hands === 0) {
          const tank = nearest(v, roomsWith(v, [TANK]).filter((r) => !dryTanks.has(r)))[0];
          if (!tank) return { kind: "failed", reason: "no_fuel" };
          return pauseIfOutOfPoints(v, goTo(v, tank) ?? { kind: "failed", reason: "no_path" }, (reason) => ({ kind: "failed", reason }));
        }
        const step = atChamber(v, () => find(v, "check_combustion"));
        if (step.kind === "act") checked = true;
        return pauseIfOutOfPoints(v, step, (reason) => ({ kind: "failed", reason }));
      }
      const need = level - known;
      if (need > 0) return pauseIfOutOfPoints(v, fuel(v, need, hands, dryTanks), (reason) => ({ kind: "failed", reason }));
      if (need < 0) {
        // Unloading needs a free hand: with none, put the carried capsules back in a tank first.
        const atTheChamber = roomsWith(v, [CHAMBER]).includes(v.you.room);
        if (atTheChamber && hands > 0 && !find(v, "unload_fuel")) returning = true;
        if (returning && hands > 0) {
          const back = find(v, "return_fuel");
          if (back) return act(back);
          const tank = nearest(v, roomsWith(v, [TANK]))[0];
          if (!tank) return { kind: "failed", reason: "no_fuel" };
          return pauseIfOutOfPoints(v, goTo(v, tank) ?? { kind: "failed", reason: "no_path" }, (reason) => ({ kind: "failed", reason }));
        }
        returning = false;
        return pauseIfOutOfPoints(v, atChamber(v, () => find(v, "unload_fuel")), (reason) => ({ kind: "failed", reason }));
      }
      if (!v.chatChannels.includes("global")) return { kind: "done" };
      return { kind: "social", message: { type: "chat", channel: "global", text: formatFuelReport(level) } }; // read back next turn: the request is answered and the goal ends
    },
  };
}
