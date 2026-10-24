// Phone layout only: a slim bar above the bottom nav, always shown, for whatever
// was tapped in the room (a person, equipment, or a door), or yourself by default, so you can act without
// leaving the room view. Examine is never shown here (it lives in the Inspect panel behind More). Legality comes from the view, like the Inspect panel.

import { type ReactNode, useLayoutEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useNames } from "../i18n/names.ts";
import { actionVisibility, type Action, type ActionOption, type PlayerView, type RoomId, type Target } from "@mush2/shared";
import { ActionLabel } from "./ActionLabel.tsx";
import { ActionButton } from "./ActionButton.tsx";
import { actionLabelKey, attackWeapon, optionsOn, resolveTarget } from "./targets.ts";

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
    const weapon = attackWeapon(view, action);
    const text = weapon ? t("actions.attackWith", { weapon: names.itemOf(weapon) }) : key ? t(key) : action.type;
    return <ActionLabel text={text} cost={cost} chance={chance} visibility={actionVisibility(action.type)} />;
  };
  if (door) {
    const canGo = reachable.has(door);
    return (
      <Bar heading={t("peek.doorTo", { room: names.room(door) })} sub={canGo ? undefined : t("peek.noAccess")}>
        {canGo && <button type="button" onClick={() => onMove(door)}>{t("common.go")}</button>}
      </Bar>
    );
  }
  const resolved = resolveTarget(view, target);
  if (!resolved) return null;
  // The phone layout shows given names only, so the surname stays out of the bar.
  const name =
    resolved.kind === "player" ? names.characterGiven(resolved.person.character) : resolved.kind === "equipment" ? names.equipment(resolved.equipment.type) : names.itemOf(resolved.item);
  const isBot = resolved.kind === "player" && resolved.person.isBot;
  return (
    <Bar
      heading={name}
      isBot={isBot}
      more={
        <button type="button" onClick={onMore} aria-label={t("peek.more")}>
          …
        </button>
      }
    >
      {optionsOn(view, target)
        .filter((o) => o.action.type !== "examine")
        .map((o) => (
        <ActionButton key={JSON.stringify(o.action)} view={view} option={o} onAction={onAction}>
          {labelFor(o)}
        </ActionButton>
      ))}
    </Bar>
  );
}

function Bar({
  heading,
  sub,
  isBot = false,
  more,
  children,
}: {
  heading: string;
  sub?: string | undefined;
  isBot?: boolean;
  /** Always shown after the actions, however many of them fit. */
  more?: ReactNode;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const actions = useOneRow();
  return (
    <div className="peek-bar" role="region" aria-label={t("peek.selection")}>
      <div className="peek-name">
        <strong>{heading}</strong>
        {isBot && <span className="tag">{t("common.ai")}</span>}
        {sub && <div className="sub">{sub}</div>}
      </div>
      <div className="peek-actions" ref={actions}>
        {children}
      </div>
      {more}
    </div>
  );
}

/**
 * The actions get one row; CSS clips the ones that wrap past it (More still reaches them).
 * This makes the clipped ones inert too, so keyboards and screen readers skip them.
 */
function useOneRow() {
  const ref = useRef<HTMLDivElement>(null);
  // No deps: the buttons change with the selection and the view, so recheck after every render.
  useLayoutEffect(() => {
    const row = ref.current;
    if (!row) return;
    const mark = () => {
      const buttons = [...row.children] as HTMLElement[];
      const top = buttons[0]?.offsetTop ?? 0;
      for (const b of buttons) b.inert = b.offsetTop > top;
    };
    mark();
    const observer = new ResizeObserver(mark);
    observer.observe(row);
    return () => observer.disconnect();
  });
  return ref;
}
