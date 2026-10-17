import type { ActopiCheat, Cheat, PlayerView, RoleCheat } from "@mush2/shared";
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
  return (
    <header className="top-bar">
      {showSummary && <PlayerSummary view={view} />}
      <span className="cycle">Day {view.day} · Cycle {view.cycleOfDay}</span>
      <span className="spacer" />
      <button disabled={!canReady} onClick={onReady}>
        {you.ready ? (
          <>
            Waiting<span className="wide-only"> for others</span>…
          </>
        ) : (
          "End cycle"
        )}
      </button>
      <button onClick={onLeave}>Leave</button>
      <SettingsDialog cheatsAllowed={cheatsAllowed} activeCheats={you.cheats} actopiCheat={you.actopiCheat} onCheat={onCheat} onActopiCheat={onActopiCheat} onRoleCheat={onRoleCheat} />
    </header>
  );
}
