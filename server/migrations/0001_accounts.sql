-- Accounts (#23, #282). Applied by `wrangler d1 migrations apply`, which records
-- each file in d1_migrations. Append-only: once on main, never edit, rename or
-- delete this file; change the schema in a new one. Times are Unix milliseconds.
-- No email is stored, and nothing here reaches a PlayerView.

CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  -- The display name lower-cased: names are unique ignoring case.
  name_key TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  -- Null until the first rename.
  renamed_at INTEGER
);
CREATE UNIQUE INDEX accounts_name_key ON accounts (name_key);

-- Sign-in methods (Google, Discord, ...). Several per account.
CREATE TABLE identities (
  provider TEXT NOT NULL,
  provider_user_id TEXT NOT NULL,
  account_id TEXT NOT NULL REFERENCES accounts (id),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (provider, provider_user_id)
);
CREATE INDEX identities_account ON identities (account_id);

-- Only the SHA-256 of a session ID (hex) is stored, so a database leak gives
-- no usable cookies.
CREATE TABLE sessions (
  id_hash TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts (id),
  expires_at INTEGER NOT NULL
);
CREATE INDEX sessions_account ON sessions (account_id);
CREATE INDEX sessions_expiry ON sessions (expires_at);

-- Every rename, for moderators.
CREATE TABLE name_history (
  id INTEGER PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts (id),
  old_name TEXT NOT NULL,
  new_name TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX name_history_account ON name_history (account_id, at);

-- Which multiplayer ships an account has been aboard. An open row (ended_at
-- null) is the ship it is on now; the partial unique index allows at most one
-- across every language's Matchmaker (#285). Also the account-to-ships index
-- account deletion will need.
CREATE TABLE account_ships (
  id INTEGER PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts (id),
  room_id TEXT NOT NULL,
  joined_at INTEGER NOT NULL,
  ended_at INTEGER
);
CREATE UNIQUE INDEX account_ships_open ON account_ships (account_id) WHERE ended_at IS NULL;
CREATE INDEX account_ships_room ON account_ships (room_id);
