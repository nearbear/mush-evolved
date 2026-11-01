-- Finished games (#155): one row per game, written by its room when the game ends (server/src/gameStore.ts), so a
-- game that hasn't ended is never here. Append-only, like every migration. Times are Unix milliseconds.
--
-- Single-player games are recorded only when their player had an account (single_player = 1) and are never on the
-- public list; only their player sees them (#332). Ships retired by a STATE_VERSION bump never ended and are never
-- recorded. Nothing is deleted until retention is decided (#132).

CREATE TABLE games (
  room_id TEXT PRIMARY KEY,
  -- The lobby language it was launched from; null for a room launched without one (tests).
  language TEXT,
  single_player INTEGER NOT NULL,
  started_at INTEGER NOT NULL,
  ended_at INTEGER NOT NULL,
  cycles INTEGER NOT NULL,
  winner TEXT NOT NULL,
  ending TEXT NOT NULL,
  setup_id TEXT,
  rules_version TEXT NOT NULL
);
-- The public list, newest first, paged by (ended_at, room_id).
CREATE INDEX games_public ON games (ended_at DESC, room_id DESC) WHERE single_player = 0;

-- Each seat: the player, not the body (a Transfer moves a player to another character).
CREATE TABLE game_players (
  room_id TEXT NOT NULL REFERENCES games (room_id),
  seat TEXT NOT NULL,
  -- The account that played the seat; null for a bot or a seat taken without one. Never sent by a public route.
  account_id TEXT REFERENCES accounts (id),
  -- The name at the time of the game.
  name TEXT NOT NULL,
  is_bot INTEGER NOT NULL,
  start_character TEXT NOT NULL,
  end_character TEXT NOT NULL,
  -- The role when the Mush were chosen, and at the end: "human" or "mush".
  start_role TEXT NOT NULL,
  end_role TEXT NOT NULL,
  alive INTEGER NOT NULL,
  PRIMARY KEY (room_id, seat)
);
-- An account's own games (#332).
CREATE INDEX game_players_account ON game_players (account_id) WHERE account_id IS NOT NULL;
