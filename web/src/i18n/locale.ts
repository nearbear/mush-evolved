// Which language the UI is in. This is a per-player, client-side choice: the
// server never needs to know it, and it is independent of which ship you join.

export const LOCALES = ["en", "fr", "es"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_KEY = "mush2.locale";

/** Each language's name in that language. These are never translated. */
export const LOCALE_NAMES: Record<Locale, string> = { en: "English", fr: "Français", es: "Español" }; // i18n-ignore

/** "fr", "fr-CA" and "FR_ca" all give "fr"; anything we don't ship gives null. */
export function matchLocale(tag: string | null | undefined): Locale | null {
  const primary = tag?.toLowerCase().split(/[-_]/)[0];
  return LOCALES.find((l) => l === primary) ?? null;
}

/** A saved choice wins, then the browser's preferences in order, then English. */
export function pickLocale(saved: string | null, preferred: readonly string[]): Locale {
  const fromSaved = matchLocale(saved);
  if (fromSaved) return fromSaved;
  for (const tag of preferred) {
    const match = matchLocale(tag);
    if (match) return match;
  }
  return DEFAULT_LOCALE;
}

export function loadSavedLocale(): string | null {
  try {
    return localStorage.getItem(LOCALE_KEY);
  } catch {
    return null; // storage blocked: fall back to the browser's language
  }
}

export function saveLocale(locale: Locale): void {
  try {
    localStorage.setItem(LOCALE_KEY, locale);
  } catch {
    // storage blocked: the choice lasts until the page reloads
  }
}
