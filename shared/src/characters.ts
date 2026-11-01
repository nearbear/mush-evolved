// Crew identities. A character mostly picks the art a seat is drawn with; the
// few rules tied to one are starting modifiers in `config.characterModifiers`
// (traits: Ian's Pacifist, Chun's Immunity). The ids match the sprite file names in
// Mush/clients/iso/gfx/anim/perso.

/**
 * How hard a character is to play well, as the character picker groups them (owner, 2026-11-01).
 * Display only: no rule reads it. Each is hard for its own reasons, not explained yet.
 */
export type Difficulty = 1 | 2 | 3;
export const DIFFICULTIES: readonly Difficulty[] = [1, 2, 3];

export const CHARACTERS = [
  { id: "chao", name: "Wang Chao", given: "Chao", difficulty: 3 },
  { id: "chun", name: "Zhong Chun", given: "Chun", difficulty: 3 },
  { id: "eleesha", name: "Eleesha Williams", given: "Eleesha", difficulty: 3 },
  { id: "finola", name: "Finola Keegan", given: "Finola", difficulty: 1 },
  { id: "frieda", name: "Frieda Bergmann", given: "Frieda", difficulty: 1 },
  { id: "gioele", name: "Gioele Rinaldo", given: "Gioele", difficulty: 2 },
  { id: "hua", name: "Jiang Hua", given: "Hua", difficulty: 2 },
  { id: "ian", name: "Ian Soulton", given: "Ian", difficulty: 1 },
  { id: "janice", name: "Janice Kent", given: "Janice", difficulty: 2 },
  { id: "jinsu", name: "Kim Jin Su", given: "Jin Su", difficulty: 3 },
  { id: "kuanti", name: "Lai Kuan Ti", given: "Kuan Ti", difficulty: 2 },
  { id: "paola", name: "Paola Rinaldo", given: "Paola", difficulty: 1 },
  { id: "raluca", name: "Raluca Tomescu", given: "Raluca", difficulty: 1 },
  { id: "roland", name: "Roland Zuccali", given: "Roland", difficulty: 1 },
  { id: "stephen", name: "Stephen Seagull", given: "Stephen", difficulty: 2 },
  { id: "terrence", name: "Terrence Archer", given: "Terrence", difficulty: 2 },
] as const satisfies readonly { id: string; name: string; given: string; difficulty: Difficulty }[];

export type CharacterId = (typeof CHARACTERS)[number]["id"];

export function isCharacterId(value: unknown): value is CharacterId {
  return CHARACTERS.some((c) => c.id === value);
}

/** A crew member's full name. Proper names, so never translated. Falls back to the id for one the list doesn't know. */
export function characterName(id: string): string {
  return CHARACTERS.find((c) => c.id === id)?.name ?? id;
}

/** A crew member's given name, without the surname (several are written surname first). What log lines use. */
export function characterGivenName(id: string): string {
  return CHARACTERS.find((c) => c.id === id)?.given ?? id;
}
