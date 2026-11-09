import { Action, type ActionCost, isString } from "./action.ts";
import { canReachItem, removeItem } from "../items.ts";
import { logPrivate, logPublic } from "../log.ts";
import { interfaceId, PATROL_SHIPS, type PatrolShip } from "../patrol.ts";
import type { GameState, ItemState, PlayerState } from "../types.ts";
import { HULL_REPAIR_ITEM } from "./repair_hull.ts";

export type RenovateActionData = { type: "renovate"; equipment: string };

/**
 * Renovate a damaged patrol ship or the Pasiphae while it is docked, from its interface in the bay (owner, 2026-10-28,
 * docs/plans/patrol.md phase 6; eMush's numbers): 2 AP, 12%, and one metal scrap, carried or in the bay, used up whether
 * or not it works. A success brings the ship back to full armor. Anyone alive may renovate. A success is public in the
 * bay, a failure private (owner). Engineer doubles the odds (modifiers/engineer.ts).
 */
export class RenovateAction extends Action<RenovateActionData> {
  constructor() {
    super("renovate", { equipment: isString });
  }

  /** An Engineer point (`resources.eng`) makes one use free (owner, 2026-11-09). */
  override getCost(state: Readonly<GameState>, player: Readonly<PlayerState>): ActionCost {
    return player.resources.eng > 0 ? { ap: 0, mp: 0, paidBy: "eng" } : { ap: state.config.patrol.renovate.cost.ap, mp: 0 };
  }

  override getSuccessChance(state: Readonly<GameState>): number {
    return state.config.patrol.renovate.chance;
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): RenovateActionData[] {
    if (!scrapFor(state, player)) return [];
    return damagedHere(state, player).map((ship): RenovateActionData => ({ type: "renovate", equipment: interfaceId(ship) }));
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: RenovateActionData): string | null {
    if (!damagedHere(state, player).some((ship) => interfaceId(ship) === target.equipment)) return "no_ship";
    if (!scrapFor(state, player)) return "no_scrap";
    return null;
  }

  override dirtChance(state: Readonly<GameState>): number {
    return state.config.patrol.renovate.dirtyChance;
  }

  override injuryChance(state: Readonly<GameState>): number {
    return state.config.patrol.renovate.injuryChance;
  }

  override apply(state: GameState, player: PlayerState, target: RenovateActionData): void {
    const ship = PATROL_SHIPS.find((s) => interfaceId(s) === target.equipment)!; // checked, so it exists
    removeItem(state, scrapFor(state, player)!.id);
    state.patrolShips[ship.id]!.armor = state.config.patrol.armor[ship.kind];
    logPublic(state, player.room, "patrolRenovated", { name: player.character, room: ship.id });
  }

  override fail(state: GameState, player: PlayerState): void {
    removeItem(state, scrapFor(state, player)!.id);
    logPrivate(state, player.id, "patrolRenovateFailed");
  }
}

/** Docked ships below full armor whose interface is in the player's room. */
function damagedHere(state: Readonly<GameState>, player: Readonly<PlayerState>): PatrolShip[] {
  return PATROL_SHIPS.filter((s) => {
    const shipState = state.patrolShips[s.id]!;
    return s.bay === player.room && !shipState.out && !shipState.destroyed && shipState.armor < state.config.patrol.armor[s.kind];
  });
}

/** The metal scrap a renovation uses: a carried one first, else one lying in the room. */
function scrapFor(state: Readonly<GameState>, player: Readonly<PlayerState>): Readonly<ItemState> | undefined {
  const scraps = state.items.filter((item) => item.type === HULL_REPAIR_ITEM && canReachItem(state, player, item));
  return scraps.find((item) => item.at.kind === "player") ?? scraps[0];
}
