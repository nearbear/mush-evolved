// A row of status effect icons. Each opens a card with its name and what it does on hover, focus, or tap,
// the same way skills do. Which statuses to show is decided by the server's view; nothing is computed here.

import { Popover } from "@base-ui/react/popover";
import { useTranslation } from "react-i18next";
import { STATUS_IDS, STATUS_PUBLIC, type StatusId } from "@mush2/shared";
import { CONTAMINATED_ICON, STATUS_ICONS } from "../art/assets.ts";

/** `contamination` is set only when the server sent one (a Mush looking at a contaminated human). */
export function StatusIcons({ statuses, contamination }: { statuses: readonly string[]; contamination?: number | undefined }) {
  const { t } = useTranslation();
  const known = STATUS_IDS.filter((id: StatusId) => statuses.includes(id));
  if (known.length === 0 && contamination === undefined) return null;
  return (
    <ul className="status-icons" aria-label={t("status.label")}>
      {known.map((id) => (
        <li key={id}>
          <StatusIcon icon={STATUS_ICONS[id]} name={t(`status.${id}`)} description={t(`status.desc.${id}`)} visibility={STATUS_PUBLIC[id] ? "public" : "private"} />
        </li>
      ))}
      {contamination !== undefined && (
        <li className="status-count">
          <StatusIcon
            icon={CONTAMINATED_ICON}
            name={t("status.contaminated", { level: contamination })}
            description={t("status.desc.contaminated")}
            visibility="private"
          >
            <span aria-hidden="true">{contamination}</span>
          </StatusIcon>
        </li>
      )}
    </ul>
  );
}

/** An icon button that opens a card with its name and, when there is one, a description. */
export function StatusIcon({
  icon,
  name,
  description,
  visibility,
  children,
}: {
  icon: string;
  name: string;
  description?: string;
  visibility?: "public" | "private";
  children?: React.ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <Popover.Root>
      <Popover.Trigger openOnHover delay={200} className="status-icon" aria-label={name}>
        <img src={icon} alt="" />
        {children}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={6}>
          <Popover.Popup className="tooltip resource-card status-card">
            <strong>{name}</strong>
            {visibility && <p className="status-visibility">{t(`status.${visibility}`)}</p>}
            {description && <p>{description}</p>}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
