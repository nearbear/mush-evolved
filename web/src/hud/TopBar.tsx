import type { ActopiCheat, Cheat, PlayerView, RoleCheat } from "@mush2/shared";
import { useState } from "react";
import { Menu } from "@base-ui/react/menu";
import { useTranslation } from "react-i18next";
import { SETTINGS_ICON } from "../art/assets.ts";
import { useMobile } from "../useMobile.ts";
import { CycleCountdown } from "./CycleCountdown.tsx";
import { PlayerSummary } from "./PlayerSummary.tsx";
import { PreselectionTag } from "./PreselectionTag.tsx";
import { ShipResources } from "./ShipResources.tsx";
import { SettingsDialog } from "./SettingsDialog.tsx";

export function TopBar({
  view,
  showSummary,
  canReady,
  onReady,
  nextCycleAt,
  clockOffset,
  onLeave,
  onResults,
  cheatsAllowed,
  onCheat,
  onActopiCheat,
  onRoleCheat,
}: {
  view: PlayerView;
  /** Phones only: on desktop the summary is in the self panel. */
  showSummary: boolean;
  /** Offered only where End cycle is on (testing); cycles otherwise change on the server's clock. */
  canReady: boolean;
  onReady: () => void;
  /** When the next cycle begins, in server ms (null until the first view arrives). */
  nextCycleAt: number | null;
  /** Server clock minus this one. */
  clockOffset: number;
  onLeave: () => void;
  /** Reopens the end screen; shown once the game has ended. */
  onResults: () => void;
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
      {mobile ? t("topBar.waiting") : t("topBar.waitingForOthers")}
    </>
  ) : (
    t("topBar.endCycle")
  );
  // Ready can't be offered while you already are, so the button stays (disabled, "Waiting…") until the cycle ends.
  const showReady = canReady || you.ready;
  const ended = view.phase === "ended";
  return (
    <header className="top-bar">
      {showSummary && <PlayerSummary view={view} compact countdown={nextCycleAt !== null && <CycleCountdown nextCycleAt={nextCycleAt} clockOffset={clockOffset} />} />}
      <span className="cycle">
        Day {view.day} · Cycle {view.cycleOfDay}
        {nextCycleAt !== null && <CycleCountdown nextCycleAt={nextCycleAt} clockOffset={clockOffset} />}
        {view.preselection && <PreselectionTag />}
      </span>
      <span className="spacer" />
      {!mobile && <ShipResources ship={view.ship} hunters={view.hunters.count} titles={view.titles} />}
      {mobile ? (
        // Phones: the actions live in a hamburger menu to save top bar space.
        <Menu.Root>
          <Menu.Trigger className="menu-button" aria-label={t("menu.open")}>
            <svg width="16" height="12" viewBox="0 0 16 12" aria-hidden="true">
              <path d="M0 1h16M0 6h16M0 11h16" stroke="currentColor" strokeWidth="2" />
            </svg>
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Positioner sideOffset={6} align="end" className="menu-positioner">
              <Menu.Popup className="menu-popup">
                {ended && (
                  <Menu.Item render={<button type="button" />} onClick={onResults}>
                    {t("gameOver.results")}
                  </Menu.Item>
                )}
                {showReady && (
                  <Menu.Item render={<button type="button" />} disabled={!canReady} onClick={onReady}>
                    {endCycleLabel}
                  </Menu.Item>
                )}
                <Menu.Item render={<button type="button" />} onClick={() => setSettingsOpen(true)}>
                  <img className="menu-item-icon" src={SETTINGS_ICON} alt="" />
                  {t("settings.title")}
                </Menu.Item>
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
      ) : (
        <>
          {ended && (
            <button type="button" onClick={onResults}>
              {t("gameOver.results")}
            </button>
          )}
          {showReady && (
            <button type="button" disabled={!canReady} onClick={onReady}>
              {endCycleLabel}
            </button>
          )}
        </>
      )}
      <SettingsDialog
        cheatsAllowed={cheatsAllowed}
        activeCheats={you.cheats}
        actopiCheat={you.actopiCheat}
        onCheat={onCheat}
        onActopiCheat={onActopiCheat}
        onRoleCheat={onRoleCheat}
        onLeave={onLeave}
        hideTrigger={mobile}
        {...(mobile ? { open: settingsOpen, onOpenChange: setSettingsOpen } : {})}
      />
    </header>
  );
}

