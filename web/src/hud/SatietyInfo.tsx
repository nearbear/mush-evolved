// Your satiety, with a popover (hover, focus, or tap: touch has no hover) on where your stomach stands: how many cycles it
// has been empty (from `satietyZeroSince`, already in your own view), or that you ate recently, plus full belly and hungry
// when you have them. The desktop HUD shows it under your name; on phones it is the first of your other resources
// (ResourceChips.tsx), with the same lines as its description.

import { Popover } from "@base-ui/react/popover";
import type { PlayerView } from "@mush2/shared";
import { useTranslation } from "react-i18next";
import { SATIETY_ICON } from "../art/assets.ts";

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

/** The desktop HUD's line under your name: the icon and the number. */
export function SatietyInfo({ view }: { view: PlayerView }) {
  const { t } = useTranslation();
  const { satiety } = view.you;
  const hungry = view.statuses.includes("hungry");
  const lines = useSatietyLines(view);
  return (
    <Popover.Root>
      <Popover.Trigger
        openOnHover
        delay={200}
        nativeButton={false}
        render={<span role="button" tabIndex={0} />}
        className={`stat-info satiety-info${hungry ? " hungry" : ""}`}
        aria-label={t("stat.satietyValue", { value: satiety })}
      >
        <span className="hud-satiety">
          <img src={SATIETY_ICON} alt="" />
          <span>{satiety}</span>
        </span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={6}>
          <Popover.Popup className="tooltip resource-card skill-card">
            <strong>{t("stat.satiety")}</strong>
            <ul>
              {lines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
