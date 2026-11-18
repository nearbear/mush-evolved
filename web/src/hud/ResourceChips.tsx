// Your other resources (satiety first, then spores, free IT points, ...) as icons and counts, and a popover with them all:
// on desktop a row of the first three and "…" at the ID card's foot (SelfHud); on phones a dark column the ID card's full height, two rows
// deep, with as many columns as fit beside AP/MP and HP/morale, the last cell a "…" when some don't (PlayerSummary).

import { Popover } from "@base-ui/react/popover";
import { useLayoutEffect, useState, type ReactNode, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import { RESOURCE_IDS, resourceAvailable, type PlayerView } from "@mush2/shared";
import { RESOURCE_ICONS, SATIETY_ICON, SPORE_ICON } from "../art/assets.ts";
import { useSatietyLines } from "./SatietyInfo.tsx";

/** How many resources show before the "…" (what fits in a row across the desktop ID card). */
const COMPACT_COUNT = 3;

type Chip = { key: string; icon: string; name: string; description?: string; count: number };

/** Satiety leads the list: it has no place of its own on either layout. */
function useChips(view: PlayerView): Chip[] {
  const { t } = useTranslation();
  const { spores, resources, skills, bookSkill, role, satiety } = view.you;
  const satietyLines = useSatietyLines(view);
  // Only resources this player could use: held, or granted by one of their skills (spores: Mush only).
  return [
    { key: "satiety", icon: SATIETY_ICON, name: t("stat.satiety"), description: satietyLines.join(" "), count: satiety },
    ...(spores > 0 || role === "mush" ? [{ key: "spores", icon: SPORE_ICON, name: t("resources.spores"), count: spores }] : []),
    ...RESOURCE_IDS.filter((id) => resourceAvailable(id, resources[id], skills, bookSkill)).map((id) => ({
      key: id,
      icon: RESOURCE_ICONS[id],
      name: t(`resources.${id}.name`),
      description: t(`resources.${id}.desc`),
      count: view.you.resources[id],
    })),
  ];
}

/** The trigger (`className`, holding `children`) opens a popover with every resource, each with its own card. */
function AllResources({ chips, shown, hover, align, className, children }: { chips: Chip[]; shown: Chip[]; hover: boolean; align: "center" | "end"; className?: string; children: ReactNode }) {
  const { t, i18n } = useTranslation();
  const list = new Intl.ListFormat(i18n.language, { type: "unit" }).format(shown.map((c) => t("resources.amount", { name: c.name, count: c.count })));
  return (
    <Popover.Root>
      <Popover.Trigger
        openOnHover={hover}
        delay={200}
        nativeButton={false}
        render={<span role="button" tabIndex={0} />}
        className={className}
        aria-label={t("resources.otherSummary", { list })}
      >
        {children}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={6} align={align}>
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

/**
 * Desktop: the first three resources in a row, as the phone's chips. When there are more, "…" follows and the row opens a popover with them
 * all (on hover too; it still opens on tap); when they all show, it is a plain row, as the phone grid is when nothing is cut.
 */
export function CompactResourceChips({ view }: { view: PlayerView }) {
  const { t, i18n } = useTranslation();
  const chips = useChips(view);
  const shown = chips.slice(0, COMPACT_COUNT);
  const parts = shown.map((chip) => (
    <span key={chip.key} className="stat-chip resource-cell">
      <img src={chip.icon} alt="" />
      {chip.count}
    </span>
  ));
  if (chips.length <= COMPACT_COUNT) {
    const list = new Intl.ListFormat(i18n.language, { type: "unit" }).format(shown.map((c) => t("resources.amount", { name: c.name, count: c.count })));
    return (
      <span className="resource-stack" role="group" aria-label={t("resources.otherSummary", { list })}>
        {parts}
      </span>
    );
  }
  return (
    <AllResources chips={chips} shown={shown} hover align="center" className="resource-stack">
      {parts}
      <span className="stat-chip resource-cell" aria-hidden="true">
        …
      </span>
    </AllResources>
  );
}

/**
 * Phones: every resource as a chip in a grid two rows deep that fills its columns top to bottom and is cut off where the
 * ID card's width runs out. Every chip stays laid out (the ones past the edge invisible), so measuring never moves
 * anything; when some don't fit, the last one that does shows "…" in its place. Tapping anywhere opens them all.
 */
export function ResourceGrid({ view, gridRef }: { view: PlayerView; gridRef: RefObject<HTMLDivElement | null> }) {
  const chips = useChips(view);
  // How many chips fit whole; all of them until measured.
  const [fit, setFit] = useState(chips.length);
  const signature = chips.map((c) => `${c.key}:${c.count}`).join();
  // biome-ignore lint/correctness/useExhaustiveDependencies: signature stands in for the chips: a chip coming or going, or a count changing width, moves the cells without resizing the grid.
  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const measure = () => {
      const width = grid.clientWidth;
      if (width === 0) return; // hidden
      const cells = [...grid.querySelectorAll<HTMLElement>(".resource-cell")];
      const whole = cells.filter((c) => c.offsetLeft + c.offsetWidth <= width + 0.5).length;
      setFit(Math.max(1, whole));
    };
    const resized = new ResizeObserver(measure);
    resized.observe(grid);
    measure();
    return () => resized.disconnect();
  }, [signature, gridRef]);
  const cut = fit < chips.length;
  // The "…" takes the last whole cell, so one fewer resource shows.
  const visible = cut ? fit - 1 : chips.length;
  return (
    <>
      {chips.map((chip, i) => {
        const isMore = cut && i === visible;
        const content = (
          <>
            <img src={chip.icon} alt="" />
            {chip.count}
          </>
        );
        return isMore ? (
          <AllResources key={chip.key} chips={chips} shown={chips.slice(0, visible)} hover={false} align="end" className="stat-chip resource-cell more">
            {content}
          </AllResources>
        ) : (
          <span key={chip.key} className="stat-chip resource-cell" data-cut={i > visible || undefined}>
            {content}
          </span>
        );
      })}
    </>
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
