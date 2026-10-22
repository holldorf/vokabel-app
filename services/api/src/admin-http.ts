import { existsSync, readFileSync } from 'node:fs';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ServiceError } from './errors.js';
import { ADMIN_SESSION_COOKIE, ADMIN_SESSION_HOURS, adminFromToken, createAdminChallenge, endAdminSession, exchangeAdminIdentity,
  licenseOverview, listAdmins, removeAdmin, roleAtLeast, setAdmin, waitlist, type Admin, type AdminConfig, type AdminRole } from './admin.js';
import { changeMonthlyMinutes, issueLicense, licenseEvents, reinstateLicense, renewLicense, revokeLicense, suspendLicense } from './licenses.js';

/** Sent by the admin page on every API call. Plain cross-site forms cannot set it, which blocks CSRF. */
export const ADMIN_REQUEST_HEADER = 'x-halani-admin';

// Google Identity Services needs these Google endpoints; everything else is same-origin only.
// Scripts stay strict. Inline styles are allowed because the Google sign-in library sets them on its
// button container; the page itself inserts all data as text, so CSS cannot be injected through data.
const CSP = ["default-src 'none'", "script-src 'self' https://accounts.google.com/gsi/client",
  "style-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/style", "connect-src 'self' https://accounts.google.com/gsi/",
  'frame-src https://accounts.google.com/gsi/', "img-src 'self' data:", "font-src 'self'", "base-uri 'none'",
  "form-action 'self'", "frame-ancestors 'none'"].join('; ');

/** The page is a fixed set of files read once at startup; no request path ever reaches the filesystem. */
function adminAssets() {
  const directory = [new URL('../admin/', import.meta.url), new URL('../../admin/', import.meta.url)].find(url => existsSync(url));
  if (!directory) throw new Error('Admin page files are missing.');
  const file = (name: string) => readFileSync(new URL(name, directory));
  return new Map([
    ['index.html', { body: file('index.html'), type: 'text/html; charset=utf-8' }],
    ['admin.js', { body: file('admin.js'), type: 'text/javascript; charset=utf-8' }],
    ['admin.css', { body: file('admin.css'), type: 'text/css; charset=utf-8' }],
  ]);
}

const cookieToken = (request: FastifyRequest) => {
  for (const part of (request.headers.cookie ?? '').split(';')) {
    const [name, ...value] = part.trim().split('=');
    if (name === ADMIN_SESSION_COOKIE) return value.join('=');
  }
  return undefined;
};
const body = (request: FastifyRequest): Record<string, unknown> => {
  if (!request.body || typeof request.body !== 'object' || Array.isArray(request.body)) throw new ServiceError('invalid_request');
  return request.body as Record<string, unknown>;
};
const licenseID = (request: FastifyRequest) => {
  const id = (request.params as { id?: string }).id ?? '';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) throw new ServiceError('license_not_found', 404);
  return id;
};

export function registerAdminRoutes(app: FastifyInstance, config: AdminConfig) {
  const assets = adminAssets();
  const secure = new URL(config.origin).protocol === 'https:';
  const cookie = (value: string, maxAge: number) =>
    `${ADMIN_SESSION_COOKIE}=${value}; Path=/v1/admin; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;

  /** The single authorization chokepoint for every admin API route. Fails closed. */
  const guard = (request: FastifyRequest) => {
    if (request.headers[ADMIN_REQUEST_HEADER] !== '1') throw new ServiceError('admin_request_rejected', 403);
    const origin = request.headers.origin;
    if (origin !== undefined && origin !== config.origin) throw new ServiceError('admin_request_rejected', 403);
  };
  const requireAdmin = async (request: FastifyRequest, role: AdminRole): Promise<Admin> => {
    guard(request);
    const admin = await adminFromToken(config.db, cookieToken(request));
    if (!roleAtLeast(admin.role, role)) throw new ServiceError('admin_forbidden', 403);
    return admin;
  };
  const audit = (admin: Admin, input: Record<string, unknown>) => ({ actor: admin.email, reason: input.reason as string });
  const options = { bodyLimit: 4096, config: { rateLimit: { max: 120, timeWindow: 60_000 } } };
  // The network limiter counts all routes together, so sign-in shares the normal limit. Guessing is not
  // a risk here: each challenge is single-use and only a Google-signed token for an admin email passes.
  const signInOptions = { bodyLimit: 20_000, config: options.config };

  const page = (name: string) => async (_request: FastifyRequest, reply: FastifyReply) => {
    const asset = assets.get(name)!;
    reply.header('Content-Type', asset.type).header('Content-Security-Policy', CSP).header('X-Frame-Options', 'DENY')
      .header('Referrer-Policy', 'strict-origin-when-cross-origin').header('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
    return reply.send(asset.body);
  };
  app.get('/admin', page('index.html'));
  app.get('/admin/', page('index.html'));
  app.get('/admin/admin.js', page('admin.js'));
  app.get('/admin/admin.css', page('admin.css'));

  app.get('/v1/admin/config', options, async request => { guard(request); return { googleClientID: config.googleClientID }; });
  app.post('/v1/admin/auth/challenge', signInOptions, async request => { guard(request); return createAdminChallenge(config.db); });
  app.post('/v1/admin/auth/exchange', signInOptions, async (request, reply) => {
    guard(request);
    const input = body(request);
    const { token, admin } = await exchangeAdminIdentity(config, input.challengeID, input.credential);
    reply.header('Set-Cookie', cookie(token, ADMIN_SESSION_HOURS * 3600));
    return admin;
  });
  app.post('/v1/admin/auth/sign-out', options, async (request, reply) => {
    guard(request);
    await endAdminSession(config.db, cookieToken(request));
    reply.header('Set-Cookie', cookie('', 0));
    return { signedOut: true };
  });
  app.get('/v1/admin/me', options, async request => requireAdmin(request, 'viewer'));

  app.get('/v1/admin/licenses', options, async request => { await requireAdmin(request, 'viewer'); return { licenses: await licenseOverview(config.db) }; });
  app.get('/v1/admin/licenses/:id/events', options, async request => {
    await requireAdmin(request, 'viewer'); return { events: await licenseEvents(config.db, licenseID(request)) };
  });
  app.post('/v1/admin/licenses', options, async request => {
    const admin = await requireAdmin(request, 'manager'), input = body(request);
    const license = await issueLicense(config.db, { email: input.email as string, label: input.label as string,
      minutesPerMonth: input.minutesPerMonth as number, startsAt: (input.startsAt as string | undefined) || undefined,
      expiresAt: (input.expiresAt as string | null | undefined) || null }, audit(admin, input));
    return { id: license.id };
  });
  app.post('/v1/admin/licenses/:id/:action', options, async request => {
    const admin = await requireAdmin(request, 'manager'), input = body(request), id = licenseID(request);
    const action = (request.params as { action: string }).action, who = audit(admin, input);
    const license =
      action === 'suspend' ? await suspendLicense(config.db, id, who) :
      action === 'reinstate' ? await reinstateLicense(config.db, id, who) :
      action === 'revoke' ? await revokeLicense(config.db, id, who) :
      action === 'renew' ? await renewLicense(config.db, id, (input.expiresAt as string | null | undefined) || null, who) :
      action === 'minutes' ? await changeMonthlyMinutes(config.db, id, input.minutesPerMonth as number, who) :
      undefined;
    if (!license) throw new ServiceError('invalid_request', 404);
    return { id: license.id };
  });

  app.get('/v1/admin/waitlist', options, async request => { await requireAdmin(request, 'viewer'); return { requests: await waitlist(config.db) }; });

  app.get('/v1/admin/admins', options, async request => { await requireAdmin(request, 'owner'); return { admins: await listAdmins(config.db) }; });
  app.post('/v1/admin/admins', options, async request => {
    const admin = await requireAdmin(request, 'owner'), input = body(request);
    return setAdmin(config.db, { email: input.email, role: input.role, reason: input.reason }, admin.email);
  });
  app.post('/v1/admin/admins/remove', options, async request => {
    const admin = await requireAdmin(request, 'owner'), input = body(request);
    return removeAdmin(config.db, { email: input.email, reason: input.reason }, admin.email);
  });
}
