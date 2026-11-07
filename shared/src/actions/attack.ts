import { Action, IN_PRESELECTION, peopleHere, type ActionTag, isString } from "./action.ts";
import { damage } from "../death.ts";
import { itemsIn, removeItem, isWorking } from "../items.ts";
import { logPublic } from "../log.ts";
import { roll } from "../rng.ts";
import type { DeepReadonly, WeaponStats } from "../types/config.ts";
import type { GameState, ItemState, PlayerState } from "../types.ts";

/** A weapon aimed at one person, or an area weapon (`WeaponStats.area`), which has no target. */
export type AttackActionData = { type: "attack"; weapon: string; target: string } | { type: "attack"; weapon: string };

/**
 * Using a weapon (owner, 2026-10-22, from the English wiki). `weapons.cost.ap` (1), with a weapon you carry that has
 * a charge left if it uses charges. One roll against its accuracy; a hit removes HP rolled in its `damage` range
 * (`mushDamage` on a Mush). An area weapon hits every other living person in the room with a roll each, and the
 * attacker with a `selfDamage` roll. Hit or miss, it spends a charge, and a `consumed` weapon (the grenade) is used up.
 * Hits and misses are public room history.
 */
export class AttackAction extends Action<AttackActionData> {
  override tags: readonly ActionTag[] = ["aggressive"];

  /** A melee weapon (the knife) makes it a blow in person; a gun does not. */
  override tagsFor(state: Readonly<GameState>, action: AttackActionData): readonly ActionTag[] {
    return statsOf(state, action)?.melee ? [...this.tags, "melee"] : this.tags;
  }

  constructor() {
    super("attack", { weapon: isString });
  }

  /** `target` is optional: an area weapon has none. */
  override parse(raw: Readonly<Record<string, unknown>>): AttackActionData | null {
    const action = super.parse(raw);
    if (!action || raw.target === undefined) return action;
    return isString(raw.target) ? { ...action, target: raw.target } : null;
  }

  override getCost(state: Readonly<GameState>): { ap: number; mp: number } {
    return { ap: state.config.weapons.cost.ap, mp: 0 };
  }

  override getSuccessChance(state: Readonly<GameState>, player: Readonly<PlayerState>, target: AttackActionData): number {
    return statsOf(state, target)?.accuracy ?? 1;
  }

  override dirtChance(state: Readonly<GameState>, player: Readonly<PlayerState>, target: AttackActionData): number {
    return statsOf(state, target)?.dirtyChance ?? 0;
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): AttackActionData[] {
    return usableWeapons(state, player).flatMap((weapon): AttackActionData[] =>
      state.config.weapons.types[weapon.type]!.area
        ? [{ type: "attack", weapon: weapon.id }]
        : peopleHere(state, player).map((o) => ({ type: "attack", weapon: weapon.id, target: o.id })),
    );
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: AttackActionData): string | null {
    if (state.preselection) return IN_PRESELECTION;
    const weapon = usableWeapons(state, player).find((i) => i.id === target.weapon);
    if (!weapon) return "no_weapon";
    const area = !!state.config.weapons.types[weapon.type]!.area;
    if (area !== !("target" in target)) return "cant_attack";
    if ("target" in target && !peopleHere(state, player).some((o) => o.id === target.target)) return "cant_see";
    return null;
  }

  override apply(state: GameState, player: PlayerState, target: AttackActionData): void {
    const { type } = spend(state, target);
    const stats = state.config.weapons.types[type]!;
    if (stats.area) {
      logPublic(state, player.room, "attackedArea", { name: player.character, item: type });
      for (const victim of peopleHere(state, player)) damage(state, victim, roll(state, stats.damage));
      damage(state, player, roll(state, stats.area.selfDamage));
      return;
    }
    const victim = state.players.find((o) => o.id === (target as { target: string }).target)!; // checked, so it exists
    logPublic(state, player.room, "attacked", { name: player.character, target: victim.character, item: type });
    damage(state, victim, roll(state, victim.role === "mush" && stats.mushDamage ? stats.mushDamage : stats.damage));
  }

  override fail(state: GameState, player: PlayerState, target: AttackActionData): void {
    const { type } = spend(state, target);
    if ("target" in target) {
      const victim = state.players.find((o) => o.id === target.target)!;
      logPublic(state, player.room, "attackMissed", { name: player.character, target: victim.character, item: type });
    } else logPublic(state, player.room, "attackAreaMissed", { name: player.character, item: type });
  }
}

/** Carried weapons that can be used now: with a charge left, if they use charges. */
function usableWeapons(state: Readonly<GameState>, player: Readonly<PlayerState>): ItemState[] {
  return itemsIn(state, { kind: "player", id: player.id }).filter((i) => {
    const stats = state.config.weapons.types[i.type];
    return stats && isWorking(i) && (stats.charges === undefined || (i.charges ?? 0) > 0);
  });
}

function statsOf(state: Readonly<GameState>, target: AttackActionData): DeepReadonly<WeaponStats> | undefined {
  const weapon = state.items.find((i) => i.id === target.weapon);
  return weapon && state.config.weapons.types[weapon.type];
}

/** Spends a use of the weapon: a charge, or the whole weapon if it is used up. Returns it. */
function spend(state: GameState, target: AttackActionData): ItemState {
  const weapon = state.items.find((i) => i.id === target.weapon)!;
  const stats = state.config.weapons.types[weapon.type]!;
  if (stats.charges !== undefined) weapon.charges = weapon.charges! - 1;
  if (stats.consumed) removeItem(state, weapon.id);
  return weapon;
}

