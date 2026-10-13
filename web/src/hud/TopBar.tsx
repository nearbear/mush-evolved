import type { PlayerView } from "@mush2/shared";
import { PlayerSummary } from "./PlayerSummary.tsx";

export function TopBar({
  view,
  showSummary,
  canReady,
  onReady,
  onLeave,
}: {
  view: PlayerView;
  /** Phones only: on desktop the summary is in the self panel. */
  showSummary: boolean;
  canReady: boolean;
  onReady: () => void;
  onLeave: () => void;
}) {
  const { you } = view;
  return (
    <header className="top-bar">
      {showSummary && <PlayerSummary view={view} />}
      <span className="cycle">Cycle {view.cycle}</span>
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
    </header>
  );
}
