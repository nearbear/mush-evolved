import type { BotPause, Cheat, PlayerView, RoleCheat } from "@mush2/shared";
import { useState } from "react";
import { Menu } from "@base-ui/react/menu";
import { useTranslation } from "react-i18next";
import { SETTINGS_ICON } from "../art/assets.ts";
import { useMobile } from "../useMobile.ts";
import { BotsPausedTag } from "./BotsPausedTag.tsx";
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
  botsPaused,
  onLeave,
  onResults,
  cheatsAllowed,
  onCheat,
  onRoleCheat,
  onSolCheat,
  onLeaveShip,
}: {
  view: PlayerView;
  /** Phones only: on desktop the summary is the HUD over the room (SelfHud). */
  showSummary: boolean;
  /** Offered only where End cycle is on (testing); cycles otherwise change on the server's clock. */
  canReady: boolean;
  onReady: () => void;
  /** When the next cycle begins, in server ms (null until the first view arrives, and in single player). */
  nextCycleAt: number | null;
  /** Why the AI crew is waiting on its model, pausing the cycle; null when it isn't. */
  botsPaused: BotPause | null;
  onLeave: () => void;
  /** Reopens the end screen; shown once the game has ended. */
  onResults: () => void;
  cheatsAllowed: boolean;
  onCheat: (cheat: Cheat, on: boolean) => void;
  onRoleCheat: (role: RoleCheat) => void;
  onSolCheat: () => void;
  onLeaveShip: () => void;
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
      {showSummary && <PlayerSummary view={view} countdown={nextCycleAt !== null && <CycleCountdown nextCycleAt={nextCycleAt} dot />} />}
      {/* Desktop zones (UI coherence step 5): time on the left, the ship in the middle, the actions on the right. Phones hide this one and show the cycle under the name. */}
      <div className="cycle">
        <span className="cycle-label hud-card amber">{t("topBar.dayCycle", { day: view.day, cycle: view.cycleOfDay })}</span>
        {nextCycleAt !== null && <CycleCountdown nextCycleAt={nextCycleAt} />}
        {view.preselection && <PreselectionTag />}
        {botsPaused && <BotsPausedTag pause={botsPaused} />}
      </div>
      {!mobile && <ShipResources ship={view.ship} hunters={view.hunters.count} titles={view.titles} orbit={view.navigation.orbitName} expedition={view.expedition} lost={view.lost} />}
      {/* On phones a plain wrapper (display: contents), so the menu stays a top-bar flex item. */}
      <div className="top-bar-actions">
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
          onCheat={onCheat}
          onRoleCheat={onRoleCheat}
          onSolCheat={onSolCheat}
          onLeaveShip={onLeaveShip}
          onLeave={onLeave}
          hideTrigger={mobile}
          {...(mobile ? { open: settingsOpen, onOpenChange: setSettingsOpen } : {})}
        />
      </div>
    </header>
  );
}

