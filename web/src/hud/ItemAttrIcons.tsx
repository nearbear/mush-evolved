// A row of item attribute icons (heavy, customized, ...) styled like the status effects on a player.

import { useTranslation } from "react-i18next";
import { ITEM_ATTR_ICONS, skillIcon } from "../art/assets.ts";
import { StatusIcon } from "./StatusIcons.tsx";

export function ItemAttrIcons({ heavy, mpPenalty, customized }: { heavy: boolean; mpPenalty: number; customized?: boolean }) {
  const { t } = useTranslation();
  if (!heavy && !customized) return null;
  return (
    <ul className="status-icons" aria-label={t("itemAttr.label")}>
      {heavy && (
        <li>
          <StatusIcon icon={ITEM_ATTR_ICONS.heavy} name={t("itemAttr.heavy")} description={t("itemAttr.heavyDesc", { mp: mpPenalty })} />
        </li>
      )}
      {customized && (
        <li>
          <StatusIcon icon={skillIcon("infantryman")} name={t("itemAttr.customized")} description={t("itemAttr.customizedDesc")} />
        </li>
      )}
    </ul>
  );
}
