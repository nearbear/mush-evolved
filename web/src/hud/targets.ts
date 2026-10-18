// Looks up what the player has selected in the data the view already holds.
// No rules here: a target is shown only if the view contains it, and actions
// come from view.legalActions.

import type { Action, ActionCost, EquipmentView, ItemView, OtherPlayerView, PlayerView, Target, UnaffordableAction, YouView } from "@mush2/shared";

export type Resolved =
  | { kind: "player"; person: YouView | OtherPlayerView }
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
  return view.legalActions.filter((a) => aimedAt(view, a, target));
}

/** Actions aimed at this target that you only lack the AP or MP for, to show disabled with the reason. */
export function unaffordableOn(view: PlayerView, target: Target): UnaffordableAction[] {
  return view.unaffordable.filter((u) => aimedAt(view, u.action, target));
}

/** What an action is done to, for walking up to it in the room view; null for actions on nothing in particular. */
export function actionTarget(a: Action): Target | null {
  if (a.type === "examine") return a.target;
  if ("equipment" in a) return { kind: "equipment", id: a.equipment };
  if ("item" in a) return { kind: "item", id: a.item };
  if (a.type === "bond" || a.type === "dtt" || a.type === "stt" || a.type === "heal" || a.type === "punch" || a.type === "spike") {
    return { kind: "player", id: a.target };
  }
  return null;
}

function aimedAt(view: PlayerView, a: Action, target: Target): boolean {
  switch (a.type) {
    case "examine":
      return sameTarget(a.target, target);
    case "access":
    case "uninstall":
    case "dispense":
    case "lie_down":
    case "shower":
      return target.kind === "equipment" && a.equipment === target.id;
    case "dismantle":
      return "equipment" in a ? target.kind === "equipment" && a.equipment === target.id : target.kind === "item" && a.item === target.id;
    case "consume":
    case "cook":
    case "build":
    case "jettison":
    case "install":
      return target.kind === "item" && a.item === target.id;
    case "bond":
    case "dtt":
    case "stt":
    case "heal":
    case "punch":
    case "spike":
      return target.kind === "player" && a.target === target.id;
    case "extract_spore":
      return target.kind === "player" && target.id === view.you.id;
    default:
      return false;
  }
}

const ACTION_LABEL_KEYS = {
  examine: "actions.examine",
  access: "actions.access",
  dispense: "actions.dispense",
  lie_down: "actions.lieDown",
  shower: "actions.shower",
  consume: "actions.consume",
  cook: "actions.cook",
  build: "actions.build",
  jettison: "actions.jettison",
  install: "actions.install",
  uninstall: "actions.uninstall",
  dismantle: "actions.dismantle",
  bond: "actions.bond",
  dtt: "actions.dtt",
  stt: "actions.stt",
  heal: "actions.heal",
  punch: "actions.punch",
  spike: "actions.spike",
  extract_spore: "actions.extractSpore",
} as const;

/** i18n key for the button text of an action aimed at a target (Inspect panel and peek bar). */
export const actionLabelKey = (action: Action) => (ACTION_LABEL_KEYS as Partial<Record<Action["type"], string>>)[action.type] as
  | (typeof ACTION_LABEL_KEYS)[keyof typeof ACTION_LABEL_KEYS]
  | undefined;

/** What an action costs you, from the view's `legalCosts`; free if it isn't listed. */
export function costOf(view: PlayerView, action: Action): ActionCost {
  return view.legalCosts[view.legalActions.indexOf(action)] ?? { ap: 0, mp: 0 };
}

/** Your chance of success at an action (0 to 1), from the view's `legalChances`; certain if it isn't listed. */
export function chanceOf(view: PlayerView, action: Action): number {
  return view.legalChances[view.legalActions.indexOf(action)] ?? 1;
}
