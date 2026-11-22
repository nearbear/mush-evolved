// Sets up i18next for the whole client. Import this once, before rendering
// (main.tsx). Components then call `useTranslation()` from react-i18next.
//
// Each locale's UI catalog and shared name catalog are dynamic-imported on
// demand so startup only downloads the active language, and switching languages
// loads the new locale via i18next's backend.

import i18n, { type BackendModule } from "i18next";
import { initReactI18next } from "react-i18next";
import type { NameCatalog } from "@mush2/shared";
import { LOCALES, type Locale, loadSavedLocale, matchLocale, pickLocale, saveLocale } from "./locale.ts";

/** A UI catalog with shared's names merged in: `rooms`, `equipment` and `items` whole, and `skills.names`. */
const withNames = <T extends { skills: object }>(ui: T, names: NameCatalog) => ({ ...ui, ...names, skills: { ...ui.skills, ...names.skills } });

type EnCatalog = typeof import("../locales/en.json");
type MergedCatalog = ReturnType<typeof withNames<EnCatalog>>;

// Gives `t("...")` autocomplete and a compile error for keys that aren't in English.
declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "translation";
    resources: { translation: MergedCatalog };
  }
}

type UiModule = { default: { skills: object } };
type NamesModule = { default: NameCatalog };

const UI_LOADERS: Record<Locale, () => Promise<UiModule>> = {
  en: () => import("../locales/en.json"),
  fr: () => import("../locales/fr.json"),
  es: () => import("../locales/es.json"),
};

const NAME_LOADERS: Record<Locale, () => Promise<NamesModule>> = {
  en: () => import("@mush2/shared/src/locales/names.en.json"),
  fr: () => import("@mush2/shared/src/locales/names.fr.json"),
  es: () => import("@mush2/shared/src/locales/names.es.json"),
};

async function loadCatalog(locale: Locale) {
  const [ui, names] = await Promise.all([UI_LOADERS[locale](), NAME_LOADERS[locale]()]);
  return withNames(ui.default, names.default);
}

const localeBackend: BackendModule = {
  type: "backend",
  init() {},
  read(language, _namespace, callback) {
    const locale = matchLocale(language);
    if (!locale) {
      callback(null, {});
      return;
    }
    loadCatalog(locale).then(
      (catalog) => callback(null, catalog),
      (err: unknown) => callback(err instanceof Error ? err : new Error(String(err)), false),
    );
  },
};

const initialLocale = pickLocale(loadSavedLocale(), typeof navigator === "undefined" ? [] : navigator.languages);

await i18n
  .use(initReactI18next)
  .use(localeBackend)
  .init({
    lng: initialLocale,
    // Every locale has full key parity (enforced by tools/tests/i18n/i18n.test.ts), so skip
    // loading English as a fallback on startup when the user is in French or Spanish.
    fallbackLng: false,
    supportedLngs: [...LOCALES],
    load: "languageOnly",
    react: { useSuspense: false },
    // React already escapes what it renders.
    interpolation: { escapeValue: false },
  });

// Keep the page's own language in step: CSS `text-transform: uppercase` and screen
// readers both depend on <html lang>. Fires once at startup, then on every change.
i18n.on("languageChanged", (language) => {
  document.documentElement.lang = language;
  const locale = matchLocale(language);
  if (locale) saveLocale(locale);
});
document.documentElement.lang = i18n.language;

export default i18n;
