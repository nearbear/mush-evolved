// What one of your four stats is and how it is commonly spent and regained, in a popover over the stat (hover, focus,
// or tap: touch has no hover). Used by the desktop HUD's pip bars and the phone's stat chips. The text is static rules
// help from the locales (base numbers, as the skill effects do); caps and move costs come from your own view.

import { Popover } from "@base-ui/react/popover";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { PlayerView } from "@mush2/shared";

export type Stat = "ap" | "mp" | "hp" | "morale";

/**
 * `children` is the stat's own display (a pip bar or a chip); the whole of it opens the card. `bar` (phones, whose chips
 * show only the value) stands up beside the text, with the capacity after the name.
 */
export function StatInfo({ stat, view, value, max, bar, children }: { stat: Stat; view: PlayerView; value: number; max: number; bar?: ReactNode; children: ReactNode }) {
  const { t } = useTranslation();
  const { mpPerMove, apPerConversion, mpPerConversion } = view.movement;
  const lines = t(`stat.info.${stat}`, { maxAp: view.maxAp, mpCap: view.maxMp, mpPerMove, apPerConversion, mpPerConversion }).split("\n").filter(Boolean);
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
                {bar && (
                  <span className="stat-info-amount">
                    {value}/{max}
                  </span>
                )}
              </strong>
              <ul>
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
