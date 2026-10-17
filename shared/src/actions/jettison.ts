import { Action } from "./action.ts";
import { CORPSE_ITEM } from "../items.ts";
import { logCovert } from "../log.ts";
import type { GameState, ItemState, PlayerState } from "../types.ts";

export type JettisonActionData = { type: "jettison"; item: string };

/**
 * Jettison (decided 2026-10-16, #28): destroys a corpse you carry, in a `jettison.rooms` room (the four bays).
 * 0 AP by default. Covert (decided 2026-10-17): room history only if a camera is in the room.
 */
export class JettisonAction extends Action<JettisonActionData> {
  constructor() {
    super("jettison");
  }

  override getCost(state: Readonly<GameState>): { ap: number; mp: number } {
    return { ap: state.config.jettison.cost.ap, mp: 0 };
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): JettisonActionData[] {
    if (!state.config.jettison.rooms.includes(player.room)) return [];
    return carriedCorpses(state, player).map((item) => ({ type: "jettison", item: item.id }));
  }

  override check(state: Readonly<GameState>, player: Readonly<PlayerState>, target: JettisonActionData): string | null {
    if (!state.config.jettison.rooms.includes(player.room)) return "cant_jettison";
    if (!carriedCorpses(state, player).some((i) => i.id === target.item)) return "cant_jettison";
    return this.canAfford(state, player, target);
  }

  override apply(state: GameState, player: PlayerState, target: JettisonActionData): void {
    const index = state.items.findIndex((i) => i.id === target.item);
    const [corpse] = state.items.splice(index, 1) as [ItemState];
    const body = state.players.find((p) => p.id === corpse.of)?.name ?? "";
    logCovert(state, player.id, "jettisoned", { name: player.name, body });
  }
}

function carriedCorpses(state: Readonly<GameState>, player: Readonly<PlayerState>): ItemState[] {
  return state.items.filter((i) => i.type === CORPSE_ITEM && i.at.kind === "player" && i.at.id === player.id);
}
