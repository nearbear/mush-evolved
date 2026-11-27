// A planet sector's tag icon (`planetTagIcon`), shared by the expedition screen (ExpeditionTimeline.tsx) and the report
// (ExpeditionReportDialog.tsx). The icons are 40x40 pixel art drawn at a whole-number scale, the CSS `--zoom` of a
// parent (1 when none sets it); see styles/expedition-timeline.css.

import { Popover } from "@base-ui/react/popover";
import { planetTagIcon } from "../art/assets.ts";
import { useTranslation } from "react-i18next";
import { useKeyedSprite } from "../art/keyedSprite.ts";

/** A sector's icon; null is the unknown sector, whose art has no alpha, so its background is keyed out. */
export function SectorIcon({ sector }: { sector: string | null }) {
  // The U-turn leads back to the landing site.
  const src = planetTagIcon(sector === "U_TURN" ? "LANDING" : sector);
  const unknown = src === planetTagIcon(null);
  return unknown ? <KeyedIcon src={src} /> : <img className="sector-icon" src={src} alt="" draggable={false} />;
}

/** A sector's icon that shows its name on hover, focus or tap (a popover, so it works on phones), like StatusIcon. */
export function SectorTip({ sector }: { sector: string | null }) {
  const name = useSectorName()(sector);
  return (
    <Popover.Root>
      <Popover.Trigger openOnHover delay={200} className="status-icon" aria-label={name}>
        <SectorIcon sector={sector} />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={6}>
          <Popover.Popup className="tooltip">{name}</Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

function KeyedIcon({ src }: { src: string }) {
  const url = useKeyedSprite(src);
  return url ? <img className="sector-icon sector-icon-unknown" src={url} alt="" draggable={false} /> : <span className="sector-icon sector-icon-unknown" />;
}

/** A sector's name; the landing and the U-turn aren't sectors but are named like them. */
export function useSectorName(): (sector: string | null) => string {
  const { t } = useTranslation();
  return (sector) =>
    sector === null
      ? t("astro.unknown")
      : sector === "LANDING"
        ? t("expedition.landing")
        : sector === "U_TURN"
          ? t("expedition.uTurnHeading")
          : t(`astro.tags.${sector}` as never, { defaultValue: sector });
}
