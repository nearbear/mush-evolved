import { Action } from "./action.ts";
import { logPrivate } from "../log.ts";
import { contaminationCapacity } from "../modifiers.ts";
import type { GameState, PlayerState } from "../types.ts";

export type ShareActionData = { type: "dtt" | "stt"; target: string };

export class ShareAction<T extends "dtt" | "stt" = "dtt" | "stt"> extends Action<{ type: T; target: string }> {
  constructor(type: T) {
    super(type);
    this.baseAPCost = 1;
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): { type: T; target: string }[] {
    return state.players.filter((other) => other.id !== player.id && other.alive && other.room === player.room).map((other) => ({ type: this.type as T, target: other.id }));
  }

  override check(state: Readonly<GameState>, player: Readonly<PlayerState>, target: { type: T; target: string }): string | null {
    if (!state.players.some((other) => other.id !== player.id && other.alive && other.room === player.room && other.id === target.target)) return "cant_see";
    if (!state.bonds[player.id]?.includes(target.target) || !state.bonds[target.target]?.includes(player.id)) return "not_bonded";
    const { day } = dayOf(state);
    if (state.sharedOnDay[player.id] === day || state.sharedOnDay[target.target] === day) return "cooldown";
    return this.canAfford(state, player, target);
  }



  override apply(state: GameState, player: PlayerState, target: { type: T; target: string }): void {
    const other = state.players.find((o) => o.id === target.target)!;
    const { day } = dayOf(state);
    for (const who of [player, other]) {
      who.morale = Math.min(state.config.maxMorale, who.morale + state.config.shareMorale);
      state.sharedOnDay[who.id] = day;
    }
    const human = player.role === "human" ? player : other;
    if (this.type === "dtt" && player.role !== other.role) {
      state.contamination[human.id] = Math.min(contaminationCapacity(state, human), (state.contamination[human.id] ?? 0) + 1);
    }
    const label = this.type.toUpperCase();
    logPrivate(state, player.id, "shareDid", { label, name: other.name });
    logPrivate(state, other.id, "shareDidToYou", { label, name: player.name });
  }
}

function dayOf(state: Pick<GameState, "cycle" | "config">): { day: number; cycleOfDay: number } {
  const n = state.config.cyclesPerDay;
  return { day: Math.floor((state.cycle - 1) / n) + 1, cycleOfDay: ((state.cycle - 1) % n) + 1 };
}
