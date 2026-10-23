// A planted hydropot's states (young, thirsty, dried, sick) as the original's plant icons, styled like a
// player's statuses. Sickness shows only when the view carries it, which is only for the Botanist role.

import type { ItemView } from "@mush2/shared";
import { useTranslation } from "react-i18next";
import { PLANT_ICONS } from "../art/assets.ts";
import { StatusIcon } from "./StatusIcons.tsx";

type PlantState = keyof typeof PLANT_ICONS;

export function PlantStates({ plant }: { plant: NonNullable<ItemView["plant"]> }) {
  const { t } = useTranslation();
  const states: PlantState[] = [
    ...(plant.age !== null ? (["young"] as const) : []),
    ...(plant.thirst === 1 ? (["thirsty"] as const) : plant.thirst === 2 ? (["dried"] as const) : []),
    ...(plant.sick ? (["sick"] as const) : []),
  ];
  if (states.length === 0) return null;
  return (
    <ul className="status-icons" aria-label={t("itemAttr.label")}>
      {states.map((state) => (
        <li key={state}>
          <StatusIcon icon={PLANT_ICONS[state]} name={t(`itemAttr.${state}`)} description={t(`itemAttr.${state}Desc`)} />
        </li>
      ))}
    </ul>
  );
}
