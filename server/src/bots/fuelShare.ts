// The fuel relay (owner, 2026-11-20; docs/scratchpad/bot-survival-plan.md Run A2c). Loading the combustion chamber is
// free (0 AP) but costs a walk to a fuel tank and the Motor Room, which the Commander can rarely afford next to the walk
// to the bridge. So the Commander asks and anyone loads, Technicians and Raluca first (`goals/loadFuel.ts`). Three
// fixed global-chat lines, like the tank and expedition lines:
//   `Fuel: need <N>`        the Commander: the chamber level the next move needs (a jump's distance, or 1 to leave orbit)
//   `Fuel: loading`         a helper claims the request for this cycle, so other bots stand down (owner, 2026-11-20)
//   `Fuel: chamber at <N>`  the helper filled the chamber to N: one line a request, not one a capsule (owner, 2026-11-20)
// The chamber level is otherwise secret (fuel actions log only to their actor); the report shares only what its
// poster read for themself. The Commander trusts it (owner, 2026-11-20: trust isn't a concern yet), and a player can
// post a false one and mislead the bots (accepted, as with the other lines). A jump or leaving orbit voids a request:
// both change the chamber, and the next move needs a new one.

import { DEFAULT_CONFIG, type PlayerId, type PlayerView } from "@mush2/shared";
import type { BotMemory } from "./goals/types.ts";

export const FUEL_LOADING_LINE = "Fuel: loading";
export const formatFuelNeed = (level: number): string => `Fuel: need ${level}`;
export const formatFuelReport = (level: number): string => `Fuel: chamber at ${level}`;

export type FuelLine = { kind: "need"; level: number } | { kind: "loading" } | { kind: "report"; level: number };

/** A chat line in the bots' fuel format, or null. Levels outside the chamber's 1..capacity are ignored. */
export function parseFuelLine(text: string): FuelLine | null {
  const t = text.trim();
  if (t === FUEL_LOADING_LINE) return { kind: "loading" };
  const m = /^Fuel: (need|chamber at) (\d+)$/.exec(t);
  if (!m) return null;
  const level = Number(m[2]);
  if (level > DEFAULT_CONFIG.ship.combustion.max || (m[1] === "need" && level < 1)) return null;
  return m[1] === "need" ? { kind: "need", level } : { kind: "report", level };
}

/** A posted line the relay keeps: who, when (`ChatLine.cycle`) and where in global chat (`ChatLine.seq`). */
export interface FuelPost {
  by: PlayerId;
  cycle: number;
  seq: number;
}

/** What a bot knows of the relay (`BotMemory.fuel`). Plain data; each field is replaced, never mutated. */
export interface FuelMemory {
  /** The latest request still standing, and whether the ship was in orbit when it was read. */
  request: (FuelPost & { level: number; orbit: boolean }) | null;
  /** The first claim of the request this cycle (claims lapse each cycle, like the tank claims). */
  claim: FuelPost | null;
  /** The latest report since the request. */
  report: (FuelPost & { level: number }) | null;
  /** The last level reported, kept across requests until the ship moves: where a helper expects the chamber to be. */
  chamber: number | null;
  /** The global-chat position read up to (`ChatLine.seq`). */
  seq: number;
}

export const newFuelMemory = (): FuelMemory => ({ request: null, claim: null, report: null, chamber: null, seq: -1 });

/** Folds new fuel lines into memory, and drops the request once the ship has moved (traveling, or in or out of orbit since). */
export function observeFuel(view: PlayerView, memory: BotMemory): void {
  const fuel = memory.fuel;
  for (const line of view.chat) {
    if (line.channel !== "global" || line.seq <= fuel.seq) continue;
    fuel.seq = line.seq;
    if (line.system || line.from === null) continue;
    const parsed = parseFuelLine(line.text);
    if (!parsed) continue;
    const post: FuelPost = { by: line.from, cycle: line.cycle, seq: line.seq };
    if (parsed.kind === "need") {
      fuel.request = { ...post, level: parsed.level, orbit: view.navigation.orbiting };
      fuel.claim = null;
      fuel.report = null;
    } else if (parsed.kind === "loading") {
      if (fuel.request && (fuel.claim === null || fuel.claim.cycle !== line.cycle)) fuel.claim = post;
    } else if (fuel.request) {
      fuel.report = { ...post, level: parsed.level };
      fuel.chamber = parsed.level;
    }
  }
  if (fuel.request && (view.navigation.traveling || view.navigation.orbiting !== fuel.request.orbit)) {
    fuel.request = null;
    fuel.claim = null;
    fuel.report = null;
  }
  if (view.navigation.traveling) fuel.chamber = null;
}

/** Whether the standing request has been answered: a report of its level since it went up. */
export const fuelAnswered = (fuel: FuelMemory): boolean =>
  fuel.request !== null && fuel.report !== null && fuel.report.seq > fuel.request.seq && fuel.report.level === fuel.request.level;

/** The standing request nobody has answered yet, if any. */
export const openFuelRequest = (fuel: FuelMemory): FuelMemory["request"] => (fuel.request && !fuelAnswered(fuel) ? fuel.request : null);

/** Who claimed the request this cycle, if anyone. */
export const fuelClaimant = (view: PlayerView, fuel: FuelMemory): PlayerId | null =>
  fuel.claim && fuel.claim.cycle === view.cycle ? fuel.claim.by : null;
