// What one of your four stats is and how it is commonly spent and regained, in a popover over the stat (hover, focus,
// or tap: touch has no hover). Used by the desktop HUD's pip bars and the phone's stat chips. The text is static rules
// help from the locales (base numbers, as the skill effects do); caps and move costs come from your own view. When
// something changes a cap (a disease, an injury, a skill, a project), the card says what, from the server's `view.caps`
// (#267): the client only names the sources, it never computes a cap.

import { Popover } from "@base-ui/react/popover";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { CapBreakdown, PlayerView } from "@mush2/shared";
import { NERON_ICON, STATUS_ICONS, skillIcon, statusIconClass } from "../art/assets.ts";

export type Stat = "ap" | "mp" | "hp" | "morale";

/**
 * `children` is the stat's own display (a pip bar or a chip); the whole of it opens the card, which shows the amount and
 * capacity after the name. `bar` (phones, whose chips show only the value) stands up beside the text.
 */
export function StatInfo({ stat, view, value, max, bar, children }: { stat: Stat; view: PlayerView; value: number; max: number; bar?: ReactNode; children: ReactNode }) {
  const { t } = useTranslation();
  const { mpPerMove, apPerConversion, mpPerConversion } = view.movement;
  const lines = t(`stat.info.${stat}`, { maxAp: view.maxAp, mpCap: view.maxMp, mpPerMove, apPerConversion, mpPerConversion }).split("\n").filter(Boolean);
  const hasCapChange = view.caps[stat].sources.length > 0;
  return (
    <Popover.Root>
      <Popover.Trigger
        openOnHover
        delay={200}
        nativeButton={false}
        render={<span role="button" tabIndex={0} />}
        className="stat-info"
        aria-label={t("stat.chip", { label: t(`stat.${stat}`), value, max })}
      >
        {children}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={6}>
          <Popover.Popup className={`tooltip resource-card skill-card${bar ? " stat-info-card" : ""}`}>
            {bar}
            <div>
              <strong>
                {t(`stat.name.${stat}`)}
                <span className="stat-info-amount">
                  {value}/{max}
                </span>
              </strong>
              {hasCapChange && <CapChange stat={stat} cap={view.caps[stat]} />}
              <ul className={`stat-info-help${hasCapChange ? " stat-info-help-divided" : ""}`}>
                {lines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** "Max Morale: 14 → 11" and one line per source that changed it ("Cold −3"), in the order the server applied them. */
function CapChange({ stat, cap }: { stat: Stat; cap: CapBreakdown }) {
  const { t, i18n } = useTranslation();
  const signed = new Intl.NumberFormat(i18n.language, { signDisplay: "exceptZero" });
  // A modifier is a status (disease, injury) or a skill; their names and icons live under different tables.
  const nameOf = ({ kind, id }: CapBreakdown["sources"][number]): string =>
    kind === "project"
      ? t(`projects.names.${id}`, { defaultValue: id })
      : i18n.exists(`status.${id}`)
        ? t(`status.${id}`, { defaultValue: id })
        : t(`skills.names.${id}`, { defaultValue: id });
  const iconOf = ({ kind, id }: CapBreakdown["sources"][number]): string =>
    kind === "project" ? NERON_ICON : (STATUS_ICONS[id] ?? skillIcon(id));
  return (
    <div className="stat-cap">
      <p>{t("stat.capChange", { label: t(`stat.${stat}`), base: cap.base, max: cap.max })}</p>
      <ul>
        {cap.sources.map((source, i) => (
          <li key={`${source.kind}:${source.id}:${i}`}>
            <img src={iconOf(source)} className={source.kind === "modifier" ? statusIconClass(source.id) : undefined} alt="" aria-hidden="true" />
            <span>{t("stat.capSource", { name: nameOf(source), delta: signed.format(source.delta) })}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
