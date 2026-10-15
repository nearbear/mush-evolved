// Looks up what the player has selected in the data the view already holds.
// No rules here: a target is shown only if the view contains it, and actions
// come from view.legalActions.

import type { Action, ActionCost, EquipmentView, ItemView, OtherPlayerView, PlayerState, PlayerView, Target } from "@mush2/shared";

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
  return view.legalActions.filter((a) => {
    switch (a.type) {
      case "examine":
        return sameTarget(a.target, target);
      case "dispense":
        return target.kind === "equipment" && a.equipment === target.id;
      case "consume":
        return target.kind === "item" && a.item === target.id;
      case "bond":
      case "dtt":
      case "stt":
        return target.kind === "player" && a.target === target.id;
      default:
        return false;
    }
  });
}

const ACTION_LABEL_KEYS = {
  examine: "actions.examine",
  dispense: "actions.dispense",
  consume: "actions.consume",
  bond: "actions.bond",
  dtt: "actions.dtt",
  stt: "actions.stt",
} as const;

/** i18n key for the button text of an action aimed at a target (Inspect panel and peek bar). */
export const actionLabelKey = (action: Action) => (ACTION_LABEL_KEYS as Partial<Record<Action["type"], string>>)[action.type] as
  | (typeof ACTION_LABEL_KEYS)[keyof typeof ACTION_LABEL_KEYS]
  | undefined;

/** What an action costs you, from the view's `legalCosts`; free if it isn't listed. */
export function costOf(view: PlayerView, action: Action): ActionCost {
  return view.legalCosts[view.legalActions.indexOf(action)] ?? { ap: 0, mp: 0 };
}
