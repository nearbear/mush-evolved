import { logPrivate } from "../log.ts";
import type { Modifier } from "../modifiers.ts";
import { nextInt } from "../rng.ts";

// Skill "logistics", confirmed 2026-10-16: each cycle, after AP is refilled, `logistics.ap` AP goes to a random
// living other player in your room who is below the AP cap (Mush count). Free for the giver; if nobody
// qualifies nothing happens. Both sides get a private log line.
export const logistics: Modifier = {
  onCycle(next, player) {
    if (!player.alive) return;
    const takers = next.players.filter((o) => o.id !== player.id && o.alive && o.room === player.room && o.ap < next.config.maxAp);
    if (takers.length === 0) return;
    const [i, rng] = nextInt(next.rng, takers.length);
    next.rng = rng;
    const taker = takers[i]!;
    taker.ap = Math.min(next.config.maxAp, taker.ap + next.config.logistics.ap);
    logPrivate(next, player.id, "logisticsGave", { target: taker.character });
    logPrivate(next, taker.id, "logisticsGot", { name: player.character });
  },
};
