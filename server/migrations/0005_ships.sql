-- Running ships (#431, docs/ops/observability.md): one row per ship that is running now, written by its room at
-- launch and deleted when its game ends, in the same batch as its `games` row (server/src/shipStore.ts). So the table
-- never holds a finished ship and needs no retention rule. The daily sweep (shipSweep.ts) removes the rows of ships
-- that never end (retired by a STATE_VERSION bump, a crash mid-launch). Append-only, like every migration. Times are
-- Unix milliseconds.
--
-- No player information: who is aboard is in account_ships. A single-player game gets a row whether or not its
-- player had an account (it is load).

CREATE TABLE ships (
  room_id TEXT PRIMARY KEY,
  -- The lobby language it was launched from; null for a room launched without one (tests).
  language TEXT,
  single_player INTEGER NOT NULL,
  -- How many seats the ship has: its pre-selection seat count, or the crew it launched with.
  seats INTEGER NOT NULL,
  launched_at INTEGER NOT NULL
);
