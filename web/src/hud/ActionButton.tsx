// A button for an offered action. When you only lack the AP or MP for it (or are too dirty), it shows disabled and a card
// says why (on hover, focus, or tap). It uses aria-disabled rather than disabled so it can still be hovered,
// focused and tapped to read the reason.

import { Popover } from "@base-ui/react/popover";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ConsumeEffects } from "./ConsumeEffects.tsx";
import { affordable, freeAp, type Action, type ActionOption, type PlayerView } from "@mush2/shared";

/** A button that does the action, or the disabled one with the reason when you lack the points. */
export function ActionButton({ view, option, onAction, children, className }: { view: PlayerView; option: ActionOption; onAction: (action: Action) => void; children: ReactNode; className?: string }) {
  if (!affordable(option)) return <DisabledActionButton view={view} blocked={option} className={className}>{children}</DisabledActionButton>;
  const button = (
    <button type="button" className={className} onClick={() => onAction(option.action)}>
      {children}
    </button>
  );
  const type = consumedType(view, option);
  if (type === undefined) return button;
  return (
    <Popover.Root>
      <Popover.Trigger openOnHover delay={200} render={button} />
      <Popover.Portal>
        <Popover.Positioner sideOffset={6}>
          <Popover.Popup className="tooltip resource-card status-card">
            <ConsumeEffects type={type} />
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** The type of the item a consume action eats, so its button can say what it does. */
function consumedType(view: PlayerView, option: ActionOption): string | undefined {
  const a = option.action;
  if (a.type !== "consume") return undefined;
  return [...view.inventory, ...view.roomItems].find((i) => i.id === a.item)?.type;
}

export function DisabledActionButton({ view, blocked, children, className }: { view: PlayerView; blocked: ActionOption; children: ReactNode; className?: string }) {
  const { t } = useTranslation();
  const { cost, lacks } = blocked;
  const reason =
    lacks[0] === "clean"
      ? t("actions.lacksClean")
      : lacks[0] === "capacity"
      ? t("actions.atCapacity")
      : lacks[0] === "cooldown"
      ? t("actions.onCooldown", { count: blocked.cooldown ?? 1 })
      : lacks[0] === "space"
      ? t("actions.lacksSpace")
      : lacks.length > 1
      ? t("actions.lacksBoth", { needAp: cost.ap, needMp: cost.mp, haveAp: freeAp(view.you), haveMp: view.you.mp })
      : lacks[0] === "mp"
        ? t("actions.lacksMp", { need: cost.mp, have: view.you.mp })
        : t("actions.lacksAp", { need: cost.ap, have: freeAp(view.you) });
  const type = consumedType(view, blocked);
  return (
    <Popover.Root>
      <Popover.Trigger openOnHover delay={200} className={className ? `action-disabled ${className}` : "action-disabled"} aria-disabled="true" render={<button type="button" />}>
        {children}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={6}>
          <Popover.Popup className="tooltip resource-card status-card">
            {reason}
            {type !== undefined && <ConsumeEffects type={type} />}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
