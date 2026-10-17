// Researches done at the laboratory's research terminal. Only the ids live here (the names are translated in the
// client). Progress is state (`GameState.research`, percent), and the whole list is public (decided 2026-10-16).
// The original's other fields (difficulty, samples, prerequisites, effects) are not used yet.

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

/** How much of a research's effects the rules implement. A research missing from RESEARCH_STATUS is "none". */
export type ResearchStatus = "full" | "partial" | "none";

/**
 * Implementation status shown in the terminal's research list. Update it when a research gains effects. Progress
 * itself works for all of them; only researches with completion effects are listed.
 */
export const RESEARCH_STATUS: Readonly<Partial<Record<(typeof RESEARCH_IDS)[number], ResearchStatus>>> = { MUSHOPHAGE_BACTERIA: "full" };

export function researchStatus(research: string): ResearchStatus {
  return RESEARCH_STATUS[research as (typeof RESEARCH_IDS)[number]] ?? "none";
}
