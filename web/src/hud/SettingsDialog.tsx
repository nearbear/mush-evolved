// The settings button and its dialog. Options apply immediately; there is no Save button.
// Uses the global Mush `button` style; only layout is set in settings.css.

import { ACTOPI_CHEATS, CHEATS, ROLE_CHEATS, isActopiCheat, type ActopiCheat, type Cheat, type RoleCheat } from "@mush2/shared";
import { DialogHeader } from "./DialogHeader.tsx";
import { Hint } from "./IconButton.tsx";
import { Dialog } from "@base-ui/react/dialog";
import { Tabs } from "@base-ui/react/tabs";
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
  onLeave,
  open,
  onOpenChange,
  hideTrigger = false,
}: {
  /** The server's dev flag. Without it the Cheats tab is not drawn at all. */
  cheatsAllowed: boolean;
  activeCheats: readonly Cheat[];
  actopiCheat: ActopiCheat;
  onCheat: (cheat: Cheat, on: boolean) => void;
  onActopiCheat: (mode: ActopiCheat) => void;
  onRoleCheat: (role: RoleCheat) => void;
  onLeave: () => void;
  /** Controlled mode, for opening the dialog from another control (the phone menu). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Leave out the gear button when something else opens the dialog. */
  hideTrigger?: boolean;
}) {
  const { t } = useTranslation();
  const fogDepth = useFogDepth();
  const allOn = CHEATS.every((c) => activeCheats.includes(c));
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      {!hideTrigger && (
        <Hint label={t("settings.open")}>
          <Dialog.Trigger className="settings-button" aria-label={t("settings.open")}>
            <img className="settings-icon" src={SETTINGS_ICON} alt="" />
          </Dialog.Trigger>
        </Hint>
      )}
      <Dialog.Portal>
        <Dialog.Backdrop className="settings-backdrop" />
        <Dialog.Popup className="settings-popup">
          <DialogHeader heading={t("settings.title")} closeLabel={t("settings.close")} />
          <Tabs.Root className="settings-tabs" defaultValue={cheatsAllowed ? "cheats" : "general"}>
            <Tabs.List className="settings-tab-list">
              <Tabs.Tab className="settings-tab" value="general">{t("settings.tabs.general")}</Tabs.Tab>
              {cheatsAllowed && <Tabs.Tab className="settings-tab" value="cheats">{t("settings.tabs.cheats")}</Tabs.Tab>}
            </Tabs.List>
            <Tabs.Panel className="settings-panel" value="general">
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
              <button type="button" onClick={onLeave}>{t("topBar.leave")}</button>
            </Tabs.Panel>
            {cheatsAllowed && (
              <Tabs.Panel className="settings-panel" value="cheats">
            <fieldset className="settings-cheats">
              <div className="settings-cheat-grid">
              {CHEATS.map((cheat) => (
                <label key={cheat} className="settings-cheat">
                  <input type="checkbox" checked={activeCheats.includes(cheat)} onChange={(e) => onCheat(cheat, e.target.checked)} />
                  {t(`settings.cheats.${cheat}`)}
                </label>
              ))}
              </div>
              <button type="button" onClick={() => {
                  for (const c of CHEATS) if (activeCheats.includes(c) === allOn) onCheat(c, !allOn);
                }}>
                {t(allOn ? "settings.cheats.disableAll" : "settings.cheats.enableAll")}
              </button>
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
              </Tabs.Panel>
            )}
          </Tabs.Root>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
