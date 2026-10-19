// Phone layout only: a slim bar above the bottom nav, always shown, for whatever
// was tapped in the room (a person, equipment, or a door), or yourself by default, so you can act without
// leaving the room view. Examine is never shown here (it lives in the Inspect panel behind More). Legality comes from the view, like the Inspect panel.

import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useNames } from "../i18n/names.ts";
import { actionVisibility, type Action, type ActionOption, type PlayerView, type RoomId, type Target } from "@mush2/shared";
import { ActionLabel } from "./ActionLabel.tsx";
import { ActionButton } from "./ActionButton.tsx";
import { actionLabelKey, optionsOn, resolveTarget } from "./targets.ts";

export function PeekBar({
  view,
  target,
  door,
  reachable,
  onAction,
  onMove,
  onMore,
}: {
  view: PlayerView;
  /** Already resolved by the caller; yourself when nothing else is selected, so the bar never goes away. */
  target: Target;
  door: RoomId | null;
  reachable: Set<RoomId>;
  onAction: (action: Action) => void;
  onMove: (to: RoomId) => void;
  onMore: () => void;
}) {
  const { t } = useTranslation();
  const names = useNames();
  const labelFor = ({ action, cost, chance }: ActionOption): ReactNode => {
    const key = actionLabelKey(action);
    return <ActionLabel text={key ? t(key) : action.type} cost={cost} chance={chance} visibility={actionVisibility(action.type)} />;
  };
  if (door) {
    const canGo = reachable.has(door);
    return (
      <Bar heading={`Door to ${names.room(door)}`} sub={canGo ? undefined : "No access"}>
        {canGo && <button type="button" onClick={() => onMove(door)}>Go</button>}
      </Bar>
    );
  }
  const resolved = resolveTarget(view, target);
  if (!resolved) return null;
  // The phone layout shows given names only, so the surname stays out of the bar.
  const name =
    resolved.kind === "player" ? names.characterGiven(resolved.person.character) : resolved.kind === "equipment" ? names.equipment(resolved.equipment.type) : names.item(resolved.item.type, resolved.item.builds);
  const isBot = resolved.kind === "player" && resolved.person.isBot;
  return (
    <Bar heading={name} isBot={isBot}>
      {optionsOn(view, target)
        .filter((o) => o.action.type !== "examine")
        .map((o) => (
        <ActionButton key={o.action.type} view={view} option={o} onAction={onAction}>
          {labelFor(o)}
        </ActionButton>
      ))}
      <button type="button" onClick={onMore} aria-label={t("peek.more")}>
        …
      </button>
    </Bar>
  );
}

function Bar({
  heading,
  sub,
  isBot = false,
  children,
}: {
  heading: string;
  sub?: string | undefined;
  isBot?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="peek-bar" role="region" aria-label="Selection">
      <div className="peek-name">
        <strong>{heading}</strong>
        {isBot && <span className="tag">AI</span>}
        {sub && <div className="sub">{sub}</div>}
      </div>
      <div className="peek-actions">{children}</div>
    </div>
  );
}
