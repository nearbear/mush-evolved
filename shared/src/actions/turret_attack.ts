import { Action, IN_PRESELECTION, type ActionCost, type ActionTag, type ActionVisibility, isString } from "./action.ts";
import { damageHunter, turretCharges, turretsHere } from "../hunters.ts";
import { roll } from "../rng.ts";
import { logPrivate, logPublic } from "../log.ts";
import { turretDamage } from "../modifiers.ts";
import type { GameState, PlayerState } from "../types.ts";

export type TurretAttackActionData = { type: "turret_attack"; equipment: string; hunter: string };

/**
 * Shoot a hunter from a turret (owner, 2026-10-24, the wiki's Tourelle): 1 AP and one of the turret's charges, hit or
 * miss. 30% to hit, and each missed shot in a row multiplies the shooter's next chance by 1.25 until a hit resets it
 * (like the astro scan). A hit does 2 to 4 damage; at 0 hp the hunter is destroyed. The shooter picks the hunter.
 * Anyone alive, Mush and dirty players included. A hit or miss is private; a kill is public in the turret room.
 */
export class TurretAttackAction extends Action<TurretAttackActionData> {
  override terminal = true;

  override visibility: ActionVisibility = "private";
  override tags: readonly ActionTag[] = ["shoot"];

  constructor() {
    super("turret_attack", { equipment: isString, hunter: isString });
  }

  /** A Shoot point (`resources.shoot`, from the gunman skill) makes a shot free, hit or miss (owner, 2026-10-25). */
  override getCost(state: Readonly<GameState>, player: Readonly<PlayerState>): ActionCost {
    return player.resources.shoot > 0 ? { ap: 0, mp: 0, paidBy: "shoot" } : { ap: state.config.turrets.cost.ap, mp: 0 };
  }

  override getSuccessChance(state: Readonly<GameState>): number {
    return state.config.turrets.chance;
  }

  override getFailureMultiplier(state: Readonly<GameState>): number {
    return state.config.turrets.failureMultiplier;
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): TurretAttackActionData[] {
    return turretsHere(state, player).flatMap((turret) =>
      state.hunters.list.map((hunter): TurretAttackActionData => ({ type: "turret_attack", equipment: turret.id, hunter: hunter.id })),
    );
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: TurretAttackActionData): string | null {
    if (state.preselection) return IN_PRESELECTION;
    if (!turretsHere(state, player).some((turret) => turret.id === target.equipment)) return "cant_shoot";
    if (!state.hunters.list.some((hunter) => hunter.id === target.hunter)) return "no_such_hunter";
    if (turretCharges(state, target.equipment) === 0) return "no_charges";
    return null;
  }

  override apply(state: GameState, player: PlayerState, target: TurretAttackActionData): void {
    spendCharge(state, target.equipment);
    const amount = turretDamage(state, player, roll(state, state.config.turrets.damage));
    if (damageHunter(state, target.hunter, amount)) logPublic(state, player.room, "hunterDestroyed", { name: player.character });
    else logPrivate(state, player.id, "turretHit", { damage: amount });
  }

  override fail(state: GameState, player: PlayerState, target: TurretAttackActionData): void {
    spendCharge(state, target.equipment);
    logPrivate(state, player.id, "turretMiss");
  }
}

function spendCharge(state: GameState, turret: string): void {
  state.turrets[turret] = turretCharges(state, turret) - 1;
}
