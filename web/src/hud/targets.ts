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

function aimedAt(view: PlayerView, a: Action, target: Target): boolean {
  switch (a.type) {
    case "examine":
      return sameTarget(a.target, target);
    case "access":
    case "uninstall":
    case "dispense":
    case "take_fuel":
    case "load_fuel":
    case "unload_fuel":
    case "return_fuel":
    case "take_oxygen":
    case "return_oxygen":
    case "check_combustion":
    case "lie_down":
    case "shower":
    case "takeoff":
    case "land":
      return target.kind === "equipment" && a.equipment === target.id;
    case "dismantle":
      return "equipment" in a ? target.kind === "equipment" && a.equipment === target.id : target.kind === "item" && a.item === target.id;
    case "consume":
    case "hide":
    case "cook":
    case "express_cook":
    case "fungal_cuisine":
    case "build":
    case "jettison":
    case "install":
    case "read_book":
    case "water":
    case "treat":
    case "sow":
    case "repair_hull":
      return target.kind === "item" && a.item === target.id;
    case "bond":
    case "dtt":
    case "stt":
    case "heal":
    case "vaccinate":
    case "punch":
    case "interrogate":
    case "chitchat":
    case "anathema":
    case "spike":
    case "body_transfer":
    case "accommodate":
    case "accept_accommodation":
    // On the pushed person: Terrence ends it from his own panel, the pusher from his.
    case "stop_accommodation":
      return target.kind === "player" && a.target === target.id;
    // At the person, or, for an area weapon, on the weapon itself.
    case "attack":
      return "target" in a ? target.kind === "player" && a.target === target.id : target.kind === "item" && a.weapon === target.id;
    case "extract_spore":
    case "get_up":
    case "search":
    case "self_disease":
    case "fiery_speech":
    case "boring_speech":
      return target.kind === "player" && target.id === view.you.id;
    default:
      return false;
  }
}

/** The carried weapon an attack uses, for its button text ("Attack (knife)"); a carried weapon is in the inventory. */
export const attackWeapon = (view: PlayerView, action: Action): ItemView | undefined =>
  action.type === "attack" ? view.inventory.find((i) => i.id === action.weapon) : undefined;
