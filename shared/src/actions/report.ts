import { Action, isString } from "./action.ts";
import { pushChat } from "../chat.ts";
import { doorOtherRoom, doorsOf } from "../doors.ts";
import { isOnFire } from "../fire.ts";
import { breakdownReported, breakdownsDetected, doorReported, doorsDetected, fireReported, firesDetected } from "../reports.ts";
import type { DoorId, GameState, PlayerState } from "../types.ts";

export type ReportFireActionData = { type: "report_fire" };
export type ReportEquipmentActionData = { type: "report_equipment"; equipment: string };
export type ReportDoorActionData = { type: "report_door"; door: DoorId };

// Reports (owner, 2026-11-14, #444; reports.ts): free (`config.report.cost`), instantaneous, always succeed, Mush
// included. Only a real, unreported problem in your own room can be reported, and not once a detector covers its kind.
// NERON posts the reporter and the room (and the equipment) in global chat.

/** Report the fire in your room. */
export class ReportFireAction extends Action<ReportFireActionData> {
  override timed = false;

  constructor() {
    super("report_fire");
  }

  override getCost(state: Readonly<GameState>): { ap: number; mp: number } {
    return { ap: state.config.report.cost.ap, mp: 0 };
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): ReportFireActionData[] {
    return this.validate(state, player) === null ? [{ type: "report_fire" }] : [];
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>): string | null {
    if (!isOnFire(state, player.room)) return "no_fire";
    if (firesDetected(state) || fireReported(state, player.room)) return "already_reported";
    return null;
  }

  override apply(state: GameState, player: PlayerState): void {
    state.reports.push({ kind: "fire", room: player.room, by: player.id });
    pushChat(state, "global", { from: null, isBot: false, text: "", system: { key: "fireReported", params: { name: player.character, room: player.room } } });
  }
}

/** Report a broken piece of equipment in your room. Items can't be reported. */
export class ReportEquipmentAction extends Action<ReportEquipmentActionData> {
  override timed = false;
  // It names broken equipment, which only `onBroken` actions may.
  override onBroken = true;

  constructor() {
    super("report_equipment", { equipment: isString });
  }

  override getCost(state: Readonly<GameState>): { ap: number; mp: number } {
    return { ap: state.config.report.cost.ap, mp: 0 };
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): ReportEquipmentActionData[] {
    if (breakdownsDetected(state)) return [];
    return (state.equipment[player.room] ?? [])
      .filter((e) => e.broken && !breakdownReported(state, e.id))
      .map((e): ReportEquipmentActionData => ({ type: "report_equipment", equipment: e.id }));
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: ReportEquipmentActionData): string | null {
    const equipment = state.equipment[player.room]?.find((e) => e.id === target.equipment);
    if (!equipment?.broken) return "not_broken";
    if (breakdownReported(state, equipment.id)) return "already_reported";
    return null;
  }

  override apply(state: GameState, player: PlayerState, target: ReportEquipmentActionData): void {
    const equipment = state.equipment[player.room]!.find((e) => e.id === target.equipment)!; // checked, so it exists
    state.reports.push({ kind: "equipment", equipment: equipment.id, by: player.id });
    pushChat(state, "global", {
      from: null,
      isBot: false,
      text: "",
      system: { key: "equipmentReported", params: { name: player.character, room: player.room, equipment: equipment.type } },
    });
  }
}

/** Report a broken door of your room. */
export class ReportDoorAction extends Action<ReportDoorActionData> {
  override timed = false;

  constructor() {
    super("report_door", { door: isString });
  }

  override getCost(state: Readonly<GameState>): { ap: number; mp: number } {
    return { ap: state.config.report.cost.ap, mp: 0 };
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): ReportDoorActionData[] {
    if (doorsDetected(state)) return [];
    return doorsOf(state, player.room)
      .filter((d) => d.broken && !doorReported(state, d.id))
      .map((d): ReportDoorActionData => ({ type: "report_door", door: d.id }));
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: ReportDoorActionData): string | null {
    const door = doorsOf(state, player.room).find((d) => d.id === target.door);
    if (!door?.broken) return "not_broken";
    if (doorReported(state, door.id)) return "already_reported";
    return null;
  }

  override apply(state: GameState, player: PlayerState, target: ReportDoorActionData): void {
    state.reports.push({ kind: "door", door: target.door, by: player.id });
    const other = doorOtherRoom(target.door, player.room)!;
    pushChat(state, "global", {
      from: null,
      isBot: false,
      text: "",
      system: { key: "doorReported", params: { name: player.character, room: player.room, other } },
    });
  }
}
