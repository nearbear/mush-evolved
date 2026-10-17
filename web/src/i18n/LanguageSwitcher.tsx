import { useTranslation } from "react-i18next";
import { LOCALES, LOCALE_NAMES, matchLocale } from "./locale.ts";
import "./languageSwitcher.css";

/**
 * A native select: works with a phone's own picker, and needs no hover.
 * By default it is pinned to the screen corner; `inline` leaves it in the flow (settings dialog).
 */
export function LanguageSwitcher({ inline = false }: { inline?: boolean }) {
  const { t, i18n } = useTranslation();
  return (
    <select
      className={inline ? "language-switcher inline" : "language-switcher"}
      data-testid="language-switcher"
      aria-label={t("language.label")}
      value={matchLocale(i18n.language) ?? "en"}
      onChange={(e) => void i18n.changeLanguage(e.target.value)}
    >
      {LOCALES.map((locale) => (
        // `lang` lets screen readers pronounce each name correctly.
        <option key={locale} value={locale} lang={locale}>
          {LOCALE_NAMES[locale]}
        </option>
      ))}
    </select>
  );
}
