// Phone layout only: a slim bar above the bottom nav for whatever was tapped
// in the room (a person, equipment, or a door), so you can act without
// leaving the room view. Legality comes from the view, like the Inspect panel.

import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { Action, PlayerView, RoomId, Target } from "@mush2/shared";
import { roomLabel } from "../scene/names.ts";
import { actionLabelKey, actionsOn, resolveTarget } from "./targets.ts";

export function PeekBar({
  view,
  target,
  door,
  reachable,
  onAction,
  onMove,
  onMore,
  onClose,
}: {
  view: PlayerView;
  /** Null, or yourself, shows nothing unless a door is peeked. */
  target: Target | null;
  door: RoomId | null;
  reachable: Set<RoomId>;
  onAction: (action: Action) => void;
  onMove: (to: RoomId) => void;
  onMore: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const labelFor = (a: Action) => {
    const key = actionLabelKey(a);
    return key ? t(key) : a.type;
  };
  if (door) {
    const canGo = reachable.has(door);
    return (
      <Bar title={`Door to ${roomLabel(door)}`} sub={canGo ? undefined : "No access"} onClose={onClose}>
        {canGo && <button onClick={() => onMove(door)}>Go</button>}
      </Bar>
    );
  }
  if (!target || (target.kind === "player" && target.id === view.you.id)) return null;
  const resolved = resolveTarget(view, target);
  if (!resolved) return null;
  const name =
    resolved.kind === "player" ? resolved.person.name : resolved.kind === "equipment" ? resolved.equipment.name : resolved.item.name;
  const isBot = resolved.kind === "player" && resolved.person.isBot;
  return (
    <Bar title={name} isBot={isBot} onClose={onClose}>
      {actionsOn(view, target).map((a) => (
        <button key={a.type} onClick={() => onAction(a)}>
          {labelFor(a)}
        </button>
      ))}
      <button onClick={onMore}>More</button>
    </Bar>
  );
}

function Bar({
  title,
  sub,
  isBot = false,
  onClose,
  children,
}: {
  title: string;
  sub?: string | undefined;
  isBot?: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="peek-bar" role="region" aria-label="Selection">
      <div className="peek-name">
        <strong>{title}</strong>
        {isBot && <span className="tag">AI</span>}
        {sub && <div className="sub">{sub}</div>}
      </div>
      <div className="peek-actions">{children}</div>
      <button className="close" onClick={onClose} aria-label="Close">
        ×
      </button>
    </div>
  );
}
