// Halani admin page. Plain JavaScript, no build step. All data is inserted as text, never as HTML.
'use strict';

const root = document.getElementById('root');
const dialog = document.getElementById('dialog');
const toastBox = document.getElementById('toast');
const state = { me: null, tab: 'licenses', licenses: [], filter: 'open', query: '' };

const MESSAGES = {
  account_not_found: 'Zu dieser E-Mail gibt es kein Konto. Die Person muss sich zuerst einmal in der App anmelden.',
  ambiguous_account: 'Diese E-Mail gehört zu mehreren Konten. Bitte wende dich an den Support.',
  license_already_exists: 'Diese Person hat schon eine Lizenz.',
  license_already_suspended: 'Die Lizenz ist bereits pausiert.',
  license_not_suspended: 'Die Lizenz ist nicht pausiert.',
  license_revoked: 'Die Lizenz wurde bereits entzogen.',
  license_not_found: 'Die Lizenz wurde nicht gefunden.',
  invalid_email: 'Bitte eine gültige E-Mail-Adresse eingeben.',
  invalid_label: 'Bitte eine Bezeichnung mit höchstens 120 Zeichen eingeben.',
  invalid_minutes_per_month: 'Minuten pro Monat: eine ganze Zahl zwischen 1 und 6000.',
  invalid_expires_at: 'Das Ablaufdatum muss nach dem Startdatum liegen.',
  invalid_starts_at: 'Bitte ein gültiges Startdatum wählen.',
  invalid_reason: 'Bitte einen Grund mit 3 bis 200 Zeichen angeben.',
  invalid_role: 'Bitte eine Rolle wählen.',
  last_owner_required: 'Es muss immer mindestens einen Eigentümer geben.',
  cannot_remove_self: 'Du kannst dich nicht selbst entfernen.',
  admin_not_found: 'Dieser Admin wurde nicht gefunden.',
  admin_forbidden: 'Dafür fehlen dir die Rechte.',
  admin_sign_in_failed: 'Anmeldung fehlgeschlagen. Nur freigeschaltete Admin-Konten können sich anmelden.',
  rate_limit: 'Zu viele Anfragen. Bitte kurz warten.',
};
const STATUS = { VALID: 'Aktiv', SUSPENDED: 'Pausiert', NOT_STARTED: 'Startet später', EXPIRED: 'Abgelaufen', REVOKED: 'Entzogen' };
const ROLES = { owner: 'Eigentümer', manager: 'Verwalter', viewer: 'Nur lesen' };
const ACTIONS = { issued: 'Vergeben', renewed: 'Verlängert', suspended: 'Pausiert', reinstated: 'Fortgesetzt', revoked: 'Entzogen', limit_changed: 'Minuten geändert' };
const RANK = { viewer: 0, manager: 1, owner: 2 };
const can = role => state.me && RANK[state.me.role] >= RANK[role];

class ApiError extends Error { constructor(status, code) { super(code); this.status = status; this.code = code; } }
const message = error => MESSAGES[error && error.code] || 'Das hat nicht geklappt. Bitte später erneut versuchen.';

async function api(path, { method = 'GET', body } = {}) {
  const response = await fetch(path, { method, credentials: 'same-origin',
    headers: { 'x-halani-admin': '1', ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new ApiError(response.status, data && data.error && data.error.code);
    if (response.status === 401 && !path.startsWith('/v1/admin/auth/')) { state.me = null; showLogin(); }
    throw error;
  }
  return data;
}

/** Builds DOM nodes. Strings become text nodes, so data can never turn into markup. */
function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else if (key === 'class') node.className = value;
    else node.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of children.flat()) if (child !== null && child !== undefined && child !== false)
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  return node;
}
const date = value => value ? new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium' }).format(new Date(value)) : '—';
const dateTime = value => new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
const endOfDay = value => value ? new Date(`${value}T23:59:59`).toISOString() : null;
const startOfDay = value => value ? new Date(`${value}T00:00:00`).toISOString() : undefined;
function toast(text) {
  toastBox.textContent = text; toastBox.classList.add('show');
  clearTimeout(toast.timer); toast.timer = setTimeout(() => toastBox.classList.remove('show'), 2600);
}

// ---- Sign-in ----

let loginRefresh;
async function showLogin(error) {
  clearTimeout(loginRefresh);
  const button = el('div', { class: 'google-button', id: 'google-button' });
  const problem = el('p', { class: 'error', hidden: !error }, error || '');
  root.replaceChildren(el('section', { class: 'login' }, el('div', { class: 'login-card' },
    el('span', { class: 'mark', 'aria-hidden': 'true' }, 'h'), el('h1', {}, 'Halani Admin'),
    el('p', {}, 'Melde dich mit deinem freigeschalteten Google-Konto an.'), button, problem)));
  try {
    const [{ googleClientID }, challenge] = await Promise.all([api('/v1/admin/config'),
      api('/v1/admin/auth/challenge', { method: 'POST', body: {} })]);
    await googleReady();
    google.accounts.id.initialize({ client_id: googleClientID, nonce: challenge.nonce, auto_select: false, ux_mode: 'popup',
      callback: async ({ credential }) => {
        try {
          state.me = await api('/v1/admin/auth/exchange', { method: 'POST', body: { challengeID: challenge.challengeID, credential } });
          clearTimeout(loginRefresh); showApp();
        } catch (failure) { showLogin(message(failure)); }
      } });
    google.accounts.id.renderButton(button, { theme: 'outline', size: 'large', text: 'signin_with', shape: 'pill', locale: 'de' });
    // The nonce is valid for five minutes; fetch a fresh one before it expires.
    loginRefresh = setTimeout(() => showLogin(), 4 * 60_000);
  } catch (failure) {
    problem.hidden = false; problem.textContent = message(failure);
  }
}
function googleReady() {
  return new Promise((resolve, reject) => {
    let tries = 0;
    const check = () => window.google && google.accounts && google.accounts.id ? resolve() :
      ++tries > 100 ? reject(new ApiError(0, 'google_unavailable')) : setTimeout(check, 100);
    check();
  });
}

// ---- Shell ----

function showApp() {
  const tabs = [['licenses', 'Lizenzen'], ['waitlist', 'Warteliste'], ...(can('owner') ? [['admins', 'Admins']] : [])];
  const page = el('section', { class: 'page', id: 'page' });
  root.replaceChildren(
    el('header', {},
      el('div', { class: 'bar' }, el('span', { class: 'mark', 'aria-hidden': 'true' }, 'h'),
        el('span', { class: 'brand' }, 'halani ', el('span', {}, 'admin')),
        el('span', { class: 'who' }, state.me.email, el('br'), ROLES[state.me.role]),
        el('button', { class: 'btn', onclick: signOut }, 'Abmelden')),
      el('nav', { 'aria-label': 'Bereiche' }, tabs.map(([id, label]) => el('button', {
        'aria-current': state.tab === id ? 'page' : null, onclick: () => { state.tab = id; showApp(); } }, label)))),
    page);
  ({ licenses: showLicenses, waitlist: showWaitlist, admins: showAdmins })[state.tab](page);
}
async function signOut() {
  await api('/v1/admin/auth/sign-out', { method: 'POST', body: {} }).catch(() => {});
  state.me = null; showLogin();
}

// ---- Licenses ----

const statusOf = license => license.revoked ? 'REVOKED' : license.status;
async function showLicenses(page) {
  page.replaceChildren(el('p', { class: 'loading' }, 'Lädt …'));
  try { state.licenses = (await api('/v1/admin/licenses')).licenses; }
  catch (error) { page.replaceChildren(el('p', { class: 'error' }, message(error))); return; }
  const count = status => state.licenses.filter(license => statusOf(license) === status).length;
  const search = el('input', { type: 'search', placeholder: 'Suchen nach E-Mail oder Bezeichnung', value: state.query,
    'aria-label': 'Suchen', oninput: event => { state.query = event.target.value; renderRows(); } });
  const filter = el('select', { 'aria-label': 'Status', onchange: event => { state.filter = event.target.value; renderRows(); } },
    [['open', 'Alle offenen'], ['VALID', 'Aktiv'], ['SUSPENDED', 'Pausiert'], ['NOT_STARTED', 'Startet später'],
      ['EXPIRED', 'Abgelaufen'], ['REVOKED', 'Entzogen'], ['all', 'Alle']]
      .map(([value, label]) => el('option', { value, selected: state.filter === value }, label)));
  const body = el('tbody');
  page.replaceChildren(
    el('div', { class: 'stats' },
      el('div', { class: 'stat' }, el('b', { class: 'num' }, count('VALID')), el('span', {}, 'Aktive Lizenzen')),
      el('div', { class: 'stat' }, el('b', { class: 'num' }, count('SUSPENDED')), el('span', {}, 'Pausiert')),
      el('div', { class: 'stat' }, el('b', { class: 'num' }, count('EXPIRED')), el('span', {}, 'Abgelaufen')),
      el('div', { class: 'stat' }, el('b', { class: 'num' },
        state.licenses.filter(license => statusOf(license) === 'VALID').reduce((sum, license) => sum + license.minutesPerMonth, 0)),
        el('span', {}, 'Minuten pro Monat vergeben'))),
    el('div', { class: 'card' },
      el('div', { class: 'toolbar' }, search, filter, el('span', { class: 'spacer' }),
        can('manager') ? el('button', { class: 'btn primary', onclick: () => issueDialog() }, 'Lizenz vergeben') : null),
      el('div', { class: 'table-wrap' }, el('table', {},
        el('thead', {}, el('tr', {}, ['Teilnehmer', 'Status', 'Gültig bis', 'Minuten / Monat', 'Verfügbar', ''].map(text => el('th', {}, text)))),
        body))));
  function renderRows() {
    const query = state.query.trim().toLowerCase();
    const rows = state.licenses.filter(license => {
      const status = statusOf(license);
      if (state.filter === 'open' && status === 'REVOKED') return false;
      if (!['open', 'all'].includes(state.filter) && status !== state.filter) return false;
      return !query || `${license.email || ''} ${license.label}`.toLowerCase().includes(query);
    });
    body.replaceChildren(...(rows.length ? rows.map(licenseRow) :
      [el('tr', {}, el('td', { colspan: 6, class: 'empty' }, state.licenses.length ? 'Keine Lizenz passt zum Filter.' : 'Noch keine Lizenzen vergeben.'))]));
  }
  renderRows();
}
function licenseRow(license) {
  const status = statusOf(license), open = !license.revoked, manage = can('manager') && open;
  return el('tr', {},
    el('td', {}, license.email || 'Gelöschtes Konto', el('span', { class: 'sub' }, license.label)),
    el('td', { 'data-label': 'Status' }, el('span', { class: `badge ${status}` }, STATUS[status] || status)),
    el('td', { 'data-label': 'Gültig bis' }, license.expiresAt ? date(license.expiresAt) : 'unbefristet',
      status === 'NOT_STARTED' ? el('span', { class: 'sub' }, `ab ${date(license.startsAt)}`) : null),
    el('td', { class: 'num', 'data-label': 'Minuten / Monat' }, license.minutesPerMonth),
    el('td', { class: 'num', 'data-label': 'Verfügbar' }, license.availableMinutes),
    el('td', { class: 'cell-actions' }, el('div', { class: 'actions' },
      manage && !license.suspended ? el('button', { class: 'btn small', onclick: () => reasonAction(license, 'suspend', 'Lizenz pausieren',
        'Die Person kann sofort keine Gespräche mehr starten, bis du die Lizenz fortsetzt.') }, 'Pausieren') : null,
      manage && license.suspended ? el('button', { class: 'btn small', onclick: () => reasonAction(license, 'reinstate', 'Lizenz fortsetzen',
        'Die Person kann wieder Gespräche führen.') }, 'Fortsetzen') : null,
      manage ? el('button', { class: 'btn small', onclick: () => renewDialog(license) }, 'Verlängern') : null,
      manage ? el('button', { class: 'btn small', onclick: () => minutesDialog(license) }, 'Minuten') : null,
      manage ? el('button', { class: 'btn small danger', onclick: () => reasonAction(license, 'revoke', 'Lizenz entziehen',
        'Endgültig: Die Lizenz kann nicht wieder aktiviert werden. Du kannst später eine neue vergeben.') }, 'Entziehen') : null,
      el('button', { class: 'btn small', onclick: () => eventsDialog(license) }, 'Verlauf'))));
}

// ---- Dialogs ----

/** Shows a form dialog; `submit` receives the form values and may throw to show an error. */
function formDialog(title, hint, fields, submitLabel, submit, danger = false) {
  const problem = el('p', { class: 'error', hidden: true });
  const form = el('form', { method: 'dialog' }, el('h2', { id: 'dialog-title' }, title), hint ? el('p', { class: 'hint' }, hint) : null,
    fields, problem,
    el('div', { class: 'buttons' }, el('button', { class: 'btn', type: 'button', onclick: () => dialog.close() }, 'Abbrechen'),
      el('button', { class: danger ? 'btn primary danger' : 'btn primary', type: 'submit' }, submitLabel)));
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(form).entries());
    const button = form.querySelector('[type="submit"]'); button.disabled = true;
    try { await submit(values); dialog.close(); }
    catch (error) { problem.hidden = false; problem.textContent = message(error); }
    finally { button.disabled = false; }
  });
  dialog.replaceChildren(form); dialog.showModal();
  const first = form.querySelector('input, select'); if (first) first.focus();
}
const field = (label, attrs, help) => el('label', {}, label, help ? el('small', {}, help) : null, el('input', attrs));
const reasonField = () => field('Grund', { name: 'reason', required: true, minlength: 3, maxlength: 200, placeholder: 'z. B. Kurs Oktober beendet' },
  'Wird im Verlauf gespeichert.');
const refresh = text => { toast(text); showApp(); };

function issueDialog(email = '') {
  formDialog('Lizenz vergeben', 'Die Person muss sich vorher einmal mit dieser E-Mail in der App angemeldet haben.', [
    field('E-Mail', { name: 'email', type: 'email', required: true, value: email, autocomplete: 'off' }),
    field('Bezeichnung', { name: 'label', required: true, maxlength: 120, placeholder: 'z. B. Kurs Oktober, Klinik Nord' }),
    field('Minuten pro Monat', { name: 'minutesPerMonth', type: 'number', min: 1, max: 6000, step: 1, value: 300, required: true },
      'Wird zu Beginn jedes Monats beim ersten Gespräch aufgefüllt.'),
    el('div', { class: 'row' }, field('Gültig ab', { name: 'startsAt', type: 'date' }, 'leer = sofort'),
      field('Gültig bis', { name: 'expiresAt', type: 'date' }, 'leer = unbefristet')),
    reasonField(),
  ], 'Vergeben', async values => {
    await api('/v1/admin/licenses', { method: 'POST', body: { email: values.email, label: values.label,
      minutesPerMonth: Number(values.minutesPerMonth), startsAt: startOfDay(values.startsAt), expiresAt: endOfDay(values.expiresAt),
      reason: values.reason } });
    state.tab = 'licenses'; refresh('Lizenz vergeben.');
  });
}
function reasonAction(license, action, title, hint) {
  formDialog(title, `${license.email || 'Gelöschtes Konto'} · ${hint}`, [reasonField()], title.split(' ').pop().replace(/^./, c => c.toUpperCase()),
    async values => { await api(`/v1/admin/licenses/${license.id}/${action}`, { method: 'POST', body: { reason: values.reason } }); refresh('Gespeichert.'); },
    action === 'revoke');
}
function renewDialog(license) {
  formDialog('Lizenz verlängern', license.email || '', [
    field('Neues Ablaufdatum', { name: 'expiresAt', type: 'date' }, 'leer = unbefristet'), reasonField(),
  ], 'Speichern', async values => {
    await api(`/v1/admin/licenses/${license.id}/renew`, { method: 'POST', body: { expiresAt: endOfDay(values.expiresAt), reason: values.reason } });
    refresh('Lizenz verlängert.');
  });
}
function minutesDialog(license) {
  formDialog('Minuten pro Monat ändern', license.email || '', [
    field('Minuten pro Monat', { name: 'minutesPerMonth', type: 'number', min: 1, max: 6000, step: 1, value: license.minutesPerMonth, required: true },
      'Gilt ab der nächsten monatlichen Auffüllung.'), reasonField(),
  ], 'Speichern', async values => {
    await api(`/v1/admin/licenses/${license.id}/minutes`, { method: 'POST', body: { minutesPerMonth: Number(values.minutesPerMonth), reason: values.reason } });
    refresh('Minuten geändert.');
  });
}
async function eventsDialog(license) {
  let events = [];
  try { events = (await api(`/v1/admin/licenses/${license.id}/events`)).events; } catch (error) { toast(message(error)); return; }
  const form = el('form', { method: 'dialog' }, el('h2', { id: 'dialog-title' }, 'Verlauf'),
    el('p', { class: 'hint' }, `${license.email || 'Gelöschtes Konto'} · ${license.label}`),
    el('ul', { class: 'events' }, events.map(event => el('li', {}, el('b', {}, ACTIONS[event.action] || event.action),
      event.reason, el('span', {}, ` · ${event.actor} · ${dateTime(event.at)}`)))),
    el('div', { class: 'buttons' }, el('button', { class: 'btn', type: 'submit' }, 'Schließen')));
  dialog.replaceChildren(form); dialog.showModal();
}

// ---- Waitlist ----

async function showWaitlist(page) {
  page.replaceChildren(el('p', { class: 'loading' }, 'Lädt …'));
  let requests;
  try { requests = (await api('/v1/admin/waitlist')).requests; }
  catch (error) { page.replaceChildren(el('p', { class: 'error' }, message(error))); return; }
  page.replaceChildren(el('div', { class: 'card' },
    el('div', { class: 'toolbar' }, el('b', {}, `${requests.length} Anfragen von der Website`)),
    el('div', { class: 'table-wrap' }, el('table', {},
      el('thead', {}, el('tr', {}, ['E-Mail', 'Angefragt am', 'Stand', ''].map(text => el('th', {}, text)))),
      el('tbody', {}, requests.length ? requests.map(request => el('tr', {},
        el('td', {}, request.email), el('td', { 'data-label': 'Angefragt am' }, date(request.requestedAt)),
        el('td', {}, request.hasLicense ? el('span', { class: 'badge VALID' }, 'Hat Lizenz') :
          request.hasAccount ? el('span', { class: 'badge NOT_STARTED' }, 'Konto vorhanden') : el('span', { class: 'badge REVOKED' }, 'Noch kein Konto')),
        el('td', {}, can('manager') && request.hasAccount && !request.hasLicense ?
          el('button', { class: 'btn small', onclick: () => issueDialog(request.email) }, 'Lizenz vergeben') : null)))
        : el('tr', {}, el('td', { colspan: 4, class: 'empty' }, 'Keine Anfragen.')))))));
}

// ---- Admins ----

async function showAdmins(page) {
  page.replaceChildren(el('p', { class: 'loading' }, 'Lädt …'));
  let admins;
  try { admins = (await api('/v1/admin/admins')).admins; }
  catch (error) { page.replaceChildren(el('p', { class: 'error' }, message(error))); return; }
  page.replaceChildren(el('div', { class: 'card' },
    el('div', { class: 'toolbar' }, el('b', {}, 'Wer diese Seite benutzen darf'), el('span', { class: 'spacer' }),
      el('button', { class: 'btn primary', onclick: () => adminDialog() }, 'Admin hinzufügen')),
    el('div', { class: 'table-wrap' }, el('table', {},
      el('thead', {}, el('tr', {}, ['E-Mail', 'Rolle', 'Hinzugefügt', ''].map(text => el('th', {}, text)))),
      el('tbody', {}, admins.map(admin => el('tr', {},
        el('td', {}, admin.email), el('td', { 'data-label': 'Rolle' }, el('span', { class: 'badge role' }, ROLES[admin.role] || admin.role)),
        el('td', { 'data-label': 'Hinzugefügt' }, date(admin.created_at), el('span', { class: 'sub' }, admin.created_by)),
        el('td', { class: 'cell-actions' }, el('div', { class: 'actions' },
          el('button', { class: 'btn small', onclick: () => adminDialog(admin) }, 'Rolle ändern'),
          admin.email !== state.me.email ? el('button', { class: 'btn small danger', onclick: () => formDialog('Admin entfernen', admin.email,
            [reasonField()], 'Entfernen', async values => {
              await api('/v1/admin/admins/remove', { method: 'POST', body: { email: admin.email, reason: values.reason } });
              refresh('Admin entfernt.');
            }, true) }, 'Entfernen') : null)))))))));
}
function adminDialog(admin) {
  formDialog(admin ? 'Rolle ändern' : 'Admin hinzufügen', 'Verwalter können Lizenzen vergeben und ändern. Nur lesen sieht alles, ändert nichts.', [
    field('E-Mail (Google-Konto)', { name: 'email', type: 'email', required: true, value: admin ? admin.email : '', readonly: admin ? true : null }),
    el('label', {}, 'Rolle', el('select', { name: 'role' }, Object.entries(ROLES).map(([value, label]) =>
      el('option', { value, selected: (admin ? admin.role : 'manager') === value }, label)))),
    reasonField(),
  ], 'Speichern', async values => {
    await api('/v1/admin/admins', { method: 'POST', body: { email: values.email, role: values.role, reason: values.reason } });
    refresh('Gespeichert.');
  });
}

// ---- Start ----

(async () => {
  try { state.me = await api('/v1/admin/me'); showApp(); }
  catch (error) { if (error.status !== 401) showLogin(message(error)); }
})();
