# Sanjivani: QR-Based Emergency Response System

A QR-code emergency response app for a university campus. Members register their identity and emergency
details (encrypted at rest) and attach QR codes to their assets (vehicle, laptop, phone). If someone finds
an asset in an emergency they scan the QR, prove they hold a real phone number, report the incident with
photos and GPS, and are shown the owner's critical medical information and emergency contacts. Campus
security watches everything from a command-and-control (C2) dashboard.

## Stack

| Layer | Technology |
| --- | --- |
| App | Next.js 16 (App Router, Turbopack), React 19, TypeScript, Tailwind CSS 4 |
| Database | PostgreSQL (e.g. Neon) via Prisma 7 and the `@prisma/adapter-pg` driver adapter |
| Member / admin sign-in | Password + **authenticator app (TOTP, RFC 6238)** + one-time recovery codes |
| Phone verification | **MSG91 OTP Widget**: MSG91 sends and checks the code itself (WhatsApp/SMS/voice/email, its own captcha); our server confirms the resulting token before trusting it |
| Bot protection | Cloudflare Turnstile (optional, free) on the public "send code" step |
| Sessions | Signed JWTs (`jose`, HS256) in an HttpOnly cookie; separate audience per token type |
| Crypto | AES-256-GCM field encryption, scrypt password hashing, HMAC blind indexes / code hashes (Node `crypto`) |
| Rate limiting | Upstash Redis if configured, otherwise atomic counters in Postgres |
| Email | Nodemailer over your SMTP server (password-reset links) |

## How sign-in works

```
1. email + password            ──▶ password ok (no session yet)
2a. account has an authenticator ──▶ 6-digit app code (or a recovery code)        ──▶ signed in
2b. first sign-in (no app yet)   ──▶ code sent to the account's phone (MSG91 widget)
                                     ──▶ scan a QR code, type the first app code
                                     ──▶ save 8 recovery codes                     ──▶ signed in
```

* **Why the phone code before setting up the app?** If a stolen password were enough to enrol an authenticator, the
  attacker would enrol their own and two-factor would protect nothing. Enrolment needs the password *and* a code delivered to the account's own phone.
* **Lost phone / app:** use one of the 8 one-time **recovery codes**. If those are gone too, members can replace the authenticator by
  confirming a code sent to their phone (this signs out other sessions and cancels the old recovery codes).
  **Administrators cannot do that**: a password plus a SIM swap must not be enough to take over an admin. Another operator runs `npm run reset-2fa`.
* **Authenticator codes** are single-use per 30 s step (a code that was just accepted, or seen over a shoulder, is dead), and attempts are capped at **5 per 15 minutes and 20 per day** per account.
* Recovery codes are stored only as keyed hashes; each works once. Members can create a fresh set from their dashboard (needs a current app code).
* Resetting a password by email does **not** bypass two-factor.

### Phone codes (MSG91 OTP Widget)

Phone codes prove a number at **registration**, on a **bystander scan**, when a member **changes their number**, and to
**authorise authenticator setup or recovery**. MSG91's OTP Widget (`src/components/Msg91WidgetOtp.tsx`) does the sending
and code-checking itself, behind its own captcha, and hands the browser a JWT as proof:

```
browser  ──window.sendOtp(number)──▶  MSG91 (sends the code; channel/captcha are the widget's own dashboard settings)
browser  ──window.verifyOtp(code)──▶  MSG91 (checks the code; returns a JWT "access-token" on success)
browser  ──/api/phone/verify───────▶  server: asks MSG91 to confirm that token (src/lib/msg91-widget.ts),
                                       then issues our own single-use signed `proof` (10 min)
browser  ──next call + proof───────▶  register / bystander / change-phone / enrol: proof must match purpose, number, account
```

**Known open issue, being tracked with MSG91 support:** their `verifyAccessToken` endpoint has consistently rejected every
token we've tested (fresh or not, `localhost` or a real public domain) with a generic `AuthenticationFailure`. The widget's
own client-side flow (send/receive/enter code) works reliably; it's specifically the server-side confirmation step that
doesn't yet behave as documented. Until that's resolved, `/api/phone/verify` will reject real attempts even though the
user successfully completed the widget flow. `src/lib/msg91-widget.ts` has the full detail and is written defensively so
it starts working the moment MSG91 clarifies the real response shape, with no code changes expected — see its docstring
before touching it.

We deliberately did **not** build this by generating/hashing/checking our own codes and using MSG91 only as an SMS/WhatsApp
pipe (the original design) — that approach worked reliably in testing but was set aside in favour of the widget. If the
`verifyAccessToken` issue can't be resolved, that original design is the fallback; it's preserved (not deleted) and can be
found via the scratchpad backups made when it was retired.

## Getting started

Requirements: Node.js 20.19+, a PostgreSQL database, an MSG91 account with an OTP Widget configured, an SMTP server for
password-reset emails. There are no simulated modes: codes are really sent and emails are really delivered.

```bash
npm install                 # also runs `prisma generate`
cp .env.example .env        # then fill it in (see below)
npm run gen:secrets         # prints JWT_SECRET, BYSTANDER_JWT_SECRET, ENCRYPTION_KEY
npm run db:migrate          # applies prisma/migrations to DATABASE_URL
npm run dev
```

Create the first administrator (there is intentionally no public endpoint for this):

```bash
ADMIN_EMAIL=you@rru.edu ADMIN_PHONE=+919876543210 ADMIN_PASSWORD='Str0ng!Passw0rd' npm run seed:admin
```

The script prints a **setup key** (and an `otpauth://` link) for the administrator's authenticator app and **8 recovery codes**, once. Add the
key in the app ("enter a setup key"), keep the recovery codes safe. Because the authenticator is provisioned here, the first administrator
can sign in with password + app code **without waiting for WhatsApp/SMS to be approved**.

### MSG91 setup

1. Create an [MSG91](https://msg91.com) account. Under **Widgets**, create an OTP Widget (or use an existing one) and open its
   **Client Side Integration** tab for the values below.
2. Set the four widget env vars: `NEXT_PUBLIC_MSG91_WIDGET_ID` and `NEXT_PUBLIC_MSG91_WIDGET_TOKEN` (not secret — meant to sit
   in browser code) from that tab, plus your account's **Authkey** into `MSG91_AUTH_KEY` (secret — server-side only, from
   Settings → Authkey).
3. In the widget's dashboard settings, choose which channels it offers (SMS/WhatsApp/voice/email) and its OTP length; SMS
   there uses MSG91's own default template (works immediately, no DLT registration needed to get started) or your own
   DLT-approved one once you have it.
4. Test the full flow with your own phone by opening the app's register or scan page — there's no separate smoke-test
   script for the widget (it's a captcha-gated browser flow, not something scriptable from the CLI).
5. Read the **known open issue** above before relying on this in production: server-side confirmation isn't working yet.

### Testing scanning from a phone

QR codes point at `NEXT_PUBLIC_QR_BASE_URL` (default: the site's own origin). To scan from a phone on your Wi-Fi, run
the dev server, set `NEXT_PUBLIC_QR_BASE_URL=http://<your-LAN-IP>:3000` and `ALLOWED_DEV_ORIGINS=<your-LAN-IP>`.
(Camera and geolocation need HTTPS on most phones outside `localhost`; use a tunnel or `next dev --experimental-https`.)

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js (`build` runs `prisma generate` first) |
| `npm test` | Unit tests (`node:test` via `tsx`), no database needed. Includes the RFC 4226/6238 TOTP test vectors |
| `npm run typecheck` / `lint` | `tsc --noEmit` / ESLint |
| `npm run db:migrate` | `prisma migrate deploy` |
| `npm run seed:admin` | Create the first ADMIN with an authenticator already set up |
| `npm run reset-2fa -- user@rru.edu` | Remove a user's authenticator; for an ADMIN, provision a new one and print it |
| `npm run gen:secrets` | Print fresh secrets (never writes files) |

## Security model (summary)

* **Authentication:** password (scrypt) + authenticator-app code. Tokens have separate audiences: a password-only "2FA pending" token
  cannot act as a session, an enrolment token or a phone proof cannot act as anything else, and bystander tokens use a different key.
* **Two-factor:** RFC 6238 TOTP (SHA-1, 6 digits, 30 s, ±1 step), secrets AES-GCM-encrypted at rest, each time step usable once,
  guess limits per account, recovery codes hashed. Setup and recovery require a phone code (except the operator scripts).
* **Phone codes:** sent and checked by MSG91's OTP Widget; our server independently confirms the resulting token (`src/lib/msg91-widget.ts`,
  currently blocked — see the known issue above) before issuing a single-use proof bound to purpose, number and account.
* **Authorization:** every admin route calls `requireAdmin()` (`src/lib/auth-guard.ts`), which re-reads the role from the
  database on each request; `src/proxy.ts` is only a first gate. Demoting a user, resetting a password or replacing an authenticator takes effect immediately (`tokenVersion`).
* **PII:** sensitive columns are AES-256-GCM encrypted; searchable values (bystander phone) use an HMAC blind index. API responses are whitelisted, never raw rows.
* **Bystander release:** blood group at once; allergies and contacts only after a 10 s review window (admins can block); the **home address is never released**; reports on frequently-scanned assets are flagged and release nothing.
* **Uploads:** JPEG/PNG/WebP only (checked by content, not name), ≤ 5 MB, stored outside `public/`, served through `/api/files` with per-file authorization, and attached to records only via a validated "adopt temp file" step.
* **Abuse controls:** per-IP and per-account rate limits on login, authenticator codes, registration, uploads, reports, password reset and code sends; client IP is read from `X-Forwarded-For` counting `TRUSTED_PROXY_HOPS` from the right, so forged headers do not help.

## Deployment notes

* Set `NEXT_PUBLIC_APP_URL` (used in emailed links) and `TRUSTED_PROXY_HOPS` (Vercel/single load balancer: `1`).
* Configure SMTP: password-reset emails are sent through it and resets do not work without it.
* **File storage is local disk** (`./storage/uploads`, override with `STORAGE_DIR`). That does not persist on serverless hosts such as
  Vercel. Deploy on a host with a persistent volume, or reimplement the functions in `src/lib/storage.ts` on Google Cloud Storage / S3.
  The rest of the app only uses that module.
* **MSG91 is a single provider**, and its server-side confirmation step is currently not working (see above) — routine member/admin sign-in is
  unaffected (it uses the authenticator app), but new registrations, bystander scans and authenticator setup/recovery are blocked until that's
  resolved or the code-generation fallback is restored.
* Back up `ENCRYPTION_KEY`. Without it, encrypted fields (including authenticator secrets) cannot be recovered.
* Rotate any credentials that were ever kept in an older `.env` (for example the previous Twilio account).

## Project layout

```
prisma/                 schema + migrations
scripts/                seed-admin.ts, reset-2fa.ts, gen-secrets.mjs
src/proxy.ts            coarse admin gate (Next 16 "proxy")
src/lib/totp.ts         RFC 6238 TOTP
src/lib/two-factor.ts   authenticator enrolment, code checks, recovery codes
src/lib/msg91-widget.ts server-side verifyAccessToken caller (see the known open issue above)
src/lib/otp/config.ts   what's left of the retired code-generation flow: purpose type, country allowlist
src/lib/                auth-guard, tokens, session, phone-verification, encryption, rate-limit, storage, profile, ...
src/components/         Msg91WidgetOtp, TotpSetup, RecoveryCodes, TwoFactorCard, theme
src/app/api/            route handlers (auth/, phone/verify, user/2fa, ...)
src/app/                pages: login, register, dashboard, scan/[id], admin/*
tests/, src/lib/*.test.ts
docs/archive/           superseded design notes
```
