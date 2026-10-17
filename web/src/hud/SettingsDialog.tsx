// The settings button and its dialog. Options apply immediately; there is no Save button.
// Uses the global Mush `button` style; only layout is set in settings.css.

import { ACTOPI_CHEATS, CHEATS, ROLE_CHEATS, isActopiCheat, type ActopiCheat, type Cheat, type RoleCheat } from "@mush2/shared";
import { Hint } from "./IconButton.tsx";
import { Dialog } from "@base-ui/react/dialog";
import { useTranslation } from "react-i18next";
import { SETTINGS_ICON } from "../art/assets.ts";
import { parseFogDepth, setFogDepth, useFogDepth } from "../fogDepth.ts";
import { LanguageSwitcher } from "../i18n/LanguageSwitcher.tsx";
import "./settings.css";

export function SettingsDialog({
  cheatsAllowed,
  activeCheats,
  actopiCheat,
  onCheat,
  onActopiCheat,
  onRoleCheat,
}: {
  /** The server's dev flag. Without it the cheats section is not drawn at all. */
  cheatsAllowed: boolean;
  activeCheats: readonly Cheat[];
  actopiCheat: ActopiCheat;
  onCheat: (cheat: Cheat, on: boolean) => void;
  onActopiCheat: (mode: ActopiCheat) => void;
  onRoleCheat: (role: RoleCheat) => void;
}) {
  const { t } = useTranslation();
  const fogDepth = useFogDepth();
  return (
    <Dialog.Root>
      <Hint label={t("settings.open")}>
        <Dialog.Trigger className="settings-button" aria-label={t("settings.open")}>
          <img className="settings-icon" src={SETTINGS_ICON} alt="" />
        </Dialog.Trigger>
      </Hint>
      <Dialog.Portal>
        <Dialog.Backdrop className="settings-backdrop" />
        <Dialog.Popup className="settings-popup">
          <Dialog.Title className="settings-title">{t("settings.title")}</Dialog.Title>
          <div className="settings-row">
            <span>{t("language.label")}</span>
            <LanguageSwitcher inline />
          </div>
          <label className="settings-row">
            <span>{t("settings.fogDepth.label")}</span>
            <select value={fogDepth} onChange={(e) => setFogDepth(parseFogDepth(e.target.value))}>
              <option value="1">{t("settings.fogDepth.one")}</option>
              <option value="2">{t("settings.fogDepth.two")}</option>
              <option value="all">{t("settings.fogDepth.all")}</option>
            </select>
          </label>
          {cheatsAllowed && (
            <fieldset className="settings-cheats">
              <legend>{t("settings.cheats.title")}</legend>
              {CHEATS.map((cheat) => (
                <label key={cheat} className="settings-cheat">
                  <input type="checkbox" checked={activeCheats.includes(cheat)} onChange={(e) => onCheat(cheat, e.target.checked)} />
                  {t(`settings.cheats.${cheat}`)}
                </label>
              ))}
              <label className="settings-cheat">
                {t("settings.cheats.actopi.label")}
                <select
                  value={actopiCheat}
                  onChange={(e) => isActopiCheat(e.target.value) && onActopiCheat(e.target.value)}
                >
                  {ACTOPI_CHEATS.map((mode) => (
                    <option key={mode} value={mode}>
                      {t(`settings.cheats.actopi.${mode}`)}
                    </option>
                  ))}
                </select>
              </label>
              {ROLE_CHEATS.map((role) => (
                <button key={role} type="button" onClick={() => onRoleCheat(role)}>
                  {t(`settings.cheats.role.${role}`)}
                </button>
              ))}
            </fieldset>
          )}
          <Dialog.Close className="settings-close">{t("settings.close")}</Dialog.Close>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
