// The bots' format for a shared planet (#417; owner, 2026-11-12): the Astrophysicist bot shares its chosen destination
// in this format, and bots (the Commander, the expedition crew) read entries written in it. Shared text is free and
// never parsed by the server; only bots parse it, and only this format. A player can share a fake planet in it and
// mislead them (accepted by the owner, 2026-11-12). Tags and directions are ids (the bots' language is #95).

import { inCraft, PLANET_DIRECTIONS, PLANET_TAGS, type PlanetDirection, type PlanetView, type PlayerView } from "@mush2/shared";

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

/**
 * Public chat lines the Commander posts in global chat about a prepared jump (#421). `"Jump: hold"`: a jump is
 * ready and held; nobody changes what they do. `"Jump: now"`: the trigger is met and the ship flees as soon as the
 * whole crew is aboard, so patrol pilots stay docked and land. `"Jump: off"`: jumped, or gave up.
 */
export const HOLD_JUMP_LINE = "Jump: hold";
export const JUMP_NOW_LINE = "Jump: now";
export const CANCEL_HOLD_LINE = "Jump: off";

/** Which of the Commander's jump lines a chat line is, or null for anything else. */
export function parseJumpHold(text: string): "hold" | "now" | "off" | null {
  const trimmed = text.trim();
  if (trimmed === HOLD_JUMP_LINE) return "hold";
  if (trimmed === JUMP_NOW_LINE) return "now";
  if (trimmed === CANCEL_HOLD_LINE) return "off";
  return null;
}

/** The current jump announcement in global chat: since which cycle, and whether it is due now. Null when none is up. */
function jumpState(view: PlayerView): { since: number; now: number | null } | null {
  let since: number | null = null;
  let now: number | null = null;
  for (const m of view.chat) {
    if (m.system || m.channel !== "global") continue;
    const kind = parseJumpHold(m.text);
    if (kind === "off") {
      since = null;
      now = null;
    } else if (kind !== null) {
      since ??= m.cycle;
      if (kind === "now") now ??= m.cycle;
    }
  }
  return since === null ? null : { since, now };
}

/** Cycle when the current jump hold started in global chat (a hold or jump-now line not yet followed by "off"), or null (#421). */
export function holdStartCycle(view: PlayerView): number | null {
  return jumpState(view)?.since ?? null;
}

/** Whether a Commander jump hold is currently up in global chat (#421). */
export function isHoldingJump(view: PlayerView): boolean {
  return jumpState(view) !== null;
}

/** Whether the Commander has announced the jump is due (`"Jump: now"`, not yet followed by `"Jump: off"`): pilots stay docked (#421). */
export function isJumpDue(view: PlayerView): boolean {
  return jumpNowCycle(view) !== null;
}

/** Cycle when the current `"Jump: now"` was posted, or null when none is up (#421). */
export function jumpNowCycle(view: PlayerView): number | null {
  return jumpState(view)?.now ?? null;
}

/**
 * Whether the minimap shows every living crewmate aboard (#421): nobody in a patrol ship or the Icarus. People whose
 * room is unknown (no ACTOPI) still show as unidentified dots, so the rooms are known even when the names aren't. The
 * lost are left out: they are on a planet, and waiting doesn't bring them back.
 */
export function crewAboard(view: PlayerView): boolean {
  const rooms = [...view.players.filter((p) => p.alive && p.room !== undefined).map((p) => p.room!), ...view.unidentified];
  return !inCraft(view.you.room) && rooms.every((r) => !inCraft(r));
}
