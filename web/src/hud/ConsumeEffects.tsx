// What eating or drinking an item does, one effect per line (amount then icon, `StatAmounts`), read from the shared item table (static data, not game state).

import {
  isAlienFruitType,
  FRUIT_LORE_SKILLS,
  ITEM_TYPES,
  type FruitBuffId,
  type PlayerView,
} from "@mush2/shared";
import { useTranslation } from "react-i18next";
import { consumeDeltas, StatAmounts } from "./StatAmount.tsx";

const FRUIT_BUFF_KEYS = {
  treat_disease: "inspect.fruitBuffs.treat_disease",
  energize: "inspect.fruitBuffs.energize",
  resistance: "inspect.fruitBuffs.resistance",
  perception: "inspect.fruitBuffs.perception",
} as const satisfies Record<FruitBuffId, string>;

export function hasHumanFruitLore(view: PlayerView): boolean {
  return FRUIT_LORE_SKILLS.some(
    (s) => view.you.skills.includes(s) || view.you.bookSkill === s,
  );
}

export function isMushOnlyFruitLore(view: PlayerView): boolean {
  return view.you.role === "mush" && !hasHumanFruitLore(view);
}

export function ConsumeEffects({
  type,
  view,
}: {
  type: string;
  view: PlayerView;
}) {
  const { t } = useTranslation();
  const consume = ITEM_TYPES[type]?.consume;
  if (!consume) return null;
  // A drug's effects are drawn per ship and only some players know them (`view.drugEffects`).
  const isDrug = ITEM_TYPES[type]?.drug === true;
  const drug = isDrug ? view.drugEffects?.[type] : undefined;
  if (isDrug && !drug)
    return <p className="consume-unknown">{t("itemAttr.drugUnknown")}</p>;
  // Alien fruit species (`fruit01`–`fruit12`) and their graft hybrids (#438) are likewise drawn per ship and revealed
  // only via `view.fruitEffects`.
  const isAlienFruit = isAlienFruitType(type);
  const fruit = isAlienFruit ? view.fruitEffects?.[type] : undefined;
  if (isAlienFruit && !fruit)
    return <p className="consume-unknown">{t("inspect.fruitUnknown")}</p>;
  const shown = consumeDeltas(type, view);
  const treats = drug?.treats ?? [];
  if (shown.length === 0 && treats.length === 0 && !fruit) return null;
  const mushWarning = fruit ? isMushOnlyFruitLore(view) : false;
  return (
    <>
      <StatAmounts deltas={shown} className="consume-effects" />
      {treats.length > 0 && (
        <p className="consume-treats">
          {t("itemAttr.drugTreats", {
            diseases: treats
              .map((d) => t(`status.${d}`, { defaultValue: d }))
              .join(", "),
          })}
        </p>
      )}
      {fruit && fruit.buffs.length > 0 && (
        <ul className="consume-buffs">
          {fruit.buffs.map((buff) => (
            <li key={buff}>{t(FRUIT_BUFF_KEYS[buff])}</li>
          ))}
        </ul>
      )}
      {fruit && fruit.diseases.length > 0 && (
        <p className="consume-diseases">
          {fruit.diseases
            .map((d) =>
              t("inspect.fruitDiseaseOdds", {
                disease: t(`status.${d.id}`, {
                  defaultValue: t(d.id as never, { defaultValue: d.id }),
                }),
                percent: Math.round(d.odds * 100),
              }),
            )
            .join(", ")}
        </p>
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
