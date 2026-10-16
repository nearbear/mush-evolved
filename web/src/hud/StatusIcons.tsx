// A row of status effect icons with names (tooltip and accessible label). Which
// statuses to show is decided by the server's view; nothing is computed here.

import { useTranslation } from "react-i18next";
import { STATUS_IDS, type StatusId } from "@mush2/shared";
import { CONTAMINATED_ICON, STATUS_ICONS } from "../art/assets.ts";

/** `contamination` is set only when the server sent one (a Mush looking at a contaminated human). */
export function StatusIcons({ statuses, contamination }: { statuses: readonly string[]; contamination?: number | undefined }) {
  const { t } = useTranslation();
  const known = STATUS_IDS.filter((id: StatusId) => statuses.includes(id));
  if (known.length === 0 && contamination === undefined) return null;
  const contaminated = contamination !== undefined ? t("status.contaminated", { level: contamination }) : "";
  return (
    <ul className="status-icons" aria-label={t("status.label")}>
      {known.map((id) => (
        <li key={id}>
          <img src={STATUS_ICONS[id]} alt={t(`status.${id}`)} title={t(`status.${id}`)} />
        </li>
      ))}
      {contamination !== undefined && (
        <li className="status-count">
          <img src={CONTAMINATED_ICON} alt={contaminated} title={contaminated} />
          <span aria-hidden="true">{contamination}</span>
        </li>
      )}
    </ul>
  );
}
