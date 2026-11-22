// The room as a list a screen reader can walk: people, equipment, items on the floor and exits, as
// buttons that make the same selections and moves as clicking the drawn room. Visually hidden, built
// from the player's own view (nothing the canvas wouldn't show), and legality comes from `reachable`.

import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { stackItemViews, type PlayerView, type RoomId, type ShipLayout, type Target } from "@mush2/shared";
import { announce } from "../announce.ts";
import { useNames } from "../i18n/names.ts";
import { DoublePressButton } from "./DoublePress.tsx";

export function RoomList({
  view,
  layout,
  reachable,
  onSelect,
  onMove,
  quiet = false,
}: {
  /** Arriving somewhere says nothing and leaves focus alone (a replay: focus stays on the playback controls). */
  quiet?: boolean;
  view: PlayerView;
  layout: ShipLayout | undefined;
  /** Rooms a move is legal to (from `legalIn`). */
  reachable: ReadonlySet<RoomId>;
  onSelect: (target: Target) => void;
  onMove: (to: RoomId) => void;
}) {
  const { t } = useTranslation();
  const names = useNames();
  const here = view.you.room;
  const people = view.players.filter((p) => p.room === here && p.id !== view.you.id);
  const exits = [...new Set(layout?.rooms.find((r) => r.id === here)?.tiles.flatMap((tile) => (tile.door ? [tile.door.target as RoomId] : [])))];
  const { mpPerMove, apPerConversion } = view.movement;
  const mp = t("stat.mp");
  const ap = t("stat.ap");
  /** What going through a door costs, in the points it spends (AP are converted to MP when MP run short). */
  const doorCost = () =>
    view.you.mp >= mpPerMove
      ? t("roomList.costPlain", { mp: mpPerMove, unit: mp })
      : t("roomList.costConverted", { mp: mpPerMove, unit: mp, ap: apPerConversion, apUnit: ap });
  const summary = () =>
    t("roomList.summary", {
      room: names.room(here),
      people: t("roomList.people_count", { count: people.length }),
      equipment: t("roomList.equipment_count", { count: view.roomEquipment.length }),
      exits: t("roomList.exits_count", { count: exits.length }),
    });

  // Arriving somewhere new: say where you are, and bring a keyboard or screen-reader user to the list.
  // Focus only moves if it was on nothing or already in the list, so typing in chat is never interrupted.
  const region = useRef<HTMLElement>(null);
  const latest = useRef(summary);
  latest.current = summary;
  const lastRoom = useRef(here);
  const quietRef = useRef(quiet);
  quietRef.current = quiet;
  useEffect(() => {
    if (lastRoom.current === here) return;
    lastRoom.current = here;
    if (quietRef.current) return;
    announce(latest.current());
    const active = document.activeElement;
    if (!active || active === document.body || region.current?.contains(active)) region.current?.focus({ preventScroll: true });
  }, [here]);
  // R says the summary again, unless a text field has the key.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "r" || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      const el = e.target;
      if (el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      announce(latest.current());
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  const groups = [
    {
      key: "people",
      entries: people.map((p) => ({
        key: p.id,
        label: p.lying ? t("roomList.lyingDown", { name: names.character(p.character) }) : names.character(p.character),
        onClick: () => onSelect({ kind: "player", id: p.id }),
      })),
    },
    {
      key: "equipment",
      entries: view.roomEquipment.map((e) => ({ key: e.id, label: e.broken ? t("roomList.brokenEquipment", { equipment: names.equipment(e.type) }) : names.equipment(e.type), onClick: () => onSelect({ kind: "equipment", id: e.id }) })),
    },
    {
      key: "items",
      entries: stackItemViews(view.roomItems).map((stack) => {
        const rep = stack.items[0]!;
        const count = stack.items.length;
        return {
          key: stack.key,
          label: count > 1 ? t("inventory.stackCount", { item: names.itemOf(rep), count }) : names.itemOf(rep),
          onClick: () => onSelect({ kind: "item", id: rep.id }),
        };
      }),
    },
    {
      key: "exits",
      entries: exits.map((to) => {
        const door = view.doors.find((d) => d.to === to);
        const broken = door?.broken === true;
        return {
          key: to,
          label: broken
            ? t("roomList.doorBroken", { room: names.room(to) })
            : reachable.has(to)
              ? t("roomList.doorCost", { room: names.room(to), cost: doorCost() })
              : view.you.mp < mpPerMove && view.you.ap < apPerConversion
                ? t("roomList.doorNoPoints", { room: names.room(to), mp, ap })
                : t("roomList.doorOutOfReach", { room: names.room(to) }),
          // Focusable but inert when unreachable (unless broken, which selects the door to inspect/repair).
          disabled: !reachable.has(to) && !broken,
          // A move is an action, so it takes a double press like every action button; selecting a broken door does not.
          double: !broken,
          onClick: () => (broken && door ? onSelect({ kind: "door", id: door.id }) : onMove(to)),
        };
      }),
    },
  ] as const;

  return (
    <section className="sr-only" ref={region} tabIndex={-1} aria-keyshortcuts="R" aria-label={t("roomList.region")}>
      {groups.map(
        (g) =>
          g.entries.length > 0 && (
            <div key={g.key} role="group" aria-label={t(`roomList.${g.key}`)}>
              <ul>
                {g.entries.map((e) => (
                  <li key={e.key}>
                    {"double" in e && !e.disabled ? (
                      <DoublePressButton onPress={e.onClick}>{e.label}</DoublePressButton>
                    ) : (
                      <button type="button" aria-disabled={"disabled" in e && e.disabled ? true : undefined} onClick={"disabled" in e && e.disabled ? undefined : e.onClick}>
                        {e.label}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ),
      )}
    </section>
  );
}
