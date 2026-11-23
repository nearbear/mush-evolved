// A resource gain or loss drawn as its signed amount followed by the resource's icon ("+1" then the AP gem), the one
// look for food, drug and fruit effects everywhere (consumable tooltips, the Hydroponics center, the Botany card).

import { isAlienFruitType, ITEM_TYPES, type PlayerView } from "@mush2/shared";
import { useTranslation } from "react-i18next";
import { AP_SLOT_ICON, HP_ICON, MORALE_ICON, MP_SLOT_ICON, SATIETY_ICON } from "../art/assets.ts";

export type ResourceStat = "ap" | "mp" | "satiety" | "morale" | "hp";

export const RESOURCE_STATS: readonly ResourceStat[] = ["ap", "mp", "satiety", "morale", "hp"];

export const RESOURCE_STAT_ICONS: Readonly<Record<ResourceStat, string>> = {
  ap: AP_SLOT_ICON,
  mp: MP_SLOT_ICON,
  satiety: SATIETY_ICON,
  morale: MORALE_ICON,
  hp: HP_ICON,
};

export interface StatDelta {
  stat: ResourceStat;
  amount: number;
}

/** "+3" or "−2" (a real minus sign). */
export function signedAmount(n: number): string {
  return `${n > 0 ? "+" : "−"}${Math.abs(n)}`;
}

/**
 * What eating or drinking `type` gains or loses, in `RESOURCE_STATS` order, zeroes left out. Drug and alien fruit
 * effects are added only when the viewer knows them; the caller decides what to show when they don't.
 */
export function consumeDeltas(type: string, view: PlayerView): StatDelta[] {
  const consume = ITEM_TYPES[type]?.consume;
  if (!consume) return [];
  const drug = ITEM_TYPES[type]?.drug === true ? view.drugEffects?.[type] : undefined;
  const fruit = isAlienFruitType(type) ? view.fruitEffects?.[type] : undefined;
  const amounts: Record<ResourceStat, number> = {
    ap: consume.ap + (drug?.ap ?? 0) + (fruit?.ap ?? 0),
    mp: (consume.mp ?? 0) + (drug?.mp ?? 0),
    satiety: consume.satiety ?? 0,
    morale: (consume.morale ?? 0) + (drug?.morale ?? 0) + (fruit?.morale ?? 0),
    hp: (consume.hp ?? 0) + (fruit?.hp ?? 0),
  };
  return RESOURCE_STATS.filter((stat) => amounts[stat] !== 0).map((stat) => ({ stat, amount: amounts[stat] }));
}

/** One amount then its icon; the icon's alt names the resource, so a screen reader hears "+1 AP". */
export function StatAmount({ stat, amount }: StatDelta) {
  const { t } = useTranslation();
  return (
    <>
      <span className="stat-amount-value">{signedAmount(amount)}</span>
      <img className="stat-amount-icon" src={RESOURCE_STAT_ICONS[stat]} alt={t(`stat.${stat}`)} />
    </>
  );
}

/**
 * A list of amounts: `column` lines them up one per line (amounts right-aligned, icons in a column), `row` runs them
 * side by side and wraps. `className` adds to `stat-amounts` (the consumable tooltips add `consume-effects`).
 */
export function StatAmounts({
  deltas,
  layout = "column",
  className,
}: {
  deltas: readonly StatDelta[];
  layout?: "column" | "row";
  className?: string;
}) {
  if (deltas.length === 0) return null;
  return (
    <ul className={`stat-amounts stat-amounts-${layout}${className ? ` ${className}` : ""}`}>
      {deltas.map((d) => (
        <li key={d.stat}>
          <StatAmount stat={d.stat} amount={d.amount} />
        </li>
      ))}
    </ul>
  );
}
