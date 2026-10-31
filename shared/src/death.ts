// ---- Damage and death -------------------------------------------------------
// Death rules (decided 2026-10-16, see Death in docs/rules/rules-design.md): reaching
// 0 HP from any source kills at once, death is permanent, and the body becomes a
// corpse item in the room. Every HP loss goes through `damage` so no source can
// leave someone alive at 0 HP (a test enforces it).

import { endAccommodationOnDeath } from "./accommodation.ts";
import { shipInvincible } from "./cheats.ts";
import type { CharacterId } from "./characters.ts";
import { removeFromChannel, pushChat } from "./chat.ts";
import { CORPSE_ITEM, ITRACKIE_ITEM, sameContainer, newItemId } from "./items.ts";
import { logPublic } from "./log.ts";
import { strikeSlots } from "./plans.ts";
import { refreshTitles } from "./titles.ts";
import { endGame, mushWinOnDeath } from "./victory.ts";
import type { ChannelId, GameState, PlayerState } from "./types.ts";

/**
 * The one way HP goes down. Floors at 0, and 0 kills. Mutates a state the
 * caller already cloned. The infiniteHp cheat (test tooling) keeps HP full.
 */
export function damage(state: GameState, player: PlayerState, amount: number): void {
  if (!player.alive || shipInvincible(state)) return;
  if (player.cheats.includes("infiniteHp")) {
    player.hp = player.maxHp;
    return;
  }
  player.hp = Math.max(0, player.hp - amount);
  if (player.hp === 0) killPlayer(state, player);
}

/** Day-start healing: a living player regains `dailyHeal` HP, up to their max. Only raises HP. */
export function healDaily(state: GameState, player: PlayerState): void {
  if (player.alive) player.hp = Math.min(player.maxHp, player.hp + state.config.dailyHeal);
}

/**
 * Kills a player at once. Mutates a state the caller already cloned. Causes of
 * death (#177) will pass a cause through here once they are shown.
 */
export function killPlayer(state: GameState, player: PlayerState): void {
  if (!player.alive) return;
  player.alive = false;
  player.hp = 0;
  player.ready = false;
  player.current = null;
  player.queue = [];

  // The iTrackie is destroyed; everything else drops into the room, then the body.
  const mine = { kind: "player", id: player.id } as const;
  state.items = state.items.filter((i) => !(sameContainer(i.at, mine) && i.type === ITRACKIE_ITEM));
  for (const item of state.items) if (sameContainer(item.at, mine)) item.at = { kind: "room", id: player.room };
  state.items.push({ id: newItemId(state), type: CORPSE_ITEM, at: { kind: "room", id: player.room }, of: player.id });

  // Bonds and contamination are void. The dead player's plan claims go with their channels (removeFromChannel, below).
  delete state.bonds[player.id];
  for (const [id, partners] of Object.entries(state.bonds)) state.bonds[id] = partners.filter((b) => b !== player.id);
  delete state.contamination[player.id];
  endAccommodationOnDeath(state, player);
  delete player.outcastBy;
  for (const other of state.players) if (other.outcastBy === player.id) delete other.outcastBy;

  for (const channel of state.channels.filter((c) => c.members.includes(player.id))) {
    if (removeFromChannel(state, channel.id, player.id)) systemMessage(state, channel.id, "leftThisWorld", player.character);
  }

  // Task slots aimed at them are struck out on every card (plans.ts).
  strikeSlots(state);

  // The room always gets a line, without the role; NERON's crew-wide announcement reveals it, unless the BIOS has
  // death announcements off (bios.ts).
  logPublic(state, player.room, "died", { name: player.character });
  if (state.bios.death_announcements) systemMessage(state, "global", player.role === "mush" ? "diedMush" : "diedHuman", player.character);
  refreshTitles(state);
  if (mushWinOnDeath(state)) endGame(state, "mush", "humans_dead");
}

function systemMessage(state: GameState, channel: ChannelId, key: string, name: CharacterId): void {
  pushChat(state, channel, { from: null, isBot: false, text: "", system: { key, params: { name } } });
}
