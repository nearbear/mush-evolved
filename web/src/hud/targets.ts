// Looks up what the player has selected in the data the view already holds.
// No rules here: a target is shown only if the view contains it, and actions
// come from view.legalActions.

import type { Action, EquipmentView, ItemView, OtherPlayerView, PlayerState, PlayerView, Target } from "@mush2/shared";

export type Resolved =
  | { kind: "player"; person: PlayerState | OtherPlayerView }
  | { kind: "equipment"; equipment: EquipmentView }
  | { kind: "item"; item: ItemView; carried: boolean };

export function sameTarget(a: Target | null, b: Target | null): boolean {
  return !!a && !!b && a.kind === b.kind && a.id === b.id;
}

/** The selection as it appears in this view, or null if it's no longer there (left the room, dropped elsewhere). */
export function resolveTarget(view: PlayerView, target: Target): Resolved | null {
  switch (target.kind) {
    case "player": {
      const person = target.id === view.you.id ? view.you : view.players.find((p) => p.id === target.id);
      return person ? { kind: "player", person } : null;
    }
    case "equipment": {
      const equipment = view.roomEquipment.find((e) => e.id === target.id);
      return equipment ? { kind: "equipment", equipment } : null;
    }
    case "item": {
      const carried = view.inventory.find((i) => i.id === target.id);
      const item = carried ?? view.roomItems.find((i) => i.id === target.id);
      return item ? { kind: "item", item, carried: !!carried } : null;
    }
  }
}

/** Legal actions aimed at this target. */
export function actionsOn(view: PlayerView, target: Target): Action[] {
  return view.legalActions.filter((a) => a.type === "examine" && sameTarget(a.target, target));
}

const ACTION_LABELS: Partial<Record<Action["type"], string>> = { examine: "Examine" };

/** Button text for an action aimed at a target (Inspect panel and peek bar). */
export const actionLabel = (action: Action) => ACTION_LABELS[action.type] ?? action.type;
