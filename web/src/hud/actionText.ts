// An action as a short phrase for the action queue and screen readers: "Take Wrench, 1 AP". The subject is
// found in the view you already hold; the cost is shown only when the view still offers the same action
// (queued actions carry none).

import type { Action, PlayerView } from "@mush2/shared";
import type { useNames } from "../i18n/names.ts";

type Names = ReturnType<typeof useNames>;

export function describeAction(view: PlayerView, names: Names, apUnit: string, action: Action): string {
  const a = action as Record<string, unknown>;
  const subject =
    typeof a.item === "string"
      ? [...view.inventory, ...view.roomItems].find((i) => i.id === a.item)
      : undefined;
  const equipment = typeof a.equipment === "string" ? view.roomEquipment.find((e) => e.id === a.equipment) : undefined;
  const personId = typeof a.target === "string" ? a.target : typeof a.subordinate === "string" ? a.subordinate : typeof a.subject === "string" ? a.subject : undefined;
  const person = personId ? [view.you, ...view.players].find((p) => p.id === personId) : undefined;
  const what = subject
    ? names.itemOf(subject)
    : equipment
      ? names.equipment(equipment.type)
      : person
        ? names.character(person.character)
        : typeof a.to === "string"
          ? names.room(a.to as never)
          : undefined;
  const cost = view.actions.find((o) => JSON.stringify(o.action) === JSON.stringify(action))?.cost;
  const text = what ? `${names.action(action.type)} ${what}` : names.action(action.type);
  return cost && cost.ap > 0 ? `${text}, ${cost.ap} ${apUnit}` : text;
}
