import { logPrivate } from "./log.ts";
import { maxAp, maxMp, maxMorale, maxHp } from "./modifiers.ts";
import type { GameState, PlayerState } from "./types.ts";
import { killPlayer } from "./death.ts";
import { shipInvincible } from "./cheats.ts";


export function gainMorale(state: GameState, player: PlayerState, amount: number): void {
  if (!player.alive || (amount < 0 && shipInvincible(state))) return;
  player.morale = Math.min(player.maxMorale, player.morale + amount); 
  player.morale = Math.max(0, player.morale);
  if(amount > 0){
    logPrivate(state, player.id, "gainMorale", {amount: amount});
  }
  else if(amount < 0){
    logPrivate(state, player.id, "loseMorale", {amount: -amount});
  }
}

export function changeMP(state: GameState, player: PlayerState, amount: number): void {
  if (!player.alive) return;
  player.mp = Math.min(player.maxMp, player.mp + amount); 
  player.mp = Math.max(0, player.mp);
}

export function changeAP(state: GameState, player: PlayerState, amount: number): void {
  if (!player.alive) return;
  player.ap = Math.min(player.maxAp, player.ap + amount); 
  player.ap = Math.max(0, player.ap);
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
