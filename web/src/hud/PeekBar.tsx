// Phone layout only: a slim bar over the bottom of the room view, always shown, for whatever
// was tapped in the room (a person, equipment, or a door), or yourself by default, so you can act without
// leaving the room view. Examine is never shown here (it lives in the Inspect panel behind More). Legality comes from the view, like the Inspect panel.

import { type ReactNode, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNames } from "../i18n/names.ts";
import { actionVisibility, ITEM_TYPES, SUPERKUBE, type Action, type ActionOption, type PlayerView, type RoomId, type Target } from "@mush2/shared";
import { ActionLabel } from "./ActionLabel.tsx";
import { ActionButton } from "./ActionButton.tsx";
import { collapsePickers, CrewPickerDialog, isPickerAction, type PickerAction } from "./CrewPickerDialog.tsx";
import { collapseThrowOut, ThrowOutDialog } from "./ThrowOutDialog.tsx";
import { DoublePressButton } from "./DoublePress.tsx";
import { SuperkubeOpener, type SendKube } from "./Superkube.tsx";
import { useKeepFocus } from "./useKeepFocus.ts";
import { attackWeapon, optionsOn, resolveTarget } from "./targets.ts";

export function PeekBar({
  view,
  target,
  reachable,
  onAction,
  onMove,
  onMore,
  onKube,
}: {
  view: PlayerView;
  /** Already resolved by the caller; yourself when nothing else is selected, so the bar never goes away. */
  target: Target;
  reachable: Set<RoomId>;
  onAction: (action: Action) => void;
  onMove: (to: RoomId) => void;
  onMore: () => void;
  /** Sends a Superkube option (#170); given only while cheats are allowed. */
  onKube?: SendKube | undefined;
}) {
  const { t } = useTranslation();
  const names = useNames();
  const labelFor = ({ action, cost, chance }: ActionOption): ReactNode => {
    const weapon = attackWeapon(view, action);
    const text = weapon
      ? t("actions.attackWith", { weapon: names.itemOf(weapon) })
      : action.type === "apprenticeship"
        ? t("actions.apprenticeshipOf", { skill: names.skill(action.skill) })
        : action.type === "upgrade_drone"
          ? t("actions.upgradeDroneWith", { upgrade: names.droneUpgrade(action.upgrade) })
          : names.action(action.type);
    return <ActionLabel text={text} cost={cost} chance={chance} visibility={actionVisibility(action.type, view)} />;
  };
  const [throwingOut, setThrowingOut] = useState(false);
  const [picking, setPicking] = useState<PickerAction | null>(null);
  const resolved = resolveTarget(view, target);
  if (!resolved) return null;
  if (resolved.kind === "door") {
    const { door } = resolved;
    const canGo = reachable.has(door.to);
    const options = optionsOn(view, target).filter((o) => o.action.type !== "examine");
    return (
      <Bar
        heading={t("peek.doorTo", { room: names.room(door.to) })}
        sub={door.broken ? t("roomList.broken") : canGo ? undefined : t("peek.noAccess")}
        more={
          <button type="button" onClick={onMore} aria-label={t("peek.more")}>
            …
          </button>
        }
      >
        {canGo && <DoublePressButton onPress={() => onMove(door.to)}>{t("common.go")}</DoublePressButton>}
        {options.map((o) => (
          <ActionButton key={JSON.stringify(o.action)} view={view} option={o} onAction={onAction}>
            {labelFor(o)}
          </ActionButton>
        ))}
      </Bar>
    );
  }
  // The phone layout shows given names only, so the surname stays out of the bar.
  const name =
    resolved.kind === "player" ? names.characterGiven(resolved.person.character) : resolved.kind === "equipment" ? names.equipment(resolved.equipment.type) : names.itemOf(resolved.item);
  const isBot = resolved.kind === "player" && resolved.person.isBot;
  const { options: afterThrowOut, throwOut } = collapseThrowOut(
    optionsOn(view, target).filter((o) => o.action.type !== "examine"),
  );
  const { options: peekOptions, picks } = collapsePickers(afterThrowOut);
  return (
    <>
      <Bar
        heading={name}
        sub={resolved.kind === "item" && ITEM_TYPES[resolved.item.type]?.notImplemented ? t("itemAttr.notImplemented") : undefined}
        isBot={isBot}
        more={
          <button type="button" onClick={onMore} aria-label={t("peek.more")}>
            …
          </button>
        }
      >
        {onKube && resolved.kind === "equipment" && resolved.equipment.type === SUPERKUBE && <SuperkubeOpener view={view} onKube={onKube} />}
        {peekOptions.map((o) => (
          <ActionButton
            key={JSON.stringify(o.action)}
            view={view}
            option={o}
            onAction={
              o.action.type === "throw_out"
                ? () => setThrowingOut(true)
                : isPickerAction(o.action.type)
                  ? () => setPicking(o.action.type as PickerAction)
                  : onAction
            }
          >
            {labelFor(o)}
          </ActionButton>
        ))}
      </Bar>
      <ThrowOutDialog
        open={throwingOut}
        targetName={name}
        options={throwOut}
        onClose={() => setThrowingOut(false)}
        onAction={onAction}
      />
      <CrewPickerDialog
        kind={picking}
        view={view}
        picks={picks}
        onClose={() => setPicking(null)}
        onAction={onAction}
      />
    </>
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
  const root = useRef<HTMLDivElement>(null);
  useKeepFocus(root);
  // The name isn't shown (the selection pulses in the room instead, to leave the actions the room); screen readers get it
  // from the bar's label. The AI tag and a short note (a broken door, no access) still show, as they change what you can do.
  return (
    <div className="peek-bar" ref={root} tabIndex={-1} role="region" aria-label={t("peek.selectionOf", { name: heading })}>
      {(isBot || sub) && (
        <div className="peek-note">
          {isBot && <span className="tag">{t("common.ai")}</span>}
          {sub && <span className="sub">{sub}</span>}
        </div>
      )}
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
