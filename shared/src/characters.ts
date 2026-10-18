// Crew identities. A character mostly picks the art a seat is drawn with; the
// few rules tied to one are starting modifiers in `config.characterModifiers`
// (Ian's Pacifist). The ids match the sprite file names in
// Mush/clients/iso/gfx/anim/perso.

export const CHARACTERS = [
  { id: "chao", name: "Wang Chao" },
  { id: "chun", name: "Zhong Chun" },
  { id: "eleesha", name: "Eleesha Williams" },
  { id: "finola", name: "Finola Keegan" },
  { id: "frieda", name: "Frieda Bergmann" },
  { id: "gioele", name: "Gioele Rinaldo" },
  { id: "hua", name: "Jiang Hua" },
  { id: "ian", name: "Ian Soulton" },
  { id: "janice", name: "Janice Kent" },
  { id: "jinsu", name: "Kim Jin Su" },
  { id: "kuanti", name: "Lai Kuan Ti" },
  { id: "paola", name: "Paola Rinaldo" },
  { id: "raluca", name: "Raluca Tomescu" },
  { id: "roland", name: "Roland Zuccali" },
  { id: "stephen", name: "Stephen Seagull" },
  { id: "terrence", name: "Terrence Archer" },
] as const;

export type CharacterId = (typeof CHARACTERS)[number]["id"];

/** A crew member's full name. Proper names, so never translated. Falls back to the id for one the list doesn't know. */
export function characterName(id: string): string {
  return CHARACTERS.find((c) => c.id === id)?.name ?? id;
}
