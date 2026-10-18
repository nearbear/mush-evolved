// Crew identities. A character mostly picks the art a seat is drawn with; the
// few rules tied to one are starting modifiers in `config.characterModifiers`
// (traits: Ian's Pacifist, Chun's Immunity). The ids match the sprite file names in
// Mush/clients/iso/gfx/anim/perso.

export const CHARACTERS = [
  { id: "chao", name: "Wang Chao", given: "Chao" },
  { id: "chun", name: "Zhong Chun", given: "Chun" },
  { id: "eleesha", name: "Eleesha Williams", given: "Eleesha" },
  { id: "finola", name: "Finola Keegan", given: "Finola" },
  { id: "frieda", name: "Frieda Bergmann", given: "Frieda" },
  { id: "gioele", name: "Gioele Rinaldo", given: "Gioele" },
  { id: "hua", name: "Jiang Hua", given: "Hua" },
  { id: "ian", name: "Ian Soulton", given: "Ian" },
  { id: "janice", name: "Janice Kent", given: "Janice" },
  { id: "jinsu", name: "Kim Jin Su", given: "Jin Su" },
  { id: "kuanti", name: "Lai Kuan Ti", given: "Kuan Ti" },
  { id: "paola", name: "Paola Rinaldo", given: "Paola" },
  { id: "raluca", name: "Raluca Tomescu", given: "Raluca" },
  { id: "roland", name: "Roland Zuccali", given: "Roland" },
  { id: "stephen", name: "Stephen Seagull", given: "Stephen" },
  { id: "terrence", name: "Terrence Archer", given: "Terrence" },
] as const;

export type CharacterId = (typeof CHARACTERS)[number]["id"];

/** A crew member's full name. Proper names, so never translated. Falls back to the id for one the list doesn't know. */
export function characterName(id: string): string {
  return CHARACTERS.find((c) => c.id === id)?.name ?? id;
}

/** A crew member's given name, without the surname (several are written surname first). What log lines use. */
export function characterGivenName(id: string): string {
  return CHARACTERS.find((c) => c.id === id)?.given ?? id;
}
