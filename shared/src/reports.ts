// Reports and the alert bar (owner, 2026-11-14, #444; docs/rules/rules-design.md "Reports and the alert bar").
// A player reports a fire or a broken piece of equipment in their own room (actions/report.ts); the report lasts until
// the problem is fixed. Fire detectors (`FIRE_SENSOR`) report every fire and the Anomaly detector (`EQUIPMENT_SENSOR`)
// every broken piece of equipment; that coverage is derived here, never stored. The alert bar counts every fire and
// every broken piece of equipment, reported or not, but locates only the reported ones (`alertsFor`).

import type { CharacterId } from "./characters.ts";
import { findPlayer } from "./helpers.ts";
import { projectDone } from "./projects.ts";
import type { Equipment, GameState, Report, RoomId } from "./types.ts";

/** Who reported a problem: a crew member, or the detector that covers its kind. */
export type ReportSource = CharacterId | "FIRE_SENSOR" | "EQUIPMENT_SENSOR";

/** One located problem on the alert bar. */
export type AlertReport = { kind: "fire"; room: RoomId; by: ReportSource } | { kind: "equipment"; room: RoomId; equipment: string; by: ReportSource };

/** The alert bar (`PlayerView.alerts`): every fire and broken piece of equipment counted, the reported ones located. */
export interface Alerts {
  fires: number;
  broken: number;
  reports: AlertReport[];
}

/** Whether Fire detectors report every fire. */
export const firesDetected = (state: Readonly<GameState>): boolean => projectDone(state, "FIRE_SENSOR");

/** Whether the Anomaly detector reports every broken piece of equipment. */
export const breakdownsDetected = (state: Readonly<GameState>): boolean => projectDone(state, "EQUIPMENT_SENSOR");

/** Every broken piece of equipment aboard, with its room. Items never count. */
export function brokenEquipment(state: Readonly<GameState>): { room: RoomId; equipment: Readonly<Equipment> }[] {
  return Object.entries(state.equipment).flatMap(([room, list]) => list.filter((e) => e.broken).map((equipment) => ({ room, equipment })));
}

/** Whether a fire in `room` is reported, by a player or by Fire detectors. */
export const fireReported = (state: Readonly<GameState>, room: RoomId): boolean =>
  firesDetected(state) || state.reports.some((r) => r.kind === "fire" && r.room === room);

/** Whether broken equipment `id` is reported, by a player or by the Anomaly detector. */
export const breakdownReported = (state: Readonly<GameState>, id: string): boolean =>
  breakdownsDetected(state) || state.reports.some((r) => r.kind === "equipment" && r.equipment === id);

/** Whether a stored report's problem still exists (and no detector has taken it over). */
function stillOpen(state: Readonly<GameState>, report: Readonly<Report>): boolean {
  if (report.kind === "fire") return !firesDetected(state) && state.fires.includes(report.room);
  return !breakdownsDetected(state) && Object.values(state.equipment).some((list) => list.some((e) => e.id === report.equipment && e.broken));
}

/**
 * Drops every report whose problem is fixed (the fire out, the equipment working) or that a detector now covers, so a
 * fire that relights or equipment that breaks again starts unreported. Runs after every input (replay.ts `applyInput`),
 * which catches every way a problem gets fixed (actions, drones, Superkube) without hooking each one. Returns `state`
 * itself when nothing is stale, or a shallow copy with the new list (never mutates its input).
 */
export function pruneReports(state: GameState): GameState {
  const kept = state.reports.filter((r) => stillOpen(state, r));
  return kept.length === state.reports.length ? state : { ...state, reports: kept };
}

/** Drops the reports on a problem that is starting again (fire.ts, breakage.ts). Mutates a state the caller already cloned. */
export function forgetReports(state: GameState, problem: { room: RoomId } | { equipment: string }): void {
  state.reports = state.reports.filter((r) => ("room" in problem ? !(r.kind === "fire" && r.room === problem.room) : !(r.kind === "equipment" && r.equipment === problem.equipment)));
}

/** The alert bar for a living player; the same for every living player. The dead get none (rules.ts `viewFor`). */
export function alertsFor(state: Readonly<GameState>): Alerts {
  const reporter = (by: string): CharacterId => findPlayer(state, by)!.character;
  const broken = brokenEquipment(state);
  const fireReports: AlertReport[] = firesDetected(state)
    ? state.fires.map((room) => ({ kind: "fire", room, by: "FIRE_SENSOR" }))
    : state.reports.flatMap((r): AlertReport[] => (r.kind === "fire" && state.fires.includes(r.room) ? [{ kind: "fire", room: r.room, by: reporter(r.by) }] : []));
  const equipmentReports: AlertReport[] = breakdownsDetected(state)
    ? broken.map(({ room, equipment }) => ({ kind: "equipment", room, equipment: equipment.type, by: "EQUIPMENT_SENSOR" }))
    : state.reports.flatMap((r): AlertReport[] => {
        if (r.kind !== "equipment") return [];
        const found = broken.find((b) => b.equipment.id === r.equipment);
        return found ? [{ kind: "equipment", room: found.room, equipment: found.equipment.type, by: reporter(r.by) }] : [];
      });
  return { fires: state.fires.length, broken: broken.length, reports: [...fireReports, ...equipmentReports] };
}
