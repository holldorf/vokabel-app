import { fileURLToPath } from 'node:url';
import { connectDatabase } from './db.js';
import { ServiceError } from './errors.js';
import { changeMonthlyMinutes, issueLicense, licenseEvents, listLicenses, reinstateLicense, renewLicense, revokeLicense,
  suspendLicense } from './licenses.js';

/**
 * Operator CLI for licenses until the admin website exists. Mutations read one JSON object from stdin,
 * always with `actor` and `reason` for the audit trail, for example:
 *   echo '{"email":"learner@example.com","label":"Kurs Oktober","minutesPerMonth":300,
 *          "expiresAt":"2027-03-31T23:59:59Z","actor":"admin@example.com","reason":"Pilotgruppe"}' \
 *     | npm run licenses-admin issue
 */
const commands = ['list', 'events', 'issue', 'suspend', 'reinstate', 'revoke', 'renew', 'set-minutes'] as const;
type Command = typeof commands[number];

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const command = process.argv[2] as Command | undefined, url = process.env.DATABASE_URL;
  if (!url || process.argv.length !== 3 || !commands.includes(command as Command)) {
    console.error(`Use DATABASE_URL and licenses-admin ${commands.join(' | ')}. Everything except list reads JSON from stdin.`);
    process.exitCode = 1;
  } else {
    const db = connectDatabase(url);
    try {
      let input: Record<string, any> = {};
      if (command !== 'list') {
        let data = '';
        for await (const chunk of process.stdin) { data += chunk.toString(); if (data.length > 100_000) throw new ServiceError('invalid_request'); }
        const parsed: unknown = JSON.parse(data);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new ServiceError('invalid_request');
        input = parsed as Record<string, any>;
      }
      const audit = { actor: input.actor, reason: input.reason };
      const result =
        command === 'list' ? await listLicenses(db) :
        command === 'events' ? await licenseEvents(db, String(input.id)) :
        command === 'issue' ? await issueLicense(db, { email: input.email, label: input.label, minutesPerMonth: input.minutesPerMonth,
          startsAt: input.startsAt, expiresAt: input.expiresAt }, audit) :
        command === 'suspend' ? await suspendLicense(db, String(input.id), audit) :
        command === 'reinstate' ? await reinstateLicense(db, String(input.id), audit) :
        command === 'revoke' ? await revokeLicense(db, String(input.id), audit) :
        command === 'renew' ? await renewLicense(db, String(input.id), input.expiresAt ?? null, audit) :
        await changeMonthlyMinutes(db, String(input.id), input.minutesPerMonth, audit);
      console.info(JSON.stringify(result, null, 2));
    } catch (error) {
      console.error(error instanceof ServiceError ? `Failed: ${error.code}` : 'Failed: invalid input or database error.');
      process.exitCode = 1;
    } finally { await db.end(); }
  }
}
