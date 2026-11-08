// ---- Single player -----------------------------------------------------------
// Decided 2026-10-13 and 2026-10-24 (docs/rules/rules-design.md, "Single player"). Nine seats: the human is always the
// only Mush, against 8 bots who are all human. No pre-selection. End cycle is on and the clock doesn't change cycles,
// so a cycle ends once everyone, the bots included, has ended theirs (`ready`); a bot that can't reach its model
// waits, and with it the cycle (owner, 2026-10-24, #114). Eleesha, Chun and Chao, the investigation characters, are
// never bots in single player (#222); the human may pick any character.

import { CHARACTERS, type CharacterId } from "./characters.ts";
import { shuffle, type RngState } from "./rng.ts";
import type { ConfigOverrides, PlayerId, Role, Seat } from "./types.ts";

export const SINGLE_PLAYER_SEATS = 9;

/** Characters a single-player bot never plays (#222). */
export const NEVER_BOTS: readonly CharacterId[] = ["eleesha", "chun", "chao"];

/** The human's seat. */
export const SINGLE_PLAYER_HUMAN: PlayerId = "p0";

export interface SinglePlayerGame {
  seats: Seat[];
  overrides: ConfigOverrides;
  forcedRoles: Record<PlayerId, Role>;
}

/** The seats, config overrides and roles of a new single-player game. The bots' characters are drawn with `rng`. */
export function singlePlayerGame(name: string, character: CharacterId, rng: RngState): SinglePlayerGame {
  const pool = CHARACTERS.map((c) => c.id).filter((id) => id !== character && !NEVER_BOTS.includes(id));
  const [drawn] = shuffle(pool, rng);
  const bots = drawn.slice(0, SINGLE_PLAYER_SEATS - 1).map(
    (c, i): Seat => ({
      id: `p${i + 1}`,
      // Bots are always labeled as AI to players.
      // i18n-ignore: a player name; the client marks bots as AI from isBot
      name: `Bot ${i + 1} (AI)`,
      isBot: true,
      botKind: "model",
      character: c,
    }),
  );
  return {
    seats: [{ id: SINGLE_PLAYER_HUMAN, name, isBot: false, character }, ...bots],
    overrides: { mushCount: 1, manualCycles: true, instantExpeditions: true },
    forcedRoles: { [SINGLE_PLAYER_HUMAN]: "mush" },
  };
}
