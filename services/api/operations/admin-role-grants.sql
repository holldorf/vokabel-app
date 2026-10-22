-- Run as the migration owner after migration 037. `mural_admin` is a fresh login role used only by
-- ADMIN_DATABASE_URL. It can manage licenses and admins and read what the admin page shows, nothing else:
-- no sign-in sessions of learners, no minute ledger writes, no purchases, no conversation records.
GRANT SELECT(id, email, deleted_at) ON accounts TO mural_admin;
GRANT SELECT(account_id, balance_ms, reserved_ms) ON minute_wallets TO mural_admin;
GRANT SELECT ON access_requests TO mural_admin;
GRANT SELECT, INSERT, UPDATE ON licenses TO mural_admin;
GRANT SELECT, INSERT ON license_events, admin_user_events TO mural_admin;
GRANT USAGE ON SEQUENCE license_events_id_seq, admin_user_events_id_seq TO mural_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON admin_users, admin_challenges, admin_sessions TO mural_admin;
