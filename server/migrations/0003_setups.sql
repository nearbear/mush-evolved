-- Posted setups (#233): one store for every language. Append-only, like every
-- migration. Times are Unix milliseconds.
--
-- A row is one version, immutable once posted: a change is a new row whose
-- previous_id names the version it follows. Nothing is ever deleted. text and
-- knobs are JSON (SetupTexts and SetupKnobs in shared/src/setups.ts), checked
-- when posted; a row that no longer validates after a rules change drops off
-- the list but is still found by ID. The owner's display name is joined in from
-- accounts when read.

CREATE TABLE setups (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES accounts (id),
  version INTEGER NOT NULL,
  previous_id TEXT REFERENCES setups (id),
  text TEXT NOT NULL,
  knobs TEXT NOT NULL,
  rules_version TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  -- A moderation takedown (#289): unused until that is built.
  taken_down_at INTEGER
);
-- Only the newest version gets a new one, so a version has at most one successor.
CREATE UNIQUE INDEX setups_previous ON setups (previous_id) WHERE previous_id IS NOT NULL;
CREATE INDEX setups_owner ON setups (owner_id, version);
CREATE INDEX setups_created ON setups (created_at);
