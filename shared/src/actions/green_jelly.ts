import { Action, type ActionVisibility, isString } from "./action.ts";
import { sabotageableEquipment, sabotageableItems } from "./sabotage.ts";
import { logSecret } from "../log.ts";
import { rollInt } from "../rng.ts";
import { hasSkill } from "../skills.ts";
import type { GameState, PlayerState } from "../types.ts";

export type GreenJellyActionData = { type: "green_jelly"; equipment: string } | { type: "green_jelly"; item: string };

/**
 * The Electro-slime skill's secret action (owner, 2026-11-07): `config.greenJelly.cost.ap` to smear green jelly on
 * sabotageable equipment in the room or an item in reach. It always takes. The target breaks after 1 to
 * `config.greenJelly.maxCycles` cycle changes (rolled now; `jellyCycle` in breakage.ts) and NERON announces the
 * breakdown like any other. Only Mush see the jelly and its cycles left. One jelly per target.
 */
export class GreenJellyAction extends Action<GreenJellyActionData> {
  override visibility: ActionVisibility = "secret";

  constructor() {
    super("green_jelly");
  }

  override parse(raw: Readonly<Record<string, unknown>>): GreenJellyActionData | null {
    if (isString(raw.item)) return { type: "green_jelly", item: raw.item };
    if (isString(raw.equipment)) return { type: "green_jelly", equipment: raw.equipment };
    return null;
  }

  override getCost(state: Readonly<GameState>): { ap: number; mp: number } {
    return { ap: state.config.greenJelly.cost.ap, mp: 0 };
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): GreenJellyActionData[] {
    if (player.role !== "mush" || !hasSkill(player, "electro_slime")) return [];
    return [
      ...sabotageableEquipment(state, player).filter((e) => e.jelly === undefined).map((e): GreenJellyActionData => ({ type: "green_jelly", equipment: e.id })),
      ...sabotageableItems(state, player).filter((i) => i.jelly === undefined).map((i): GreenJellyActionData => ({ type: "green_jelly", item: i.id })),
    ];
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: GreenJellyActionData): string | null {
    if (player.role !== "mush") return "not_mush";
    if (!hasSkill(player, "electro_slime")) return "no_skill";
    const found = "item" in target
      ? sabotageableItems(state, player).some((i) => i.id === target.item && i.jelly === undefined)
      : sabotageableEquipment(state, player).some((e) => e.id === target.equipment && e.jelly === undefined);
    return found ? null : "cant_sabotage";
  }

  override apply(state: GameState, player: PlayerState, target: GreenJellyActionData): void {
    const cycles = rollInt(state, state.config.greenJelly.maxCycles) + 1;
    if ("item" in target) {
      const item = state.items.find((i) => i.id === target.item)!; // checked, so it exists
      item.jelly = cycles;
      logSecret(state, player.id, "greenJellyItem", { name: player.character, item: item.type, cycles });
      return;
    }
    const equipment = state.equipment[player.room]!.find((e) => e.id === target.equipment)!;
    equipment.jelly = cycles;
    logSecret(state, player.id, "greenJelly", { name: player.character, equipment: equipment.type, cycles });
  }
}
