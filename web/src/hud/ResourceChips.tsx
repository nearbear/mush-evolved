// Your other resources (spores, free IT points, ...) as icon and count chips: all of them in a row on desktop,
// one chip in the phone nameplate's chip row (beside AP/MP/HP/morale) showing the first two and "…", which opens them all.

import { Popover } from "@base-ui/react/popover";
import { useTranslation } from "react-i18next";
import { RESOURCE_IDS, type PlayerView } from "@mush2/shared";
import { RESOURCE_ICONS, SPORE_ICON } from "../art/assets.ts";

/** How many chips the phone nameplate shows before the "…" button. */
const COMPACT_COUNT = 2;

type Chip = { key: string; icon: string; name: string; description?: string; count: number };

function useChips(view: PlayerView): Chip[] {
  const { t } = useTranslation();
  // TODO(extras): later, show only the resources the player has a non-zero amount of.
  return [
    { key: "spores", icon: SPORE_ICON, name: t("resources.spores"), count: view.you.spores },
    ...RESOURCE_IDS.map((id) => ({
      key: id,
      icon: RESOURCE_ICONS[id],
      name: t(`resources.${id}.name`),
      description: t(`resources.${id}.desc`),
      count: view.you.resources[id],
    })),
  ];
}

export function ResourceChips({ view }: { view: PlayerView }) {
  return useChips(view).map(({ key, ...chip }) => <ResourceChip key={key} {...chip} />);
}

/** One chip with the first two resources and "…"; it opens a popover with all of them, each with its own card. */
export function CompactResourceChips({ view }: { view: PlayerView }) {
  const { t } = useTranslation();
  const chips = useChips(view);
  const shown = chips.slice(0, COMPACT_COUNT);
  return (
    <Popover.Root>
      <Popover.Trigger
        nativeButton={false}
        render={<span role="button" tabIndex={0} />}
        className="stat-chip resource-chip"
        aria-label={`${t("resources.other")}: ${shown.map((c) => `${c.name} ${c.count}`).join(", ")}`}
      >
        {shown.map((chip) => (
          <span key={chip.key} className="resource-chip-part">
            <img src={chip.icon} alt="" />
            {chip.count}
          </span>
        ))}
        {chips.length > COMPACT_COUNT && <span aria-hidden="true">…</span>}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={6} align="end">
          <Popover.Popup className="tooltip resource-rest" aria-label={t("resources.other")}>
            {chips.map(({ key, ...chip }) => (
              <ResourceChip key={key} {...chip} />
            ))}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
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
