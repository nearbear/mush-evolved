// A row of status effect icons. Each opens a card with its name and what it does on hover, focus, or tap,
// the same way skills do. Which statuses to show is decided by the server's view; nothing is computed here.

import { Popover } from "@base-ui/react/popover";
import { useTranslation } from "react-i18next";
import { DEFAULT_CONFIG, STATUS_PUBLIC, TRAIT_STATUS_IDS, isCurseId, statusIdsFor } from "@mush2/shared";
import { CONTAMINATED_ICON, statusIcon, statusIconClass } from "../art/assets.ts";

/**
 * `contamination` is set only when the server sent one (a Mush looking at a contaminated human). `calmed` lists your
 * own disorders a Shrink's Comfort has calmed for now, drawn grayed out.
 */
export function StatusIcons({
  statuses,
  contamination,
  protecting,
  protectedBy,
  calmed = [],
}: {
  statuses: readonly string[];
  calmed?: readonly string[];
  contamination?: number | undefined;
  protecting?: string | undefined;
  protectedBy?: string | undefined;
}) {
  const { t } = useTranslation();
  const known = statusIdsFor(DEFAULT_CONFIG.diseases.allDiseases, DEFAULT_CONFIG.diseases.allInjuries, DEFAULT_CONFIG.diseases.allDisorders).filter((id) => statuses.includes(id));
  if (known.length === 0 && contamination === undefined) return null;
  const descriptionFor = (id: string): string | undefined => {
    if (id === "protecting" && protecting) return t("status.desc.protectingTarget", { name: protecting });
    if (id === "protected" && protectedBy) return t("status.desc.protectedBy", { name: protectedBy });
    const desc = t(`status.desc.${id}`, { defaultValue: "" });
    if (calmed.includes(id)) return [t("status.calmed"), desc].filter(Boolean).join("\n");
    return desc || undefined;
  };
  return (
    <ul className="status-icons" aria-label={t("status.label")}>
      {known.map((id) => (
        <li key={id} className={calmed.includes(id) ? "status-calmed" : undefined}>
          <StatusIcon
            icon={statusIcon(id)}
            iconClass={statusIconClass(id)}
            name={t(`status.${id}`, { defaultValue: id })}
            description={descriptionFor(id)}
            visibility={isCurseId(id) ? "mushOnly" : STATUS_PUBLIC[id] ? "public" : "private"}
            caption={TRAIT_STATUS_IDS.includes(id) ? t("status.permanent") : undefined}
          />
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
  iconClass,
  name,
  description,
  visibility,
  caption,
  children,
}: {
  icon: string;
  /** A class that recolours the icon (`statusIconClass`). */
  iconClass?: string | undefined;
  name: string;
  description?: string;
  visibility?: "public" | "private" | "mushOnly";
  /** A small italic note under the description, such as a trait's "This can't be removed." */
  caption?: string | undefined;
  children?: React.ReactNode;
}) {
  const { t } = useTranslation();
  // A description with several lines is a list, as a skill's effects are (SkillSlots.tsx); one line stays a paragraph.
  const lines = description?.split("\n").filter(Boolean) ?? [];
  return (
    <Popover.Root>
      <Popover.Trigger openOnHover delay={200} className="status-icon" aria-label={name}>
        <img src={icon} className={iconClass} alt="" />
        {children}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={6}>
          <Popover.Popup className="tooltip resource-card status-card">
            <strong>{name}</strong>
            {visibility && <p className="status-visibility">{t(`status.${visibility}`)}</p>}
            {lines.length === 1 && <p>{lines[0]}</p>}
            {lines.length > 1 && (
              <ul>
                {lines.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            )}
            {caption && <p className="status-caption">{caption}</p>}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
