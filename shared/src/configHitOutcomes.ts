import type { WeaponHitOutcome, WeaponMissOutcome } from "./types.ts";

export interface WeaponOutcomes {
  hitOutcomes: WeaponHitOutcome[];
  missOutcomes: WeaponMissOutcome[];
}

export const BLASTER_OUTCOMES: WeaponOutcomes = {
  hitOutcomes: [
    { weight: 75, log: "BLASTER_SUCCESSFUL_SHOT" },
    { weight: 1, critical: true, log: "BLASTER_TARGET_HEADSHOT", effects: { instantKill: "target" } },
    { weight: 2, critical: true, log: "BLASTER_TARGET_RANDOM_INJURY", effects: { injuries: [{ who: "target", injury: "random", chance: 1 }] } },
    { weight: 2, critical: true, log: "BLASTER_SHOOTER_PLUS_2_MAX_DAMAGE_20_RANDOM_INJURY_TO_TARGET", effects: { maxDamageDelta: 2, injuries: [{ who: "target", injury: "random", chance: 0.2 }] } },
    { weight: 2, critical: true, log: "BLASTER_SHOOTER_PLUS_1_DAMAGE_TARGET_DAMAGED_EARS", effects: { damageDelta: 1, injuries: [{ who: "target", injury: "damaged_ears_injury", chance: 1 }] } },
    {
      weight: 1,
      critical: true,
      log: "BLASTER_SHOOTER_PLUS_2_DAMAGE_TARGET_30_TORN_TONGUE_TARGET_30_BURST_NOSE_TARGET_30_OPEN_AIR_BRAIN_TARGET_30_HEAD_TRAUMA",
      effects: {
        damageDelta: 2,
        injuries: [
          { who: "target", injury: "torn_tongue_injury", chance: 0.3 },
          { who: "target", injury: "burst_nose_injury", chance: 0.3 },
          { who: "target", injury: "open_air_brain_injury", chance: 0.3 },
          { who: "target", injury: "head_trauma_injury", chance: 0.3 },
        ],
      },
    },
    { weight: 1, critical: true, log: "BLASTER_SHOOTER_PLUS_1_DAMAGE_TARGET_REMOVE_2_AP", effects: { damageDelta: 1, apLoss: { who: "target", amount: 2 } } },
  ],
  missOutcomes: [
    { weight: 75, log: "BLASTER_FAILED_SHOT" },
    { weight: 2, fumble: true, log: "BLASTER_BREAK_WEAPON", effects: { weaponEffect: "break" } },
    { weight: 2, fumble: true, log: "BLASTER_SHOOTER_DROP_WEAPON", effects: { weaponEffect: "drop" } },
    {
      weight: 2,
      fumble: true,
      log: "BLASTER_SHOOTER_MINUS_1_AP_SHOOTER_DROP_WEAPON_SHOOTER_RANDOM_INJURY",
      effects: { apLoss: { who: "attacker", amount: 1 }, weaponEffect: "drop", injuries: [{ who: "attacker", injury: "random", chance: 1 }] },
    },
    { weight: 1, fumble: true, log: "BLASTER_SHOOTER_MINUS_1_AP_BREAK_WEAPON", effects: { apLoss: { who: "attacker", amount: 1 }, weaponEffect: "break" } },
    { weight: 1, fumble: true, log: "BLASTER_SHOOTER_MINUS_1_AP", effects: { apLoss: { who: "attacker", amount: 1 } } },
  ],
};

export const KNIFE_OUTCOMES: WeaponOutcomes = {
  hitOutcomes: [
    { weight: 75, log: "KNIFE_SUCCESSFUL_HIT_10_HAEMORRHAGE", effects: { injuries: [{ who: "target", injury: "haemorrhage_injury", chance: 0.1 }] } },
    { weight: 5, critical: true, log: "KNIFE_PLUS_2_DAMAGE_RANDOM_INJURY", effects: { damageDelta: 2, injuries: [{ who: "target", injury: "random", chance: 1 }] } },
    { weight: 5, critical: true, log: "KNIFE_PLUS_2_DAMAGE_50_CRITICAL_HAEMORRHAGE", effects: { damageDelta: 2, injuries: [{ who: "target", injury: "critical_haemorrhage_injury", chance: 0.5 }] } },
    {
      weight: 3,
      critical: true,
      log: "KNIFE_PLUS_2_DAMAGE_50_CRITICAL_HAEMORRHAGE_RANDOM_INJURY",
      effects: { damageDelta: 2, injuries: [{ who: "target", injury: "critical_haemorrhage_injury", chance: 0.5 }, { who: "target", injury: "random", chance: 1 }] },
    },
    {
      weight: 3,
      critical: true,
      log: "KNIFE_PLUS_2_DAMAGE_60_CRITICAL_HAEMORRHAGE_BUSTED_ARM_JOINT",
      effects: { damageDelta: 2, injuries: [{ who: "target", injury: "critical_haemorrhage_injury", chance: 0.6 }, { who: "target", injury: "busted_arm_joint_injury", chance: 1 }] },
    },
    { weight: 2, critical: true, log: "KNIFE_INSTAGIB_BLED", effects: { instantKill: "target" } },
    { weight: 1, critical: true, log: "KNIFE_PLUS_2_DAMAGE_PUNCTURED_LUNG", effects: { damageDelta: 2, injuries: [{ who: "target", injury: "punctured_lung_injury", chance: 1 }] } },
  ],
  missOutcomes: [
    { weight: 75, log: "KNIFE_FAILED_HIT" },
    { weight: 3, fumble: true, log: "KNIFE_BREAK_WEAPON", effects: { weaponEffect: "break" } },
    { weight: 3, fumble: true, log: "KNIFE_BREAK_WEAPON_SHOOTER_TORN_TONGUE", effects: { weaponEffect: "break", injuries: [{ who: "attacker", injury: "torn_tongue_injury", chance: 1 }] } },
    { weight: 2, fumble: true, log: "KNIFE_SHOOTER_BRUISED_SHOULDER", effects: { injuries: [{ who: "attacker", injury: "bruised_shoulder_injury", chance: 1 }] } },
    { weight: 3, fumble: true, log: "KNIFE_SHOOTER_DROP_WEAPON", effects: { weaponEffect: "drop" } },
    { weight: 1, fumble: true, log: "KNIFE_SHOOTER_MINUS_2_AP", effects: { apLoss: { who: "attacker", amount: 2 } } },
  ],
};

/** Heavy-gun hit/miss outcome tables shared by Natamy rifle, Old Faithful, and Lizaro Jungle in eMush. */
function heavyGunOutcomes(prefix: string, mushMultiplier?: number): WeaponOutcomes {
  const mush = mushMultiplier !== undefined ? { mushMultiplier } : {};
  return {
    hitOutcomes: [
      {
        weight: 75,
        log: `${prefix}_SUCCESSFUL_SHOT`,
        effects: {
          ...mush,
          injuries: [
            { who: "target", injury: "random", chance: 1 },
            { who: "target", injury: "haemorrhage_injury", chance: 0.4 },
            { who: "target", injury: "critical_haemorrhage_injury", chance: 0.1 },
          ],
        },
      },
      {
        weight: 5,
        critical: true,
        log: `${prefix}_SHOOTER_PLUS_2_MAX_DAMAGE_SHOOTER_MINUS_1_AP_TARGET_CRITICAL_HAEMORRHAGE_40_PERCENTS_TARGET_RANDOM_INJURY`,
        effects: {
          ...mush,
          maxDamageDelta: 2,
          apLoss: { who: "attacker", amount: 1 },
          injuries: [
            { who: "target", injury: "critical_haemorrhage_injury", chance: 0.4 },
            { who: "target", injury: "random", chance: 1 },
          ],
        },
      },
      {
        weight: 5,
        critical: true,
        log: `${prefix}_TARGET_MASHED_FOOT`,
        effects: { ...mush, injuries: [{ who: "target", injury: "mashed_foot_injury", chance: 1 }] },
      },
      {
        weight: 3,
        critical: true,
        log: `${prefix}_TARGET_BROKEN_SHOULDER_TARGET_CRITICAL_HAEMORRHAGE_40_PERCENTS_TARGET_HAEMORRHAGE_40_PERCENTS`,
        effects: {
          ...mush,
          injuries: [
            { who: "target", injury: "broken_shoulder_injury", chance: 1 },
            { who: "target", injury: "critical_haemorrhage_injury", chance: 0.4 },
            { who: "target", injury: "haemorrhage_injury", chance: 0.4 },
          ],
        },
      },
      { weight: 1, critical: true, log: `${prefix}_HEADSHOT`, effects: { instantKill: "target" } },
      { weight: 1, critical: true, log: `${prefix}_HEADSHOT_2`, effects: { instantKill: "target", apLoss: { who: "attacker", amount: 1 } } },
    ],
    missOutcomes: [
      { weight: 75, log: `${prefix}_FAILED_SHOT` },
      { weight: 1, fumble: true, log: `${prefix}_TARGET_MINUS_1AP`, effects: { apLoss: { who: "target", amount: 1 } } },
      { weight: 1, fumble: true, log: `${prefix}_BREAK_WEAPON`, effects: { weaponEffect: "break" } },
      { weight: 1, fumble: true, log: `${prefix}_SHOOTER_BURNT_HAND`, effects: { injuries: [{ who: "attacker", injury: "burnt_hand_injury", chance: 1 }] } },
      { weight: 1, fumble: true, log: `${prefix}_SHOOTER_BROKEN_SHOULDER`, effects: { injuries: [{ who: "attacker", injury: "broken_shoulder_injury", chance: 1 }] } },
    ],
  };
}

export const NATAMY_RIFLE_OUTCOMES = heavyGunOutcomes("NATAMY_RIFLE", 2);
export const LIZARO_JUNGLE_OUTCOMES = heavyGunOutcomes("LIZARO_JUNGLE");
export const OLD_FAITHFUL_OUTCOMES = heavyGunOutcomes("OLD_FAITHFUL");

export const MISSILE_LAUNCHER_OUTCOMES: WeaponOutcomes = {
  hitOutcomes: [
    {
      weight: 40,
      log: "ROCKET_LAUNCHER_SUCCESSFUL_HIT_2_RANDOM_WOUNDS_4_ITEMS_6_SPLASH",
      effects: { injuries: [{ who: "target", injury: "random", chance: 1, count: 2 }], breakRandomItems: 4, splashDamage: { amount: 6 } },
    },
    { weight: 7, critical: true, log: "ROCKET_LAUNCHER_ROCKETTED", effects: { instantKill: "target" } },
    {
      weight: 2,
      critical: true,
      log: "ROCKET_LAUNCHER_CRITICAL_MINUS_8_DAMAGE_2_RANDOM_WOUNDS_2_BACKFIRE_WOUNDS_2_ITEMS",
      effects: {
        damageDelta: -8,
        injuries: [
          { who: "target", injury: "random", chance: 1, count: 2 },
          { who: "attacker", injury: "random", chance: 1, count: 2 },
        ],
        breakRandomItems: 2,
      },
    },
    {
      weight: 4,
      critical: true,
      log: "ROCKET_LAUNCHER_CRITICAL_3_RANDOM_WOUNDS_2_ITEMS",
      effects: { injuries: [{ who: "target", injury: "random", chance: 1, count: 3 }], breakRandomItems: 2 },
    },
  ],
  missOutcomes: [
    { weight: 3, log: "ROCKET_LAUNCHER_MISS_10_ITEMS", effects: { breakRandomItems: 10 } },
    { weight: 3, fumble: true, log: "ROCKET_LAUNCHER_FUMBLE_6_ITEMS", effects: { breakRandomItems: 6 } },
    { weight: 3, fumble: true, log: "ROCKET_LAUNCHER_FUMBLE_6_ITEMS_BACKFIRE_ROCKETTED", effects: { breakRandomItems: 6, instantKill: "attacker" } },
    { weight: 3, fumble: true, log: "ROCKET_LAUNCHER_FUMBLE_8_SPLASH_50_PERCENT_4_ITEMS", effects: { splashDamage: { amount: 8, chance: 0.5 }, breakRandomItems: 4 } },
  ],
};

export const GRENADE_OUTCOMES: WeaponOutcomes = {
  hitOutcomes: [
    { weight: 40, log: "GRENADE_SUCCESSFUL_THROW_SPLASH_DAMAGE_ALL", effects: { weaponEffect: "destroy" } },
    {
      weight: 10,
      critical: true,
      log: "GRENADE_CRITICAL_THROW_SPLASH_DAMAGE_ALL_BREAK_ITEMS_SPLASH_WOUNDS",
      effects: { weaponEffect: "destroy", breakRandomItems: 4, injuries: [{ who: "splash", injury: "random", chance: 1, count: 2 }] },
    },
  ],
  missOutcomes: [
    { weight: 1, log: "GRENADE_FAILURE_PLACEHOLDER", effects: { weaponEffect: "destroy" } },
  ],
};

export const BARE_HANDS_OUTCOMES: WeaponOutcomes = {
  hitOutcomes: [
    { weight: 15, log: "BARE_HANDS_SUCCESSFUL_HIT", effects: { skillMaxDamage: true } },
    { weight: 5, critical: true, log: "BARE_HANDS_PLUS_1_DAMAGE", effects: { damageDelta: 1, skillMaxDamage: true } },
    { weight: 5, critical: true, log: "BARE_HANDS_TARGET_BURST_NOSE_TARGET_10_PERCENTS", effects: { skillMaxDamage: true, injuries: [{ who: "target", injury: "burst_nose_injury", chance: 0.1 }] } },
  ],
  missOutcomes: [
    { weight: 30, log: "BARE_HANDS_FAILED_HIT" },
    { weight: 10, fumble: true, log: "BARE_HANDS_FUMBLE" },
  ],
};
