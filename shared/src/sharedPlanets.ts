// ---- Shared planets ----------------------------------------------------------
// Sharing a planet in the Astrophysics feature (owner, 2026-10-31, docs/rules/rules-design.md "Sharing planets"). At the
// Astro terminal, a living player with an iTrackie posts free text about one of their own planets. The text is never
// parsed: it may say anything, lies and mistakes included. Each planet gets one entry, which is also a discussion
// thread with the Astrophysics feature's access (chat.ts). Entries are never removed, only marked no longer applicable
// when the planet is lost. Like chat, this is not an Action, and the server moderates the text first.
// Structured shares (owner, 2026-11-19, docs/plans/archive/expedition-ui.md): an entry also carries the planet's true name
// and one sector slot per sector of the planet (its true size), each any tag or unknown as the sharer chose.

import { chatChannels, pushChat } from "./chat.ts";
import { cloneState, dayOf, fail, findPlayer, type ActionResult } from "./helpers.ts";
import { astroTerminalsHere, PLANET_TAGS, planetsOf, type PlanetTag } from "./planets.ts";
import type { GameState, PlayerId, PlayerState, SharedPlanetId } from "./types.ts";

/** Longest shared planet text (owner, 2026-10-31). */
export const MAX_SHARED_PLANET_LENGTH = 500;

/** Most lines in a shared planet text; moderation enforces it. */
export const MAX_SHARED_PLANET_LINES = 20;

/**
 * Whether this player may share planets now: alive at an Astro terminal with what opens the Astrophysics feature (an
 * iTrackie, or the rebel base's brain probes; `chatChannels` holds only the living, and only while playing).
 */
export const canSharePlanets = (state: Readonly<GameState>, player: Readonly<PlayerState>): boolean =>
  player.alive && astroTerminalsHere(state, player.room).length > 0 && chatChannels(state, player).includes("astrophysics");

/**
 * Shares one of your own planets, or replaces the sectors and text of its entry when it was shared before (the entry
 * and its thread stay, and it becomes applicable again). Free. `sectors` must have one slot per sector of the planet,
 * each a planet tag or null (unknown); the name comes from the planet. `text` comes moderated.
 */
export function sharePlanet(state: GameState, playerId: PlayerId, planetId: string, sectors: readonly (PlanetTag | null)[], text: string): ActionResult {
  const p = findPlayer(state, playerId);
  if (!p || !canSharePlanets(state, p)) return fail("share_forbidden");
  const planet = planetsOf(state, playerId).find((pl) => pl.id === planetId);
  if (!planet) return fail("planet_not_found");
  if (!Array.isArray(sectors) || sectors.length !== planet.sectors.length || !sectors.every((tag) => tag === null || (typeof tag === "string" && Object.hasOwn(PLANET_TAGS, tag)))) {
    return fail("share_sectors_invalid");
  }
  const body = text.trim();
  if (!body || body.length > MAX_SHARED_PLANET_LENGTH) return fail("share_text_invalid");

  const next = cloneState(state);
  const when = dayOf(next);
  const entry = next.sharedPlanets.find((s) => s.planet === planetId);
  if (entry) {
    Object.assign(entry, { name: planet.name, sectors: [...sectors], text: body, by: playerId, ...when, stale: false });
  } else {
    const id: SharedPlanetId = `sp-${next.nextSharedPlanetId++}`;
    next.sharedPlanets.push({ id, planet: planetId, name: planet.name, sectors: [...sectors], text: body, by: playerId, ...when, stale: false });
  }
  pushChat(next, "astrophysics", { from: null, isBot: false, text: "", system: { key: entry ? "planetShareUpdated" : "planetShared", params: { name: p.character } } });
  return { ok: true, state: next };
}

/**
 * Marks entries no longer applicable, all but the one shared from `keep` (the planet a travel heads for, which stays
 * in play in orbit). Mutates a state the caller already cloned.
 */
export function markSharedPlanetsStale(state: GameState, keep: string | null = null): void {
  for (const entry of state.sharedPlanets) if (entry.planet !== keep) entry.stale = true;
}
