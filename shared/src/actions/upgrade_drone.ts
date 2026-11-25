import { Action, type ActionCost, isString } from "./action.ts";
import { DRONE_UPGRADES, type DroneUpgrade, droneParams, isDroneUpgrade, newDrone } from "../drones.ts";
import { SUPPORT_DRONE_ITEM, canReachItem, removeItem } from "../items.ts";
import { logPublic } from "../log.ts";
import { hasSkill } from "../skills.ts";
import type { GameState, ItemState, PlayerState } from "../types.ts";

export type UpgradeDroneActionData = { type: "upgrade_drone"; item: string; upgrade: string };

const METAL_SCRAPS = "metal_scraps";

/**
 * A Robotics Expert's action (#412, owner, 2026-11-12; eMushpedia "Drone de soutien", the original's UPGRADE_DRONE):
 * fits a working support drone in reach (carried or on the floor) with one upgrade it doesn't have yet, for
 * `config.drones.upgrade.cost.ap` and `scraps` metal scraps, with the original's dirt and injury chances. Never fails.
 * The scraps are taken from the inventory first, then the room (as Reinforce's `findScrap`). Public in the room; the
 * upgrades show when anyone examines the drone. One option per upgrade still missing.
 */
export class UpgradeDroneAction extends Action<UpgradeDroneActionData> {
  constructor() {
    super("upgrade_drone", { item: isString, upgrade: isString });
  }

  override getCost(state: Readonly<GameState>): ActionCost {
    return { ap: state.config.drones.upgrade.cost.ap, mp: 0 };
  }

  override dirtChance(state: Readonly<GameState>): number {
    return state.config.drones.upgrade.dirtyChance;
  }

  override injuryChance(state: Readonly<GameState>): number {
    return state.config.drones.upgrade.injuryChance;
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): UpgradeDroneActionData[] {
    if (!hasSkill(player, "robotics") || !scrapsFor(state, player)) return [];
    return drones(state, player).flatMap((drone) =>
      missing(drone).map((upgrade): UpgradeDroneActionData => ({ type: "upgrade_drone", item: drone.id, upgrade })),
    );
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: UpgradeDroneActionData): string | null {
    if (!hasSkill(player, "robotics")) return "no_skill";
    if (!isDroneUpgrade(target.upgrade)) return "cant_upgrade";
    const drone = drones(state, player).find((i) => i.id === target.item);
    if (!drone) return "cant_upgrade";
    if (!missing(drone).includes(target.upgrade)) return "already_upgraded";
    return scrapsFor(state, player) ? null : "no_scrap";
  }

  override apply(state: GameState, player: PlayerState, target: UpgradeDroneActionData): void {
    for (const scrap of scrapsFor(state, player)!) removeItem(state, scrap.id); // checked, so they exist
    const item = state.items.find((i) => i.id === target.item)!; // checked, so it exists
    // A drone made before drones had state (a game started before #411 landed) gets it now.
    const drone = (item.drone ??= newDrone(state));
    if (item.owner === undefined) item.owner = player.id;
    drone.upgrades.push(target.upgrade);
    logPublic(state, player.room, "droneUpgraded", { name: player.character, ...droneParams(item, drone), upgrade: target.upgrade });
  }
}

/** The support drones the player can reach. Broken ones are refused by the base `check` and not offered here. */
const drones = (state: Readonly<GameState>, player: Readonly<PlayerState>): ItemState[] =>
  state.items.filter((i) => i.type === SUPPORT_DRONE_ITEM && !i.broken && canReachItem(state, player, i));

/** The upgrades this drone can still get, in `DRONE_UPGRADES` order. */
const missing = (drone: Readonly<ItemState>): DroneUpgrade[] => DRONE_UPGRADES.filter((u) => !drone.drone?.upgrades.includes(u));

/** The metal scraps an upgrade would use: those in the inventory first, then the room's; undefined if there aren't enough. */
function scrapsFor(state: Readonly<GameState>, player: Readonly<PlayerState>): ItemState[] | undefined {
  const usable = state.items.filter((i) => i.type === METAL_SCRAPS && canReachItem(state, player, i));
  const ordered = [...usable.filter((i) => i.at.kind === "player"), ...usable.filter((i) => i.at.kind === "room")];
  const need = state.config.drones.upgrade.scraps;
  return ordered.length >= need ? ordered.slice(0, need) : undefined;
}
