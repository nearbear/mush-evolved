// Researches done at the laboratory's research terminal. Only the ids live here (the names are translated in the
// client). Progress is state (`GameState.research`, percent), and the whole list is public (decided 2026-10-16).
// What a research needs before it can be worked on is in RESEARCH_REQUIRES. The original's other fields (difficulty,
// prerequisites, effects) are not used yet.

/** The researches that have card art in `Mush/www/img/cards/research/` (the file is the lowercase id). */
export const RESEARCH_IDS = [
  "DRUG_DISPENSER",
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
export const RESEARCH_SKILLS = ["biologist", "medic"] as const;

export type ResearchId = (typeof RESEARCH_IDS)[number];

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
}

/** One of a research's requirements: an item type, Chun, or the Mush having been chosen. */
export type ResearchNeed = { item: string } | "chun" | "postSelection";

/** A research's requirements one by one, in the order the terminal lists them and `PlayerView.researchNeeds` reports them. */
export function researchNeedOrder(needs: Readonly<ResearchRequirement>): ResearchNeed[] {
  return [...(needs.items ?? []).map((item) => ({ item })), ...(needs.chun ? ["chun" as const] : []), ...(needs.postSelection ? ["postSelection" as const] : [])];
}

export const RESEARCH_REQUIRES: Readonly<Partial<Record<ResearchId, ResearchRequirement>>> = {
  MYCOSCAN: { chun: true },
  PATULINE_SCRAMBLER: { postSelection: true },
  FUNGUS_SCRAMBLER: { postSelection: true },
  PHEROMODEM: { items: ["mush_floppy_disk"], postSelection: true },
  CONSTIPASPORE_SERUM: { items: [ANY_CONSUMABLE, "mush_sample"] },
  MYCO_ALARM: { items: ["mush_sample"] },
  SPORE_EXTRACTOR: { items: ["mush_sample"] },
  MYCO_DIALECT: { items: ["mush_floppy_disk"] },
  MUSH_BREEDING_SYSTEM: { items: ["mush_floppy_disk"], postSelection: true },
  MUSH_BREEDS: { postSelection: true },
  MUSH_PREDATOR: { items: ["mush_sample"], chun: true },
  ANTI_MUSH_SERUM: { items: ["mush_sample", "mush_floppy_disk"], chun: true, postSelection: true },
  HEALING_OINTMANT: { items: ["medikit"] },
  NCC_LENS: { items: ["body_cat"] },
  NATAMY_GUN: { items: ["mush_sample", "blaster"], consumes: ["blaster"] },
  TESLA_SUP2X: { items: ["water_stick"] },
  INFINITE_WATER: { items: ["water_stick"] },
  GUARANA_CAPUCCINO: { items: ["coffee"] },
  MUSHICIDE_SOAP: { items: ["soap"], consumes: ["soap"], chun: true },
  MUSHOPHAGE_BACTERIA: { chun: true, postSelection: true },
  ANTISPORE_GAZ: { items: ["mush_sample"] },
  SUPER_CALC: { items: ["super_map"] },
};

/** How much of a research's effects the rules implement. A research missing from RESEARCH_STATUS is "none". */
export type ResearchStatus = "full" | "partial" | "none";

/**
 * Implementation status shown in the terminal's research list. Update it when a research gains effects. Progress
 * itself works for all of them; only researches with completion effects are listed.
 */
export const RESEARCH_STATUS: Readonly<Partial<Record<ResearchId, ResearchStatus>>> = { ANTI_MUSH_SERUM: "full", MUSHOPHAGE_BACTERIA: "full", MYCO_ALARM: "partial", MYCOSCAN: "full", STEROIDS: "full", SUPER_CALC: "partial" };

export function researchStatus(research: string): ResearchStatus {
  return RESEARCH_STATUS[research as ResearchId] ?? "none";
}
