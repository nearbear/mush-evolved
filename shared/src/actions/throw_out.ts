import { Action, IN_PRESELECTION, isString, peopleHere, type ActionTag } from "./action.ts";
import { attackWithHeldWeapon } from "./attack.ts";
import { getUp } from "./lie_down.ts";
import { leaveAccommodation, pushing } from "../accommodation.ts";
import { isDoorBroken } from "../doors.ts";
import { hostileHere, hostilesHere } from "../hostiles.ts";
import { isInactive } from "../inactivity.ts";
import { logPublic } from "../log.ts";
import { enterRoom, enteredRoom } from "../modifiers.ts";
import { hasSkill } from "../skills.ts";
import { arrive } from "../spot.ts";
import type { GameState, PlayerState } from "../types.ts";

export type ThrowOutActionData = { type: "throw_out"; target: string; to: string };

const canThrowOut = (player: Readonly<PlayerState>): boolean => hasSkill(player, "wrestler") || hasSkill(player, "sturdy");

const openAdjacentRooms = (state: Readonly<GameState>, room: string): string[] =>
  (state.config.rooms[room] ?? []).filter((to) => !isDoorBroken(state, room, to));

/**
 * Throw Out (owner, 2026-11-15): Wrestler (`wrestler`) or Solid (`sturdy`), `throwOut.cost.ap` (2) AP
 * (`throwOut.cost.inactiveAp` (1) AP on an inactive target), aggressive, 100% success. Throws a living
 * roommate through an unbroken door into a chosen adjacent room, interrupting their timed action and queue,
 * standing them up from bed, ending any wheelchair push, clearing `guardian`, setting `enteredFrom` to the
 * origin room, and logging publicly in both rooms. A hostile NPC in the room (hostiles.ts) can be thrown out the same
 * way, at the full cost.
 */
export class ThrowOutAction extends Action<ThrowOutActionData> {
  override tags: readonly ActionTag[] = ["aggressive"];

  constructor() {
    super("throw_out", { target: isString, to: isString });
  }

  override getCost(state: Readonly<GameState>, _player: Readonly<PlayerState>, target: ThrowOutActionData): { ap: number; mp: number } {
    const victim = state.players.find((o) => o.id === target.target);
    const ap = victim && isInactive(victim) ? state.config.throwOut.cost.inactiveAp : state.config.throwOut.cost.ap;
    return { ap, mp: 0 };
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): ThrowOutActionData[] {
    if (state.preselection || !canThrowOut(player)) return [];
    const rooms = openAdjacentRooms(state, player.room);
    if (rooms.length === 0) return [];
    return [...peopleHere(state, player), ...hostilesHere(state, player)].flatMap((o) => rooms.map((to): ThrowOutActionData => ({ type: "throw_out", target: o.id, to })));
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: ThrowOutActionData): string | null {
    if (state.preselection) return IN_PRESELECTION;
    if (!canThrowOut(player)) return "no_skill";
    if (!peopleHere(state, player).some((o) => o.id === target.target) && !hostileHere(state, player, target.target)) return "cant_see";
    if (!(state.config.rooms[player.room] ?? []).includes(target.to)) return "not_adjacent";
    if (isDoorBroken(state, player.room, target.to)) return "door_broken";
    return null;
  }

  override apply(state: GameState, player: PlayerState, target: ThrowOutActionData): void {
    const hostile = hostileHere(state, player, target.target);
    if (hostile) {
      hostile.room = target.to;
      hostile.enteredFrom = player.room;
      logPublic(state, player.room, "threwOutHostile", { name: player.character, hostile: hostile.kind, room: target.to });
      logPublic(state, target.to, "hostileThrownIn", { hostile: hostile.kind, room: player.room });
      return;
    }
    const victim = state.players.find((o) => o.id === target.target)!; // checked, so it exists
    const from = player.room;
    victim.current = null;
    victim.queue = [];
    if (victim.modifiers.includes("lying_down")) getUp(victim);
    delete victim.pushedBy;
    const pushed = pushing(state, victim);
    if (pushed) delete pushed.pushedBy;
    leaveAccommodation(state, victim);

    victim.room = target.to;
    arrive(victim, from);
    logPublic(state, from, "threwOut", { name: player.character, target: victim.character, room: target.to });
    logPublic(state, target.to, "thrownIn", { target: victim.character, room: from });
    enteredRoom(state, victim, { attackWithHeldWeapon });
    enterRoom(state, victim);
  }
}
