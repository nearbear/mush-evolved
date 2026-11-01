import { changeAP } from "../adjustStats.ts";
import { isSuperInactive } from "../inactivity.ts";
import { logPrivate } from "../log.ts";
import type { Modifier } from "../modifiers.ts";
import { rollInt } from "../rng.ts";

// Skill "logistics", confirmed 2026-10-16: each cycle, after AP is refilled, `logistics.ap` AP goes to a random
// living other player in your room who is below the AP cap (Mush count). Free for the giver; if nobody
// qualifies nothing happens. Super inactive crew are skipped (owner, 2026-10-31, #145). Both sides get a private log line.
export const logistics: Modifier = {
  onCycle(next, player) {
    if (!player.alive) return;
    const takers = next.players.filter((o) => o.id !== player.id && o.alive && o.room === player.room && o.ap < o.maxAp && !isSuperInactive(o));
    if (takers.length === 0) return;
    const taker = takers[rollInt(next, takers.length)]!;
    changeAP(next, taker, next.config.logistics.ap);
    logPrivate(next, player.id, "logisticsGave", { target: taker.character });
    logPrivate(next, taker.id, "logisticsGot", { name: player.character });
  },
};
