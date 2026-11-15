// The bots' format for a shared expedition report: returning crew members share their report in the Expeditions
// feature (`shareReport`), and bots (especially the Commander, for `leave_orbit`) fold `view.sharedReports` into
// `BotMemory.reports`. Shared text is free and never parsed by the server; only bots parse it, and only this format.
// A player can post a fake report in it and mislead them (accepted, as with shared planets). Sector tags are ids
// (the bots' language is #95).

import { PLANET_TAGS, type ExpeditionEvent, type PlayerView } from "@mush2/shared";
import type { BotMemory, BotSocial } from "./goals/types.ts";
import { activeSharedPlanet } from "./planetShare.ts";

/** An expedition report as a share in the bots' format describes it. */
export interface SharedReportInfo {
  planet: string;
  explored: string[];
}

const NONE = "none";

/** The sector tags an expedition actually explored (landing and `again` events leave the sector unexplored). */
export function exploredSectors(events: readonly ExpeditionEvent[]): string[] {
  return events
    .filter((e) => e.sector !== "LANDING" && e.kind !== "again" && Object.hasOwn(PLANET_TAGS, e.sector))
    .map((e) => e.sector);
}

/** The bots' share text for an expedition report. */
export function formatReportShare(planet: string, explored: readonly string[]): string {
  return [`Planet: ${planet}`, `Explored: ${explored.length > 0 ? explored.join(", ") : NONE}`].join("\n");
}

/** A shared report's planet and explored sectors, if its text is in the bots' format (anything else gives null). */
export function parseReportShare(text: string): SharedReportInfo | null {
  const lines = text
    .trim()
    .split("\n")
    .map((l) => l.trim());
  if (lines.length !== 2) return null;
  const planet = /^Planet: (.+)$/.exec(lines[0]!)?.[1]?.trim();
  const raw = /^Explored: (.+)$/.exec(lines[1]!)?.[1]?.trim();
  if (!planet || !raw) return null;
  if (raw === NONE) return { planet, explored: [] };
  const explored = raw.split(",").map((s) => s.trim());
  if (!explored.every((s) => Object.hasOwn(PLANET_TAGS, s))) return null;
  return { planet, explored };
}

/** What a bot knows about explored sectors from shared expedition reports (`BotMemory.reports`). */
export interface ReportMemory {
  /** Explored sector tags seen in shared reports, by planet name, in order of discovery. */
  explored: Map<string, string[]>;
  /** Shared report ids (`SharedReportView.id`) already folded into `explored`, so each entry is counted once. */
  seen: Set<string>;
  /** Own expedition report ids (`ExpeditionReportView.id`) already shared (or attempted), so we don't repeat. */
  shared: Set<string>;
}

export const newReportMemory = (): ReportMemory => ({ explored: new Map(), seen: new Set(), shared: new Set() });

/**
 * Folds new `view.sharedReports` entries in the bots' format into `memory.reports`, and returns a `shareReport`
 * message for the first finished, unshared expedition report this bot returned from (when `canPost` is true). Once
 * returned, the report counts as shared so a refused message isn't tried again.
 */
export function observeReports(view: PlayerView, memory: BotMemory, canPost = true): BotSocial | null {
  const reports = memory.reports;
  for (const entry of view.sharedReports) {
    if (reports.seen.has(entry.id)) continue;
    reports.seen.add(entry.id);
    const info = parseReportShare(entry.text);
    if (!info) continue;
    const list = reports.explored.get(info.planet) ?? [];
    list.push(...info.explored);
    reports.explored.set(info.planet, list);
  }
  if (!canPost || !view.canShareReports) return null;
  for (const report of view.expeditions) {
    if (report.away || report.shared || reports.shared.has(report.id)) continue;
    reports.shared.add(report.id);
    return {
      type: "shareReport",
      report: report.id,
      text: formatReportShare(report.planet, exploredSectors(report.events)),
    };
  }
  return null;
}

/** The sector tags reported as explored on `planet`. */
export const exploredOn = (memory: BotMemory, planet: string): string[] => [...(memory.reports.explored.get(planet) ?? [])];

/**
 * Whether every sector of the orbited planet is explored, as far as this bot knows (#417): the explored sectors in
 * shared reports (`BotMemory.reports`) against the planet's sector count, from the bot's own copy of the planet or the
 * active share in the bots' format. `null` when not in orbit or the planet's sectors aren't known to the bot.
 */
export function orbitExplored(view: PlayerView, memory: BotMemory): boolean | null {
  const name = view.navigation.orbitName;
  if (!view.navigation.orbiting || !name) return null;
  const own = view.planets.find((p) => p.orbited || p.name === name);
  const shared = activeSharedPlanet(view);
  const count = own?.sectors.length ?? (shared?.name === name ? shared.sectors.length : null);
  if (count === null) return null;
  return exploredOn(memory, name).length >= count;
}
