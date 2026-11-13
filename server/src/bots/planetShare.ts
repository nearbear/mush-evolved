// The bots' format for a shared planet (#417; owner, 2026-11-12): the Astrophysicist bot shares its chosen destination
// in this format, and bots (the Commander, the expedition crew) read entries written in it. Shared text is free and
// never parsed by the server; only bots parse it, and only this format. A player can share a fake planet in it and
// mislead them (accepted by the owner, 2026-11-12). Tags and directions are ids (the bots' language is #95).

import { PLANET_DIRECTIONS, PLANET_TAGS, type PlanetDirection, type PlanetView } from "@mush2/shared";

/** A planet as a share in the bots' format describes it. `null` is a sector not analyzed yet. */
export interface SharedPlanetInfo {
  name: string;
  direction: PlanetDirection;
  distance: number;
  sectors: (string | null)[];
}

const UNKNOWN = "?";

/** The bots' share text for a planet the bot holds. */
export function formatPlanetShare(planet: Pick<PlanetView, "name" | "direction" | "distance" | "sectors">): string {
  return [
    `Planet: ${planet.name}`,
    `Position: ${planet.direction}, ${planet.distance} fuel`,
    `Sectors: ${planet.sectors.map((s) => s ?? UNKNOWN).join(", ")}`,
  ].join("\n");
}

/** A share's planet, if its text is in the bots' format (anything else, or anything off in it, gives null). */
export function parsePlanetShare(text: string): SharedPlanetInfo | null {
  const lines = text.trim().split("\n").map((l) => l.trim());
  if (lines.length !== 3) return null;
  const name = /^Planet: (.+)$/.exec(lines[0]!)?.[1]?.trim();
  const position = /^Position: (\w+), (\d{1,2}) fuel$/.exec(lines[1]!);
  const sectors = /^Sectors: (.+)$/.exec(lines[2]!)?.[1]?.split(",").map((s) => s.trim());
  if (!name || !position || !sectors) return null;
  const direction = PLANET_DIRECTIONS.find((d) => d === position[1]);
  const distance = Number(position[2]);
  if (!direction || distance < 1) return null;
  if (!sectors.every((s) => s === UNKNOWN || Object.hasOwn(PLANET_TAGS, s))) return null;
  return { name, direction, distance, sectors: sectors.map((s) => (s === UNKNOWN ? null : s)) };
}
