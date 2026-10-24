// Your other resources (spores, free IT points, ...) as icon and count chips, showing the first two (desktop) or as many as fit (phone) and "…", which opens
// them all: one chip in the phone nameplate's chip row (beside AP/MP/HP/morale), or a card stacking them on desktop.

import { Popover } from "@base-ui/react/popover";
import { useTranslation } from "react-i18next";
import { RESOURCE_IDS, type PlayerView } from "@mush2/shared";
import { RESOURCE_ICONS, SPORE_ICON } from "../art/assets.ts";

/** How many resources show before the "…" (the desktop card fits two rows beside the stat cards). */
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

/**
 * The first two resources and "…"; it opens a popover with all of them, each with its own card. `stacked` is the
 * desktop card: the resources one above the other, and the popover also opens on hover (it still opens on tap).
 */
export function CompactResourceChips({ view, stacked = false }: { view: PlayerView; stacked?: boolean }) {
  const { t, i18n } = useTranslation();
  const chips = useChips(view);
  // The phone chip lists every resource and lets CSS cut it off with a "…" where the nameplate's width runs out.
  const shown = stacked ? chips.slice(0, COMPACT_COUNT) : chips;
  const list = new Intl.ListFormat(i18n.language, { type: "unit" }).format(shown.map((c) => t("resources.amount", { name: c.name, count: c.count })));
  return (
    <Popover.Root>
      <Popover.Trigger
        openOnHover={stacked}
        delay={200}
        nativeButton={false}
        render={<span role="button" tabIndex={0} />}
        className={stacked ? "resource-stack" : "stat-chip resource-chip"}
        aria-label={t("resources.otherSummary", { list })}
      >
        {shown.map((chip) => (
          <span key={chip.key} className="resource-chip-part">
            <img src={chip.icon} alt="" />
            {chip.count}
          </span>
        ))}
        {stacked && chips.length > COMPACT_COUNT && <span aria-hidden="true">…</span>}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={6} align={stacked ? "center" : "end"}>
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
