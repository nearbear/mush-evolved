// A shared planet's sector slots as a row of tag icons (docs/plans/archive/expedition-ui.md, "Sharing planets with sectors"):
// what the sharer chose for each sector, unknown included. Shown in the Astrophysics feature and on the expedition
// screen; each icon names its sector on hover or tap.

import type { PlanetTag } from "@mush2/shared";
import { useTranslation } from "react-i18next";
import { SectorTip } from "./SectorIcon.tsx";

export function SharedSectors({ sectors }: { sectors: readonly (PlanetTag | null)[] }) {
  const { t } = useTranslation();
  if (sectors.length === 0) return null;
  return (
    <ul className="shared-sectors" aria-label={t("astro.sharedSectors")}>
      {sectors.map((tag, i) => (
        <li key={i}>
          <SectorTip sector={tag} />
        </li>
      ))}
    </ul>
  );
}
