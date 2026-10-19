// Everything about you, under the room: your summary, with a row of other resources under it.
// On phones the summary lives in the top bar instead. Items are in the room view's InventoryOverlay.

import { Popover } from "@base-ui/react/popover";
import { useTranslation } from "react-i18next";
import { RESOURCE_IDS, type Action, type PlayerView } from "@mush2/shared";
import { RESOURCE_ICONS, SPORE_ICON } from "../art/assets.ts";
import { PlayerSummary } from "./PlayerSummary.tsx";

export function SelfPanel({ view, showSummary, onAction }: { view: PlayerView; showSummary: boolean; onAction: (action: Action) => void }) {
  const { t } = useTranslation();
  return (
    <section className="panel self-panel">
      {showSummary && (
        <div className="self-main">
          <PlayerSummary view={view} />
        </div>
      )}
      {/* Home for resources that belong nowhere else (spores, free IT points, ...). */}
      <aside className="self-extras" aria-label={t("resources.other")}>
        {/* TODO(extras): later, show only the resources the player has a non-zero amount of. */}
        <ResourceChip icon={SPORE_ICON} name={t("resources.spores")} count={view.you.spores} />
        {RESOURCE_IDS.map((id) => (
          <ResourceChip
            key={id}
            icon={RESOURCE_ICONS[id]}
            name={t(`resources.${id}.name`)}
            description={t(`resources.${id}.desc`)}
            count={view.you.resources[id]}
          />
        ))}
      </aside>
      <Credits />
    </section>
  );
}

/** An icon and a count; the name (and description) open in a popover on hover, focus, or tap (touch has no hover). */
function ResourceChip({ icon, name, description, count }: { icon: string; name: string; description?: string; count: number }) {
  return (
    <Popover.Root>
      <Popover.Trigger
        openOnHover
        delay={200}
        nativeButton={false}
        render={<span role="button" tabIndex={0} />}
        className="resource"
        aria-label={`${name}: ${count}`}
      >
        <img src={icon} alt="" />
        {count}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={6}>
          <Popover.Popup className="tooltip resource-card">
            <strong>{name}</strong>
            {description && <p>{description}</p>}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
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
