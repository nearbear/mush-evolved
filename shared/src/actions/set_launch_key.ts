import { Action, isBoolean, isString, TRAVEL_UNDERWAY } from "./action.ts";
import { logPublic } from "../log.ts";
import { commandTerminalsHere } from "../pilgred.ts";
import { TITLE_IDS, type TitleId } from "../titles.ts";
import type { GameState, PlayerState } from "../types.ts";

export type SetLaunchKeyActionData = { type: "set_launch_key"; equipment: string; title: TitleId; on: boolean };

const isTitleId = (value: unknown): value is TitleId => isString(value) && (TITLE_IDS as readonly string[]).includes(value);

/**
 * Insert or remove a title's launch key at the Command terminal (#480, owner 2026-11-22). A key is not an item: it is the
 * title's authorization for intergalactic travel, so only that title's holder flips it, never a hacked terminal or
 * `neron_access` (which is why this doesn't use `hasTitleAccess`); the `freeHacking` cheat is the one bypass, for testing.
 * Free, at any time, and a public room log line either way. A broken terminal refuses it through the base `check`
 * (`BROKEN`), and the keys stay as they are. A key stays in when its holder leaves the bridge.
 */
export class SetLaunchKeyAction extends Action<SetLaunchKeyActionData> {
  override terminal = true;

  constructor() {
    super("set_launch_key", { equipment: isString, title: isTitleId, on: isBoolean });
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): SetLaunchKeyActionData[] {
    return commandTerminalsHere(state, player).flatMap((terminal) =>
      TITLE_IDS.filter((title) => mayTurnKey(state, player, title)).map(
        (title): SetLaunchKeyActionData => ({ type: "set_launch_key", equipment: terminal.id, title, on: !state.launchKeys[title] }),
      ),
    );
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: SetLaunchKeyActionData): string | null {
    if (!commandTerminalsHere(state, player).some((terminal) => terminal.id === target.equipment)) return "cant_set_launch_key";
    if (state.launched !== null) return TRAVEL_UNDERWAY;
    if (!mayTurnKey(state, player, target.title)) return "not_title_holder";
    if (state.launchKeys[target.title] === target.on) return "launch_key_unchanged";
    return null;
  }

  override apply(state: GameState, player: PlayerState, target: SetLaunchKeyActionData): void {
    state.launchKeys[target.title] = target.on;
    logPublic(state, player.room, target.on ? "launchKeyInserted" : "launchKeyRemoved", { name: player.character, title: target.title });
  }
}

/** Whether this player may turn a title's key: its holder, or the `freeHacking` cheat. */
function mayTurnKey(state: Readonly<GameState>, player: Readonly<PlayerState>, title: TitleId): boolean {
  return state.titles[title] === player.id || player.cheats.includes("freeHacking");
}
