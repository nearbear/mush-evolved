// A button for an action aimed at a target. When you only lack the AP or MP for it, it shows disabled and a card
// says why (on hover, focus, or tap). It uses aria-disabled rather than disabled so it can still be hovered,
// focused and tapped to read the reason.

import { Popover } from "@base-ui/react/popover";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { PlayerView, UnaffordableAction } from "@mush2/shared";

export function DisabledActionButton({ view, blocked, children }: { view: PlayerView; blocked: UnaffordableAction; children: ReactNode }) {
  const { t } = useTranslation();
  const { cost, lacks } = blocked;
  const reason =
    lacks.length > 1
      ? t("actions.lacksBoth", { needAp: cost.ap, needMp: cost.mp, haveAp: view.you.ap, haveMp: view.you.mp })
      : lacks[0] === "mp"
        ? t("actions.lacksMp", { need: cost.mp, have: view.you.mp })
        : t("actions.lacksAp", { need: cost.ap, have: view.you.ap });
  return (
    <Popover.Root>
      <Popover.Trigger openOnHover delay={200} className="action-disabled" aria-disabled="true" render={<button type="button" />}>
        {children}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={6}>
          <Popover.Popup className="tooltip resource-card status-card">{reason}</Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
