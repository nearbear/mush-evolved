import { DEFAULT_CONFIG, FUEL_CAPSULE_ITEM, PLANET_DIRECTIONS, type PlanetDirection, type PlayerView, type RoomId } from "@mush2/shared";
import { dutyPriority, holdsTrigger } from "../duties.ts";
import { parsePlanetShare, type SharedPlanetInfo } from "../planetShare.ts";
import { act, canAfford, failed, find, goTo, nearest, offered, roomsWith, where } from "./blocks.ts";
import type { GoalDef, GoalStep } from "./types.ts";

const COMMAND = "PILOT_MODULE";
const CHAMBER = "COMBUSTION_CHAMBER_ACCESS";
const TANK = "FUEL_TANK";

/** AP to face `direction` the shorter way and travel: what the Commander must have before it sets out (a broken reactor's longer way is found only at the terminal). */
function steerAp(view: PlayerView, direction: PlanetDirection): number {
  const nav = DEFAULT_CONFIG.navigation; // costs at a terminal the bot isn't at come from the public base config
  const heading = view.navigation.heading;
  const ways = heading === null ? null : turnsTo(heading, direction);
  const turns = ways ? Math.min(ways.left, ways.right) : 0;
  return turns * nav.turn.cost.ap + nav.travel.cost.ap;
}

/**
 * Where the ship should go (#417; owner, 2026-11-12): the most recent applicable share written in the bots' format
 * (`planetShare.ts`), whoever wrote it (a human Mush can share a fake one: accepted), whose distance the fuel in the
 * tanks and in the bot's hands covers. Null while traveling or in orbit. (Planets lie 2 to 9 fuel away, and the chamber
 * holds 9: a fake share farther than that fails at loading.)
 */
export function sharedDestination(view: PlayerView): SharedPlanetInfo | null {
  if (view.navigation.traveling || view.navigation.orbiting) return null;
  const carried = view.inventory.filter((i) => i.type === FUEL_CAPSULE_ITEM).length;
  const reach = view.ship.fuel + carried;
  const shares = view.sharedPlanets
    .map((entry, i) => ({ entry, i, info: entry.stale ? null : parsePlanetShare(entry.text) }))
    .filter((s): s is typeof s & { info: SharedPlanetInfo } => s.info !== null && s.info.distance <= reach);
  shares.sort((a, b) => b.entry.day - a.entry.day || b.entry.cycleOfDay - a.entry.cycleOfDay || b.i - a.i);
  return shares[0]?.info ?? null;
}

/**
 * The chamber's level from this bot's own latest reading in its log (checking it, or loading or unloading a capsule),
 * or null if it has none. Only trusted after a check made by the goal now running: an older reading may be out of date.
 */
export function combustionReading(view: PlayerView): number | null {
  for (let i = view.log.length - 1; i >= 0; i--) {
    const line = view.log[i]!;
    const mine = line.key === "checkedCombustion" || ((line.key === "loadedFuel" || line.key === "unloadedFuel") && line.params?.name === view.you.character);
    if (mine && typeof line.params?.level === "number") return line.params.level;
  }
  return null;
}

/** Quarter turns to face `to` from `from`, each way (`PLANET_DIRECTIONS` runs anticlockwise, so left is the next one). */
export function turnsTo(from: PlanetDirection, to: PlanetDirection): { left: number; right: number } {
  const n = PLANET_DIRECTIONS.length;
  const left = (PLANET_DIRECTIONS.indexOf(to) - PLANET_DIRECTIONS.indexOf(from) + n) % n;
  return { left, right: (n - left) % n };
}

/**
 * The Commander's travel (`BOT_DUTIES`; owner, 2026-11-12, #417): to the shared destination, out of orbit and not
 * traveling. It checks the combustion chamber (nobody sees its level otherwise), fills it with exactly the distance in
 * fuel from the tanks (or unloads the extra), turns the ship to the destination's heading at the Command terminal, and
 * travels. Leaving orbit waits for the explored sectors to be known, from expedition reports the crew shares (slice 3).
 * A pilot out on patrol is not looked for (owner, 2026-11-12: travel regardless). A human Commander means no travel.
 * Like `returnToSol`, it may spend the AP reserve: walking between the tanks and the chamber burns AP once MP runs out,
 * and a Commander reaching the bridge at the reserve would otherwise rest until its AP is full before steering.
 */
export const travel: GoalDef = {
  id: "travel",
  get priority() {
    return dutyPriority("destination");
  },
  options(view, memory) {
    if (!holdsTrigger(view, "destination")) return [];
    const destination = sharedDestination(view);
    if (!destination) return [];
    const bridge = roomsWith(view, [COMMAND]).find((r) => !memory.ended.has(`travel:${r}`) && canAfford(view, r, steerAp(view, destination.direction), 0));
    if (!bridge) return [];
    let checked = false;
    /** Tanks found offering no capsule (broken) in this run of the goal. */
    const dryTanks = new Set<RoomId>();
    return [
      {
        id: "travel",
        key: `travel:${bridge}`,
        label: `Fill the combustion chamber and steer the ship ${destination.direction}, ${destination.distance} fuel, to the shared destination from the Command terminal ${where(view, bridge)}`, // i18n-ignore: model prompt text, not player-visible
        step(v) {
          const dest = sharedDestination(v);
          // The share changed or went stale, or the ship is already on its way.
          if (!dest) return { kind: "done" };
          const level = checked ? combustionReading(v) : null;
          if (level === null) {
            const step = atChamber(v, () => find(v, "check_combustion"));
            if (step.kind === "act") checked = true;
            return step;
          }
          const carried = v.inventory.filter((i) => i.type === FUEL_CAPSULE_ITEM).length;
          const need = dest.distance - level;
          if (need > 0) return fuel(v, need, carried, dryTanks);
          if (need < 0) return atChamber(v, () => find(v, "unload_fuel"));
          return walkThenSteer(v, bridge, dest.direction);
        },
      },
    ];
  },
};

/** Walks to the combustion chamber, then takes the action `pick` finds there. */
function atChamber(view: PlayerView, pick: () => ReturnType<typeof find>): GoalStep {
  const room = nearest(view, roomsWith(view, [CHAMBER]))[0];
  if (!room) return failed("no_chamber");
  const walk = goTo(view, room);
  if (walk) return walk;
  const action = pick();
  return action ? act(action) : failed("cant_fuel");
}

/**
 * One step toward loading `need` more capsules: take them from the nearest tank while the hands hold more, then load
 * what is carried. Capsules already carried are loaded first. A tank offering none (broken) is noted in `dry` and the
 * next one tried.
 */
function fuel(view: PlayerView, need: number, carried: number, dry: Set<RoomId>): GoalStep {
  if (carried < need) {
    const here = view.you.room;
    if (roomsWith(view, [TANK]).includes(here)) {
      const take = find(view, "take_fuel");
      if (take) return act(take);
      // Hands full: load what is carried. None offered at all: this tank is out of order.
      if (offered(view, "take_fuel").length === 0) dry.add(here);
    }
    const tank = nearest(view, roomsWith(view, [TANK]).filter((r) => !dry.has(r)))[0];
    if (carried === 0 && tank !== undefined) return goTo(view, tank) ?? failed("no_path");
  }
  if (carried === 0) return failed("no_fuel");
  return atChamber(view, () => find(view, "load_fuel"));
}

/** At the Command terminal: a quarter turn the shorter way (the other way if that reactor is broken), then travel. */
function walkThenSteer(view: PlayerView, bridge: RoomId, direction: PlanetDirection): GoalStep {
  const walk = goTo(view, bridge);
  if (walk) return walk;
  const heading = view.navigation.heading;
  if (heading === null) return failed("cant_steer");
  const ways = turnsTo(heading, direction);
  const options = offered(view, heading === direction ? "travel" : "turn_ship")
    .filter((o) => o.lacks.length === 0)
    .sort((a, b) => (a.action.type === "turn_ship" && b.action.type === "turn_ship" ? ways[a.action.side] - ways[b.action.side] : 0));
  const option = options[0];
  if (!option) return failed("cant_steer");
  return act(option.action);
}
