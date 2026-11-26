import { Action, COOLDOWN, IN_PRESELECTION, peopleHere, type ActionTag, type ActionVisibility, isString } from "./action.ts";
import { logCovert } from "../log.ts";
import { contaminate } from "../infection.ts";
import { hasSkill } from "../skills.ts";
import type { GameState, PlayerState } from "../types.ts";

export type SpikeActionData = { type: "spike"; target: string };

/**
 * Spiking (confirmed 2026-10-15): a Mush spends 1 AP and 1 spore to raise a
 * living human in their room by 1 contamination (reaching capacity converts
 * them, see `infection.ts`). Always succeeds. Covert (decided 2026-10-17): only a
 * camera in the room reveals it, to everyone including the victim; bystanders and the
 * victim are not told otherwise. Contamination stays hidden from everyone. Aggressive (owner, 2026-10-18). Each Mush then waits `spike.cooldownCycles` (4) cycles before spiking again (owner, 2026-11-03).
 * An Infector (Mush skill) holds `spike.infectorCharges` (2) charges instead of 1: the first spike starts the cooldown,
 * the other charges can be spent during it, and all come back together when it ends (owner, 2026-11-25).
 */
export class SpikeAction extends Action<SpikeActionData> {
  override visibility: ActionVisibility = "covert";
  override tags: readonly ActionTag[] = ["spore", "aggressive", "mush"];

  constructor() {
    super("spike", { target: isString });
  }

  override getCost(state: Readonly<GameState>): { ap: number; mp: number } {
    return { ap: state.config.spike.cost.ap, mp: 0 };
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): SpikeActionData[] {
    return player.role === "mush" ? peopleHere(state, player).filter((o) => o.role === "human").map((o) => ({ type: "spike", target: o.id })) : [];
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: SpikeActionData): string | null {
    if (state.preselection) return IN_PRESELECTION;
    if (player.role !== "mush") return "not_mush";
    const victim = peopleHere(state, player).find((o) => o.id === target.target);
    if (!victim) return "cant_see";
    if (victim.role !== "human") return "not_human";
    if (player.spores < 1) return "no_spores";
    if (this.cooldownLeft(state, player, target) > 0) return COOLDOWN;
    return null;
  }

  override cooldownLeft(state: Readonly<GameState>, player: Readonly<PlayerState>, _target: SpikeActionData): number {
    if (player.cheats.includes("infiniteSpores")) return 0; // the cheat also skips the cooldown
    const left = cooldownRunning(state, player);
    return left > 0 && spikesThisCooldown(state, player) >= spikeCharges(player, state) ? left : 0;
  }

  override apply(state: GameState, player: PlayerState, target: SpikeActionData): void {
    const victim = state.players.find((o) => o.id === target.target)!; // checked, so it exists
    player.spores -= 1;
    if (cooldownRunning(state, player) > 0) state.spikeCount[player.id] = spikesThisCooldown(state, player) + 1;
    else [state.spikedOn[player.id], state.spikeCount[player.id]] = [state.cycle, 1];
    logCovert(state, player.id, "spiked", { name: player.character, target: victim.character });
    contaminate(state, victim);
  }
}

/** How many spikes the player can make per cooldown: 1, or `spike.infectorCharges` with Infector. */
export function spikeCharges(player: Readonly<PlayerState>, state: Readonly<GameState>): number {
  return hasSkill(player, "infectious_agent") ? state.config.spike.infectorCharges : 1;
}

/** Cycles left on the cooldown the player's first spike started, or 0 when none is running. */
function cooldownRunning(state: Readonly<GameState>, player: Readonly<PlayerState>): number {
  const started = state.spikedOn[player.id];
  return started === undefined ? 0 : Math.max(0, state.config.spike.cooldownCycles - (state.cycle - started));
}

/** Spikes made during the running cooldown (a game stored before Infector counts its one spike). */
const spikesThisCooldown = (state: Readonly<GameState>, player: Readonly<PlayerState>): number => (cooldownRunning(state, player) > 0 ? (state.spikeCount[player.id] ?? 1) : 0);
