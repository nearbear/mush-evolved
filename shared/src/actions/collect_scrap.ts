import { Action, NO_DEBRIS, PASIPHAE_INTACT, type ActionVisibility, isString } from "./action.ts";
import { damage } from "../death.ts";
import { destroyPatrolShip } from "../hunters.ts";
import { logPrivate } from "../log.ts";
import { canScavenge, commandId, onPlanet, shipAboard } from "../patrol.ts";
import { roll, rollFloat, rollShuffle, rollWeighted } from "../rng.ts";
import type { GameState, PlayerState } from "../types.ts";

export type CollectScrapActionData = { type: "collect_scrap"; equipment: string };

/**
 * Collect debris floating around the Daedalus from a patrol ship or the Pasiphae in flight, at its command (owner,
 * 2026-10-28, docs/plans/patrol.md phase 5): 2 AP. Offered whenever the ship is in flight, but refused (shown disabled) while
 * there is no debris, and from a patrol ship while the Pasiphae hasn't been destroyed (owner, 2026-11-11). A patrol ship brings in 0 pieces
 * (75%) or 1, the Pasiphae 1, 2 or 3, picked at random and put in the ship's room; the landing unloads them. While
 * hunters remain, each try costs the ship 2 to 4 armor (at 0 it is destroyed) and the pilot 0 hp (50%) or 2 to 4.
 * Everything is private to the pilot (owner, 2026-10-28).
 */
export class CollectScrapAction extends Action<CollectScrapActionData> {
  override visibility: ActionVisibility = "private";

  constructor() {
    super("collect_scrap", { equipment: isString });
  }

  override getCost(state: Readonly<GameState>): { ap: number; mp: number } {
    return { ap: state.config.patrol.collect.cost.ap, mp: 0 };
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): CollectScrapActionData[] {
    const ship = shipAboard(player);
    return ship && !onPlanet(state, ship) ? [{ type: "collect_scrap", equipment: commandId(ship) }] : [];
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: CollectScrapActionData): string | null {
    const ship = shipAboard(player);
    if (!ship || commandId(ship) !== target.equipment) return "not_flying";
    if (onPlanet(state, ship)) return "on_planet";
    if (!canScavenge(state, ship)) return PASIPHAE_INTACT;
    return state.space.length > 0 ? null : NO_DEBRIS;
  }

  override apply(state: GameState, player: PlayerState): void {
    const ship = shipAboard(player)!; // checked, so it exists
    const { pieces, armor, hp } = state.config.patrol.collect;
    const count = Math.min(state.space.length, rollWeighted(state, pieces[ship.kind]));
    const picked = new Set(rollShuffle(state, state.space).slice(0, count));
    for (const debris of picked) state.items.push({ ...debris, at: { kind: "room", id: ship.id } });
    state.space = state.space.filter((debris) => !picked.has(debris));
    if (count > 0) logPrivate(state, player.id, "scrapCollected", { count });
    else logPrivate(state, player.id, "scrapNotFound");
    if (state.hunters.list.length === 0) return;
    const armorLoss = roll(state, armor);
    const hpLoss = rollFloat(state) < hp.noneChance ? 0 : roll(state, hp.range);
    const shipState = state.patrolShips[ship.id]!;
    shipState.armor = Math.max(0, shipState.armor - armorLoss);
    logPrivate(state, player.id, "scrapUnderFire", { armor: armorLoss, hp: hpLoss });
    if (shipState.armor === 0) destroyPatrolShip(state, ship, "patrolDestroyed");
    else damage(state, player, hpLoss);
  }
}
