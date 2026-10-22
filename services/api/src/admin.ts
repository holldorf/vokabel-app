import { randomBytes, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { connectDatabase, transaction, type Database } from './db.js';
import { ServiceError } from './errors.js';
import { digest, verifyIdentity } from './auth.js';
import { licenseCode, type LicenseRow } from './licenses.js';
import { MS_PER_MINUTE } from './minutes.js';

/** Admin roles, weakest first. Each role includes everything the roles before it may do. */
export const ADMIN_ROLES = ['viewer', 'manager', 'owner'] as const;
export type AdminRole = typeof ADMIN_ROLES[number];
export interface Admin { email: string; role: AdminRole }
export interface AdminConfig { db: Database; googleClientID: string; origin: string; identityVerifier?: typeof verifyIdentity }

export const ADMIN_SESSION_COOKIE = 'halani_admin';
export const ADMIN_SESSION_HOURS = 8;
const SESSION_TOKEN = /^[A-Za-z0-9_-]{43}$/;

/** Strict startup configuration; anything half-configured refuses to start. */
export function adminConfig(env: NodeJS.ProcessEnv): Omit<AdminConfig, 'db'> & { databaseURL: string } | undefined {
  const enabled = env.ADMIN_ENABLED ?? 'false';
  if (enabled !== 'true' && enabled !== 'false') throw new Error('ADMIN_ENABLED must be true or false.');
  if (enabled === 'false') return undefined;
  const databaseURL = env.ADMIN_DATABASE_URL ?? '', googleClientID = env.ADMIN_GOOGLE_CLIENT_ID ?? '', origin = env.ADMIN_ORIGIN ?? '';
  if (!/^postgres(ql)?:\/\//.test(databaseURL)) throw new Error('ADMIN_DATABASE_URL must be a separate PostgreSQL connection.');
  if (databaseURL === env.DATABASE_URL) throw new Error('ADMIN_DATABASE_URL must use a different role than DATABASE_URL.');
  if (!/^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$/.test(googleClientID)) throw new Error('ADMIN_GOOGLE_CLIENT_ID must be a Google web client ID.');
  let parsed: URL;
  try { parsed = new URL(origin); } catch { throw new Error('ADMIN_ORIGIN must be an origin such as https://admin.example.com.'); }
  const local = parsed.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(parsed.hostname);
  if ((parsed.protocol !== 'https:' && !local) || parsed.origin !== origin) throw new Error('ADMIN_ORIGIN must be an https origin without a path.');
  return { databaseURL, googleClientID, origin };
}

export const normalEmail = (value: unknown) => {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!/^[^\s@\x00-\x1f\x7f]{1,64}@[^\s@\x00-\x1f\x7f]{1,189}\.[^\s@\x00-\x1f\x7f]{2,}$/.test(email)) throw new ServiceError('invalid_email');
  return email;
};
const reasonText = (value: unknown) => {
  if (typeof value !== 'string' || value.trim().length < 3 || value.length > 200 || /[\u0000-\u001f\u007f]/.test(value))
    throw new ServiceError('invalid_reason');
  return value.trim();
};
const role = (value: unknown): AdminRole => {
  if (!ADMIN_ROLES.includes(value as AdminRole)) throw new ServiceError('invalid_role');
  return value as AdminRole;
};
export const roleAtLeast = (actual: AdminRole, needed: AdminRole) => ADMIN_ROLES.indexOf(actual) >= ADMIN_ROLES.indexOf(needed);

// ---- Sign-in ----

export async function createAdminChallenge(db: Database) {
  const id = randomUUID(), nonce = randomBytes(32).toString('hex');
  await db.query("INSERT INTO admin_challenges(id,nonce_hash,expires_at) VALUES($1,$2,now()+interval '5 minutes')", [id, digest(nonce)]);
  return { challengeID: id, nonce, expiresInSeconds: 300 };
}

/**
 * Exchanges a Google ID token for an admin session. The token must be issued for the admin web
 * client, carry this challenge's nonce and a Google-verified email that is listed in admin_users.
 * Every refusal looks the same to the caller.
 */
export async function exchangeAdminIdentity(config: AdminConfig, challengeID: unknown, credential: unknown) {
  if (typeof challengeID !== 'string' || !/^[0-9a-f-]{36}$/.test(challengeID) || typeof credential !== 'string')
    throw new ServiceError('invalid_request');
  // Single use: the challenge is consumed before the token is checked, so a failed attempt cannot be retried.
  const challenge = (await config.db.query(`UPDATE admin_challenges SET used_at=now()
    WHERE id=$1 AND used_at IS NULL AND expires_at>now() RETURNING nonce_hash`, [challengeID])).rows[0];
  if (!challenge) throw new ServiceError('admin_sign_in_failed', 401);
  const identity = await (config.identityVerifier ?? verifyIdentity)('google', credential, challenge.nonce_hash,
    { googleClientID: config.googleClientID }).catch(() => { throw new ServiceError('admin_sign_in_failed', 401); });
  if (identity.provider !== 'google' || !identity.email) throw new ServiceError('admin_sign_in_failed', 401);
  const email = identity.email.toLowerCase();
  const admin = (await config.db.query('SELECT email, role FROM admin_users WHERE email=$1', [email])).rows[0] as Admin | undefined;
  if (!admin) throw new ServiceError('admin_sign_in_failed', 401);
  const token = randomBytes(32).toString('base64url');
  await config.db.query(`INSERT INTO admin_sessions(id,email,token_hash,expires_at)
    VALUES($1,$2,$3,now()+make_interval(hours => $4))`, [randomUUID(), admin.email, digest(token), ADMIN_SESSION_HOURS]);
  return { token, admin };
}

/** Resolves the session cookie to the admin's current role; removed admins lose access immediately. */
export async function adminFromToken(db: Database, token: string | undefined): Promise<Admin> {
  if (!token || !SESSION_TOKEN.test(token)) throw new ServiceError('admin_sign_in_required', 401);
  const admin = (await db.query(`SELECT u.email, u.role FROM admin_sessions s JOIN admin_users u ON u.email=s.email
    WHERE s.token_hash=$1 AND s.expires_at>now() AND s.revoked_at IS NULL`, [digest(token)])).rows[0] as Admin | undefined;
  if (!admin) throw new ServiceError('admin_sign_in_required', 401);
  return admin;
}

export async function endAdminSession(db: Database, token: string | undefined) {
  if (token && SESSION_TOKEN.test(token))
    await db.query('UPDATE admin_sessions SET revoked_at=now() WHERE token_hash=$1 AND revoked_at IS NULL', [digest(token)]);
}

export async function pruneAdminRecords(db: Database) {
  await db.query("DELETE FROM admin_challenges WHERE expires_at < now() - interval '1 day'");
  await db.query("DELETE FROM admin_sessions WHERE expires_at < now() - interval '7 days'");
}

// ---- Admin management (owner only at the HTTP layer) ----

export async function listAdmins(db: Pick<Database, 'query'>) {
  return (await db.query('SELECT email, role, created_by, created_at FROM admin_users ORDER BY email')).rows;
}

/** Adds an admin or changes their role. The last owner can never be demoted. */
export async function setAdmin(db: Database, input: { email: unknown; role: unknown; reason: unknown }, actor: string) {
  const email = normalEmail(input.email), next = role(input.role), reason = reasonText(input.reason);
  return transaction(db, async sql => {
    await sql.query("SELECT pg_advisory_xact_lock(hashtext('halani-admin-users'))");
    const existing = (await sql.query('SELECT role FROM admin_users WHERE email=$1', [email])).rows[0];
    if (existing?.role === next) return { email, role: next, changed: false };
    if (existing?.role === 'owner' && next !== 'owner' &&
      Number((await sql.query("SELECT count(*) FROM admin_users WHERE role='owner'")).rows[0].count) <= 1)
      throw new ServiceError('last_owner_required', 409);
    if (existing) await sql.query('UPDATE admin_users SET role=$2 WHERE email=$1', [email, next]);
    else await sql.query('INSERT INTO admin_users(email,role,created_by) VALUES($1,$2,$3)', [email, next, actor]);
    await sql.query('INSERT INTO admin_user_events(email,action,role,actor,reason) VALUES($1,$2,$3,$4,$5)',
      [email, existing ? 'role_changed' : 'added', next, actor, reason]);
    return { email, role: next, changed: true };
  });
}

export async function removeAdmin(db: Database, input: { email: unknown; reason: unknown }, actor: string) {
  const email = normalEmail(input.email), reason = reasonText(input.reason);
  if (email === actor) throw new ServiceError('cannot_remove_self', 409);
  return transaction(db, async sql => {
    await sql.query("SELECT pg_advisory_xact_lock(hashtext('halani-admin-users'))");
    const existing = (await sql.query('SELECT role FROM admin_users WHERE email=$1', [email])).rows[0];
    if (!existing) throw new ServiceError('admin_not_found', 404);
    if (existing.role === 'owner' && Number((await sql.query("SELECT count(*) FROM admin_users WHERE role='owner'")).rows[0].count) <= 1)
      throw new ServiceError('last_owner_required', 409);
    await sql.query('DELETE FROM admin_users WHERE email=$1', [email]);
    await sql.query('INSERT INTO admin_user_events(email,action,role,actor,reason) VALUES($1,$2,NULL,$3,$4)', [email, 'removed', actor, reason]);
    return { email, removed: true };
  });
}

// ---- Read models for the admin page ----

/** Licenses with their current status code and the learner's available minutes. */
export async function licenseOverview(db: Pick<Database, 'query'>) {
  const now: Date = (await db.query('SELECT now() AS now')).rows[0].now;
  const rows = (await db.query(`SELECT l.*, a.email, a.deleted_at AS account_deleted_at,
      GREATEST(COALESCE(w.balance_ms,0)-COALESCE(w.reserved_ms,0),0) AS available_ms
    FROM licenses l JOIN accounts a ON a.id=l.account_id LEFT JOIN minute_wallets w ON w.account_id=l.account_id
    ORDER BY l.revoked_at NULLS FIRST, l.created_at DESC LIMIT 2000`)).rows as (LicenseRow & { email: string | null; available_ms: string })[];
  return rows.map(row => ({
    id: row.id, email: row.email, label: row.label, status: licenseCode(row, now),
    suspended: row.suspended_at !== null, revoked: row.revoked_at !== null,
    startsAt: row.starts_at, expiresAt: row.expires_at, minutesPerMonth: row.minutes_per_month,
    availableMinutes: Math.floor(Number(row.available_ms) / MS_PER_MINUTE), createdBy: row.created_by, createdAt: row.created_at,
  }));
}

/** The website waitlist, newest first, marked when the person already has an account or license. */
export async function waitlist(db: Pick<Database, 'query'>) {
  return (await db.query(`SELECT r.email, r.requested_at,
      EXISTS(SELECT 1 FROM accounts a WHERE lower(a.email)=r.email AND a.deleted_at IS NULL) AS has_account,
      EXISTS(SELECT 1 FROM licenses l JOIN accounts a ON a.id=l.account_id
        WHERE lower(a.email)=r.email AND l.revoked_at IS NULL) AS has_license
    FROM access_requests r ORDER BY r.requested_at DESC LIMIT 1000`)).rows
    .map(row => ({ email: row.email, requestedAt: row.requested_at, hasAccount: row.has_account, hasLicense: row.has_license }));
}

// ---- CLI: bootstrap the first owner on the admin connection ----

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [command, emailArg, roleArg] = process.argv.slice(2), url = process.env.ADMIN_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url || !['list', 'set', 'remove'].includes(command ?? '') || (command !== 'list' && !emailArg) || (command === 'set' && !roleArg)) {
    console.error('Use ADMIN_DATABASE_URL and admin-users list | set <email> <owner|manager|viewer> | remove <email>.');
    process.exitCode = 1;
  } else {
    const db = connectDatabase(url);
    try {
      const actor = 'operator-cli', reason = 'Set from the operator command line';
      const result = command === 'list' ? await listAdmins(db) :
        command === 'set' ? await setAdmin(db, { email: emailArg, role: roleArg, reason }, actor) :
        await removeAdmin(db, { email: emailArg, reason }, actor);
      console.info(JSON.stringify(result, null, 2));
    } catch (error) {
      console.error(error instanceof ServiceError ? `Failed: ${error.code}` : 'Failed: database error.');
      process.exitCode = 1;
    } finally { await db.end(); }
  }
}
