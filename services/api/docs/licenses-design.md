# Design: Lizenzen und Admin-Webseite

Status: Schritte 1–5 umgesetzt (Datenbank, Prüfung, Sperre im Gespräch, Hinweise in der App, Admin-Anmeldung, Admin-API, Admin-Webseite, Kommandozeilen). Einrichtung: README, Abschnitt „Licenses“. Ziel: Nur Personen mit gültiger Lizenz dürfen gehostete
Gespräche führen, weil jede Minute echte OpenAI-Kosten verursacht. Ein Admin vergibt, pausiert,
verlängert und entzieht Lizenzen über eine Webseite.

## Was heute schon da ist

- `HostedVoice.allows(account)` (`src/hosted-voice.ts`) und `HostedHelpers.allows(account)` sind
  die beiden Stellen, an denen ein gehostetes Gespräch zugelassen wird. Im Testmodus prüfen sie eine
  feste `accountAllowlist` aus der Umgebung – das ist eine Lizenzliste, nur ohne Datenbank und ohne
  Oberfläche.
- Konten (`accounts`), Minuten-Ledger (`minutes.ts`), Willkommensminuten und Kampagnen mit
  `actor` + `reason` als Prüfspur (`minutes-admin.ts`).
- Admin-Aufgaben laufen bisher als Kommandozeilenskripte mit `DATABASE_URL`
  (`access-requests-admin.ts`, `minutes-admin.ts`), nicht als Webseite.
- Zugangsanfragen per E-Mail (`access_requests`) – die natürliche Warteliste, aus der Lizenzen
  vergeben werden.

## Vorbild: keygen-api

Aus `keygen-sh/keygen-api` (im Steroids-Korpus) übernommen, auf unseren Fall verkleinert:

| keygen | Bedeutung | Bei uns |
| --- | --- | --- |
| `License` mit `owner` (User) | Lizenz gehört genau einer Person | `licenses.account_id` |
| `expiry`, `renew!` mit `renewal_basis` | Ablaufdatum, Verlängern ab Ablauf oder ab jetzt | `expires_at`, Aktion „verlängern“ |
| `suspend!` / `reinstate!` | vorübergehend sperren, ohne zu löschen | `suspended_at` |
| `revoke` (Löschen + Event) | endgültig entziehen | `revoked_at` (kein Löschen, wegen Prüfspur) |
| `LicenseValidationService#validate!` | feste Prüfreihenfolge mit Code: `NOT_FOUND`, `BANNED`, `SUSPENDED`, `EXPIRED`, `VALID` | `licenseStatus()` mit denselben Codes |
| `policy` (Laufzeit, Limits) | Vorlage für viele Lizenzen | `minutes_per_month` als einziges Limit |
| `BroadcastEventService` (`license.revoked` …) | jede Änderung als Ereignis | Tabelle `license_events` |

Weggelassen, weil für uns unnötig: Maschinen/Geräte-Bindung, Check-in-Intervalle,
Release-Downloads, Produkte, Mandanten.

## Datenmodell (Migration `036_licenses.sql`)

```sql
CREATE TABLE licenses (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES accounts(id),
  label text NOT NULL CHECK (length(label) BETWEEN 1 AND 120),        -- z. B. "Kurs Oktober, Klinik X"
  starts_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,                                              -- NULL = unbefristet
  minutes_per_month integer NOT NULL CHECK (minutes_per_month BETWEEN 1 AND 6000),
  suspended_at timestamptz,
  revoked_at timestamptz,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- Höchstens eine nicht entzogene Lizenz pro Konto.
CREATE UNIQUE INDEX licenses_one_open_per_account ON licenses(account_id) WHERE revoked_at IS NULL;

CREATE TABLE license_events (
  id bigserial PRIMARY KEY,
  license_id uuid NOT NULL REFERENCES licenses(id),
  action text NOT NULL CHECK (action IN ('issued','renewed','suspended','reinstated','revoked','limit_changed')),
  actor text NOT NULL, reason text NOT NULL,
  before jsonb, after jsonb,
  at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE admin_users (
  email text PRIMARY KEY CHECK (email = lower(btrim(email))),
  role text NOT NULL CHECK (role IN ('owner','manager','viewer')),
  created_at timestamptz NOT NULL DEFAULT now()
);
```

Lizenzen werden nie gelöscht; Entziehen setzt `revoked_at`. So bleibt nachvollziehbar, wer wann
Zugang hatte – wichtig, weil Zugang Geld kostet.

## Prüfung beim Gespräch

Neue Funktion `licenseStatus(db, accountID, now)` in `src/licenses.ts`, Reihenfolge wie bei keygen:

1. keine offene Lizenz → `NOT_LICENSED`
2. `suspended_at` gesetzt → `SUSPENDED`
3. `starts_at > now` → `NOT_STARTED`
4. `expires_at <= now` → `EXPIRED`
5. sonst → `VALID` (danach wird einmal pro Monat aufgefüllt; ist das Guthaben leer, greift die
   bestehende Minutenprüfung mit `insufficient_minutes`)

Einbindung: `HostedVoice.allows()` und `HostedHelpers.allows()` bekommen eine optionale
`licenseGate`. Ist `LICENSES_REQUIRED=true` gesetzt, muss zusätzlich zu den bisherigen Regeln
`VALID` herauskommen. Ohne den Schalter verhält sich der Server wie heute (Upstream-kompatibel).
`/v1/live/capabilities` gibt den Code mit zurück, damit die App „Lizenz abgelaufen“ statt eines
allgemeinen Fehlers zeigen kann. Die bestehende Sperre über Minuten-Guthaben bleibt bestehen; die
Lizenz ist eine zusätzliche Schranke, kein Ersatz.

Der Monatsverbrauch kommt aus dem vorhandenen Minuten-Ledger (Summe der gehosteten Abbuchungen
im laufenden Monat), damit es keine zweite Zählung gibt, die auseinanderlaufen kann.

## Admin-API (`/v1/admin/...`)

| Methode | Pfad | Zweck |
| --- | --- | --- |
| GET | `/v1/admin/licenses?status=&q=` | Liste mit Status, Konto-E-Mail, Ablauf, Monatsverbrauch |
| POST | `/v1/admin/licenses` | vergeben: E-Mail, Bezeichnung, Ablauf, Monatslimit, Grund |
| POST | `/v1/admin/licenses/:id/renew` | verlängern ab Ablauf oder ab heute |
| POST | `/v1/admin/licenses/:id/suspend` / `reinstate` | pausieren / fortsetzen |
| POST | `/v1/admin/licenses/:id/revoke` | entziehen |
| PATCH | `/v1/admin/licenses/:id` | Bezeichnung oder Monatslimit ändern |
| GET | `/v1/admin/licenses/:id/events` | Verlauf |
| GET | `/v1/admin/access-requests` | Warteliste, mit „Lizenz vergeben“ |

Jede schreibende Aktion verlangt `reason` (3–200 Zeichen, wie `auditText` in `minutes-admin.ts`),
läuft in einer Transaktion und schreibt ein `license_events`-Eintrag. Vergeben an eine E-Mail ohne
Konto legt eine ausstehende Lizenz an, die beim ersten Anmelden mit dieser E-Mail aktiv wird.

## Admin-Anmeldung und Sicherheit (umgesetzt)

- Anmeldung mit Google („Sign in with Google“ auf der Webseite): eigener OAuth-Web-Client
  (`ADMIN_GOOGLE_CLIENT_ID`), Nonce aus `admin_challenges` (einmalig, 5 Minuten), nur
  Google-bestätigte E-Mails aus `admin_users`. Jede Ablehnung sieht gleich aus.
- Sitzung als `HttpOnly`, `Secure`, `SameSite=Strict`-Cookie mit Pfad `/v1/admin`, 8 Stunden;
  gespeichert wird nur der SHA-256-Hash. Entfernte Admins verlieren den Zugang sofort.
- CSRF-Schutz: Jede Admin-Anfrage braucht den Header `x-halani-admin: 1`, fremde `Origin` wird
  abgelehnt.
- Rollen: `owner` (Admins und Lizenzen), `manager` (Lizenzen), `viewer` (nur lesen). Der letzte
  Eigentümer kann nicht herabgestuft oder entfernt werden; niemand kann sich selbst entfernen.
- Eigene Datenbankrolle `mural_admin` (`ADMIN_DATABASE_URL`): darf Lizenzen und Admins verwalten
  und das Nötige lesen, aber keine App-Sitzungen, kein Minuten-Ledger schreiben, keine Käufe.
- Die öffentliche API-Rolle sieht keine Admin-Tabellen.
- Die Webseite ist eine feste Dateiliste mit strenger Content Security Policy (Skripte nur vom
  eigenen Server und von Google Sign-In) und fügt Daten nur als Text ein.

## Admin-Webseite (umgesetzt)

- `/admin`, auf Deutsch, ohne zusätzliche Abhängigkeiten oder Build-Schritt (`admin/`), vom
  bestehenden Fastify-Server ausgeliefert.
- **Lizenzen:** Kennzahlen (aktiv, pausiert, abgelaufen, vergebene Monatsminuten), Suche, Filter,
  Tabelle mit Status, Ablauf, Monatsminuten, verfügbaren Minuten; Aktionen Vergeben, Pausieren,
  Fortsetzen, Verlängern, Minuten ändern, Entziehen, Verlauf. Jede Änderung fragt nach einem Grund.
- **Warteliste:** Anfragen von der Website mit Stand (noch kein Konto, Konto vorhanden, hat
  Lizenz) und „Lizenz vergeben“ mit vorausgefüllter E-Mail.
- **Admins** (nur Eigentümer): hinzufügen, Rolle ändern, entfernen.
- Auf schmalen Bildschirmen wird jede Zeile zur Karte.

## Umsetzung in Schritten

1. Migration, `licenses.ts` mit `licenseStatus` und Aktionen, Unit- und Integrationstests gegen
   Postgres (wie die bestehenden Tests).
2. Lizenz-Schranke in `HostedVoice`/`HostedHelpers` hinter `LICENSES_REQUIRED`, Code in
   `/v1/live/capabilities`; Hinweis in der App, wenn keine gültige Lizenz vorliegt.
3. Admin-Anmeldung, Rollen, Admin-API mit Tests für Rechte und Prüfspur.
4. Admin-Webseite.
5. Kommandozeile `licenses-admin.js` (vergeben/entziehen) als Notfallweg ohne Webseite.

## Entscheidungen

- Eine Lizenz gibt Zugang **und** Minuten: beim ersten Gespräch eines Kalendermonats (UTC) wird das
  Konto auf `minutes_per_month` aufgefüllt (Buchung `gift`, Referenz `license:<id>:<Monat>`).
  Ungenutzte Lizenzminuten sammeln sich nicht über einen Monatsbetrag hinaus an; gekaufte Minuten
  bleiben unberührt. `minutes_per_month` ist deshalb Pflicht.
- Erster Admin (Rolle `owner`) wird bei der Einrichtung per Kommandozeile eingetragen.

## Umgesetzt (Schritt 1 und 2)

- Migration `036_licenses.sql`: `licenses`, `license_events` (unveränderlich),
  `license_monthly_grants` (eine Auffüll-Entscheidung pro Lizenz und Monat, unveränderlich).
- `src/licenses.ts`: Prüfreihenfolge, Monatsauffüllung, Aktionen (vergeben, pausieren, fortsetzen,
  verlängern, Minuten ändern, entziehen), jede mit Akteur und Grund.
- `LICENSES_REQUIRED=true` sperrt `/v1/live/sessions`, Hilfen und meldet den Grund in
  `/v1/live/capabilities`; `/v1/minutes` zeigt bereits aufgefüllte Monatsminuten.
- `operations/license-runtime-grants.sql`: Die API-Rolle darf Lizenzen nur lesen.
- `npm run licenses-admin`: Kommandozeile, bis die Webseite da ist.
- App-Hinweise auf iPhone und Android für alle vier Lizenz-Fehler.
- Gelöschte Konten mit Lizenz bleiben anonymisiert erhalten, damit der Verlauf stimmt.

## Noch offen

- Einrichtung auf dem Server: Migrationen 036 und 037, Rollen und Rechte, Google-Web-Client,
  erster Eigentümer per `npm run admin-users set <E-Mail> owner` (die E-Mail steht bewusst nicht
  im öffentlichen Repo).
- Wo läuft der Server (Hosting), damit die Webseite erreichbar ist?
- Pflege-Inhalte und Kosten: Monatsminuten pro Kurs festlegen.
