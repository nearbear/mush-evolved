// Display names for rooms, equipment, items and skills, in each ship language. The catalogs live here, not in web, so
// the server can use the names players see (a model bot's prompt says "Medlab", not SICK_BAY) and web merges them
// into its i18next catalogs (web/src/i18n/index.ts), so there is one copy. Pure lookups: an unknown id names itself.

import { BLUEPRINTS } from "./blueprints.ts";
import { isLostPlace } from "./patrol.ts";
import en from "./locales/names.en.json";
import es from "./locales/names.es.json";
import fr from "./locales/names.fr.json";
import type { LobbyLanguage } from "./protocol.ts";
import type { ItemView } from "./types.ts";

export type NameCatalog = typeof en;

/** By language. Web merges each into its translation catalog: keys `rooms.*`, `equipment.*`, `items.*`, `skills.names.*`. */
export const NAME_CATALOGS: Record<LobbyLanguage, NameCatalog> = { en, fr, es };

type Group = "rooms" | "equipment" | "items";
const lookup = (language: LobbyLanguage, group: Group, id: string): string =>
  (NAME_CATALOGS[language][group] as Record<string, string | undefined>)[id] ?? id;

/** The name every lost member's place (`lostPlace`) goes by. */
export const LOST_PLACE_NAME = "LOST";
export const roomName = (language: LobbyLanguage, id: string): string => lookup(language, "rooms", isLostPlace(id) ? LOST_PLACE_NAME : id);
export const equipmentName = (language: LobbyLanguage, type: string): string => lookup(language, "equipment", type);
export const skillName = (language: LobbyLanguage, id: string): string =>
  (NAME_CATALOGS[language].skills.names as Record<string, string | undefined>)[id] ?? id;

/** An item as a view has it: a blueprint is named for what it builds, a skill book for its skill. */
export function itemName(language: LobbyLanguage, item: Pick<ItemView, "type" | "builds" | "teaches">): string {
  const items = NAME_CATALOGS[language].items;
  if (item.teaches !== undefined) return items.bookOf.replace("{{skill}}", skillName(language, item.teaches));
  if (item.builds !== undefined) {
    const makes = BLUEPRINTS[item.builds]?.makes;
    const thing = makes && "item" in makes ? lookup(language, "items", makes.item) : equipmentName(language, makes ? makes.equipment : item.builds);
    return items.blueprintOf.replace("{{thing}}", thing);
  }
  return lookup(language, "items", item.type);
}
