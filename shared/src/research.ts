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
