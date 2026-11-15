// The settings button and its dialog. Options apply immediately; there is no Save button.
// Uses the global Mush `button` style and the terminal frame (FramedDialog).

import { CHEATS, type Cheat, type RoleCheat } from "@mush2/shared";
import { AccountSettings } from "../account/AccountSettings.tsx";
import { Credits } from "./Credits.tsx";
import { FramedDialog } from "./FramedDialog.tsx";
import { Hint } from "./IconButton.tsx";
import { Dialog } from "@base-ui/react/dialog";
import { Tabs } from "@base-ui/react/tabs";
import { useTranslation } from "react-i18next";
import { SETTINGS_ICON } from "../art/assets.ts";
import { parseVerbosity, setVerbosity, useVerbosity } from "../announce.ts";
import { parseFogDepth, setFogDepth, useFogDepth } from "../fogDepth.ts";
import { LanguageSwitcher } from "../i18n/LanguageSwitcher.tsx";
import { resetTips, setTipsOn, useTipPrefs } from "../tips.ts";
import "./settings.css";
import "./terminal.css";

/** Cheats that explain themselves in a tooltip on their label. */
const CHEAT_HINTS: Partial<Record<Cheat, "settings.cheatHints.fastExpeditions">> = {
  fastExpeditions: "settings.cheatHints.fastExpeditions",
};

const ROLE_BUTTON_ORDER: readonly RoleCheat[] = ["human", "mush"];

export function SettingsDialog({
  cheatsAllowed,
  activeCheats,
  onCheat,
  onRoleCheat,
  onCheatRoom,
  onLeaveShip,
  onLeave,
  open,
  onOpenChange,
  hideTrigger = false,
}: {
  /** The server's dev flag. Without it the Cheats tab is not drawn at all. */
  cheatsAllowed: boolean;
  activeCheats: readonly Cheat[];
  onCheat: (cheat: Cheat, on: boolean) => void;
  onRoleCheat: (role: RoleCheat) => void;
  /** Go to the cheat room (#170). Absent on a ship without one, and while you're in it. */
  onCheatRoom?: (() => void) | undefined;
  /** Leave ship (cheat): the server frees the account and closes the socket, which sends the client to the lobby. */
  onLeaveShip: () => void;
  /** Back to the lobby. The seat stays this account's: the lobby boards it back onto the same ship. */
  onLeave: () => void;
  /** Controlled mode, for opening the dialog from another control (the phone menu). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Leave out the gear button when something else opens the dialog. */
  hideTrigger?: boolean;
}) {
  const { t } = useTranslation();
  const fogDepth = useFogDepth();
  const verbosity = useVerbosity();
  const tips = useTipPrefs();
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
      <FramedDialog heading={t("settings.title")} closeLabel={t("settings.close")}>
        <Tabs.Root className="settings-tabs" defaultValue={cheatsAllowed ? "cheats" : "general"}>
          <Tabs.List className="settings-tab-list">
            <Tabs.Tab className="settings-tab" value="general">{t("settings.tabs.general")}</Tabs.Tab>
            <Tabs.Tab className="settings-tab" value="account">{t("settings.tabs.account")}</Tabs.Tab>
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
        <label className="settings-row">
          <span>{t("settings.announce.label")}</span>
          <select value={verbosity} onChange={(e) => setVerbosity(parseVerbosity(e.target.value))}>
            <option value="all">{t("settings.announce.all")}</option>
            <option value="mentions">{t("settings.announce.mentions")}</option>
            <option value="off">{t("settings.announce.off")}</option>
          </select>
        </label>
        <div className="settings-row">
          <label>
            <input type="checkbox" checked={tips.on} onChange={(e) => setTipsOn(e.target.checked)} /> {t("settings.tips.show")}
          </label>
          <button type="button" onClick={resetTips} disabled={tips.muted.length === 0 && tips.snoozed.length === 0}>
            {t("settings.tips.reset")}
          </button>
        </div>
            <button type="button" onClick={onLeave}>{t("topBar.mainMenu")}</button>
            <Credits as="p" className="settings-credits" />
          </Tabs.Panel>
          <Tabs.Panel className="settings-panel" value="account">
            <AccountSettings onLeave={onLeave} />
          </Tabs.Panel>
          {cheatsAllowed && (
            <Tabs.Panel className="settings-panel" value="cheats">
          <fieldset className="settings-cheats">
            <div className="settings-cheat-grid">
            {CHEATS.map((cheat) => {
              const box = (
                <label key={cheat} className="settings-cheat">
                  <input type="checkbox" checked={activeCheats.includes(cheat)} onChange={(e) => onCheat(cheat, e.target.checked)} />
                  {t(`settings.cheats.${cheat}`)}
                </label>
              );
              const hint = CHEAT_HINTS[cheat];
              return hint ? <Hint key={cheat} label={t(hint)}>{box}</Hint> : box;
            })}
            </div>
            <button type="button" onClick={() => {
                for (const c of CHEATS) if (activeCheats.includes(c) === allOn) onCheat(c, !allOn);
              }}>
              {t(allOn ? "settings.cheats.disableAll" : "settings.cheats.enableAll")}
            </button>
            <div className="settings-cheat-row">
              {ROLE_BUTTON_ORDER.map((role) => (
                <button key={role} type="button" onClick={() => onRoleCheat(role)}>
                  {t(`settings.cheats.role.${role}`)}
                </button>
              ))}
            </div>
            {onCheatRoom && <button type="button" onClick={onCheatRoom}>{t("settings.cheats.goToCheatRoom")}</button>}
            <button type="button" onClick={onLeaveShip}>{t("settings.cheats.leaveShip")}</button>
          </fieldset>
            </Tabs.Panel>
          )}
        </Tabs.Root>
      </FramedDialog>
    </Dialog.Root>
  );
}
