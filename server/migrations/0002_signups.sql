-- Pending sign-ups (#283, #284), and one identity per provider per account.
--
-- Pending sign-ups. A first sign-in with an unknown identity
-- doesn't create an account until the player confirms a display name, so the
-- identity waits here, under the SHA-256 of a short-lived cookie's random ID.
-- suggested_name is the provider's name if it passed checkDisplayName, else
-- null. Expired rows are refused on lookup and deleted by the daily cron.
-- Append-only, like every migration.

CREATE TABLE signups (
  id_hash TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  provider_user_id TEXT NOT NULL,
  suggested_name TEXT,
  expires_at INTEGER NOT NULL
);
CREATE INDEX signups_expiry ON signups (expires_at);

-- An account links at most one identity per provider (owner, 2026-10-30): one
-- Google and one Discord, never two Googles.
CREATE UNIQUE INDEX identities_account_provider ON identities (account_id, provider);
