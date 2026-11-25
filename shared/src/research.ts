// Researches done at the laboratory's research terminal. Only the ids, requirements and per-research base efficiencies
// live here (the names are translated in the client). Progress is state (`GameState.research`, percent), and the whole
// list is public (decided 2026-10-16). What a research needs before it can be worked on is in RESEARCH_REQUIRES, and its
// base progress efficiency (1–18, mirrored from eMush; owner, 2026-11-24) is in RESEARCH_EFFICIENCY.

import type { RelayProgressConfig } from "./relay.ts";

/** The researches (card art in `Mush/www/img/cards/research/`, or `projects/whos_who.png` for `WHOS_WHO`). */
export const RESEARCH_IDS = [
  "DRUG_DISPENSER",
  "WHOS_WHO",
  "STEROIDS",
  "MYCOSCAN",
  "PATULINE_SCRAMBLER",
  "FUNGUS_SCRAMBLER",
  "PHEROMODEM",
  "CONSTIPASPORE_SERUM",
  "MYCO_ALARM",
  "SPORE_EXTRACTOR",
  "MYCO_DIALECT",
  "MUSH_BREEDING_SYSTEM",
  "MUSH_BREEDS",
  "MUSH_PREDATOR",
  "ANTI_MUSH_SERUM",
  "HEALING_OINTMANT",
  "NCC_LENS",
  "NATAMY_GUN",
  "TESLA_SUP2X",
  "INFINITE_WATER",
  "GUARANA_CAPUCCINO",
  "MUSHICIDE_SOAP",
  "MUSHOPHAGE_BACTERIA",
  "ANTISPORE_GAZ",
  "SUPER_CALC",
] as const;

export const RESEARCH_COMPLETE = 100;

/** Skills that speed up a research, each by `config.research.progress.skillBoost` (the original's research tags; owner, 2026-10-26). */
export const RESEARCH_SKILLS = ["biologist", "medic", "skilful"] as const;

export type ResearchId = (typeof RESEARCH_IDS)[number];

/**
 * Each research's base progress efficiency (1–18, mirrored from eMush's `ProjectConfigData.php`; owner, 2026-11-24),
 * overriding `config.research.progress.rate` before skill boosts, BIOS priority, Migraine and relay penalties.
 * `WHOS_WHO` (ACTOPI Protocol) keeps its eMush NERON project efficiency of 18.
 */
export const RESEARCH_EFFICIENCY: Readonly<Record<ResearchId, number>> = {
  DRUG_DISPENSER: 6,
  WHOS_WHO: 18,
  STEROIDS: 12,
  MYCOSCAN: 4,
  PATULINE_SCRAMBLER: 6,
  FUNGUS_SCRAMBLER: 3,
  PHEROMODEM: 3,
  CONSTIPASPORE_SERUM: 6,
  MYCO_ALARM: 6,
  SPORE_EXTRACTOR: 4,
  MYCO_DIALECT: 6,
  MUSH_BREEDING_SYSTEM: 18,
  MUSH_BREEDS: 6,
  MUSH_PREDATOR: 6,
  ANTI_MUSH_SERUM: 1,
  HEALING_OINTMANT: 6,
  NCC_LENS: 12,
  NATAMY_GUN: 6,
  TESLA_SUP2X: 12,
  INFINITE_WATER: 6,
  GUARANA_CAPUCCINO: 6,
  MUSHICIDE_SOAP: 3,
  MUSHOPHAGE_BACTERIA: 3,
  ANTISPORE_GAZ: 6,
  SUPER_CALC: 3,
};

/** A research's base progress efficiency (1–18, mirrored from eMush; owner, 2026-11-24), or `fallback` for an unknown id. */
export function researchEfficiency(research: string, fallback = 6): number {
  return RESEARCH_EFFICIENCY[research as ResearchId] ?? fallback;
}

/** The `RelayProgressConfig` for a specific research, applying its per-research efficiency as `rate`. */
export function researchProgressConfig(config: Readonly<RelayProgressConfig>, research: string): RelayProgressConfig {
  return { ...config, rate: researchEfficiency(research, config.rate) };
}

/** Stands for any food, drink or drug (an item type with `consume`) in `ResearchRequirement.items`. */
export const ANY_CONSUMABLE = "consumable";

/**
 * What must be true in the laboratory before a research can be worked on (owner, 2026-10-25, from the original's
 * `research.json`). Checked before every contribution, not only the first.
 */
export interface ResearchRequirement {
  /** Item types that must each be in the lab, on the floor or carried by anyone there (`samples`). `ANY_CONSUMABLE` matches any consumable. */
  items?: readonly string[];
  /** Of `items`, the ones used up when the research completes (`kill_sample`). */
  consumes?: readonly string[];
  /** Chun, alive, must be in the lab, until Xyloph's ZONG_CHUN_SAMPLE entry is drawn (`need_chun`). */
  chun?: true;
  /** Only after the Mush are chosen, never in pre-selection (`need_cryo`). */
  postSelection?: true;
  /** At least one Mush has died aboard (`hasMushDied`, matching the Sick Bay cryo tank; owner, 2026-11-21). */
  deadMush?: true;
}

/** One of a research's requirements: an item type, Chun, post-selection, or a dead Mush. */
export type ResearchNeed = { item: string } | "chun" | "postSelection" | "deadMush";

/** A research's requirements one by one, in the order the terminal lists them and `PlayerView.researchNeeds` reports them. */
export function researchNeedOrder(needs: Readonly<ResearchRequirement>): ResearchNeed[] {
  return [
    ...(needs.items ?? []).map((item) => ({ item })),
    ...(needs.chun ? ["chun" as const] : []),
    ...(needs.postSelection ? ["postSelection" as const] : []),
    ...(needs.deadMush ? ["deadMush" as const] : []),
  ];
}

export const RESEARCH_REQUIRES: Readonly<Partial<Record<ResearchId, ResearchRequirement>>> = {
  MYCOSCAN: { chun: true },
  PATULINE_SCRAMBLER: { deadMush: true },
  FUNGUS_SCRAMBLER: { deadMush: true },
  PHEROMODEM: { items: ["mush_floppy_disk"], postSelection: true },
  CONSTIPASPORE_SERUM: { items: [ANY_CONSUMABLE, "mush_sample"] },
  MYCO_ALARM: { items: ["mush_sample"] },
  SPORE_EXTRACTOR: { items: ["mush_sample"] },
  MYCO_DIALECT: { items: ["mush_floppy_disk"] },
  MUSH_BREEDING_SYSTEM: { items: ["mush_floppy_disk"], deadMush: true },
  MUSH_BREEDS: { deadMush: true },
  MUSH_PREDATOR: { items: ["mush_sample"], chun: true },
  ANTI_MUSH_SERUM: { items: ["mush_sample", "mush_floppy_disk"], chun: true, postSelection: true },
  HEALING_OINTMANT: { items: ["medikit"] },
  NCC_LENS: { items: ["body_cat"] },
  NATAMY_GUN: { items: ["mush_sample", "blaster"], consumes: ["blaster"] },
  TESLA_SUP2X: { items: ["water_stick"] },
  INFINITE_WATER: { items: ["water_stick"] },
  GUARANA_CAPUCCINO: { items: ["coffee"] },
  MUSHICIDE_SOAP: { items: ["soap"], consumes: ["soap"], chun: true },
  MUSHOPHAGE_BACTERIA: { chun: true, deadMush: true },
  ANTISPORE_GAZ: { items: ["mush_sample"] },
  SUPER_CALC: { items: ["super_map"] },
};

/** How much of a research's effects the rules implement. A research missing from RESEARCH_STATUS is "none". */
export type ResearchStatus = "full" | "partial" | "none";

/**
 * Implementation status shown in the terminal's research list. Update it when a research gains effects. Progress
 * itself works for all of them; only researches with completion effects are listed.
 */
export const RESEARCH_STATUS: Readonly<Partial<Record<ResearchId, ResearchStatus>>> = { ANTI_MUSH_SERUM: "full", ANTISPORE_GAZ: "full", CONSTIPASPORE_SERUM: "full", DRUG_DISPENSER: "full", FUNGUS_SCRAMBLER: "full", GUARANA_CAPUCCINO: "full", HEALING_OINTMANT: "full", MUSHOPHAGE_BACTERIA: "full", MYCO_ALARM: "full", MYCOSCAN: "full", SPORE_EXTRACTOR: "full", STEROIDS: "full", SUPER_CALC: "partial", WHOS_WHO: "full" };

export function researchStatus(research: string): ResearchStatus {
  return RESEARCH_STATUS[research as ResearchId] ?? "none";
}
