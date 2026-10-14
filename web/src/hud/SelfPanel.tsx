// Everything about you, under the room: your summary, the room's items (left),
// and your inventory (right). On phones the summary lives in the top bar instead.

import type { Action, PlayerView, Target } from "@mush2/shared";
import { InventoryPanel } from "./InventoryPanel.tsx";
import { PlayerSummary } from "./PlayerSummary.tsx";

export function SelfPanel({
  view,
  selected,
  showSummary,
  onAction,
  onSelect,
}: {
  view: PlayerView;
  selected: Target;
  showSummary: boolean;
  onAction: (action: Action) => void;
  onSelect: (target: Target) => void;
}) {
  return (
    <section className="panel self-panel">
      {showSummary && <PlayerSummary view={view} />}
      <InventoryPanel view={view} selected={selected} onAction={onAction} onSelect={onSelect} />
      <Credits />
    </section>
  );
}

function Credits() {
  return (
    <footer className="credits">
      Art from <em>Mush</em> by Motion Twin (
      <a href="https://github.com/motion-twin/WebGamesArchives">WebGamesArchives</a>), licensed{" "}
      <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/">CC BY-NC-SA 4.0</a>. Adapted. Not affiliated with Motion Twin.
    </footer>
  );
}
