// The "Day X · Cycle Y" rule between feed entries from different cycles. Render it
// before an entry whose cycle differs from the previous entry's.

import { dayOf } from "@mush2/shared";
import { useTranslation } from "react-i18next";

export function CycleDivider({ cycle, cyclesPerDay }: { cycle: number; cyclesPerDay: number }) {
  const { t } = useTranslation();
  const { day, cycleOfDay } = dayOf({ cycle, config: { cyclesPerDay } });
  return <li className="cycle-divider">{t("itrackie.cycleDivider", { day, cycle: cycleOfDay })}</li>;
}
