-- Links an app user row to its Zitadel identity (the `sub` claim).
-- Nullable + additive: old code ignores it, new code populates it. Safe to apply
-- while the current auth is still live.

ALTER TABLE users ADD COLUMN IF NOT EXISTS zitadel_user_id VARCHAR(64);

CREATE UNIQUE INDEX IF NOT EXISTS ix_users_zitadel_user_id
    ON users (zitadel_user_id)
    WHERE zitadel_user_id IS NOT NULL;
