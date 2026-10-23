// Everything about you, under the room: your summary, with a row of other resources under it.
// On phones the summary and the resources live in the top bar instead. Items are in the room view's InventoryOverlay.

import { Trans, useTranslation } from "react-i18next";
import type { Action, PlayerView } from "@mush2/shared";
import { PlayerSummary } from "./PlayerSummary.tsx";
import { ResourceChips } from "./ResourceChips.tsx";

export function SelfPanel({ view, showSummary, onAction }: { view: PlayerView; showSummary: boolean; onAction: (action: Action) => void }) {
  const { t } = useTranslation();
  return (
    <section className="panel self-panel">
      {showSummary && (
        <div className="self-main">
          <PlayerSummary view={view} />
        </div>
      )}
      {/* Home for resources that belong nowhere else (spores, free IT points, ...). On phones they're in the top bar's nameplate. */}
      {showSummary && (
        <aside className="self-extras" aria-label={t("resources.other")}>
          <ResourceChips view={view} />
        </aside>
      )}
      <Credits />
    </section>
  );
}

function Credits() {
  return (
    <footer className="credits">
      <Trans
        i18nKey="credits.text"
        components={{
          mush: <em />,
          archive: <a href="https://github.com/motion-twin/WebGamesArchives" />,
          license: <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/" />,
        }}
      />
    </footer>
  );
}
