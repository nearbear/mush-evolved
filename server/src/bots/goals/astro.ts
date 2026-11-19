import type { PlanetView, PlayerView } from "@mush2/shared";
import { dutyPriority, holdsTrigger } from "../duties.ts";
import { formatPlanetShare, parsePlanetShare } from "../planetShare.ts";
import { act, canAfford, failed, offered, goTo, roomsWith, where } from "./blocks.ts";
import type { BotMemory, ExpeditionKind, Goal, GoalDef, GoalStep } from "./types.ts";

const ASTRO = "ASTRO_MODULE";
const isAstroDuty = (d: { actions?: readonly string[] }): boolean => Boolean(d.actions?.includes("scan_planet"));

/** Sectors that make a planet not worth the risk: deleted on sight (owner, 2026-11-12, #417). */
export const DEADLY_TAGS: readonly string[] = ["MANKAROG", "VOLCANIC_ACTIVITY"];

/** What a planet's revealed sectors offer an expedition: an Oxygen sector, a Hydrocarbon sector (owner, 2026-11-12). */
export function planetKinds(sectors: readonly (string | null)[]): ExpeditionKind[] {
  const kinds: ExpeditionKind[] = [];
  if (sectors.includes("OXYGEN")) kinds.push("oxygen");
  if (sectors.includes("HYDROCARBON")) kinds.push("fuel");
  return kinds;
}

/**
 * What the Astrophysicist makes of one of its planets (#417): delete it (a deadly sector, farther than the ship's fuel,
 * or fully analyzed with neither oxygen nor fuel), analyze it further, or it is ready to go to. A planet is ready as soon
 * as an oxygen or fuel sector is revealed, without waiting for the rest (owner, 2026-11-18): a full analysis took until
 * about cycle 12, and escape jumps erased the planet first. Its other sectors are left unknown. The orbited planet is
 * left alone (null): it can't be deleted, and it was already chosen.
 */
export function judgePlanet(view: PlayerView, planet: PlanetView): "delete" | "analyze" | "ready" | null {
  if (planet.orbited) return null;
  if (planet.sectors.some((s) => s !== null && DEADLY_TAGS.includes(s))) return "delete";
  if (planet.distance > view.ship.fuel) return "delete";
  if (planetKinds(planet.sectors).length > 0) return "ready";
  return planet.sectors.includes(null) ? "analyze" : "delete";
}

/**
 * Which ready planet to send the ship to: one with something other than what the last expedition went for first, so
 * oxygen and fuel alternate, then the nearest (owner, 2026-11-12: whichever target is ready first goes first).
 */
export function chooseDestination(view: PlayerView, last: ExpeditionKind | null): PlanetView | null {
  const ready = view.planets.filter((p) => judgePlanet(view, p) === "ready");
  const fresh = (p: PlanetView) => (planetKinds(p.sectors).some((k) => k !== last) ? 0 : 1);
  return ready.sort((a, b) => fresh(a) - fresh(b) || a.distance - b.distance || a.id.localeCompare(b.id))[0] ?? null;
}

/** Whether this bot already has an applicable share naming a planet it still holds and would go to. */
function destinationShared(view: PlayerView): boolean {
  return view.sharedPlanets.some((entry) => {
    if (entry.by !== view.you.id || entry.stale) return false;
    const name = parsePlanetShare(entry.text)?.name;
    return view.planets.some((p) => p.name === name && judgePlanet(view, p) === "ready");
  });
}

/** The Astrophysicist's next piece of astro work, in order: delete, share the destination, analyze, scan. */
export type AstroWork =
  | { kind: "delete"; planet: PlanetView }
  | { kind: "share"; planet: PlanetView }
  | { kind: "analyze"; planet: PlanetView; ap: number }
  | { kind: "scan"; ap: number };

export function nextAstroWork(view: PlayerView, last: ExpeditionKind | null): AstroWork | null {
  const toDelete = view.planets.find((p) => judgePlanet(view, p) === "delete");
  if (toDelete) return { kind: "delete", planet: toDelete };
  // Not while traveling or in orbit: travel and leaving orbit make every share but the destination's no longer applicable.
  if (!view.navigation.traveling && !view.navigation.orbiting && !destinationShared(view)) {
    const destination = chooseDestination(view, last);
    if (destination) return { kind: "share", planet: destination };
  }
  const unanalyzed = view.planets.find((p) => judgePlanet(view, p) === "analyze");
  if (unanalyzed) return { kind: "analyze", planet: unanalyzed, ap: view.config.analyzeAp };
  if (view.planets.length < view.maxPlanets && !view.navigation.orbiting && !view.navigation.traveling) {
    return { kind: "scan", ap: Math.max(0, view.config.scanAp - view.config.astrophysicistScanDiscount) };
  }
  return null;
}

/** AP the next astro work costs (0 to delete or share), or null when there is none. */
export function nextAstroAp(view: PlayerView, last: ExpeditionKind | null = null): number | null {
  const work = nextAstroWork(view, last);
  return work === null ? null : work.kind === "analyze" || work.kind === "scan" ? work.ap : 0;
}

/**
 * The Astrophysicist's duty (`BOT_DUTIES`; owner, 2026-11-12, #417): find an oxygen planet and a fuel planet, analyze
 * them until an oxygen or fuel sector shows (owner, 2026-11-18), delete the ones not worth going to, and share the destination in the bots' format (`planetShare.ts`) so
 * the Commander and the crew can read it. Each cycle while there is such work, down to the AP reserve.
 */
export const astro: GoalDef = {
  id: "astro",
  get priority() {
    return dutyPriority("astro", isAstroDuty);
  },
  options: (view, memory) => astroOptions(view, memory, false),
};

/** Notes what an orbited planet of its own offers, so the next destination alternates. */
function noteOrbit(view: PlayerView, memory: BotMemory): void {
  const orbited = view.planets.find((p) => p.orbited);
  const kinds = orbited ? planetKinds(orbited.sectors) : [];
  // A planet with both counts as an oxygen run: oxygen is what runs out first.
  if (kinds.length > 0) memory.lastExpedition = kinds[0]!;
}

export function astroOptions(view: PlayerView, memory: BotMemory, ignoreDirty: boolean): Goal[] {
  if (!holdsTrigger(view, "astro", isAstroDuty)) return [];
  noteOrbit(view, memory);
  const work = nextAstroWork(view, memory.lastExpedition);
  if (work === null) return [];
  const ap = work.kind === "analyze" || work.kind === "scan" ? work.ap : 0;
  if (ap > 0 && !ignoreDirty && view.statuses.includes("dirty")) return [];
  const room = roomsWith(view, [ASTRO]).find((r) => !memory.ended.has(`astro:${r}`) && canAfford(view, r, ap, memory.reserve, memory));
  if (!room) return [];
  return [
    {
      id: "astro",
      key: `astro:${room}`,
      label: `Look for oxygen and fuel planets at the astro terminal ${where(view, room)}`, // i18n-ignore: model prompt text, not player-visible
      step: (v, m) => goTo(v, room) ?? astroStep(v, m),
    },
  ];
}

function astroStep(view: PlayerView, memory: BotMemory): GoalStep {
  const work = nextAstroWork(view, memory.lastExpedition);
  if (work === null) return { kind: "done" };
  if (work.kind === "share") {
    if (!view.canSharePlanets) return failed("cant_share_planet");
    return { kind: "social", message: { type: "sharePlanet", planet: work.planet.id, text: formatPlanetShare(work.planet) } };
  }
  const option =
    work.kind === "delete"
      ? offered(view, "delete_planet").find((o) => o.action.planet === work.planet.id)
      : work.kind === "analyze"
        ? offered(view, "analyze_planet").find((o) => o.action.planet === work.planet.id)
        : offered(view, "scan_planet")[0];
  if (!option) return failed("cant_astro");
  if (view.you.ap - option.cost.ap < memory.reserve) return { kind: "done" };
  // Dirty: done for now, offered again once clean (the shower goal looks at astro work).
  if (option.lacks.includes("clean")) return { kind: "done", again: true };
  if (option.lacks.length > 0) return { kind: "done" };
  return act(option.action);
}
