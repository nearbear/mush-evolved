// Looks up what the player has selected in the data the view already holds.
// No rules here: a target is shown only if the view contains it, and actions
// come from view.actions.

import type { Action, ActionOption, EquipmentView, ItemView, OtherPlayerView, PlayerView, Target, YouView } from "@mush2/shared";

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

/** Actions aimed at this target: the ones you can do, then the ones you lack the AP or MP for (shown disabled). */
export function optionsOn(view: PlayerView, target: Target): ActionOption[] {
  return view.actions.filter((o) => aimedAt(view, o.action, target));
}

/** What an action is done to, for walking up to it in the room view; null for actions on nothing in particular. */
export function actionTarget(a: Action): Target | null {
  if (a.type === "examine") return a.target;
  if ("equipment" in a) return { kind: "equipment", id: a.equipment };
  if ("item" in a) return { kind: "item", id: a.item };
  if (a.type === "bond" || a.type === "dtt" || a.type === "stt" || a.type === "heal" || a.type === "punch" || a.type === "spike" || a.type === "accommodate" || a.type === "accept_accommodation") {
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
    case "express_cook":
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
    case "accommodate":
    case "accept_accommodation":
    // On the pushed person: Terrence ends it from his own panel, the pusher from his.
    case "stop_accommodation":
      return target.kind === "player" && a.target === target.id;
    case "extract_spore":
    case "get_up":
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
  express_cook: "actions.expressCook",
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
  get_up: "actions.getUp",
  accommodate: "actions.accommodate",
  accept_accommodation: "actions.acceptAccommodation",
  stop_accommodation: "actions.stopAccommodation",
} as const;

/** i18n key for the button text of an action aimed at a target (Inspect panel and peek bar). */
export const actionLabelKey = (action: Action) => (ACTION_LABEL_KEYS as Partial<Record<Action["type"], string>>)[action.type] as
  | (typeof ACTION_LABEL_KEYS)[keyof typeof ACTION_LABEL_KEYS]
  | undefined;
