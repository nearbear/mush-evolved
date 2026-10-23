// Everything about you, under the room on desktop: your summary (portrait, stats, and other resources in one row).
// On phones the summary lives in the top bar instead. Items are in the room view's InventoryOverlay.

import type { PlayerView } from "@mush2/shared";
import { PlayerSummary } from "./PlayerSummary.tsx";

export function SelfPanel({ view }: { view: PlayerView }) {
  return (
    <section className="panel self-panel">
      <PlayerSummary view={view} />
    </section>
  );
}
