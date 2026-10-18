// Phone layout only: a slim bar above the bottom nav, always shown, for whatever
// was tapped in the room (a person, equipment, or a door), or yourself by default, so you can act without
// leaving the room view. Examine is never shown here (it lives in the Inspect panel behind More). Legality comes from the view, like the Inspect panel.

import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useNames } from "../i18n/names.ts";
import { actionVisibility, type Action, type PlayerView, type RoomId, type Target } from "@mush2/shared";
import { ActionLabel } from "./ActionLabel.tsx";
import { DisabledActionButton } from "./ActionButton.tsx";
import { actionLabelKey, actionsOn, chanceOf, costOf, resolveTarget, unaffordableOn } from "./targets.ts";

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
  const labelFor = (a: Action, cost = costOf(view, a), chance = chanceOf(view, a)): ReactNode => {
    const key = actionLabelKey(a);
    return <ActionLabel text={key ? t(key) : a.type} cost={cost} chance={chance} visibility={actionVisibility(a.type)} />;
  };
  if (door) {
    const canGo = reachable.has(door);
    return (
      <Bar heading={`Door to ${names.room(door)}`} sub={canGo ? undefined : "No access"}>
        {canGo && <button onClick={() => onMove(door)}>Go</button>}
      </Bar>
    );
  }
  const resolved = resolveTarget(view, target);
  if (!resolved) return null;
  const name =
    resolved.kind === "player" ? resolved.person.name : resolved.kind === "equipment" ? names.equipment(resolved.equipment.type) : names.item(resolved.item.type, resolved.item.builds);
  const isBot = resolved.kind === "player" && resolved.person.isBot;
  return (
    <Bar heading={name} isBot={isBot}>
      {actionsOn(view, target)
        .filter((a) => a.type !== "examine")
        .map((a) => (
        <button key={a.type} onClick={() => onAction(a)}>
          {labelFor(a)}
        </button>
      ))}
      {unaffordableOn(view, target)
        .filter((u) => u.action.type !== "examine")
        .map((u) => (
        <DisabledActionButton key={u.action.type} view={view} blocked={u}>
          {labelFor(u.action, u.cost, u.chance)}
        </DisabledActionButton>
      ))}
      <button onClick={onMore}>More</button>
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
