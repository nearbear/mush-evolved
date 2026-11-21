// ---- Damage and death -------------------------------------------------------
// Death rules (decided 2026-10-16, see Death in docs/rules/rules-design.md): reaching
// 0 HP from any source kills at once, death is permanent, and the body becomes a
// corpse item in the room. Every HP loss goes through `damage` and every HP gain through `heal`, so no source can
// leave someone alive at 0 HP (a test enforces it).

import { endAccommodationOnDeath } from "./accommodation.ts";
import { gainMorale } from "./adjustStats.ts";
import { shipInvincible } from "./cheats.ts";
import type { CharacterId } from "./characters.ts";
import { removeFromChannel, pushChat } from "./chat.ts";
import { CORPSE_ITEM, ITRACKIE_ITEM, sameContainer, spawnInRoom } from "./items.ts";
import { logPublic, withNimbleActor } from "./log.ts";
import { damageTaken } from "./modifiers.ts";
import { PATROL_SHIPS } from "./patrol.ts";
import { removeStatus } from "./statuses.ts";
import { strikeSlots } from "./plans.ts";
import { refreshTitles } from "./titles.ts";
import { endGame, mushWinOnDeath } from "./victory.ts";
import type { ChannelId, GameState, PlayerState } from "./types.ts";

/**
 * How someone died (owner, 2026-11-11, #177), with upstream eMush's end-cause ids. The death messages carry it; the
 * killer is never named. A Mush's fatal shower is `injury`, so the room line doesn't give the role away.
 */
export const DEATH_CAUSES = [
  "assassinated",
  "injury",
  "starvation",
  "burnt",
  "metal_plate",
  "electrocuted",
  "asphyxia",
  "depression",
  "patrol_ship_explosion",
  "space_battle",
  "abandoned",
  "exploration",
  "exploration_combat",
  "exploration_lost",
  "daedalus_destroyed",
  // Traded away to a merchant ship (merchants.ts, #143): no corpse, and no room line or NERON announcement for now
  // (whether it is announced like a death is still open, docs/plans/merchants.md). A traded Mush still counts as a dead
  // Mush and fills the Sick Bay's human tank (`hasMushDied`), so the trade can reveal the role (owner, 2026-11-15).
  "traded",
  // A failed surgery's sepsis (owner, 2026-11-17).
  "sepsis",
  // Bleeding out from Haemorrhage or Critical Haemorrhage (owner, 2026-11-18).
  "bled",
] as const;
export type DeathCause = (typeof DEATH_CAUSES)[number];

/**
 * The one way HP goes down. Floors at 0, and 0 kills, of `cause`. Mutates a state the
 * caller already cloned. The infiniteHp cheat (test tooling) keeps HP full.
 */
export function damage(state: GameState, player: PlayerState, amount: number, cause: DeathCause): void {
  if (!player.alive || shipInvincible(state)) return;
  if (player.cheats.includes("infiniteHp")) {
    player.hp = player.maxHp;
    return;
  }
  // Modifiers can make a loss bigger (Space Rabies), never turn a zero into a loss.
  const dealt = amount > 0 ? damageTaken(state, player, amount) : amount;
  player.hp = Math.max(0, player.hp - dealt);
  if (player.hp === 0) killPlayer(state, player, cause);
}

/**
 * The one way HP goes up. Only raises HP: a negative amount does nothing, the dead stay dead, and HP caps at the
 * player's max. Mutates a state the caller already cloned.
 */
export function heal(_state: GameState, player: PlayerState, amount: number): void {
  if (!player.alive) return;
  player.hp = Math.min(player.maxHp, player.hp + Math.max(0, amount));
}

/** Day-start healing: a living player regains `dailyHeal` HP, up to their max. */
export function healDaily(state: GameState, player: PlayerState): void {
  heal(state, player, state.config.dailyHeal);
}

/** Kills a player at once, of `cause` (#177). Mutates a state the caller already cloned. */
export function killPlayer(state: GameState, player: PlayerState, cause: DeathCause): void {
  if (!player.alive) return;
  player.alive = false;
  removeStatus(player, "guardian");
  removeStatus(player, "nimble");
  player.hp = 0;
  player.ready = false;
  player.current = null;
  player.queue = [];

  // The iTrackie is destroyed; everything else drops into the room, then the body.
  const mine = { kind: "player", id: player.id } as const;
  state.items = state.items.filter((i) => !(sameContainer(i.at, mine) && i.type === ITRACKIE_ITEM));
  for (const item of state.items) if (sameContainer(item.at, mine)) item.at = { kind: "room", id: player.room };
  const traded = cause === "traded";
  if (!traded) spawnInRoom(state, player.room, CORPSE_ITEM, 1, { of: player.id });

  // Bonds and contamination are void. The dead player's plan claims go with their channels (removeFromChannel, below).
  delete state.bonds[player.id];
  for (const [id, partners] of Object.entries(state.bonds)) state.bonds[id] = partners.filter((b) => b !== player.id);
  delete state.contamination[player.id];
  endAccommodationOnDeath(state, player);
  delete player.outcastBy;
  for (const other of state.players) if (other.outcastBy === player.id) delete other.outcastBy;
  delete player.protectedBy;
  for (const other of state.players) if (other.protectedBy === player.id) delete other.protectedBy;
  delete player.hackedEquipment;

  for (const channel of state.channels.filter((c) => c.members.includes(player.id))) {
    if (removeFromChannel(state, channel.id, player.id)) systemMessage(state, channel.id, "leftThisWorld", { name: player.character });
  }

  // Task slots aimed at them are struck out on every card (plans.ts).
  strikeSlots(state);

  // The room always gets a line, without the role; NERON's crew-wide announcement reveals it, unless the BIOS has
  // death announcements off (bios.ts). Both give the cause, never the killer (#177).
  loseShipOnPlanet(state, player);
  if (!traded) withNimbleActor(null, () => logPublic(state, player.room, "died", { name: player.character, cause }));
  if (!traded && state.bios.death_announcements) {
    systemMessage(state, "global", player.role === "mush" ? "diedMush" : "diedHuman", { name: player.character, cause });
  }
  // Owner, 2026-11-21: if a pregnant crewmember dies, every living crewmember (human or Mush) loses morale.
  if (!traded && player.statuses.includes("pregnant") && state.config.share.pregnancy.deathMoraleLoss > 0) {
    for (const other of state.players) {
      if (other.alive) gainMorale(state, other, -state.config.share.pregnancy.deathMoraleLoss, "pregnantDeathMoraleLoss");
    }
  }
  refreshTitles(state);
  if (mushWinOnDeath(state)) endGame(state, "mush", "humans_dead");
}

/**
 * A patrol ship its pilot landed on a planet is lost for good when they die before it docks (owner, 2026-11-09, #359),
 * with everything in it (their body too, if they died aboard). NERON tells everyone, unless the BIOS has death
 * announcements off (owner, 2026-11-09): the line would only echo the death.
 */
function loseShipOnPlanet(state: GameState, player: Readonly<PlayerState>): void {
  for (const ship of PATROL_SHIPS) {
    const shipState = state.patrolShips[ship.id]!;
    if (shipState.onPlanet !== player.id) continue;
    shipState.onPlanet = null;
    shipState.destroyed = true;
    shipState.armor = 0;
    state.items = state.items.filter((i) => !sameContainer(i.at, { kind: "room", id: ship.id }));
    if (state.bios.death_announcements) logPublic(state, undefined, "patrolLeftOnPlanet", { room: ship.id }, "warning");
  }
}

/**
 * Whether a Mush has died on the ship at any point in the game.
 * Public to everyone: the sick bay's human_tank shows a person in it.
 */
export function hasMushDied(state: Readonly<{ players: readonly PlayerState[] }>): boolean {
  return state.players.some((p) => p.role === "mush" && !p.alive);
}

function systemMessage(state: GameState, channel: ChannelId, key: string, params: { name: CharacterId; cause?: DeathCause }): void {
  pushChat(state, channel, { from: null, isBot: false, text: "", system: { key, params } });
}
