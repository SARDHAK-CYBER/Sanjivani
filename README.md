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
| Phone verification | We generate/hash/check the 6-digit code ourselves; Fast2SMS is used only as an SMS delivery pipe |
| Bot protection | Cloudflare Turnstile (optional, free) on the public "send code" step |
| Sessions | Signed JWTs (`jose`, HS256) in an HttpOnly cookie; separate audience per token type |
| Crypto | AES-256-GCM field encryption, scrypt password hashing, HMAC blind indexes / code hashes (Node `crypto`) |
| Rate limiting | Upstash Redis if configured, otherwise atomic counters in Postgres |
| Email | Nodemailer over your SMTP server (password-reset links) |

## How sign-in works

```
1. email + password            ──▶ password ok (no session yet)
2a. account has an authenticator ──▶ 6-digit app code (or a recovery code)        ──▶ signed in
2b. first sign-in (no app yet)   ──▶ code sent to the account's phone (SMS via Fast2SMS)
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

### Phone codes

Phone codes prove a number at **registration**, on a **bystander scan**, when a member **changes their number**, and to
**authorise authenticator setup or recovery**. We generate the code ourselves, hash and store it, and use Fast2SMS purely
as an SMS delivery pipe — Fast2SMS never decides whether a code is correct, we do:

```
browser  ──/api/phone/send─────────▶  server: generates a 6-digit code, hashes+stores it (src/lib/otp/service.ts),
                                       hands it to Fast2SMS to deliver by SMS (src/lib/otp/transport.ts)
browser  ──/api/phone/verify───────▶  server: checks the code against the stored hash, capped attempts,
                                       then issues our own single-use signed `proof` (10 min)
browser  ──next call + proof───────▶  register / bystander / change-phone / enrol: proof must match purpose, number, account
```

**Design history:** this went through two earlier providers before settling on Fast2SMS. First, MSG91's client-side OTP
Widget (MSG91 sending, checking and handing back a JWT for our server to confirm via their `verifyAccessToken` endpoint) —
tested extensively, including a full live production deployment, real phone, real domain — and it consistently rejected
valid tokens with a generic `AuthenticationFailure`, even though the widget's own send/verify flow worked correctly.
Second, generating codes ourselves and using MSG91 purely for delivery (its Flow SMS API and classic SendOTP API) — both
require a DLT-registered Sender ID/template for India, which this project's MSG91 account doesn't have, so neither could
actually deliver anything (accepted the request, sent nothing). Fast2SMS's "Quick SMS" route (`route=q`) sends a
free-form message without needing a DLT template at all, and was confirmed to deliver a real code end-to-end before being
wired in. Both retired MSG91 integrations are preserved (not deleted) in the scratchpad backups made when each was
retired, in case a DLT-registered template or the widget's server-side confirmation is ever worth revisiting.

## Getting started

Requirements: Node.js 20.19+, a PostgreSQL database, a Fast2SMS account with an API key and a wallet top-up of at least
₹100, an SMTP server for password-reset emails. There are no simulated modes: codes are really sent and emails are
really delivered.

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
can sign in with password + app code **without waiting for the SMS provider to be approved**.

### Fast2SMS setup

1. Create a [Fast2SMS](https://fast2sms.com) account and copy your **API key** (Dev API section) into `FAST2SMS_API_KEY`.
2. Add credit: the API refuses requests until you've completed a single wallet top-up of **at least ₹100** (a signup
   trial balance alone is not enough — you'll get a clear `status_code: 999` error until you do this).
3. No template registration or DLT setup needed — the Quick SMS route (`route=q`) sends a free-form message.
4. Verify delivery with your own phone before relying on it anywhere else: `npm run otp:smoke -- +919876543210`.

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
| `npm run otp:smoke -- +919876543210` | Send a real, throw-away code to your own phone via Fast2SMS |

## Security model (summary)

* **Authentication:** password (scrypt) + authenticator-app code. Tokens have separate audiences: a password-only "2FA pending" token
  cannot act as a session, an enrolment token or a phone proof cannot act as anything else, and bystander tokens use a different key.
* **Two-factor:** RFC 6238 TOTP (SHA-1, 6 digits, 30 s, ±1 step), secrets AES-GCM-encrypted at rest, each time step usable once,
  guess limits per account, recovery codes hashed. Setup and recovery require a phone code (except the operator scripts).
* **Phone codes:** generated, hashed and checked entirely by us (`src/lib/otp/service.ts`); Fast2SMS only delivers the message.
  Guess limits per challenge, resend cooldown, a per-number/per-account/per-IP send limit and a daily circuit breaker all
  apply before a single-use proof is issued, bound to purpose, number and account.
* **Authorization:** every admin route calls `requireAdmin()` (`src/lib/auth-guard.ts`), which re-reads the role from the
  database on each request; `src/proxy.ts` is only a first gate. Demoting a user, resetting a password or replacing an authenticator takes effect immediately (`tokenVersion`).
* **PII:** sensitive columns are AES-256-GCM encrypted; searchable values (bystander phone) use an HMAC blind index. API responses are whitelisted, never raw rows.
* **Bystander release:** blood group at once; allergies and contacts only after a 10 s review window (admins can block); the **home address is never released**; reports on frequently-scanned assets are flagged and release nothing.
* **Uploads:** JPEG/PNG/WebP only (checked by content, not name), ≤ 5 MB, stored outside `public/`, served through `/api/files` with per-file authorization, and attached to records only via a validated "adopt temp file" step.
* **Abuse controls:** per-IP and per-account rate limits on login, authenticator codes, registration, uploads, reports, password reset and code sends; client IP is read from `X-Forwarded-For` counting `TRUSTED_PROXY_HOPS` from the right, so forged headers do not help.

## Deployment notes

* Set `NEXT_PUBLIC_APP_URL` (used in emailed links) and `TRUSTED_PROXY_HOPS` (Vercel/single load balancer: `1`).
* Configure SMTP: password-reset emails are sent through it and resets do not work without it.
* **File storage** uses Vercel Blob when `BLOB_READ_WRITE_TOKEN` is set (create a Blob store under Project → Storage; connecting
  it to the project adds the token automatically), otherwise local disk (`./storage/uploads`, override with `STORAGE_DIR`) —
  fine for local dev, but local disk does not persist on serverless hosts such as Vercel, so set up the Blob store before
  deploying there. The rest of the app only talks to `src/lib/storage.ts`.
* **Fast2SMS is a single provider**, used only for message delivery (see "Design history" above for why). If it's ever
  unreachable, sends fail closed with a clear error rather than silently pretending to succeed.
* Back up `ENCRYPTION_KEY`. Without it, encrypted fields (including authenticator secrets) cannot be recovered.
* Rotate any credentials that were ever kept in an older `.env` (for example the previous Twilio or MSG91 accounts).

## Project layout

```
prisma/                  schema + migrations
scripts/                 seed-admin.ts, reset-2fa.ts, gen-secrets.mjs, otp-smoke.ts
src/proxy.ts             coarse admin gate (Next 16 "proxy")
src/lib/totp.ts          RFC 6238 TOTP
src/lib/two-factor.ts    authenticator enrolment, code checks, recovery codes
src/lib/otp/config.ts    Fast2SMS config, purpose type, country allowlist
src/lib/otp/service.ts   code generation, hashing, send/check challenge lifecycle
src/lib/otp/transport.ts Fast2SMS Quick SMS delivery
src/lib/                 auth-guard, tokens, session, phone-verification, encryption, rate-limit, storage, profile, ...
src/components/          PhoneOtp, TotpSetup, RecoveryCodes, TwoFactorCard, theme
src/app/api/             route handlers (auth/, phone/send, phone/verify, user/2fa, ...)
src/app/                 pages: login, register, dashboard, scan/[id], admin/*
tests/, src/lib/*.test.ts
docs/archive/            superseded design notes
```
