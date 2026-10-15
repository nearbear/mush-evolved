// A row of status effect icons with names (tooltip and accessible label). Which
// statuses to show is decided by the server's view; nothing is computed here.

import { useTranslation } from "react-i18next";
import { STATUS_IDS, type StatusId } from "@mush2/shared";
import { STATUS_ICONS } from "../art/assets.ts";

export function StatusIcons({ statuses }: { statuses: readonly string[] }) {
  const { t } = useTranslation();
  const known = STATUS_IDS.filter((id: StatusId) => statuses.includes(id));
  if (known.length === 0) return null;
  return (
    <ul className="status-icons" aria-label={t("status.label")}>
      {known.map((id) => (
        <li key={id}>
          <img src={STATUS_ICONS[id]} alt={t(`status.${id}`)} title={t(`status.${id}`)} />
        </li>
      ))}
    </ul>
  );
}
