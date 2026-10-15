// Everything about you, under the room: your summary, the room's items (left),
// and your inventory, plus a card on the far right for other resources. On phones the summary lives in the top bar instead.

import { useTranslation } from "react-i18next";
import type { Action, PlayerView, Target } from "@mush2/shared";
import { SPORE_ICON } from "../art/assets.ts";
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
  const { t } = useTranslation();
  return (
    <section className="panel self-panel">
      <div className="self-main">
        {showSummary && <PlayerSummary view={view} />}
        <InventoryPanel view={view} selected={selected} onAction={onAction} onSelect={onSelect} />
      </div>
      {/* Home for resources that belong nowhere else (spores, free IT points, ...). */}
      <aside className="self-extras" aria-label={t("resources.other")}>
        {/* TODO(extras): placeholder to show the shape (icon + number, stacked); real resources come later. */}
        <div className="resource" title={t("resources.spores")}>
          <img src={SPORE_ICON} alt="" />
          99
        </div>
      </aside>
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
