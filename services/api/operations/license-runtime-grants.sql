-- Run as the migration owner after migration 036 and the minute runtime grants.
-- The API may read licenses and record the once-per-month top-up decision, but it can never
-- issue, extend, suspend, reinstate or revoke a license, nor read or write the audit trail.
-- Those actions run through `npm run licenses-admin` on a separate operator connection.
REVOKE ALL ON licenses, license_events, license_monthly_grants FROM mural_runtime;
GRANT SELECT ON licenses TO mural_runtime;
GRANT SELECT, INSERT ON license_monthly_grants TO mural_runtime;
