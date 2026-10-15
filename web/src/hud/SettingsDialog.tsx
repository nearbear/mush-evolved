// The settings button and its dialog. Options apply immediately; there is no Save button.
// Uses the global Mush `button` style; only layout is set in settings.css.

import { Dialog } from "@base-ui/react/dialog";
import { useTranslation } from "react-i18next";
import { SETTINGS_ICON } from "../art/assets.ts";
import { LanguageSwitcher } from "../i18n/LanguageSwitcher.tsx";
import "./settings.css";

export function SettingsDialog() {
  const { t } = useTranslation();
  return (
    <Dialog.Root>
      <Dialog.Trigger className="settings-button" aria-label={t("settings.open")} title={t("settings.open")}>
        <img className="settings-icon" src={SETTINGS_ICON} alt="" />
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className="settings-backdrop" />
        <Dialog.Popup className="settings-popup">
          <Dialog.Title className="settings-title">{t("settings.title")}</Dialog.Title>
          <div className="settings-row">
            <span>{t("language.label")}</span>
            <LanguageSwitcher inline />
          </div>
          <Dialog.Close className="settings-close">{t("settings.close")}</Dialog.Close>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
