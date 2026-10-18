// The "Cycle N" rule between feed entries from different cycles. Render it
// before an entry whose cycle differs from the previous entry's.

import { useTranslation } from "react-i18next";

export function CycleDivider({ cycle }: { cycle: number }) {
  const { t } = useTranslation();
  return <li className="cycle-divider">{t("itrackie.cycleDivider", { cycle })}</li>;
}
