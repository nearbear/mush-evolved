// Cosmetic login name shown at the top of a terminal: the given name's first initial plus the surname, lowercase,
// no spaces (Wang Chao -> cwang, Kim Jin Su -> jkim). Several surnames come first in the full name, so the surname
// is whatever is left once the given name is taken out.

import { bypassesTitles, characterGivenName, characterName, EQUIPMENT_TYPES, type PlayerView } from "@mush2/shared";

export function terminalUsername(character: string): string {
  const given = characterGivenName(character);
  const surname = characterName(character).replace(given, "");
  return `${given.charAt(0)}${surname}`.replace(/\s+/g, "").toLowerCase();
}

/** The cosmetic login at the top of a terminal (TerminalFrame): who is logged in, and the access line under it. */
export interface TerminalLogin {
  user: string;
  access: "granted" | "limited" | "hacked";
}

/**
 * A terminal that needs a title says access is limited to anyone who doesn't hold it, unless they got in with the
 * hacker kit, which logs them in as the holder (when there is one). Everyone else is logged in as themselves.
 */
export function terminalLogin(type: string, view: PlayerView): TerminalLogin {
  const title = EQUIPMENT_TYPES[type]?.title;
  const holder = title ? view.titles.find((entry) => entry.id === title)?.holder : null;
  const mine = view.you.character;
  const hacked = !!title && holder !== mine && holder != null && bypassesTitles(view.you, title);
  const limited = !!title && holder !== mine && !hacked;
  return { user: terminalUsername(hacked ? holder : mine), access: hacked ? "hacked" : limited ? "limited" : "granted" };
}
