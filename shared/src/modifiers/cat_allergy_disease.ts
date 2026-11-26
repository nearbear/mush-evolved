import { gainMorale } from "../adjustStats.ts";
import { addDisease, diseaseAffects, sneeze } from "../diseases.ts";
import { CAT_ITEM } from "../itemIds.ts";
import type { Modifier } from "../modifiers.ts";
import type { GameState, PlayerState, RoomId } from "../types.ts";

export const CAT_ALLERGY = "cat_allergy_disease";
/** Morale lost each time the carrier and Schrödinger meet. */
const MORALE_LOSS = 1;
/** How much likelier an injury is with Schrödinger in the room. */
const INJURY_FACTOR = 3;
/** What holding him gives a carrier. */
const ON_HOLD = "quincks_oedema_disease";

// Cat Allergy (owner, 2026-11-21): lasts 12-20 cycles (config.ts). Each time a carrier and Schrödinger end up in the
// same room (the carrier walks in, the cat walks in on his turn, or someone carrying him walks in) the carrier sneezes
// (special logs) and loses 1 morale. With him in the room, carried or not, every action's injury chance is tripled
// (capped at 1). Picking him up gives Quincke's Oedema (`addDisease`, so a Hygienist may resist). A Mush carries it with
// none of this: the injury fold never reaches a Mush's diseases, and the hooks below check `diseaseAffects`.

/** Whether Schrödinger is in `room`, on its floor or carried by someone there. */
function catIn(state: Readonly<GameState>, room: RoomId): boolean {
  return state.items.some((i) => {
    if (i.type !== CAT_ITEM) return false;
    if (i.at.kind === "room") return i.at.id === room;
    const id = i.at.id;
    return state.players.some((p) => p.id === id && p.room === room);
  });
}

/** A carrier meets the cat: a sneeze (special logs) and, for a human, 1 morale. */
function react(state: GameState, player: PlayerState): void {
  sneeze(state, player);
  if (diseaseAffects(player)) gainMorale(state, player, -MORALE_LOSS);
}

/** Schrödinger just came into `room` (his own move, or carried by `except`): every living carrier there but `except` reacts. */
export function catCameIn(state: GameState, room: RoomId, except?: string): void {
  for (const p of state.players) {
    if (p.alive && p.room === room && p.id !== except && p.modifiers.includes(CAT_ALLERGY)) react(state, p);
  }
}

/** `player` just walked into their room: if they carry Schrödinger, the carriers already there react. */
export function catCarriedIn(state: GameState, player: PlayerState): void {
  const carrying = state.items.some((i) => i.type === CAT_ITEM && i.at.kind === "player" && i.at.id === player.id);
  if (carrying) catCameIn(state, player.room, player.id);
}

/** `player` just picked Schrödinger up: a human carrier catches Quincke's Oedema. */
export function heldCat(state: GameState, player: PlayerState): void {
  if (player.alive && diseaseAffects(player) && player.modifiers.includes(CAT_ALLERGY)) addDisease(state, player, ON_HOLD);
}

export const cat_allergy_disease: Modifier = {
  onEnterRoom(next, player) {
    if (catIn(next, player.room)) react(next, player);
  },
  actionInjuryRate: (chance, { state, actor }) => (catIn(state, actor.room) ? Math.min(1, chance * INJURY_FACTOR) : chance),
};
