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

/**
 * Grammatical gender for log lines (#505): web passes it as i18next `context`, so `key_female` / `key_male`
 * are tried before the plain key, which holds gender-free wording. A non-binary character is `neutral` and
 * always gets the plain key. The current crew follow the original game's genders.
 */
export type Gender = "male" | "female" | "neutral";

export const CHARACTERS = [
  { id: "chao", name: "Wang Chao", given: "Chao", gender: "male", difficulty: 3 },
  { id: "chun", name: "Zhong Chun", given: "Chun", gender: "female", difficulty: 3 },
  { id: "eleesha", name: "Eleesha Williams", given: "Eleesha", gender: "female", difficulty: 3 },
  { id: "finola", name: "Finola Keegan", given: "Finola", gender: "female", difficulty: 1 },
  { id: "frieda", name: "Frieda Bergmann", given: "Frieda", gender: "female", difficulty: 1 },
  { id: "gioele", name: "Gioele Rinaldo", given: "Gioele", gender: "male", difficulty: 2 },
  { id: "hua", name: "Jiang Hua", given: "Hua", gender: "female", difficulty: 2 },
  { id: "ian", name: "Ian Soulton", given: "Ian", gender: "male", difficulty: 1 },
  { id: "janice", name: "Janice Kent", given: "Janice", gender: "female", difficulty: 2 },
  { id: "jinsu", name: "Kim Jin Su", given: "Jin Su", gender: "male", difficulty: 3 },
  { id: "kuanti", name: "Lai Kuan Ti", given: "Kuan Ti", gender: "male", difficulty: 2 },
  { id: "paola", name: "Paola Rinaldo", given: "Paola", gender: "female", difficulty: 1 },
  { id: "raluca", name: "Raluca Tomescu", given: "Raluca", gender: "female", difficulty: 1 },
  { id: "roland", name: "Roland Zuccali", given: "Roland", gender: "male", difficulty: 1 },
  { id: "stephen", name: "Stephen Seagull", given: "Stephen", gender: "male", difficulty: 2 },
  { id: "terrence", name: "Terrence Archer", given: "Terrence", gender: "male", difficulty: 2 },
] as const satisfies readonly { id: string; name: string; given: string; gender: Gender; difficulty: Difficulty }[];

export type CharacterId = (typeof CHARACTERS)[number]["id"];

export function isCharacterId(value: unknown): value is CharacterId {
  return CHARACTERS.some((c) => c.id === value);
}

/** A crew member's full name. Proper names, so never translated. Falls back to the id for one the list doesn't know. */
export function characterName(id: string): string {
  return CHARACTERS.find((c) => c.id === id)?.name ?? id;
}

/**
 * A crew member's username, as signed on comms (owner, 2026-11-16: "prinaldo" for Paola Rinaldo): the given name's
 * first letter and the surname, lower case, spaces dropped. Falls back to the id for one the list doesn't know.
 */
export function characterUsername(id: string): string {
  const c = CHARACTERS.find((ch) => ch.id === id);
  if (!c) return id;
  const surname = c.name.replace(c.given, "").trim();
  return `${c.given[0]}${surname}`.toLowerCase().replace(/\s+/g, "");
}

/** A crew member's given name, without the surname (several are written surname first). What log lines use. */
export function characterGivenName(id: string): string {
  return CHARACTERS.find((c) => c.id === id)?.given ?? id;
}

/** A crew member's grammatical gender for log lines. `neutral` for one the list doesn't know, so text never misgenders. */
export function characterGender(id: string): Gender {
  return CHARACTERS.find((c) => c.id === id)?.gender ?? "neutral";
}
