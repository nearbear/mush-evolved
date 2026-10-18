// A button for an offered action. When you only lack the AP or MP for it, it shows disabled and a card
// says why (on hover, focus, or tap). It uses aria-disabled rather than disabled so it can still be hovered,
// focused and tapped to read the reason.

import { Popover } from "@base-ui/react/popover";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { affordable, type Action, type ActionOption, type PlayerView } from "@mush2/shared";

/** A button that does the action, or the disabled one with the reason when you lack the points. */
export function ActionButton({ view, option, onAction, children }: { view: PlayerView; option: ActionOption; onAction: (action: Action) => void; children: ReactNode }) {
  if (!affordable(option)) return <DisabledActionButton view={view} blocked={option}>{children}</DisabledActionButton>;
  return (
    <button type="button" onClick={() => onAction(option.action)}>
      {children}
    </button>
  );
}

export function DisabledActionButton({ view, blocked, children }: { view: PlayerView; blocked: ActionOption; children: ReactNode }) {
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
