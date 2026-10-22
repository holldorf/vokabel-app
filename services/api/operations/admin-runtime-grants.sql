-- Run as the migration owner after migration 037 and the baseline runtime grants.
-- The public API role never sees admin accounts, admin sign-in challenges or admin sessions.
REVOKE ALL ON admin_users, admin_user_events, admin_challenges, admin_sessions FROM mural_runtime;
