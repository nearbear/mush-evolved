// A row of item attribute icons (heavy, customized, charges, plant states, spoilage, spores, jelly, shield) styled like the status effects on a player.

import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { CUSTOMIZED_BLASTER_ITEM, ITEM_TYPES, type ItemView } from "@mush2/shared";
import { CHARGES_ICON, CONTAMINATED_ICON, ITEM_ATTR_ICONS, JELLY_ICON, PLANT_ICONS, SHIELD_ICON, SPOIL_ICONS, skillIcon } from "../art/assets.ts";
import { plantStateIds } from "./PlantStates.tsx";
import { StatusIcon } from "./StatusIcons.tsx";

export interface ThingMarkIcon {
  key: string;
  icon: string;
  count: number;
  name: string;
  description: string;
}

/** Private-visibility marks with a count badge (spores, green jelly, shielding), shared by items and equipment. */
export function thingMarkIcons(
  { spores, jelly, shield }: { spores?: number | undefined; jelly?: number | undefined; shield?: number | undefined },
  t: TFunction,
): ThingMarkIcon[] {
  const marks: ThingMarkIcon[] = [];
  if (spores !== undefined) {
    marks.push({
      key: "spores",
      icon: CONTAMINATED_ICON,
      count: spores,
      name: t("itemAttr.contaminated", { level: spores }),
      description: t("itemAttr.contaminatedDesc"),
    });
  }
  if (jelly !== undefined) {
    marks.push({
      key: "jelly",
      icon: JELLY_ICON,
      count: jelly,
      name: t("itemAttr.jelly", { count: jelly }),
      description: t("itemAttr.jellyDesc"),
    });
  }
  if (shield !== undefined) {
    marks.push({
      key: "shield",
      icon: SHIELD_ICON,
      count: shield,
      name: t("itemAttr.shield", { shield }),
      description: t("itemAttr.shieldDesc"),
    });
  }
  return marks;
}

export type ItemAttrSource = Pick<ItemView, "type" | "charges" | "plant" | "spores" | "jelly" | "shield" | "spoil">;

export function ItemAttrIcons({ item, mpPenalty }: { item: ItemAttrSource; mpPenalty: number }) {
  const { t } = useTranslation();
  const heavy = ITEM_TYPES[item.type]?.heavy === true;
  const customized = item.type === CUSTOMIZED_BLASTER_ITEM;
  const hasCharges = item.charges !== undefined;
  const plantStates = item.plant ? plantStateIds(item.plant) : [];
  const marks = thingMarkIcons(item, t);
  const spoil = item.spoil;
  if (!heavy && !customized && !hasCharges && plantStates.length === 0 && spoil === undefined && marks.length === 0) return null;
  return (
    <ul className="status-icons" aria-label={t("itemAttr.label")}>
      {heavy && (
        <li key="heavy">
          <StatusIcon icon={ITEM_ATTR_ICONS.heavy} name={t("itemAttr.heavy")} description={t("itemAttr.heavyDesc", { mp: mpPenalty })} />
        </li>
      )}
      {customized && (
        <li key="customized">
          <StatusIcon icon={skillIcon("infantryman")} name={t("itemAttr.customized")} description={t("itemAttr.customizedDesc")} />
        </li>
      )}
      {hasCharges && (
        <li key="charges" className="status-count">
          <StatusIcon icon={CHARGES_ICON} name={t("itemAttr.charges", { count: item.charges })}>
            <span aria-hidden="true">{item.charges}</span>
          </StatusIcon>
        </li>
      )}
      {plantStates.map((state) => (
        <li key={state}>
          <StatusIcon icon={PLANT_ICONS[state]} name={t(`itemAttr.${state}`)} description={t(`itemAttr.${state}Desc`)} />
        </li>
      ))}
      {spoil !== undefined && (
        <li key="spoil">
          <StatusIcon icon={SPOIL_ICONS[spoil]} name={t(`itemAttr.spoil_${spoil}`)} description={t(`itemAttr.spoil_${spoil}Desc`)} visibility="private" />
        </li>
      )}
      {marks.map((mark) => (
        <li key={mark.key} className="status-count">
          <StatusIcon icon={mark.icon} name={mark.name} description={mark.description} visibility="private">
            <span aria-hidden="true">{mark.count}</span>
          </StatusIcon>
        </li>
      ))}
    </ul>
  );
}
