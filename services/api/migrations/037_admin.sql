-- Admin website: who may manage licenses, their sign-in challenges and browser sessions.
-- The public API role gets no access to these tables (operations/admin-runtime-grants.sql);
-- admin routes use a separate ADMIN_DATABASE_URL connection with operations/admin-role-grants.sql.
CREATE TABLE admin_users (
  email text PRIMARY KEY CHECK (length(email) BETWEEN 3 AND 254 AND email = lower(btrim(email)) AND email !~ '[[:cntrl:][:space:]]'),
  role text NOT NULL CHECK (role IN ('owner','manager','viewer')),
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE admin_user_events (
  id bigserial PRIMARY KEY,
  email text NOT NULL,
  action text NOT NULL CHECK (action IN ('added','role_changed','removed')),
  role text CHECK (role IN ('owner','manager','viewer')),
  actor text NOT NULL,
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 3 AND 200 AND reason !~ '[[:cntrl:]]'),
  at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER admin_user_events_immutable BEFORE UPDATE OR DELETE ON admin_user_events
FOR EACH ROW EXECUTE FUNCTION immutable_ledger();

-- Nonces for Google sign-in on the admin page; separate from app sign-in challenges.
CREATE TABLE admin_challenges (
  id uuid PRIMARY KEY,
  nonce_hash text NOT NULL CHECK (nonce_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz NOT NULL,
  used_at timestamptz
);
CREATE INDEX admin_challenges_expiry ON admin_challenges(expires_at);

-- Only a SHA-256 digest of the session cookie is stored. Removing an admin ends their sessions.
CREATE TABLE admin_sessions (
  id uuid PRIMARY KEY,
  email text NOT NULL REFERENCES admin_users(email) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);
CREATE INDEX admin_sessions_expiry ON admin_sessions(expires_at);
