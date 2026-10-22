-- Licenses decide who may start hosted (operator-paid) conversations when LICENSES_REQUIRED=true.
-- Rows are never deleted: revoking sets revoked_at so the history of who had access stays auditable.
CREATE TABLE licenses (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES accounts(id),
  label text NOT NULL CHECK (length(btrim(label)) BETWEEN 1 AND 120 AND label !~ '[[:cntrl:]]'),
  starts_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz CHECK (expires_at IS NULL OR expires_at > starts_at),
  minutes_per_month integer NOT NULL CHECK (minutes_per_month BETWEEN 1 AND 6000),
  suspended_at timestamptz,
  revoked_at timestamptz,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Lets monthly grants reference (license, account) together instead of accounts directly.
  CONSTRAINT licenses_id_account UNIQUE (id, account_id)
);
-- At most one license per account that has not been revoked.
CREATE UNIQUE INDEX licenses_one_open_per_account ON licenses(account_id) WHERE revoked_at IS NULL;
-- Full index for account lookups and the foreign-key check when accounts are deleted.
CREATE INDEX licenses_account ON licenses(account_id);

CREATE TABLE license_events (
  id bigserial PRIMARY KEY,
  license_id uuid NOT NULL REFERENCES licenses(id),
  action text NOT NULL CHECK (action IN ('issued','renewed','suspended','reinstated','revoked','limit_changed')),
  actor text NOT NULL CHECK (length(btrim(actor)) BETWEEN 3 AND 200 AND actor !~ '[[:cntrl:]]'),
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 3 AND 200 AND reason !~ '[[:cntrl:]]'),
  before jsonb,
  after jsonb NOT NULL,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX license_events_license ON license_events(license_id, at);
CREATE TRIGGER license_events_immutable BEFORE UPDATE OR DELETE ON license_events
FOR EACH ROW EXECUTE FUNCTION immutable_ledger();

-- One monthly top-up decision per account and calendar month (UTC). The row is written even when
-- nothing was added, so spending minutes later in the month never triggers a second top-up. It is keyed
-- by account, not license, so revoking and re-issuing a license within a month cannot top up again.
-- account_id is checked through the license (composite key), so deleting accounts needs no extra check here.
CREATE TABLE license_monthly_grants (
  account_id uuid NOT NULL,
  month date NOT NULL CHECK (month = date_trunc('month', month)::date),
  license_id uuid NOT NULL,
  granted_ms bigint NOT NULL CHECK (granted_ms >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, month),
  FOREIGN KEY (license_id, account_id) REFERENCES licenses(id, account_id)
);
CREATE TRIGGER license_monthly_grants_immutable BEFORE UPDATE OR DELETE ON license_monthly_grants
FOR EACH ROW EXECUTE FUNCTION immutable_ledger();
