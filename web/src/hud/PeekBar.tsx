// Phone layout only: a slim bar over the bottom of the room view, always shown, for whatever
// was tapped in the room (a person, equipment, or a door), or yourself by default, so you can act without
// leaving the room view. Examine is never shown here (it lives in the Inspect panel behind More). Legality comes from the view, like the Inspect panel.

import { type ReactNode, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNames } from "../i18n/names.ts";
import { actionItemType, actionVisibility, ITEM_TYPES, isRenameableType, SUPERKUBE, type Action, type ActionOption, type ItemId, type PlayerView, type RoomId, type Target } from "@mush2/shared";
import { ActionLabel } from "./ActionLabel.tsx";
import { ActionButton } from "./ActionButton.tsx";
import { collapsePickers, CrewPickerDialog, isPickerAction, type PickerAction } from "./CrewPickerDialog.tsx";
import { collapseThrowOut, ThrowOutDialog } from "./ThrowOutDialog.tsx";
import { RenameItemDialog } from "./RenameItemDialog.tsx";
import { DoublePressButton } from "./DoublePress.tsx";
import { SuperkubeOpener, type SendKube } from "./Superkube.tsx";
import { useKeepFocus } from "./useKeepFocus.ts";
import { attackWeapon, graftFruit, optionsOn, resolveTarget } from "./targets.ts";

export function PeekBar({
  view,
  target,
  reachable,
  onAction,
  onMove,
  onMore,
  onKube,
  onRenameItem,
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
  /** Renames an owned item (friendly NPC, plant, or customized blaster). */
  onRenameItem?: ((item: ItemId, name: string) => void) | undefined;
}) {
  const { t } = useTranslation();
  const names = useNames();
  const labelFor = ({ action, cost, chance }: ActionOption): ReactNode => {
    const weapon = attackWeapon(view, action);
    const fruit = graftFruit(view, action);
    const text = weapon
      ? t("actions.attackWith", { weapon: names.itemOf(weapon) })
      : fruit
        ? t("actions.graftWith", { fruit: names.itemOf(fruit) })
      : action.type === "apprenticeship"
        ? t("actions.apprenticeshipOf", { skill: names.skill(action.skill) })
        : action.type === "upgrade_drone"
          ? t("actions.upgradeDroneWith", { upgrade: names.droneUpgrade(action.upgrade) })
          : names.action(action.type);
    return <ActionLabel text={text} cost={cost} chance={chance} visibility={actionVisibility(action.type, view, actionItemType([...view.inventory, ...view.roomItems], action))} />;
  };
  const [throwingOut, setThrowingOut] = useState(false);
  const [renaming, setRenaming] = useState(false);
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
        onMore={onMore}
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
    resolved.kind === "player"
      ? names.characterGiven(resolved.person.character)
      : resolved.kind === "equipment"
        ? names.equipment(resolved.equipment.type)
        : resolved.kind === "hostile"
          ? names.hostileName(resolved.hostile.kind)
          : names.itemOf(resolved.item);
  const isBot = resolved.kind === "player" && resolved.person.isBot;
  const { options: afterThrowOut, throwOut } = collapseThrowOut(
    optionsOn(view, target).filter((o) => o.action.type !== "examine"),
  );
  const { options: peekOptions, picks } = collapsePickers(afterThrowOut);
  const canRename =
    onRenameItem !== undefined &&
    resolved.kind === "item" &&
    resolved.item.owner === view.you.id &&
    isRenameableType(resolved.item.type) &&
    view.phase === "playing" &&
    view.you.alive &&
    !view.statuses.includes("coma");
  return (
    <>
      <Bar
        heading={name}
        sub={
          resolved.kind === "item" && ITEM_TYPES[resolved.item.type]?.notImplemented
            ? t("itemAttr.notImplemented")
            : resolved.kind === "item" && resolved.item.customName
              ? resolved.item.customName
              : resolved.kind === "hostile"
                ? t("hostiles.hp", { hp: resolved.hostile.hp, max: resolved.hostile.maxHp })
                : undefined
        }
        isBot={isBot}
        onMore={onMore}
      >
        {onKube && resolved.kind === "equipment" && resolved.equipment.type === SUPERKUBE && <SuperkubeOpener view={view} onKube={onKube} />}
        {canRename && (
          <button type="button" onClick={() => setRenaming(true)}>
            {t("rename.button")}
          </button>
        )}
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
      {canRename && resolved.kind === "item" && (
        <RenameItemDialog
          open={renaming}
          itemName={name}
          currentName={resolved.item.customName}
          onClose={() => setRenaming(false)}
          onRename={(newName) => onRenameItem(resolved.item.id, newName)}
        />
      )}
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
  onMore,
  children,
}: {
  heading: string;
  sub?: string | undefined;
  isBot?: boolean;
  /** More is always shown after the actions, however many of them fit; it opens them all in Inspect. */
  onMore: () => void;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const [actions, clipped] = useOneRow();
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
      {/* The badge counts the actions clipped off the row; informational (blue), not an alert. */}
      <button
        type="button"
        className="peek-more"
        onClick={onMore}
        aria-label={clipped > 0 ? t("peek.moreHidden", { count: clipped }) : t("peek.more")}
      >
        …
        {clipped > 0 && (
          <span className="peek-more-badge" aria-hidden="true">
            {clipped}
          </span>
        )}
      </button>
    </div>
  );
}

/**
 * The actions get one row; CSS clips the ones that wrap past it (More still reaches them).
 * This makes the clipped ones inert too, so keyboards and screen readers skip them, and returns how many were clipped
 * (More's badge).
 */
function useOneRow() {
  const ref = useRef<HTMLDivElement>(null);
  const [clipped, setClipped] = useState(0);
  // No deps: the buttons change with the selection and the view, so recheck after every render.
  useLayoutEffect(() => {
    const row = ref.current;
    if (!row) return;
    const mark = () => {
      const buttons = [...row.children] as HTMLElement[];
      const top = buttons[0]?.offsetTop ?? 0;
      let n = 0;
      for (const b of buttons) {
        b.inert = b.offsetTop > top;
        if (b.inert) n++;
      }
      // Bails out when unchanged, so the effect's rerun after this render settles.
      setClipped(n);
    };
    mark();
    const observer = new ResizeObserver(mark);
    observer.observe(row);
    return () => observer.disconnect();
  });
  return [ref, clipped] as const;
}
