// A row of item attribute icons (heavy, ...) styled like the status effects on a player.

import { useTranslation } from "react-i18next";
import { ITEM_ATTR_ICONS } from "../art/assets.ts";
import { StatusIcon } from "./StatusIcons.tsx";

export function ItemAttrIcons({ heavy, mpPenalty }: { heavy: boolean; mpPenalty: number }) {
  const { t } = useTranslation();
  if (!heavy) return null;
  return (
    <ul className="status-icons" aria-label={t("itemAttr.label")}>
      <li>
        <StatusIcon icon={ITEM_ATTR_ICONS.heavy} name={t("itemAttr.heavy")} description={t("itemAttr.heavyDesc", { mp: mpPenalty })} />
      </li>
    </ul>
  );
}
