import { Action, IN_PRESELECTION, peopleHere, type ActionTag, isString } from "./action.ts";
import { changeAP } from "../adjustStats.ts";
import { breakItem } from "../breakage.ts";
import { damage } from "../death.ts";
import { damageHostile, hostileAttacked, hostileHere, hostilesHere } from "../hostiles.ts";
import { addDisease } from "../diseases.ts";
import { ITEM_TYPES, afterProtection, dropWeapon, itemsIn, removeItem, removeItemIfPresent, isWorking } from "../items.ts";
import { logPublic } from "../log.ts";
import { weaponOutcomeWeight } from "../modifiers.ts";
import { roll, rollFloat, rollInt, rollShuffle, rollWeighted } from "../rng.ts";
import type { DeepReadonly, WeaponOutcomeEffects, WeaponStats } from "../types/config.ts";
import type { GameState, ItemState, PlayerState } from "../types.ts";

/** A weapon aimed at one person, or an area weapon (`WeaponStats.area`, the grenade), which has no target. */
export type AttackActionData = { type: "attack"; weapon: string; target: string } | { type: "attack"; weapon: string };

/**
 * Using a weapon (owner, 2026-10-22, from the English wiki). `weapons.cost.ap` (1), with a weapon you carry that has
 * a charge left if it uses charges. One roll against its accuracy; a hit removes HP rolled in its `damage` range
 * (`mushDamage` on a Mush). An area weapon (the grenade) has no target and hits every other living person in the room
 * with a roll each. A weapon with `selfDamage` (rocket launcher, grenade) also hurts the attacker on a hit. The rolled
 * outcome's effects go to whom they name: the target only (an instant kill, "2 random wounds"), the splash (every other
 * living person in the room, owner 2026-11-17), or the attacker. Hit or miss, it spends a charge, and a `consumed` weapon
 * is used up. Hits and misses are public room history.
 *
 * A hostile NPC in the room (hostiles.ts) can be aimed at too, and an area weapon hits the hostiles in the room as well.
 * A hostile takes the weapon's `damage` range (never `mushDamage`), has no armor, and dies to an instant kill; the
 * outcome's other effects on the target (injuries, AP loss) don't apply to it, while those on the attacker and the
 * splash do. Its hits and misses log with the hostile's kind instead of the outcome's own line. Hit or miss, once the
 * attack and all its effects are done, it may answer (`hostileAttacked`: the intruder punches back at a melee weapon).
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
        : [...peopleHere(state, player), ...hostilesHere(state, player)].map((o) => ({ type: "attack", weapon: weapon.id, target: o.id })),
    );
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: AttackActionData): string | null {
    if (state.preselection) return IN_PRESELECTION;
    const weapon = usableWeapons(state, player).find((i) => i.id === target.weapon);
    if (!weapon) return "no_weapon";
    const area = !!state.config.weapons.types[weapon.type]!.area;
    if (area !== !("target" in target)) return "cant_attack";
    if ("target" in target && !peopleHere(state, player).some((o) => o.id === target.target) && !hostileHere(state, player, target.target)) return "cant_see";
    return null;
  }

  override apply(state: GameState, player: PlayerState, target: AttackActionData): void {
    const weapon = spend(state, target);
    const { type } = weapon;
    const stats = state.config.weapons.types[type]!;
    const weights = stats.hitOutcomes.map((o) =>
      weaponOutcomeWeight(o.weight, { state, player, weapon: stats, kind: "hit", critical: !!o.critical, fumble: false }),
    );
    const outcome = stats.hitOutcomes[rollWeighted(state, weights)]!;
    const effects = outcome.effects;
    const armored = armoredHit(!!outcome.critical);

    const splash = peopleHere(state, player);
    let victim: PlayerState | undefined;
    const hostile = "target" in target ? hostileHere(state, player, target.target) : undefined;
    if (stats.area) {
      logPublic(state, player.room, outcome.log, { name: player.character, item: type });
      const range = adjustedDamageRange(stats.damage, effects);
      const hostiles = hostilesHere(state, player);
      for (const v of splash) damage(state, v, armored(state, v, roll(state, range)), "assassinated", player);
      for (const h of hostiles) damageHostile(state, h, roll(state, range));
    } else if (hostile) {
      logPublic(state, player.room, "attackedHostile", { name: player.character, hostile: hostile.kind, item: type });
      damageHostile(state, hostile, effects?.instantKill === "target" ? hostile.hp : roll(state, adjustedDamageRange(stats.damage, effects)));
    } else {
      victim = state.players.find((o) => o.id === (target as { target: string }).target)!; // checked, so it exists
      const params = { name: player.character, target: victim.character, item: type };
      if (effects?.instantKill === "target") {
        logPublic(state, player.room, outcome.log, params);
        damage(state, victim, victim.hp, "assassinated", player);
      } else {
        const baseRange = victim.role === "mush" && stats.mushDamage ? stats.mushDamage : stats.damage;
        const hit = roll(state, adjustedDamageRange(baseRange, effects));
        const dealt = armored(state, victim, hit);
        logPublic(state, player.room, hit > 0 && dealt === 0 ? "attackArmor" : outcome.log, params);
        damage(state, victim, dealt, "assassinated", player);
      }
    }
    if (stats.selfDamage) damage(state, player, roll(state, stats.selfDamage), "assassinated");
    applyOutcomeEffects(state, player, weapon, { target: victim, splash }, effects);
    if (hostile && player.alive) hostileAttacked(state, hostile.id, player, !!stats.melee);
  }

  override fail(state: GameState, player: PlayerState, target: AttackActionData): void {
    const weapon = spend(state, target);
    const { type } = weapon;
    const stats = state.config.weapons.types[type]!;
    const weights = stats.missOutcomes.map((o) =>
      weaponOutcomeWeight(o.weight, { state, player, weapon: stats, kind: "miss", critical: false, fumble: !!o.fumble }),
    );
    const outcome = stats.missOutcomes[rollWeighted(state, weights)]!;

    const splash = peopleHere(state, player);
    const hostile = "target" in target ? hostileHere(state, player, target.target) : undefined;
    const victim = "target" in target && !hostile ? state.players.find((o) => o.id === target.target)! : undefined;
    if (hostile) {
      logPublic(state, player.room, "attackMissedHostile", { name: player.character, hostile: hostile.kind, item: type });
      if (outcome.effects?.instantKill === "target") damageHostile(state, hostile, hostile.hp);
    } else if (victim) {
      logPublic(state, player.room, outcome.log, { name: player.character, target: victim.character, item: type });
      if (outcome.effects?.instantKill === "target") damage(state, victim, victim.hp, "assassinated", player);
    } else {
      logPublic(state, player.room, outcome.log, { name: player.character, item: type });
    }
    applyOutcomeEffects(state, player, weapon, { target: victim, splash }, outcome.effects);
    if (hostile && player.alive) hostileAttacked(state, hostile.id, player, !!stats.melee);
  }
}

/** Carried weapons that can be used now: with a charge left, if they use charges. */
function usableWeapons(state: Readonly<GameState>, player: Readonly<PlayerState>): ItemState[] {
  return itemsIn(state, { kind: "player", id: player.id }).filter((i) => {
    if (i.owner !== undefined && i.owner !== player.id) return false;
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

/** A weapon hit's damage after the target's Plastenite Armor and Hard-boiled, which a critical hit goes through (owner, 2026-11-17, 2026-11-22). */
function armoredHit(critical: boolean) {
  return (state: Readonly<GameState>, target: Readonly<PlayerState>, amount: number): number =>
    critical ? amount : afterProtection(state, target, amount);
}

/** Shifts a `[min, max]` damage range by an outcome's `damageDelta` and `maxDamageDelta`, clamped at 0. */
function adjustedDamageRange(
  base: readonly [number, number],
  effects: DeepReadonly<WeaponOutcomeEffects> | undefined,
): [number, number] {
  const min = Math.max(0, base[0] + (effects?.damageDelta ?? 0));
  const max = Math.max(min, base[1] + (effects?.damageDelta ?? 0) + (effects?.maxDamageDelta ?? 0));
  return [min, max];
}

/** The pool a weapon's "random injury" draws from: its kind's (`WeaponStats.injuryPool`), else `combatInjuries`. */
export function weaponInjuryPool(state: Readonly<GameState>, weapon: Readonly<ItemState>): readonly string[] {
  const kind = state.config.weapons.types[weapon.type]?.injuryPool;
  const d = state.config.diseases;
  return kind ? d[`${kind}Injuries` as const] : d.combatInjuries;
}

/** Applies secondary combat outcome effects to the target, the splash or the attacker (backfire kill, splash damage, AP loss, injuries, weapon drop/break/destroy, room item breakage). */
function applyOutcomeEffects(
  state: GameState,
  attacker: PlayerState,
  weapon: ItemState,
  hit: { target?: PlayerState; splash: readonly PlayerState[] },
  effects: DeepReadonly<WeaponOutcomeEffects> | undefined,
): void {
  if (!effects) return;
  const targets = hit.target ? [hit.target] : [];
  const group = (who: "target" | "attacker" | "splash"): readonly PlayerState[] =>
    who === "attacker" ? [attacker] : who === "splash" ? hit.splash : targets;
  if (effects.instantKill === "attacker") damage(state, attacker, attacker.hp, "assassinated");
  if (effects.splashDamage && rollFloat(state) < (effects.splashDamage.chance ?? 1)) {
    for (const v of hit.splash) damage(state, v, effects.splashDamage.amount, "assassinated", attacker);
  }
  if (effects.apLoss) {
    for (const p of group(effects.apLoss.who)) changeAP(state, p, -effects.apLoss.amount);
  }
  if (effects.injuries) {
    const injuryPool = weaponInjuryPool(state, weapon);
    for (const inj of effects.injuries) {
      const count = inj.count ?? 1;
      for (const recipient of group(inj.who)) {
        if (!recipient.alive) continue;
        for (let i = 0; i < count; i++) {
          if (rollFloat(state) < inj.chance) {
            const id = inj.injury === "random" ? injuryPool[rollInt(state, injuryPool.length)]! : inj.injury;
            addDisease(state, recipient, id);
          }
        }
      }
    }
  }
  if (effects.weaponEffect === "drop") dropWeapon(state, attacker, weapon, { bypassCanDrop: true });
  else if (effects.weaponEffect === "break") breakItem(state, weapon);
  else if (effects.weaponEffect === "destroy") removeItemIfPresent(state, weapon.id);
  if (effects.breakRandomItems && effects.breakRandomItems > 0) {
    const breakable = itemsIn(state, { kind: "room", id: attacker.room }).filter((i) => !i.broken && ITEM_TYPES[i.type]?.canBreak);
    for (const item of rollShuffle(state, breakable).slice(0, effects.breakRandomItems)) breakItem(state, item);
  }
}


/**
 * The attacker swings a weapon they carry at a random other living player in the room, with the attack action's own
 * roll, damage, charge and public lines, and no AP cost (Space Rabies). Does nothing without a usable weapon or anyone
 * to hit. An area weapon (the grenade) has no target and hits the whole room.
 */
export function attackWithHeldWeapon(state: GameState, attacker: PlayerState): void {
  const weapons = usableWeapons(state, attacker);
  const others = peopleHere(state, attacker);
  if (weapons.length === 0 || others.length === 0) return;
  const weapon = weapons[rollInt(state, weapons.length)]!;
  const data: AttackActionData = state.config.weapons.types[weapon.type]!.area
    ? { type: "attack", weapon: weapon.id }
    : { type: "attack", weapon: weapon.id, target: others[rollInt(state, others.length)]!.id };
  const action = new AttackAction();
  if (rollFloat(state) < action.getSuccessChance(state, attacker, data)) action.apply(state, attacker, data);
  else action.fail(state, attacker, data);
}
