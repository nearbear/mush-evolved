import { Action, IN_PRESELECTION, type ActionCost, type ActionVisibility, isString } from "./action.ts";
import { damageHunter } from "../hunters.ts";
import { logPrivate } from "../log.ts";
import { failureStreakMultiplier } from "../modifiers.ts";
import { commandId, shipAboard, type PatrolShip } from "../patrol.ts";
import { roll } from "../rng.ts";
import type { GameState, PlayerState } from "../types.ts";

export type PatrolAttackActionData = { type: "patrol_attack"; equipment: string; hunter: string };

/**
 * Shoot a hunter from a patrol ship in flight, at its command (owner, 2026-10-24 and 2026-10-28, docs/plans/patrol.md
 * phase 3): 1 AP and one of the ship's charges, hit or miss. 40% to hit, x1.25 for each miss in a row (its own streak,
 * not the turrets'), a Pilot x2 (modifiers/pilot.ts); 3 to 6 damage. The Pasiphae can't shoot. A Shoot point pays for
 * it and Persistent speeds up the streak, as at a turret; Gunner doesn't apply, so it has no `shoot` tag. Everything is
 * private to the shooter, the kill too (owner, 2026-10-28): the crew sees only the hunter count drop. Done from the
 * cockpit's hunter list (PatrolCockpit.tsx), so it is a terminal action and the inspect panel leaves it out.
 */
export class PatrolAttackAction extends Action<PatrolAttackActionData> {
  override terminal = true;

  override visibility: ActionVisibility = "private";

  constructor() {
    super("patrol_attack", { equipment: isString, hunter: isString });
  }

  override getCost(state: Readonly<GameState>, player: Readonly<PlayerState>): ActionCost {
    return player.resources.shoot > 0 ? { ap: 0, mp: 0, paidBy: "shoot" } : { ap: state.config.patrol.shot.cost.ap, mp: 0 };
  }

  override getSuccessChance(state: Readonly<GameState>, player: Readonly<PlayerState>): number {
    const { chance, failureMultiplier } = state.config.patrol.shot;
    return Math.min(1, chance * failureStreakMultiplier(state, player, failureMultiplier) ** (state.patrolFailures[player.id] ?? 0));
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): PatrolAttackActionData[] {
    const ship = armedShip(state, player);
    if (!ship) return [];
    return state.hunters.list.map((hunter): PatrolAttackActionData => ({ type: "patrol_attack", equipment: commandId(ship), hunter: hunter.id }));
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: PatrolAttackActionData): string | null {
    if (state.preselection) return IN_PRESELECTION;
    const ship = shipAboard(player);
    if (!ship || ship.kind === "pasiphae" || commandId(ship) !== target.equipment) return "cant_shoot";
    if (!state.hunters.list.some((hunter) => hunter.id === target.hunter)) return "no_such_hunter";
    if (state.patrolShips[ship.id]!.charges === 0) return "no_charges";
    return null;
  }

  override apply(state: GameState, player: PlayerState, target: PatrolAttackActionData): void {
    spendCharge(state, player);
    delete state.patrolFailures[player.id];
    const amount = roll(state, state.config.patrol.shot.damage);
    if (damageHunter(state, target.hunter, amount)) logPrivate(state, player.id, "patrolKill");
    else logPrivate(state, player.id, "turretHit", { damage: amount });
  }

  override fail(state: GameState, player: PlayerState): void {
    spendCharge(state, player);
    state.patrolFailures[player.id] = (state.patrolFailures[player.id] ?? 0) + 1;
    logPrivate(state, player.id, "turretMiss");
  }
}

/** The ship the player flies, if it can shoot and has a charge left. */
function armedShip(state: Readonly<GameState>, player: Readonly<PlayerState>): PatrolShip | undefined {
  const ship = shipAboard(player);
  return ship && ship.kind !== "pasiphae" && state.patrolShips[ship.id]!.charges > 0 ? ship : undefined;
}

function spendCharge(state: GameState, player: PlayerState): void {
  state.patrolShips[shipAboard(player)!.id]!.charges -= 1;
}
