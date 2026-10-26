// Looks up what the player has selected in the data the view already holds.
// No rules here: a target is shown only if the view contains it, and actions
// come from view.actions.

import { actionInTerminal, namedTarget, type Action, type ActionOption, type EquipmentView, type ItemView, type OtherPlayerView, type PlayerView, type Target, type YouView } from "@mush2/shared";

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

/**
 * Whether an action belongs on this target's panel: what its fields name (`namedTarget`), so an attack is on the
 * person or, for an area weapon, the weapon, and stopping a push on the pushed person (Terrence ends it from his own
 * panel, the pusher from his). An action that names nothing (search, a speech, getting up) is on yourself.
 */
function aimedAt(view: PlayerView, a: Action, target: Target): boolean {
  // Terminal actions are in the terminal's window, and the inventory panel takes and drops.
  if (actionInTerminal(a.type) || a.type === "take" || a.type === "drop" || a.type === "ready") return false;
  if (Object.keys(a).length === 1) return target.kind === "player" && target.id === view.you.id;
  return sameTarget(namedTarget(a), target);
}

/** The carried weapon an attack uses, for its button text ("Attack (knife)"); a carried weapon is in the inventory. */
export const attackWeapon = (view: PlayerView, action: Action): ItemView | undefined =>
  action.type === "attack" ? view.inventory.find((i) => i.id === action.weapon) : undefined;
