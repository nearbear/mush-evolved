// Cosmetic login name shown at the top of a terminal: the given name's first initial plus the surname, lowercase,
// no spaces (Wang Chao -> cwang, Kim Jin Su -> jkim). Several surnames come first in the full name, so the surname
// is whatever is left once the given name is taken out.

import { characterGivenName, characterName } from "@mush2/shared";

export function terminalUsername(character: string): string {
  const given = characterGivenName(character);
  const surname = characterName(character).replace(given, "");
  return `${given.charAt(0)}${surname}`.replace(/\s+/g, "").toLowerCase();
}
