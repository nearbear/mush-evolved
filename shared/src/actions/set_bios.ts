import { Action, AT_CAPACITY, type ActionVisibility, isBoolean, isString } from "./action.ts";
import {
  biosTerminalsHere,
  BIOS_OPTIONS,
  canChangeBios,
  CPU_PRIORITIES,
  CREW_LOCKS,
  isBiosOption,
  isCpuPriority,
  isCrewLock,
  type BiosOption,
  type CpuPriority,
  type CrewLock,
} from "../bios.ts";
import { logPrivate } from "../log.ts";
import type { GameState, PlayerState } from "../types.ts";

export type SetBiosActionData =
  | { type: "set_bios"; equipment: string; option: BiosOption; value: boolean }
  | { type: "set_bios"; equipment: string; option: "cpu_priority"; value: CpuPriority }
  | { type: "set_bios"; equipment: string; option: "crew_lock"; value: CrewLock };

/**
 * Change one of NERON's BIOS settings at the BIOS terminal (owner, 2026-10-21, 2026-11-21): free, NERON Admin only
 * (bios.ts), Mush included. Private: only the actor gets a log line; the settings themselves show to anyone at the
 * terminal (`cpu_priority` is also visible ship-wide to living players). Changing `cpu_priority` is limited to once per
 * player per day (`AT_CAPACITY`); `crew_lock` and the boolean switches have no daily limit.
 */
export class SetBiosAction extends Action<SetBiosActionData> {
  override terminal = true;

  override visibility: ActionVisibility = "private";

  // BIOS changes are left out of the action history, as in eMush (owner, 2026-10-24).
  override recorded = false;

  constructor() {
    super("set_bios", {
      equipment: isString,
      option: (v) => isBiosOption(v) || v === "cpu_priority" || v === "crew_lock",
      value: (v) => isBoolean(v) || isCpuPriority(v) || isCrewLock(v),
    });
  }

  override parse(raw: Readonly<Record<string, unknown>>): SetBiosActionData | null {
    if (!isString(raw.equipment)) return null;
    if (isBiosOption(raw.option) && isBoolean(raw.value)) {
      return { type: "set_bios", equipment: raw.equipment, option: raw.option, value: raw.value };
    }
    if (raw.option === "cpu_priority" && isCpuPriority(raw.value)) {
      return { type: "set_bios", equipment: raw.equipment, option: "cpu_priority", value: raw.value };
    }
    if (raw.option === "crew_lock" && isCrewLock(raw.value)) {
      return { type: "set_bios", equipment: raw.equipment, option: "crew_lock", value: raw.value };
    }
    return null;
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): SetBiosActionData[] {
    if (!canChangeBios(state, player)) return [];
    return biosTerminalsHere(state, player).flatMap((terminal): SetBiosActionData[] => [
      ...BIOS_OPTIONS.map((option): SetBiosActionData => ({ type: "set_bios", equipment: terminal.id, option, value: !state.bios[option] })),
      ...CPU_PRIORITIES.filter((value) => value !== state.bios.cpu_priority).map(
        (value): SetBiosActionData => ({ type: "set_bios", equipment: terminal.id, option: "cpu_priority", value }),
      ),
      ...CREW_LOCKS.filter((value) => value !== state.bios.crew_lock).map(
        (value): SetBiosActionData => ({ type: "set_bios", equipment: terminal.id, option: "crew_lock", value }),
      ),
    ]);
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: SetBiosActionData): string | null {
    if (!biosTerminalsHere(state, player).some((terminal) => terminal.id === target.equipment)) return "cant_use_bios";
    if (!canChangeBios(state, player)) return "not_neron_admin";
    if (state.bios[target.option] === target.value) return "bios_unchanged";
    if (target.option === "cpu_priority" && player.cpuPriorityChangedToday) return AT_CAPACITY;
    return null;
  }

  override apply(state: GameState, player: PlayerState, target: SetBiosActionData): void {
    if (target.option === "cpu_priority") {
      state.bios.cpu_priority = target.value;
      player.cpuPriorityChangedToday = true;
      logPrivate(state, player.id, CPU_PRIORITY_LOG_KEYS[target.value]);
      return;
    }
    if (target.option === "crew_lock") {
      state.bios.crew_lock = target.value;
      logPrivate(state, player.id, CREW_LOCK_LOG_KEYS[target.value]);
      return;
    }
    state.bios[target.option] = target.value;
    logPrivate(state, player.id, LOG_KEYS[target.option][target.value ? "on" : "off"]);
  }
}

/** One whole sentence per option and value (i18n rule 2), rather than a translated option name in a shared line. */
const LOG_KEYS: Record<BiosOption, { on: string; off: string }> = {
  actopi: { on: "biosActopiOn", off: "biosActopiOff" },
  death_announcements: { on: "biosDeathsOn", off: "biosDeathsOff" },
  plasma_shield: { on: "biosShieldOn", off: "biosShieldOff" },
};

const CPU_PRIORITY_LOG_KEYS: Record<CpuPriority, string> = {
  none: "biosCpuNone",
  astronavigation: "biosCpuAstronavigation",
  projects: "biosCpuProjects",
  research: "biosCpuResearch",
};

const CREW_LOCK_LOG_KEYS: Record<CrewLock, string> = {
  piloting: "biosLockPiloting",
  projects: "biosLockProjects",
  research: "biosLockResearch",
};
