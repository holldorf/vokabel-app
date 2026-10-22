import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { connectDatabase, transaction, type Database } from '../src/db.js';
import { migrate } from '../src/migrate.js';
import { createApp } from '../src/app.js';
import { adminConfig, setAdmin } from '../src/admin.js';
import type { verifyIdentity } from '../src/auth.js';

const databaseURL = process.env.TEST_DATABASE_URL;
if (databaseURL && !new URL(databaseURL).pathname.endsWith('_test')) throw new Error('Use an isolated test database.');
const integration = (name: string, fn: () => Promise<void>) => test(name, { skip: !databaseURL && 'Set TEST_DATABASE_URL.' }, fn);
const ORIGIN = 'https://admin.example.test', CLIENT = '123-abc.apps.googleusercontent.com';

/** Test identity verifier: the "Google token" is the verified email itself; `invalid` fails like a bad signature. */
const verifier = (async (_provider, token) => {
  if (token === 'invalid') throw new Error('bad token');
  return { provider: 'google' as const, subject: `sub-${token}`, email: token };
}) as typeof verifyIdentity;

async function fixture(adminDB?: (owner: Database, schema: string) => Promise<Database>) {
  const schema = `admin_${randomUUID().replaceAll('-', '')}`, url = new URL(databaseURL!);
  url.searchParams.set('options', `-c search_path=${schema}`);
  const db = connectDatabase(url.toString()); await db.query(`CREATE SCHEMA ${schema}`); await migrate(db);
  const admin = adminDB ? await adminDB(db, schema) : db;
  const app = createApp({ db, auth: {}, admin: { db: admin, googleClientID: CLIENT, origin: ORIGIN, identityVerifier: verifier } });
  const call = async (method: 'GET' | 'POST', url: string, options: { cookie?: string; body?: unknown; headers?: Record<string, string> } = {}) =>
    app.inject({ method, url, headers: { 'x-halani-admin': '1', ...(options.cookie ? { cookie: options.cookie } : {}), ...options.headers },
      ...(options.body !== undefined ? { payload: options.body as object } : {}) });
  return { db, admin, app, call,
    async signIn(email: string) {
      const challenge = (await call('POST', '/v1/admin/auth/challenge', { body: {} })).json();
      const response = await call('POST', '/v1/admin/auth/exchange', { body: { challengeID: challenge.challengeID, credential: email } });
      const setCookie = String(response.headers['set-cookie'] ?? '');
      return { response, setCookie, cookie: setCookie.split(';')[0]! };
    },
    async learner(email: string) {
      const id = randomUUID();
      await transaction(db, async sql => {
        await sql.query('INSERT INTO accounts(id,email) VALUES($1,$2)', [id, email]);
        await sql.query('INSERT INTO wallets(account_id) VALUES($1)', [id]);
      });
      return id;
    },
    async cleanup() { await app.close(); if (admin !== db) await admin.end(); await db.query(`DROP SCHEMA ${schema} CASCADE`); await db.end(); }
  };
}

test('admin configuration is off by default and refuses half or unsafe settings', () => {
  assert.equal(adminConfig({}), undefined);
  const base = { ADMIN_ENABLED: 'true', ADMIN_DATABASE_URL: 'postgresql://admin@db/halani', ADMIN_GOOGLE_CLIENT_ID: CLIENT,
    ADMIN_ORIGIN: ORIGIN, DATABASE_URL: 'postgresql://runtime@db/halani' };
  assert.deepEqual(adminConfig(base), { databaseURL: base.ADMIN_DATABASE_URL, googleClientID: CLIENT, origin: ORIGIN });
  assert.equal(adminConfig({ ...base, ADMIN_ORIGIN: 'http://localhost:8080' })?.origin, 'http://localhost:8080');
  for (const change of [{ ADMIN_ENABLED: 'yes' }, { ADMIN_DATABASE_URL: '' }, { ADMIN_DATABASE_URL: base.DATABASE_URL },
    { ADMIN_GOOGLE_CLIENT_ID: 'not-a-client' }, { ADMIN_ORIGIN: 'http://admin.example.test' },
    { ADMIN_ORIGIN: 'https://admin.example.test/path' }, { ADMIN_ORIGIN: 'admin.example.test' }])
    assert.throws(() => adminConfig({ ...base, ...change }), JSON.stringify(change));
});

integration('the admin page is served from a fixed file list with a strict content security policy', async () => {
  const f = await fixture();
  try {
    for (const path of ['/admin', '/admin/']) {
      const page = await f.app.inject(path);
      assert.equal(page.statusCode, 200);
      assert.match(String(page.headers['content-type']), /text\/html/);
      assert.match(String(page.headers['content-security-policy']), /default-src 'none'.*frame-ancestors 'none'/);
      assert.doesNotMatch(String(page.headers['content-security-policy']), /script-src[^;]*unsafe/);
      assert.equal(page.headers['x-frame-options'], 'DENY');
      assert.match(page.body, /Halani Admin/);
    }
    assert.match(String((await f.app.inject('/admin/admin.js')).headers['content-type']), /javascript/);
    assert.match(String((await f.app.inject('/admin/admin.css')).headers['content-type']), /text\/css/);
    for (const path of ['/admin/../package.json', '/admin/%2e%2e/package.json', '/admin/index.html', '/admin/other.js'])
      assert.equal((await f.app.inject(path)).statusCode, 404, path);
    // The page never needs innerHTML; data is always inserted as text.
    assert.doesNotMatch(await readFile(new URL('../admin/admin.js', import.meta.url), 'utf8'), /innerHTML|insertAdjacentHTML|outerHTML/);
  } finally { await f.cleanup(); }
});

integration('only listed admins can sign in, with a single-use challenge and a protected session cookie', async () => {
  const f = await fixture();
  try {
    await setAdmin(f.db, { email: 'Owner@Example.test', role: 'owner', reason: 'Bootstrap' }, 'operator-cli');
    assert.equal((await f.call('GET', '/v1/admin/me')).statusCode, 401);
    assert.equal((await f.signIn('stranger@example.test')).response.statusCode, 401);
    assert.equal((await f.signIn('invalid')).response.json().error.code, 'admin_sign_in_failed');

    const challenge = (await f.call('POST', '/v1/admin/auth/challenge', { body: {} })).json();
    const first = await f.call('POST', '/v1/admin/auth/exchange', { body: { challengeID: challenge.challengeID, credential: 'owner@example.test' } });
    assert.equal(first.statusCode, 200); assert.deepEqual(first.json(), { email: 'owner@example.test', role: 'owner' });
    const reused = await f.call('POST', '/v1/admin/auth/exchange', { body: { challengeID: challenge.challengeID, credential: 'owner@example.test' } });
    assert.equal(reused.statusCode, 401);

    const { setCookie, cookie } = await f.signIn('owner@example.test');
    for (const attribute of ['HttpOnly', 'SameSite=Strict', 'Path=/v1/admin', 'Secure', 'Max-Age=28800']) assert.match(setCookie, new RegExp(attribute));
    assert.equal((await f.call('GET', '/v1/admin/me', { cookie })).json().role, 'owner');
    // Only the digest is stored.
    const token = cookie.split('=')[1]!;
    assert.equal((await f.db.query('SELECT count(*)::int AS n FROM admin_sessions WHERE token_hash=$1', [token])).rows[0].n, 0);

    // CSRF defences: the custom header is required and a foreign Origin is refused.
    const noHeader = await f.app.inject({ method: 'GET', url: '/v1/admin/me', headers: { cookie } });
    assert.equal(noHeader.statusCode, 403);
    assert.equal((await f.call('GET', '/v1/admin/me', { cookie, headers: { origin: 'https://evil.example' } })).statusCode, 403);
    assert.equal((await f.call('GET', '/v1/admin/me', { cookie, headers: { origin: ORIGIN } })).statusCode, 200);

    // Expired and signed-out sessions stop working.
    await f.db.query("UPDATE admin_sessions SET expires_at=now()-interval '1 second' WHERE email='owner@example.test'");
    assert.equal((await f.call('GET', '/v1/admin/me', { cookie })).statusCode, 401);
    const fresh = await f.signIn('owner@example.test');
    const out = await f.call('POST', '/v1/admin/auth/sign-out', { cookie: fresh.cookie, body: {} });
    assert.match(String(out.headers['set-cookie']), /Max-Age=0/);
    assert.equal((await f.call('GET', '/v1/admin/me', { cookie: fresh.cookie })).statusCode, 401);
  } finally { await f.cleanup(); }
});

integration('roles decide what an admin may do and every change is recorded under their own email', async () => {
  const f = await fixture();
  try {
    await setAdmin(f.db, { email: 'owner@example.test', role: 'owner', reason: 'Bootstrap' }, 'operator-cli');
    await setAdmin(f.db, { email: 'manager@example.test', role: 'manager', reason: 'Course lead' }, 'operator-cli');
    await setAdmin(f.db, { email: 'viewer@example.test', role: 'viewer', reason: 'Support' }, 'operator-cli');
    const owner = (await f.signIn('owner@example.test')).cookie, manager = (await f.signIn('manager@example.test')).cookie;
    const viewer = (await f.signIn('viewer@example.test')).cookie;
    await f.learner('learner@example.test');
    const issue = { email: 'learner@example.test', label: 'Kurs Oktober', minutesPerMonth: 300, reason: 'Pilotgruppe',
      actor: 'spoofed@example.test' };

    assert.equal((await f.call('POST', '/v1/admin/licenses', { cookie: viewer, body: issue })).json().error.code, 'admin_forbidden');
    const issued = await f.call('POST', '/v1/admin/licenses', { cookie: manager, body: issue });
    assert.equal(issued.statusCode, 200);
    const id = issued.json().id;
    const list = (await f.call('GET', '/v1/admin/licenses', { cookie: viewer })).json().licenses;
    assert.equal(list.length, 1);
    assert.equal(list[0].email, 'learner@example.test'); assert.equal(list[0].status, 'VALID'); assert.equal(list[0].minutesPerMonth, 300);

    assert.equal((await f.call('POST', `/v1/admin/licenses/${id}/suspend`, { cookie: viewer, body: { reason: 'Pause' } })).statusCode, 403);
    assert.equal((await f.call('POST', `/v1/admin/licenses/${id}/suspend`, { cookie: manager, body: { reason: 'Kurspause' } })).statusCode, 200);
    assert.equal((await f.call('POST', `/v1/admin/licenses/${id}/reinstate`, { cookie: manager, body: { reason: 'Weiter' } })).statusCode, 200);
    assert.equal((await f.call('POST', `/v1/admin/licenses/${id}/renew`, { cookie: manager,
      body: { expiresAt: '2099-01-01T00:00:00Z', reason: 'Verlängert' } })).statusCode, 200);
    assert.equal((await f.call('POST', `/v1/admin/licenses/${id}/minutes`, { cookie: manager,
      body: { minutesPerMonth: 120, reason: 'Weniger' } })).statusCode, 200);
    assert.equal((await f.call('POST', `/v1/admin/licenses/${id}/unknown`, { cookie: manager, body: { reason: 'Nope' } })).statusCode, 404);
    assert.equal((await f.call('POST', `/v1/admin/licenses/${id}/revoke`, { cookie: manager, body: { reason: 'x' } })).json().error.code, 'invalid_reason');
    assert.equal((await f.call('POST', `/v1/admin/licenses/${id}/revoke`, { cookie: manager, body: { reason: 'Kurs beendet' } })).statusCode, 200);
    const events = (await f.call('GET', `/v1/admin/licenses/${id}/events`, { cookie: viewer })).json().events;
    assert.deepEqual(events.map((event: { action: string }) => event.action), ['issued', 'suspended', 'reinstated', 'renewed', 'limit_changed', 'revoked']);
    assert.ok(events.every((event: { actor: string }) => event.actor === 'manager@example.test'));

    // Admin management is owner-only and keeps at least one owner.
    assert.equal((await f.call('GET', '/v1/admin/admins', { cookie: manager })).statusCode, 403);
    assert.equal((await f.call('POST', '/v1/admin/admins', { cookie: manager, body: { email: 'x@example.test', role: 'owner', reason: 'Grab' } })).statusCode, 403);
    assert.equal((await f.call('GET', '/v1/admin/admins', { cookie: owner })).json().admins.length, 3);
    assert.equal((await f.call('POST', '/v1/admin/admins', { cookie: owner, body: { email: 'owner@example.test', role: 'viewer', reason: 'Oops' } }))
      .json().error.code, 'last_owner_required');
    assert.equal((await f.call('POST', '/v1/admin/admins/remove', { cookie: owner, body: { email: 'owner@example.test', reason: 'Oops' } }))
      .json().error.code, 'cannot_remove_self');
    // Removing an admin ends their session at once.
    assert.equal((await f.call('POST', '/v1/admin/admins/remove', { cookie: owner, body: { email: 'manager@example.test', reason: 'Left the team' } })).statusCode, 200);
    assert.equal((await f.call('GET', '/v1/admin/licenses', { cookie: manager })).statusCode, 401);
    // Promoting a viewer takes effect on their next request, without signing in again.
    assert.equal((await f.call('POST', '/v1/admin/admins', { cookie: owner, body: { email: 'viewer@example.test', role: 'manager', reason: 'Promoted' } })).statusCode, 200);
    assert.equal((await f.call('GET', '/v1/admin/me', { cookie: viewer })).json().role, 'manager');
    assert.deepEqual((await f.db.query('SELECT action, actor FROM admin_user_events ORDER BY id')).rows.slice(-2).map(row => [row.action, row.actor]),
      [['removed', 'owner@example.test'], ['role_changed', 'owner@example.test']]);
  } finally { await f.cleanup(); }
});

integration('the waitlist shows who already has an account or license', async () => {
  const f = await fixture();
  try {
    await setAdmin(f.db, { email: 'owner@example.test', role: 'owner', reason: 'Bootstrap' }, 'operator-cli');
    const owner = (await f.signIn('owner@example.test')).cookie;
    for (const email of ['waiting@example.test', 'signed-up@example.test', 'licensed@example.test'])
      await f.db.query("INSERT INTO access_requests(email,consent_version,source) VALUES($1,'waitlist-v1','website')", [email]);
    await f.learner('signed-up@example.test'); await f.learner('licensed@example.test');
    await f.call('POST', '/v1/admin/licenses', { cookie: owner, body: { email: 'licensed@example.test', label: 'Kurs', minutesPerMonth: 60, reason: 'Pilot' } });
    const rows = (await f.call('GET', '/v1/admin/waitlist', { cookie: owner })).json().requests;
    const byEmail = Object.fromEntries(rows.map((row: { email: string }) => [row.email, row]));
    assert.deepEqual([byEmail['waiting@example.test'].hasAccount, byEmail['waiting@example.test'].hasLicense], [false, false]);
    assert.deepEqual([byEmail['signed-up@example.test'].hasAccount, byEmail['signed-up@example.test'].hasLicense], [true, false]);
    assert.deepEqual([byEmail['licensed@example.test'].hasAccount, byEmail['licensed@example.test'].hasLicense], [true, true]);
  } finally { await f.cleanup(); }
});

integration('the admin database role can run the admin page but cannot touch learner sessions or the minute ledger', async () => {
  let role = '';
  const f = await fixture(async (owner, schema) => {
    role = `admin_role_${randomUUID().replaceAll('-', '')}`;
    await owner.query(`CREATE ROLE ${role}; GRANT USAGE ON SCHEMA ${schema} TO ${role}`);
    await owner.query((await readFile(new URL('../operations/admin-role-grants.sql', import.meta.url), 'utf8')).replaceAll('mural_admin', role));
    const url = new URL(databaseURL!); url.searchParams.set('options', `-c search_path=${schema} -c role=${role}`);
    return connectDatabase(url.toString());
  });
  try {
    await setAdmin(f.db, { email: 'owner@example.test', role: 'owner', reason: 'Bootstrap' }, 'operator-cli');
    const owner = (await f.signIn('owner@example.test')).cookie;
    await f.learner('learner@example.test');
    const id = (await f.call('POST', '/v1/admin/licenses', { cookie: owner,
      body: { email: 'learner@example.test', label: 'Kurs', minutesPerMonth: 60, reason: 'Pilot' } })).json().id;
    assert.ok(id);
    assert.equal((await f.call('POST', `/v1/admin/licenses/${id}/suspend`, { cookie: owner, body: { reason: 'Pause' } })).statusCode, 200);
    assert.equal((await f.call('GET', '/v1/admin/licenses', { cookie: owner })).json().licenses[0].status, 'SUSPENDED');
    assert.equal((await f.call('GET', '/v1/admin/waitlist', { cookie: owner })).statusCode, 200);
    assert.equal((await f.call('POST', '/v1/admin/admins', { cookie: owner, body: { email: 'm@example.test', role: 'manager', reason: 'Team' } })).statusCode, 200);
    for (const sql of ['SELECT * FROM auth_sessions', 'SELECT * FROM minute_entries', "UPDATE minute_wallets SET balance_ms=0",
      'SELECT * FROM identities', 'DELETE FROM license_events', "UPDATE accounts SET email='x'", 'SELECT * FROM hosted_sessions'])
      await assert.rejects(f.admin.query(sql), /permission denied|immutable/, sql);
  } finally {
    await f.cleanup();
    if (role) { const cleanup = connectDatabase(databaseURL!); await cleanup.query(`DROP OWNED BY ${role}; DROP ROLE ${role}`).catch(() => {}); await cleanup.end(); }
  }
});
