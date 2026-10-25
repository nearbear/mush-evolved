// The room as a list a screen reader can walk: people, equipment, items on the floor and exits, as
// buttons that make the same selections and moves as clicking the drawn room. Visually hidden, built
// from the player's own view (nothing the canvas wouldn't show), and legality comes from `reachable`.

import { useTranslation } from "react-i18next";
import type { PlayerView, RoomId, ShipLayout, Target } from "@mush2/shared";
import { useNames } from "../i18n/names.ts";

export function RoomList({
  view,
  layout,
  reachable,
  onSelect,
  onMove,
}: {
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
      entries: view.roomEquipment.map((e) => ({ key: e.id, label: names.equipment(e.type), onClick: () => onSelect({ kind: "equipment", id: e.id }) })),
    },
    {
      key: "items",
      entries: view.roomItems.map((i) => ({ key: i.id, label: names.itemOf(i), onClick: () => onSelect({ kind: "item", id: i.id }) })),
    },
    {
      key: "exits",
      entries: exits.map((to) => ({
        key: to,
        label: t(reachable.has(to) ? "roomList.door" : "roomList.doorOutOfReach", { room: names.room(to) }),
        // Focusable but inert, so a reader still hears the exit and why it does nothing.
        disabled: !reachable.has(to),
        onClick: () => onMove(to),
      })),
    },
  ] as const;

  return (
    <section className="sr-only" aria-label={t("roomList.region")}>
      {groups.map(
        (g) =>
          g.entries.length > 0 && (
            <div key={g.key} role="group" aria-label={t(`roomList.${g.key}`)}>
              <ul>
                {g.entries.map((e) => (
                  <li key={e.key}>
                    <button type="button" aria-disabled={"disabled" in e && e.disabled ? true : undefined} onClick={"disabled" in e && e.disabled ? undefined : e.onClick}>
                      {e.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ),
      )}
    </section>
  );
}
