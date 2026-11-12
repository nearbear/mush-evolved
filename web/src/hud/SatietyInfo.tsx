// What your satiety's card says: where your stomach stands, how many cycles it has been empty (from `satietyZeroSince`,
// already in your own view), or that you ate recently, plus full belly and hungry when you have them. Satiety is the first of
// your other resources (ResourceChips.tsx) on both layouts, with these lines as its description.

import type { PlayerView } from "@mush2/shared";
import { useTranslation } from "react-i18next";

/** What the satiety card says, one sentence per line. */
export function useSatietyLines(view: PlayerView): string[] {
  const { t } = useTranslation();
  const { satiety, satietyZeroSince, role } = view.you;
  const lines: string[] = [];
  if (view.statuses.includes("hungry")) lines.push(t("status.desc.hungry"));
  if (view.statuses.includes("full_belly")) lines.push(t("status.desc.full_belly"));
  if (role === "mush") lines.push(t("stat.satietyInfo.mush"));
  else if (satiety === 0 && satietyZeroSince !== null) lines.push(t("stat.satietyInfo.emptyFor", { count: Math.max(0, view.cycle - satietyZeroSince) }));
  else if (satiety > 0) lines.push(t("stat.satietyInfo.fed"));
  return lines;
}
