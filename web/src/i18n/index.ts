// Sets up i18next for the whole client. Import this once, before rendering
// (main.tsx). Components then call `useTranslation()` from react-i18next.
//
// Catalogs are bundled rather than loaded on demand: three small JSON files.
// If they ever get large, switch to dynamic `import()` per language.

import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "../locales/en.json";
import es from "../locales/es.json";
import fr from "../locales/fr.json";
import { DEFAULT_LOCALE, LOCALES, loadSavedLocale, pickLocale, saveLocale, matchLocale } from "./locale.ts";

// Gives `t("...")` autocomplete and a compile error for keys that aren't in English.
declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "translation";
    resources: { translation: typeof en };
  }
}

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, fr: { translation: fr }, es: { translation: es } },
  lng: pickLocale(loadSavedLocale(), typeof navigator === "undefined" ? [] : navigator.languages),
  fallbackLng: DEFAULT_LOCALE,
  supportedLngs: [...LOCALES],
  // Resources are bundled, so there is nothing to wait for: initialize synchronously
  // so the first render is already translated and nothing needs a Suspense boundary.
  initAsync: false,
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
