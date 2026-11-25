// What your satiety's card says: where your stomach stands, how many cycles it has been empty (from `satietyZeroSince`,
// already in your own view, for Mush too), how long a human has until Hungry (or that Mush never get hungry), plus full
// belly and hungry when you have them. Under it, the caption: what an empty stomach does, how to fill it, and where the
// food is. Satiety is the first of your other resources (ResourceChips.tsx) on both layouts.

import { DEFAULT_CONFIG, type PlayerView } from "@mush2/shared";
import { Trans, useTranslation } from "react-i18next";
import { useNames } from "../i18n/names.ts";

/** Cycles at 0 satiety before a human gets Hungry: fewer with a tapeworm (as `isHungry` in shared/src/statuses.ts). */
function hungryAfter(view: PlayerView): number {
  const { hungryAfterCycles, tapewormHungryAfterCycles } = DEFAULT_CONFIG.hunger;
  return view.you.modifiers.includes("tapeworm_disease") ? tapewormHungryAfterCycles : hungryAfterCycles;
}

/** What the satiety card says, one sentence per line. */
export function useSatietyLines(view: PlayerView): string[] {
  const { t } = useTranslation();
  const { satiety, satietyZeroSince, role } = view.you;
  const hungry = view.statuses.includes("hungry");
  const emptyFor = satiety === 0 && satietyZeroSince !== null ? Math.max(0, view.cycle - satietyZeroSince) : null;
  const lines: string[] = [];
  if (hungry) lines.push(t("status.desc.hungry"));
  if (view.statuses.includes("full_belly")) lines.push(t("status.desc.full_belly"));
  if (emptyFor !== null) lines.push(t("stat.satietyInfo.emptyFor", { count: emptyFor }));
  else if (satiety > 0) lines.push(t("stat.satietyInfo.fed"));
  if (role === "mush") lines.push(t("stat.satietyInfo.mush"));
  else if (emptyFor !== null && !hungry) lines.push(t("stat.satietyInfo.hungryIn", { count: Math.max(1, hungryAfter(view) - emptyFor) }));
  else if (emptyFor === null) lines.push(t("stat.satietyInfo.hungryAfter", { count: hungryAfter(view) }));
  return lines;
}

/** The caption under the card: what an empty stomach does to you, how food fills it, and where to find food. */
export function SatietyHelp({ view }: { view: PlayerView }) {
  const names = useNames();
  const mush = view.you.role === "mush";
  const values = {
    cycles: hungryAfter(view),
    hp: DEFAULT_CONFIG.hunger.hpPerCycle,
    refectory: names.room("REFECTORY"),
    garden: names.room(view.config.gardenRoom),
    coffee: names.equipment("COFFEE_DISPENSER"),
  };
  // Each line is one whole sentence with its label in a <b> tag, so translators keep the word order (as the spores card).
  const components = { b: <strong /> };
  return (
    <ul className="stat-info-help">
      <li>
        <Trans i18nKey={mush ? "stat.satietyInfo.help.emptyMush" : "stat.satietyInfo.help.empty"} values={values} components={components} />
      </li>
      <li>
        <Trans i18nKey={mush ? "stat.satietyInfo.help.fillMush" : "stat.satietyInfo.help.fill"} values={values} components={components} />
      </li>
      <li>
        <Trans i18nKey="stat.satietyInfo.help.where" values={values} components={components} />
      </li>
    </ul>
  );
}
