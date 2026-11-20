// A shared planet's sector slots as a row of tag icons (docs/plans/expedition-ui.md, "Sharing planets with sectors"):
// what the sharer chose for each sector, unknown included. Shown in the Astrophysics feature and on the expedition
// screen; the icons are named for screen readers.

import type { PlanetTag } from "@mush2/shared";
import { useTranslation } from "react-i18next";
import { SectorIcon, useSectorName } from "./SectorIcon.tsx";

export function SharedSectors({ sectors }: { sectors: readonly (PlanetTag | null)[] }) {
  const { t } = useTranslation();
  const sectorName = useSectorName();
  if (sectors.length === 0) return null;
  return (
    <ul className="shared-sectors" aria-label={t("astro.sharedSectors")}>
      {sectors.map((tag, i) => (
        <li key={i}>
          <SectorIcon sector={tag} />
          <span className="sr-only">{sectorName(tag)}</span>
        </li>
      ))}
    </ul>
  );
}
