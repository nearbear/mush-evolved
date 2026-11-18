// A planted hydropot's states (young, thirsty, dried, sick) as the original's plant icons, styled like a
// player's statuses, plus maturation time for alien fruit species when `view.fruitEffects` exposes it.

import type { ItemView, PlayerView } from "@mush2/shared";
import { useTranslation } from "react-i18next";
import { PLANT_ICONS } from "../art/assets.ts";
import { isMushOnlyFruitLore } from "./ConsumeEffects.tsx";
import { StatusIcon } from "./StatusIcons.tsx";

export type PlantState = keyof typeof PLANT_ICONS;

export function plantStateIds(plant: NonNullable<ItemView["plant"]>): PlantState[] {
  return [
    ...(plant.age !== null ? (["young"] as const) : []),
    ...(plant.thirst === 1 ? (["thirsty"] as const) : plant.thirst === 2 ? (["dried"] as const) : []),
    ...(plant.sick ? (["sick"] as const) : []),
  ];
}

export function PlantStates({
  plant,
  view,
  icons = true,
}: {
  plant: NonNullable<ItemView["plant"]>;
  view?: PlayerView;
  icons?: boolean;
}) {
  const { t } = useTranslation();
  const states = icons ? plantStateIds(plant) : [];
  const fruit = view?.fruitEffects?.[plant.species];
  if (states.length === 0 && !fruit) return null;
  const mushWarning = fruit && view ? isMushOnlyFruitLore(view) : false;
  return (
    <>
      {states.length > 0 && (
        <ul className="status-icons" aria-label={t("itemAttr.label")}>
          {states.map((state) => (
            <li key={state}>
              <StatusIcon icon={PLANT_ICONS[state]} name={t(`itemAttr.${state}`)} description={t(`itemAttr.${state}Desc`)} />
            </li>
          ))}
        </ul>
      )}
      {fruit && (
        <p className="consume-grow">
          {t("inspect.fruitGrowCycles", { count: fruit.growCycles })}
        </p>
      )}
      {mushWarning && (
        <p className="consume-mush-warning">{t("inspect.fruitMushWarning")}</p>
      )}
    </>
  );
}
