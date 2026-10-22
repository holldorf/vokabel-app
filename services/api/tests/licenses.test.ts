import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { connectDatabase, transaction } from '../src/db.js';
import { migrate } from '../src/migrate.js';
import { deleteAccount, digest } from '../src/auth.js';
import { readFile } from 'node:fs/promises';
import { createApp, type Services } from '../src/app.js';
import { minuteBalance } from '../src/minutes.js';
import { admitLicensed, changeMonthlyMinutes, issueLicense, licenseCode, licenseEvents, licenseStatus, licensesRequired,
  reinstateLicense, renewLicense, revokeLicense, suspendLicense, type LicenseRow } from '../src/licenses.js';

const databaseURL = process.env.TEST_DATABASE_URL;
if (databaseURL && !new URL(databaseURL).pathname.endsWith('_test')) throw new Error('Use an isolated test database.');
const integration = (name: string, fn: () => Promise<void>) => test(name, { skip: !databaseURL && 'Set TEST_DATABASE_URL.' }, fn);
const audit = { actor: 'test-operator', reason: 'Synthetic license test' };
const MINUTE = 60_000;

async function fixture() {
  const schema = `licenses_${randomUUID().replaceAll('-', '')}`, url = new URL(databaseURL!);
  url.searchParams.set('options', `-c search_path=${schema}`);
  const db = connectDatabase(url.toString()); await db.query(`CREATE SCHEMA ${schema}`); await migrate(db);
  return { db,
    async account(email = `learner-${randomUUID()}@example.test`) {
      const id = randomUUID();
      await transaction(db, async sql => {
        await sql.query('INSERT INTO accounts(id,email) VALUES($1,$2)', [id, email]);
        await sql.query('INSERT INTO wallets(account_id) VALUES($1)', [id]);
      });
      return { id, email };
    },
    async token(account: string) {
      const token = randomBytes(32).toString('base64url');
      await db.query("INSERT INTO auth_sessions(id,account_id,token_hash,expires_at) VALUES($1,$2,$3,now()+interval '1 hour')",
        [randomUUID(), account, digest(token)]);
      return `Bearer ${token}`;
    },
    async cleanup() { await db.query(`DROP SCHEMA ${schema} CASCADE`); await db.end(); }
  };
}

test('LICENSES_REQUIRED accepts only true or false and defaults to off', () => {
  assert.equal(licensesRequired({}), false);
  assert.equal(licensesRequired({ LICENSES_REQUIRED: 'false' }), false);
  assert.equal(licensesRequired({ LICENSES_REQUIRED: 'true' }), true);
  for (const value of ['1', 'yes', 'TRUE', '']) assert.throws(() => licensesRequired({ LICENSES_REQUIRED: value }));
});

test('license codes follow a fixed precedence', () => {
  const now = new Date('2026-10-20T12:00:00Z');
  const base: LicenseRow = { id: randomUUID(), account_id: randomUUID(), label: 'Kurs', starts_at: new Date('2026-10-01T00:00:00Z'),
    expires_at: new Date('2026-12-31T00:00:00Z'), minutes_per_month: 300, suspended_at: null, revoked_at: null,
    created_by: 'test', created_at: new Date('2026-10-01T00:00:00Z') };
  assert.equal(licenseCode(undefined, now), 'NOT_LICENSED');
  assert.equal(licenseCode(base, now), 'VALID');
  assert.equal(licenseCode({ ...base, expires_at: null }, now), 'VALID');
  assert.equal(licenseCode({ ...base, revoked_at: now, suspended_at: now }, now), 'NOT_LICENSED');
  assert.equal(licenseCode({ ...base, suspended_at: now, expires_at: new Date('2026-10-02T00:00:00Z') }, now), 'SUSPENDED');
  assert.equal(licenseCode({ ...base, starts_at: new Date('2026-11-01T00:00:00Z') }, now), 'NOT_STARTED');
  assert.equal(licenseCode({ ...base, expires_at: now }, now), 'EXPIRED');
});

integration('issuing validates input, allows one open license per account and records who did it', async () => {
  const f = await fixture();
  try {
    const learner = await f.account('Learner@Example.test');
    await assert.rejects(issueLicense(f.db, { email: 'nobody@example.test', label: 'Kurs', minutesPerMonth: 300 }, audit), /account_not_found/);
    await assert.rejects(issueLicense(f.db, { email: 'not-an-email', label: 'Kurs', minutesPerMonth: 300 }, audit), /invalid_email/);
    for (const minutesPerMonth of [0, 6001, 1.5, NaN])
      await assert.rejects(issueLicense(f.db, { email: learner.email, label: 'Kurs', minutesPerMonth }, audit), /invalid_minutes_per_month/);
    await assert.rejects(issueLicense(f.db, { email: learner.email, label: '', minutesPerMonth: 300 }, audit), /invalid_label/);
    await assert.rejects(issueLicense(f.db, { email: learner.email, label: 'Kurs', minutesPerMonth: 300 }, { actor: 'x', reason: 'ok reason' }), /invalid_actor/);
    await assert.rejects(issueLicense(f.db, { email: learner.email, label: 'Kurs', minutesPerMonth: 300 }, { ...audit, reason: 'a\nb c' }), /invalid_reason/);
    await assert.rejects(issueLicense(f.db, { email: learner.email, label: 'Kurs', minutesPerMonth: 300, expiresAt: '2001-01-01T00:00:00Z' }, audit),
      /invalid_expires_at/);

    const license = await issueLicense(f.db, { email: ' learner@example.TEST ', label: 'Kurs Oktober', minutesPerMonth: 300 }, audit);
    assert.equal(license.account_id, learner.id);
    assert.equal((await licenseStatus(f.db, learner.id)).code, 'VALID');
    await assert.rejects(issueLicense(f.db, { email: learner.email, label: 'Zweite', minutesPerMonth: 10 }, audit), /license_already_exists/);
    const events = await licenseEvents(f.db, license.id);
    assert.deepEqual(events.map(event => [event.action, event.actor, event.reason]), [['issued', 'test-operator', 'Synthetic license test']]);
    await assert.rejects(f.db.query('UPDATE license_events SET reason=$1', ['rewritten']), /immutable/);
  } finally { await f.cleanup(); }
});

integration('suspend, reinstate, renew, change and revoke move through audited states', async () => {
  const f = await fixture();
  try {
    const learner = await f.account();
    const license = await issueLicense(f.db, { email: learner.email, label: 'Kurs', minutesPerMonth: 300 }, audit);
    await suspendLicense(f.db, license.id, audit);
    assert.equal((await licenseStatus(f.db, learner.id)).code, 'SUSPENDED');
    await assert.rejects(suspendLicense(f.db, license.id, audit), /license_already_suspended/);
    await reinstateLicense(f.db, license.id, audit);
    assert.equal((await licenseStatus(f.db, learner.id)).code, 'VALID');
    await assert.rejects(reinstateLicense(f.db, license.id, audit), /license_not_suspended/);
    await assert.rejects(renewLicense(f.db, license.id, '2001-01-01T00:00:00Z', audit), /invalid_expires_at/);
    const renewed = await renewLicense(f.db, license.id, '2099-01-01T00:00:00Z', audit);
    assert.equal(renewed.expires_at?.toISOString(), '2099-01-01T00:00:00.000Z');
    assert.equal((await changeMonthlyMinutes(f.db, license.id, 120, audit)).minutes_per_month, 120);
    await f.db.query("UPDATE licenses SET starts_at=now()-interval '2 days', expires_at=now()-interval '1 day' WHERE id=$1", [license.id]);
    assert.equal((await licenseStatus(f.db, learner.id)).code, 'EXPIRED');
    await revokeLicense(f.db, license.id, audit);
    assert.equal((await licenseStatus(f.db, learner.id)).code, 'NOT_LICENSED');
    await assert.rejects(reinstateLicense(f.db, license.id, audit), /license_revoked/);
    await assert.rejects(suspendLicense(f.db, randomUUID(), audit), /license_not_found/);
    assert.deepEqual((await licenseEvents(f.db, license.id)).map(event => event.action),
      ['issued', 'suspended', 'reinstated', 'renewed', 'limit_changed', 'revoked']);
    // A revoked license stays in the history and a new one can be issued.
    const again = await issueLicense(f.db, { email: learner.email, label: 'Neu', minutesPerMonth: 60 }, audit);
    assert.notEqual(again.id, license.id);
    assert.equal((await f.db.query('SELECT count(*)::int AS n FROM licenses WHERE account_id=$1', [learner.id])).rows[0].n, 2);
  } finally { await f.cleanup(); }
});

integration('a valid license tops minutes up once per month and never for invalid licenses', async () => {
  const f = await fixture();
  try {
    const learner = await f.account();
    assert.equal(await admitLicensed(f.db, learner.id), 'NOT_LICENSED');
    const license = await issueLicense(f.db, { email: learner.email, label: 'Kurs', minutesPerMonth: 30 }, audit);
    await suspendLicense(f.db, license.id, audit);
    assert.equal(await admitLicensed(f.db, learner.id), 'SUSPENDED');
    assert.equal((await minuteBalance(f.db, learner.id)).availableMilliseconds, 0);
    await reinstateLicense(f.db, license.id, audit);
    assert.equal(await admitLicensed(f.db, learner.id), 'VALID');
    assert.equal((await minuteBalance(f.db, learner.id)).availableMilliseconds, 30 * MINUTE);
    // Repeated admission in the same month never adds more.
    assert.equal(await admitLicensed(f.db, learner.id), 'VALID');
    await Promise.all([admitLicensed(f.db, learner.id), admitLicensed(f.db, learner.id)]);
    assert.equal((await minuteBalance(f.db, learner.id)).availableMilliseconds, 30 * MINUTE);
    const grants = (await f.db.query('SELECT granted_ms FROM license_monthly_grants WHERE license_id=$1', [license.id])).rows;
    assert.deepEqual(grants.map(row => Number(row.granted_ms)), [30 * MINUTE]);
  } finally { await f.cleanup(); }
});

integration('revoking and re-issuing a license in the same month does not top up a second time', async () => {
  const f = await fixture();
  try {
    const learner = await f.account();
    const first = await issueLicense(f.db, { email: learner.email, label: 'Kurs', minutesPerMonth: 30 }, audit);
    assert.equal(await admitLicensed(f.db, learner.id), 'VALID');
    // The learner spends every minute, then the license is revoked and issued again.
    await transaction(f.db, async sql => {
      const { appendMinuteEntry } = await import('../src/minutes.js');
      await appendMinuteEntry(sql, learner.id, `usage:${randomUUID()}`, 'forfeit', -30 * MINUTE, 0);
    });
    await revokeLicense(f.db, first.id, audit);
    await issueLicense(f.db, { email: learner.email, label: 'Neu', minutesPerMonth: 60 }, audit);
    assert.equal(await admitLicensed(f.db, learner.id), 'VALID');
    assert.equal((await minuteBalance(f.db, learner.id)).availableMilliseconds, 0);
    assert.equal((await f.db.query('SELECT count(*)::int AS n FROM license_monthly_grants WHERE account_id=$1', [learner.id])).rows[0].n, 1);
  } finally { await f.cleanup(); }
});

integration('the monthly top-up only fills the gap below the allowance', async () => {
  const f = await fixture();
  try {
    const learner = await f.account();
    await transaction(f.db, async sql => {
      const { appendMinuteEntry } = await import('../src/minutes.js');
      await appendMinuteEntry(sql, learner.id, `purchase:${randomUUID()}`, 'purchase', 50 * MINUTE, 0, 'funded');
    });
    await issueLicense(f.db, { email: learner.email, label: 'Kurs', minutesPerMonth: 30 }, audit);
    assert.equal(await admitLicensed(f.db, learner.id), 'VALID');
    assert.equal((await minuteBalance(f.db, learner.id)).availableMilliseconds, 50 * MINUTE);
  } finally { await f.cleanup(); }
});

integration('with LICENSES_REQUIRED the hosted routes deny unlicensed accounts before any provider work', async () => {
  const f = await fixture();
  let created = 0, helpers = 0;
  const hosted = { available: true, minuteFunded: true, publicMinuteAccess: true, realFundedAccess: true, publicPaidAccess: false,
    allows: () => true, create: async () => { created++; return { id: randomUUID() }; } } as unknown as Services['hosted'];
  const hostedHelpers = { allows: () => true,
    request: async () => { helpers++; return { text: 'Hallo.' }; } } as unknown as Services['hostedHelpers'];
  const app = createApp({ db: f.db, auth: {}, hosted, hostedHelpers, licensesRequired: true });
  try {
    const learner = await f.account(), authorization = await f.token(learner.id);
    const capabilities = async () => (await app.inject({ url: '/v1/live/capabilities', headers: { authorization } })).json();
    const start = () => app.inject({ method: 'POST', url: '/v1/live/sessions',
      headers: { authorization, 'idempotency-key': randomUUID() }, payload: { sdp: 'v=0', language: 'de' } });
    const helper = () => app.inject({ method: 'POST', url: `/v1/live/sessions/${randomUUID()}/helpers`, headers: { authorization }, payload: {} });

    assert.deepEqual(await capabilities(), { hostedMinutes: false, license: 'NOT_LICENSED' });
    const denied = await start();
    assert.equal(denied.statusCode, 403); assert.equal(denied.json().error.code, 'license_not_licensed');
    assert.equal((await helper()).statusCode, 403);
    assert.equal(created, 0); assert.equal(helpers, 0);

    const license = await issueLicense(f.db, { email: learner.email, label: 'Kurs', minutesPerMonth: 20 }, audit);
    assert.deepEqual(await capabilities(), { hostedMinutes: true, experimental: true, license: 'VALID' });
    assert.equal((await app.inject({ url: '/v1/minutes', headers: { authorization } })).json().availableMilliseconds, 20 * MINUTE);
    assert.equal((await start()).statusCode, 200); assert.equal(created, 1);

    await suspendLicense(f.db, license.id, audit);
    const suspended = await start();
    assert.equal(suspended.statusCode, 403); assert.equal(suspended.json().error.code, 'license_suspended');
    assert.equal((await helper()).json().error.code, 'license_suspended');
    assert.equal(created, 1); assert.equal(helpers, 0);
  } finally { await app.close(); await f.cleanup(); }
});

integration('without LICENSES_REQUIRED hosted access behaves as before', async () => {
  const f = await fixture();
  let created = 0;
  const hosted = { available: true, minuteFunded: true, allows: () => true,
    create: async () => { created++; return { id: randomUUID() }; } } as unknown as Services['hosted'];
  const app = createApp({ db: f.db, auth: {}, hosted, hostedHelpers: { allows: () => true } as unknown as Services['hostedHelpers'] });
  try {
    const learner = await f.account(), authorization = await f.token(learner.id);
    assert.deepEqual((await app.inject({ url: '/v1/live/capabilities', headers: { authorization } })).json(), { hostedMinutes: true, experimental: true });
    const started = await app.inject({ method: 'POST', url: '/v1/live/sessions',
      headers: { authorization, 'idempotency-key': randomUUID() }, payload: { sdp: 'v=0', language: 'de' } });
    assert.equal(started.statusCode, 200); assert.equal(created, 1);
  } finally { await app.close(); await f.cleanup(); }
});

integration('deleting a licensed account keeps an anonymous tombstone so the access history stays intact', async () => {
  const f = await fixture();
  try {
    const learner = await f.account();
    const license = await issueLicense(f.db, { email: learner.email, label: 'Kurs', minutesPerMonth: 30 }, audit);
    await suspendLicense(f.db, license.id, audit);
    assert.deepEqual(await deleteAccount(f.db, learner.id), { retainedFinancialRecords: true });
    const account = (await f.db.query('SELECT email, deleted_at FROM accounts WHERE id=$1', [learner.id])).rows[0];
    assert.equal(account.email, null); assert.ok(account.deleted_at);
    assert.equal((await licenseEvents(f.db, license.id)).length, 2);
  } finally { await f.cleanup(); }
});

integration('the restricted API role can admit and top up but cannot change licenses or read the audit trail', async () => {
  const suffix = randomUUID().replaceAll('-', ''), schema = `license_runtime_${suffix}`, role = `license_runtime_${suffix}`;
  const ownerURL = new URL(databaseURL!); ownerURL.searchParams.set('options', `-c search_path=${schema}`);
  const owner = connectDatabase(ownerURL.toString());
  await owner.query(`CREATE SCHEMA ${schema}`); await migrate(owner);
  await owner.query(`CREATE ROLE ${role}; GRANT USAGE ON SCHEMA ${schema} TO ${role};
    GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA ${schema} TO ${role}`);
  for (const file of ['minute-runtime-grants.sql', 'license-runtime-grants.sql'])
    await owner.query((await readFile(new URL(`../operations/${file}`, import.meta.url), 'utf8')).replaceAll('mural_runtime', role));
  const runtimeURL = new URL(databaseURL!); runtimeURL.searchParams.set('options', `-c search_path=${schema} -c role=${role}`);
  const runtime = connectDatabase(runtimeURL.toString());
  try {
    const id = randomUUID(), email = `runtime-${suffix}@example.test`;
    await owner.query('INSERT INTO accounts(id,email) VALUES($1,$2)', [id, email]);
    await owner.query('INSERT INTO wallets(account_id) VALUES($1)', [id]);
    const license = await issueLicense(owner, { email, label: 'Kurs', minutesPerMonth: 15 }, audit);
    assert.equal(await admitLicensed(runtime, id), 'VALID');
    await Promise.all([admitLicensed(runtime, id), admitLicensed(runtime, id)]);
    assert.equal((await minuteBalance(runtime, id)).availableMilliseconds, 15 * MINUTE);
    await assert.rejects(runtime.query('UPDATE licenses SET suspended_at=NULL WHERE id=$1', [license.id]), /permission denied/);
    await assert.rejects(runtime.query('UPDATE licenses SET expires_at=NULL WHERE id=$1', [license.id]), /permission denied/);
    await assert.rejects(runtime.query("INSERT INTO licenses(id,account_id,label,minutes_per_month,created_by) VALUES($1,$2,'x',1,'x')",
      [randomUUID(), randomUUID()]), /permission denied/);
    await assert.rejects(runtime.query('SELECT * FROM license_events'), /permission denied/);
    await assert.rejects(suspendLicense(runtime, license.id, audit), /permission denied/);
    await assert.rejects(runtime.query('DELETE FROM license_monthly_grants'), /permission denied/);
  } finally {
    await runtime.end();
    await owner.query(`DROP SCHEMA ${schema} CASCADE; DROP ROLE ${role}`); await owner.end();
  }
});
