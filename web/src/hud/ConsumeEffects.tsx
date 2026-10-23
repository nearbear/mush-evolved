// What eating or drinking an item does, one effect per line with its icon, read from the shared item table (static data, not game state).

import { ITEM_TYPES } from "@mush2/shared";
import { useTranslation } from "react-i18next";
import { AP_PIP, HP_ICON, MORALE_ICON, SATIETY_ICON } from "../art/assets.ts";

export function ConsumeEffects({ type }: { type: string }) {
  const { t } = useTranslation();
  const consume = ITEM_TYPES[type]?.consume;
  if (!consume) return null;
  const effects: [number | undefined, string, string][] = [
    [consume.ap, AP_PIP, t("stat.ap")],
    [consume.satiety, SATIETY_ICON, t("itemAttr.satiety")],
    [consume.morale, MORALE_ICON, t("stat.morale")],
    [consume.hp, HP_ICON, t("stat.hp")],
  ];
  const shown = effects.filter(([n]) => n);
  if (shown.length === 0) return null;
  return (
    <ul className="consume-effects">
      {shown.map(([n, icon, label]) => (
        <li key={label}>
          <img src={icon} alt={label} />
          <span>{`${n! > 0 ? "+" : "−"}${Math.abs(n!)}`}</span>
        </li>
      ))}
    </ul>
  );
}
