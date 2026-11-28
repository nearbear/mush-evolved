import { logPrivate } from "./log.ts";
import { maxAp, maxMp, maxMorale, maxHp, moraleLoss } from "./modifiers.ts";
import type { GameState, PlayerState } from "./types.ts";
import { killPlayer } from "./death.ts";
import { shipInvincible } from "./cheats.ts";


/** `lossKey` names the private log line for a loss, when a more specific one than `loseMorale` says why. */
export function gainMorale(state: GameState, player: PlayerState, amount: number, lossKey = "loseMorale"): void {
  if (!player.alive || (amount < 0 && shipInvincible(state))) return;
  // Every loss goes through the holder's `moraleLoss` hooks (Addiction: one more).
  if (amount < 0) amount = -moraleLoss(state, player, -amount);
  player.morale = Math.min(player.maxMorale, player.morale + amount); 
  player.morale = Math.max(0, player.morale);
  if(amount > 0){
    logPrivate(state, player.id, "gainMorale", {amount: amount});
  }
  else if(amount < 0){
    logPrivate(state, player.id, lossKey, {amount: -amount});
  }
}

/** Each change logs a private line with the amount asked for, even if a cap limited it, like `gainMorale`. */
export function changeMP(state: GameState, player: PlayerState, amount: number): void {
  if (!player.alive) return;
  player.mp = Math.max(0, Math.min(player.maxMp, player.mp + amount));
  logChange(state, player, amount, "Mp");
}

export function changeAP(state: GameState, player: PlayerState, amount: number): void {
  if (!player.alive) return;
  player.ap = Math.max(0, Math.min(player.maxAp, player.ap + amount));
  logChange(state, player, amount, "Ap");
}

function logChange(state: GameState, player: PlayerState, amount: number, stat: "Ap" | "Mp"): void {
  if (amount === 0 || !state.config.statLogs) return;
  logPrivate(state, player.id, amount > 0 ? `gain${stat}` : `lose${stat}`, { amount: Math.abs(amount) });
}

export function updateMaxValues(state: GameState, player: PlayerState){
    player.maxAp = maxAp(state, player, state.config.maxAp);
    if(player.ap > player.maxAp){
        player.ap = player.maxAp;
    }
    player.maxMp = maxMp(state, player, state.config.movement.mpCap);
    if(player.mp > player.maxMp){
        player.mp = player.maxMp;
    }
    player.maxMorale = maxMorale(state, player, state.config.maxMorale);
    if(player.morale > player.maxMorale){
        player.morale = player.maxMorale;
    }
    if(player.maxMorale <= 0){
      killPlayer(state, player, "depression");
    }
    player.maxHp = maxHp(state, player, state.config.maxHp);
    if(player.hp > player.maxHp){
        player.hp = player.maxHp;
    }
    if(player.maxHp <= 0){
      killPlayer(state, player, "injury");
    }
}
