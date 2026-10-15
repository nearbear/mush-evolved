// Display names for ids the server sends: rooms, equipment, items, and log
// events. The server never sends English text (see the i18n skill); these
// helpers turn ids into the player's language. Call `useNames()` in a
// component so it re-renders when the language changes.

import type { LogEntry, RoomId } from "@mush2/shared";
import { useTranslation } from "react-i18next";

export function useNames() {
  const { t } = useTranslation();
  // Dynamic keys, so the id falls back to itself when a catalog lacks it.
  const lookup = (group: "rooms" | "equipment" | "items", id: string): string => t(`${group}.${id}` as never, { defaultValue: id });
  const room = (id: RoomId) => lookup("rooms", id);
  const equipment = (type: string) => lookup("equipment", type);
  const item = (type: string) => lookup("items", type);

  /** The text of a log entry. `room`, `item` and `equipment` params are ids and get translated. */
  const logLine = ({ key, params = {} }: Pick<LogEntry, "key" | "params">): string => {
    const resolved: Record<string, string | number> = { ...params };
    if (typeof params.room === "string") resolved.room = room(params.room);
    if (typeof params.item === "string") resolved.item = item(params.item);
    if (typeof params.equipment === "string") resolved.equipment = equipment(params.equipment);
    return t(`logEvent.${key}` as never, { ...resolved, defaultValue: key });
  };

  return { room, equipment, item, logLine };
}
