// Public status icons floating over a character's head, like a debuff bar above a unit in an
// MMO. Which statuses to show is decided by the server's view; nothing is computed here.

import { useTranslation } from "react-i18next";
import { DEFAULT_CONFIG, overheadStatuses, statusIdsFor } from "@mush2/shared";
import { statusIcon, statusIconClass } from "../art/assets.ts";

export function StatusBadges({ statuses }: { statuses: readonly string[] }) {
  const { t } = useTranslation();
  const known = statusIdsFor(DEFAULT_CONFIG.diseases.allDiseases).filter((id) => overheadStatuses(statuses).includes(id));
  if (known.length === 0) return null;
  return (
    <div className="status-badges" role="img" aria-label={known.map((id) => t(`status.${id}`, { defaultValue: id })).join(", ")}>
      {known.map((id) => (
        <img key={id} src={statusIcon(id)} className={statusIconClass(id)} alt="" />
      ))}
    </div>
  );
}
