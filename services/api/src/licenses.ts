import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { transaction, type Database } from './db.js';
import { ServiceError } from './errors.js';
import { appendMinuteEntry, lockMinuteWallet, MS_PER_MINUTE } from './minutes.js';

/**
 * Licenses decide who may start hosted conversations, which cost the operator real money.
 * Modelled on keygen's license lifecycle (issue, renew, suspend, reinstate, revoke) and its
 * ordered validation codes, reduced to one license per account plus a monthly minute allowance.
 */
export type LicenseCode = 'VALID' | 'NOT_LICENSED' | 'SUSPENDED' | 'NOT_STARTED' | 'EXPIRED';
export interface LicenseRow {
  id: string; account_id: string; label: string; starts_at: Date; expires_at: Date | null;
  minutes_per_month: number; suspended_at: Date | null; revoked_at: Date | null; created_by: string; created_at: Date;
}
type Query = Pick<Database, 'query'> | PoolClient;

export function licensesRequired(env: NodeJS.ProcessEnv): boolean {
  const value = env.LICENSES_REQUIRED ?? 'false';
  if (value !== 'true' && value !== 'false') throw new Error('LICENSES_REQUIRED must be true or false.');
  return value === 'true';
}

/** Fixed precedence, as in keygen: a suspended license reports SUSPENDED even when it has also expired. */
export function licenseCode(license: LicenseRow | undefined, now: Date): LicenseCode {
  if (!license || license.revoked_at) return 'NOT_LICENSED';
  if (license.suspended_at) return 'SUSPENDED';
  if (license.starts_at > now) return 'NOT_STARTED';
  if (license.expires_at && license.expires_at <= now) return 'EXPIRED';
  return 'VALID';
}

async function openLicense(db: Query, account: string, lock = false): Promise<LicenseRow | undefined> {
  return (await db.query(`SELECT * FROM licenses WHERE account_id=$1 AND revoked_at IS NULL${lock ? ' FOR UPDATE' : ''}`, [account])).rows[0];
}

export async function licenseStatus(db: Query, account: string) {
  const now: Date = (await db.query('SELECT now() AS now')).rows[0].now;
  const license = await openLicense(db, account);
  return { code: licenseCode(license, now), license };
}

const monthStart = (now: Date) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

/**
 * Tops the account up to the license's monthly allowance, once per account and calendar month (UTC),
 * even if its license is revoked and re-issued within the month.
 * Unused minutes are not multiplied: the top-up only fills the gap below the allowance, so a learner
 * holds at most one month of licensed minutes plus whatever they bought themselves.
 */
async function topUpMonthlyMinutes(sql: PoolClient, license: LicenseRow, now: Date): Promise<number> {
  const month = monthStart(now).toISOString().slice(0, 10);
  // The wallet lock serialises concurrent admissions for one account; the month row then decides.
  const wallet = await lockMinuteWallet(sql, license.account_id);
  if ((await sql.query('SELECT 1 FROM license_monthly_grants WHERE account_id=$1 AND month=$2', [license.account_id, month])).rowCount) return 0;
  const allowance = license.minutes_per_month * MS_PER_MINUTE;
  const grant = Math.max(0, allowance - (wallet.balance - wallet.reserved));
  const recorded = await sql.query(`INSERT INTO license_monthly_grants(account_id,month,license_id,granted_ms) VALUES($1,$2,$3,$4)
    ON CONFLICT DO NOTHING`, [license.account_id, month, license.id, grant]);
  if (!recorded.rowCount) return 0;
  if (grant > 0) await appendMinuteEntry(sql, license.account_id, `license:${license.account_id}:${month}`, 'gift', grant, 0, 'funded');
  return grant;
}

/**
 * The gate the hosted endpoints call before admitting a session. Fails closed: anything other than a
 * valid license denies. A valid license also receives this month's minutes on first use.
 */
export async function admitLicensed(db: Database, account: string): Promise<LicenseCode> {
  return transaction(db, async sql => {
    const now: Date = (await sql.query('SELECT now() AS now')).rows[0].now;
    // No row lock: the API role may read licenses but never change them.
    const license = await openLicense(sql, account);
    const code = licenseCode(license, now);
    if (code === 'VALID') await topUpMonthlyMinutes(sql, license!, now);
    return code;
  });
}

// ---- Administrative actions (used by the admin CLI now and the admin API later) ----

export interface Audit { actor: string; reason: string }
const auditText = (value: unknown, field: string) => {
  if (typeof value !== 'string' || value.trim().length < 3 || value.length > 200 || /[\u0000-\u001f\u007f]/.test(value))
    throw new ServiceError(`invalid_${field}`);
  return value.trim();
};
const minutesPerMonth = (value: unknown) => {
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > 6000) throw new ServiceError('invalid_minutes_per_month');
  return value as number;
};
const optionalDate = (value: unknown, field: string): Date | null => {
  if (value === undefined || value === null) return null;
  const date = value instanceof Date ? value : typeof value === 'string' ? new Date(value) : new Date(NaN);
  if (Number.isNaN(date.getTime())) throw new ServiceError(`invalid_${field}`);
  return date;
};
const snapshot = (row: LicenseRow) => ({ label: row.label, startsAt: row.starts_at, expiresAt: row.expires_at,
  minutesPerMonth: row.minutes_per_month, suspended: row.suspended_at !== null, revoked: row.revoked_at !== null });

async function record(sql: PoolClient, license: LicenseRow, action: string, audit: Audit, before?: LicenseRow) {
  await sql.query('INSERT INTO license_events(license_id,action,actor,reason,before,after) VALUES($1,$2,$3,$4,$5,$6)',
    [license.id, action, audit.actor, audit.reason, before ? JSON.stringify(snapshot(before)) : null, JSON.stringify(snapshot(license))]);
}
const checkedAudit = (audit: Audit): Audit => ({ actor: auditText(audit.actor, 'actor'), reason: auditText(audit.reason, 'reason') });

export interface IssueInput { email: string; label: string; minutesPerMonth: number; startsAt?: string | Date; expiresAt?: string | Date | null }

/** Issues a license to an existing, active account identified by its sign-in email. */
export async function issueLicense(db: Database, input: IssueInput, audit: Audit): Promise<LicenseRow> {
  const checked = checkedAudit(audit);
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
  if (!/^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/.test(email)) throw new ServiceError('invalid_email');
  const label = typeof input.label === 'string' ? input.label.trim() : '';
  if (label.length < 1 || label.length > 120 || /[\u0000-\u001f\u007f]/.test(label)) throw new ServiceError('invalid_label');
  const minutes = minutesPerMonth(input.minutesPerMonth);
  const startsAt = optionalDate(input.startsAt, 'starts_at'), expiresAt = optionalDate(input.expiresAt, 'expires_at');
  return transaction(db, async sql => {
    const accounts = (await sql.query('SELECT id FROM accounts WHERE lower(email)=$1 AND deleted_at IS NULL', [email])).rows;
    if (accounts.length !== 1) throw new ServiceError(accounts.length ? 'ambiguous_account' : 'account_not_found', accounts.length ? 409 : 404);
    const account: string = accounts[0].id;
    if (await openLicense(sql, account, true)) throw new ServiceError('license_already_exists', 409);
    const now: Date = (await sql.query('SELECT now() AS now')).rows[0].now;
    const start = startsAt ?? now;
    if (expiresAt && expiresAt <= start) throw new ServiceError('invalid_expires_at');
    const row: LicenseRow = (await sql.query(`INSERT INTO licenses(id,account_id,label,starts_at,expires_at,minutes_per_month,created_by)
      VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`, [randomUUID(), account, label, start, expiresAt, minutes, checked.actor])).rows[0];
    await record(sql, row, 'issued', checked);
    return row;
  });
}

async function change(db: Database, id: string, audit: Audit, action: string,
  apply: (row: LicenseRow, now: Date) => { sql: string; values: unknown[] }): Promise<LicenseRow> {
  const checked = checkedAudit(audit);
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new ServiceError('license_not_found', 404);
  return transaction(db, async sql => {
    const before: LicenseRow | undefined = (await sql.query('SELECT * FROM licenses WHERE id=$1 FOR UPDATE', [id])).rows[0];
    if (!before) throw new ServiceError('license_not_found', 404);
    if (before.revoked_at) throw new ServiceError('license_revoked', 409);
    const now: Date = (await sql.query('SELECT now() AS now')).rows[0].now;
    const update = apply(before, now);
    const after: LicenseRow = (await sql.query(`UPDATE licenses SET ${update.sql} WHERE id=$1 RETURNING *`, [id, ...update.values])).rows[0];
    await record(sql, after, action, checked, before);
    return after;
  });
}

export const suspendLicense = (db: Database, id: string, audit: Audit) => change(db, id, audit, 'suspended', row => {
  if (row.suspended_at) throw new ServiceError('license_already_suspended', 409);
  return { sql: 'suspended_at=now()', values: [] };
});
export const reinstateLicense = (db: Database, id: string, audit: Audit) => change(db, id, audit, 'reinstated', row => {
  if (!row.suspended_at) throw new ServiceError('license_not_suspended', 409);
  return { sql: 'suspended_at=NULL', values: [] };
});
export const revokeLicense = (db: Database, id: string, audit: Audit) => change(db, id, audit, 'revoked', () =>
  ({ sql: 'revoked_at=now()', values: [] }));
/** Sets a new end date; `null` makes the license open-ended. */
export const renewLicense = (db: Database, id: string, expiresAt: string | Date | null, audit: Audit) =>
  change(db, id, audit, 'renewed', (row, now) => {
    const date = optionalDate(expiresAt, 'expires_at');
    if (date && (date <= now || date <= row.starts_at)) throw new ServiceError('invalid_expires_at');
    return { sql: 'expires_at=$2', values: [date] };
  });
export const changeMonthlyMinutes = (db: Database, id: string, minutes: number, audit: Audit) =>
  change(db, id, audit, 'limit_changed', () => ({ sql: 'minutes_per_month=$2', values: [minutesPerMonth(minutes)] }));

export async function listLicenses(db: Query) {
  return (await db.query(`SELECT l.*, a.email FROM licenses l JOIN accounts a ON a.id=l.account_id
    ORDER BY l.revoked_at NULLS FIRST, l.created_at DESC`)).rows as (LicenseRow & { email: string | null })[];
}
export async function licenseEvents(db: Query, id: string) {
  return (await db.query('SELECT action,actor,reason,before,after,at FROM license_events WHERE license_id=$1 ORDER BY id', [id])).rows;
}
