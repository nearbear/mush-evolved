// What eating or drinking an item does, one effect per line with its icon, read from the shared item table (static data, not game state).

import { ITEM_TYPES, type PlayerView } from "@mush2/shared";
import { useTranslation } from "react-i18next";
import {
  AP_PIP,
  HP_ICON,
  MORALE_ICON,
  MP_PIP,
  SATIETY_ICON,
} from "../art/assets.ts";

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
  const effects: [number | undefined, string, string][] = [
    [consume.ap + (drug?.ap ?? 0), AP_PIP, t("stat.ap")],
    [(consume.mp ?? 0) + (drug?.mp ?? 0), MP_PIP, t("stat.mp")],
    [consume.satiety, SATIETY_ICON, t("itemAttr.satiety")],
    [
      (consume.morale ?? 0) + (drug?.morale ?? 0),
      MORALE_ICON,
      t("stat.morale"),
    ],
    [consume.hp, HP_ICON, t("stat.hp")],
  ];
  const shown = effects.filter(([n]) => n);
  const treats = drug?.treats ?? [];
  if (shown.length === 0 && treats.length === 0) return null;
  return (
    <>
      <ul className="consume-effects">
        {shown.map(([n, icon, label]) => (
          <li key={label}>
            <img src={icon} alt={label} />
            <span>{`${n! > 0 ? "+" : "−"}${Math.abs(n!)}`}</span>
          </li>
        ))}
      </ul>
      {treats.length > 0 && (
        <p className="consume-treats">
          {t("itemAttr.drugTreats", {
            diseases: treats
              .map((d) => t(`status.${d}`, { defaultValue: d }))
              .join(", "),
          })}
        </p>
      )}
    </>
  );
}
