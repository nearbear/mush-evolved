import type { ActopiCheat, Cheat, PlayerView, RoleCheat } from "@mush2/shared";
import { useState } from "react";
import { Menu } from "@base-ui/react/menu";
import { useTranslation } from "react-i18next";
import { SETTINGS_ICON } from "../art/assets.ts";
import { useMobile } from "../useMobile.ts";
import { PlayerSummary } from "./PlayerSummary.tsx";
import { SettingsDialog } from "./SettingsDialog.tsx";

export function TopBar({
  view,
  showSummary,
  canReady,
  onReady,
  onLeave,
  cheatsAllowed,
  onCheat,
  onActopiCheat,
  onRoleCheat,
}: {
  view: PlayerView;
  /** Phones only: on desktop the summary is in the self panel. */
  showSummary: boolean;
  canReady: boolean;
  onReady: () => void;
  onLeave: () => void;
  cheatsAllowed: boolean;
  onCheat: (cheat: Cheat, on: boolean) => void;
  onActopiCheat: (mode: ActopiCheat) => void;
  onRoleCheat: (role: RoleCheat) => void;
}) {
  const { you } = view;
  const { t } = useTranslation();
  const mobile = useMobile();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const endCycleLabel = you.ready ? (
    <>
      Waiting<span className="wide-only"> for others</span>…
    </>
  ) : (
    "End cycle"
  );
  const leaveLabel = "Leave";
  return (
    <header className="top-bar">
      {showSummary && <PlayerSummary view={view} compact />}
      <span className="cycle">Day {view.day} · Cycle {view.cycleOfDay}</span>
      <span className="spacer" />
      {mobile ? (
        // Phones: both actions live in a hamburger menu to save top bar space.
        <Menu.Root>
          <Menu.Trigger className="menu-button" aria-label={t("menu.open")}>
            <svg width="16" height="12" viewBox="0 0 16 12" aria-hidden="true">
              <path d="M0 1h16M0 6h16M0 11h16" stroke="currentColor" strokeWidth="2" />
            </svg>
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Positioner sideOffset={6} align="end" className="menu-positioner">
              <Menu.Popup className="menu-popup">
                <Menu.Item render={<button />} disabled={!canReady} onClick={onReady}>
                  {endCycleLabel}
                </Menu.Item>
                <Menu.Item render={<button />} onClick={() => setSettingsOpen(true)}>
                  <img className="menu-item-icon" src={SETTINGS_ICON} alt="" />
                  {t("settings.title")}
                </Menu.Item>
                <Menu.Item render={<button />} onClick={onLeave}>
                  {leaveLabel}
                </Menu.Item>
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
      ) : (
        <>
          <button disabled={!canReady} onClick={onReady}>
            {endCycleLabel}
          </button>
          <button onClick={onLeave}>{leaveLabel}</button>
        </>
      )}
      <SettingsDialog
        cheatsAllowed={cheatsAllowed}
        activeCheats={you.cheats}
        actopiCheat={you.actopiCheat}
        onCheat={onCheat}
        onActopiCheat={onActopiCheat}
        onRoleCheat={onRoleCheat}
        hideTrigger={mobile}
        {...(mobile ? { open: settingsOpen, onOpenChange: setSettingsOpen } : {})}
      />
    </header>
  );
}
